/**
 * Depth-Averaged RANS Turbulence Closure Solvers
 *
 * Implements:
 * 1. Mixing Length Model (Algebraic Nezu & Rodi depth-averaged form)
 * 2. k-ε Model (Two-equation transport for turbulent kinetic energy and dissipation)
 * 3. k-ω SST Model (Shear Stress Transport for separated flows at structures)
 */

import {
  TurbulenceParameters,
  TurbulenceState,
  TurbulenceDiagnostics,
} from '../types/turbulence';
import { RiverGridMesh, HydrodynamicsState } from '../types/riverReach';
import {
  computeFrictionVelocity,
  computeRoughnessLength,
  computeEquilibriumBedTurbulence,
} from './wallFunctions';

const H_DRY_TURB = 0.005; // Turbulence is suppressed in shallow wetting/drying sheets < 5mm

/**
 * Initializes turbulence state buffers
 */
export function initializeTurbulenceState(cellCount: number): TurbulenceState {
  const k = new Float32Array(cellCount);
  const epsOrOmega = new Float32Array(cellCount);
  const nuT = new Float32Array(cellCount);
  const pK = new Float32Array(cellCount);

  for (let i = 0; i < cellCount; i++) {
    k[i] = 1e-5;
    epsOrOmega[i] = 1e-4;
    nuT[i] = 1e-6;
    pK[i] = 0;
  }

  return { k, epsOrOmega, nuT, pK };
}

export function createInitialTurbulenceState(meshOrCount: RiverGridMesh | number): TurbulenceState {
  const count = typeof meshOrCount === 'number' ? meshOrCount : meshOrCount.cells.length;
  return initializeTurbulenceState(count);
}

export const stepTurbulenceModel = stepTurbulence;

/**
 * Steps the selected RANS turbulence model forward by dt
 */
export function stepTurbulence(
  mesh: RiverGridMesh,
  hydro: HydrodynamicsState,
  turb: TurbulenceState,
  params: TurbulenceParameters,
  dt: number
): TurbulenceDiagnostics {
  if (params.model === 'none') {
    turb.nuT.fill(0);
    turb.k.fill(0);
    turb.epsOrOmega.fill(0);
    turb.pK.fill(0);
    return {
      maxNuT: 0,
      meanNuT: 0,
      maxK: 0,
      maxPk: 0,
      residualK: 0,
      residualEpsOrOmega: 0,
    };
  }

  if (params.model === 'mixing-length') {
    return stepMixingLength(mesh, hydro, turb, params);
  }

  if (params.model === 'k-epsilon') {
    return stepKEpsilon(mesh, hydro, turb, params, dt);
  }

  if (params.model === 'k-omega-sst') {
    return stepKOmegaSst(mesh, hydro, turb, params, dt);
  }

  return {
    maxNuT: 0,
    meanNuT: 0,
    maxK: 0,
    maxPk: 0,
    residualK: 0,
    residualEpsOrOmega: 0,
  };
}

/**
 * 1. Mixing Length Model (Algebraic)
 * nu_t = l_m^2 * |S|
 * Depth-averaged Nezu & Rodi: l_m = (1/6) * kappa * h
 */
function stepMixingLength(
  mesh: RiverGridMesh,
  hydro: HydrodynamicsState,
  turb: TurbulenceState,
  params: TurbulenceParameters
): TurbulenceDiagnostics {
  const n = mesh.cells.length;
  let maxNuT = 0;
  let sumNuT = 0;
  let wetCount = 0;

  for (let i = 0; i < n; i++) {
    const h = hydro.depth[i];
    if (h < H_DRY_TURB) {
      turb.nuT[i] = 0;
      turb.k[i] = 0;
      turb.epsOrOmega[i] = 0;
      turb.pK[i] = 0;
      continue;
    }

    const cell = mesh.cells[i];
    const S = computeStrainRateMagnitude(mesh, hydro, i);
    const lm = (1 / 6) * params.kappa * h;
    const rawNuT = Math.pow(lm, 2) * S;

    const nuT = Math.min(params.eddyViscosityCapM2s, Math.max(1e-6, rawNuT));
    turb.nuT[i] = nuT;

    // Estimate k from mixing length equilibrium: k ≈ nu_t * |S| / sqrt(C_mu)
    turb.k[i] = (nuT * S) / Math.sqrt(params.cMu);
    turb.epsOrOmega[i] = Math.pow(turb.k[i], 1.5) / Math.max(1e-3, lm);
    turb.pK[i] = nuT * Math.pow(S, 2);

    if (nuT > maxNuT) maxNuT = nuT;
    sumNuT += nuT;
    wetCount++;
  }

  return {
    maxNuT,
    meanNuT: wetCount > 0 ? sumNuT / wetCount : 0,
    maxK: Math.max(...Array.from(turb.k)),
    maxPk: Math.max(...Array.from(turb.pK)),
    residualK: 0,
    residualEpsOrOmega: 0,
  };
}

/**
 * 2. k-ε Two-Equation Turbulence Solver
 * d(hk)/dt + div(hkU) = div[(nu + nu_t/sigma_k)*h*grad(k)] + h*Pk - h*eps
 * d(heps)/dt + div(hepsU) = div[(nu + nu_t/sigma_eps)*h*grad(eps)] + h*C1eps*(eps/k)*Pk - h*C2eps*(eps^2/k)
 */
function stepKEpsilon(
  mesh: RiverGridMesh,
  hydro: HydrodynamicsState,
  turb: TurbulenceState,
  params: TurbulenceParameters,
  dt: number
): TurbulenceDiagnostics {
  const n = mesh.cells.length;
  const nextK = new Float32Array(n);
  const nextEps = new Float32Array(n);

  let maxNuT = 0;
  let sumNuT = 0;
  let wetCount = 0;
  let resK = 0;
  let resEps = 0;

  for (let i = 0; i < n; i++) {
    const h = hydro.depth[i];
    const cell = mesh.cells[i];

    if (h < H_DRY_TURB) {
      turb.nuT[i] = 0;
      turb.k[i] = 1e-6;
      turb.epsOrOmega[i] = 1e-5;
      turb.pK[i] = 0;
      nextK[i] = 1e-6;
      nextEps[i] = 1e-5;
      continue;
    }

    const u = hydro.u[i];
    const v = hydro.v[i];
    const kOld = Math.max(1e-6, turb.k[i]);
    const epsOld = Math.max(1e-6, turb.epsOrOmega[i]);
    const nuTOld = Math.max(1e-6, turb.nuT[i]);

    // Shear strain rate magnitude
    const S = computeStrainRateMagnitude(mesh, hydro, i);
    const Pk = nuTOld * Math.pow(S, 2);
    turb.pK[i] = Pk;

    // Depth-averaged bed-generated turbulence source terms (Rastogi & Rodi 1978)
    let bedSourceK = 0;
    let bedSourceEps = 0;
    if (params.wallFunctionsEnabled) {
      const uStar = computeFrictionVelocity(hydro.velocityMag[i], h, cell.manningN);
      const hEff = Math.max(0.05, h);
      // P_kv = u_*^3 / h; P_epsv = 3.6 * u_*^4 / h^2
      bedSourceK = Math.pow(uStar, 3) / hEff;
      bedSourceEps = (3.6 * Math.pow(uStar, 4)) / (hEff * hEff);
    }

    // Spatial advection and diffusion of k and epsilon across faces
    let divK = 0;
    let divEps = 0;
    const diffKCoeff = 1e-6 + nuTOld / params.sigmaK;
    const diffEpsCoeff = 1e-6 + nuTOld / params.sigmaEps;

    for (let f = 0; f < cell.neighbors.length; f++) {
      const nId = cell.neighbors[f];
      const [nx, ny] = cell.faceNormals[f];
      const lenF = cell.faceLengths[f];
      const unF = u * nx + v * ny;

      if (nId >= 0 && nId < n && hydro.depth[nId] >= H_DRY_TURB) {
        // Advection (upwind)
        const kUp = unF >= 0 ? kOld : Math.max(1e-6, turb.k[nId]);
        const epsUp = unF >= 0 ? epsOld : Math.max(1e-6, turb.epsOrOmega[nId]);
        divK += unF * kUp * lenF;
        divEps += unF * epsUp * lenF;

        // Diffusion: grad ~ (phi_neighbor - phi_cell) / delta_x
        const dX = Math.sqrt(cell.areaM2);
        divK -= diffKCoeff * ((turb.k[nId] - kOld) / dX) * lenF;
        divEps -= diffEpsCoeff * ((turb.epsOrOmega[nId] - epsOld) / dX) * lenF;
      }
    }

    const netDivK = divK / cell.areaM2;
    const netDivEps = divEps / cell.areaM2;

    // Semi-implicit source terms to guarantee unconditional positivity
    // d(k)/dt = Pk - eps - div(U*k)
    const kNew = (kOld + dt * (Pk + bedSourceK - netDivK)) / (1.0 + (dt * epsOld) / kOld);

    // d(eps)/dt = C1eps * (eps/k) * Pk - C2eps * (eps^2/k) - div(U*eps)
    const epsNew =
      (epsOld + dt * (params.c1Eps * (epsOld / kOld) * Pk + bedSourceEps - netDivEps)) /
      (1.0 + dt * params.c2Eps * (epsOld / kOld));

    const kClamped = Math.max(1e-6, Math.min(50.0, kNew));
    const epsClamped = Math.max(1e-6, Math.min(500.0, epsNew));

    nextK[i] = kClamped;
    nextEps[i] = epsClamped;

    // Kinematic eddy viscosity nu_t = C_mu * k^2 / eps
    const rawNuT = params.cMu * (Math.pow(kClamped, 2) / epsClamped);
    const nuT = Math.min(params.eddyViscosityCapM2s, Math.max(1e-6, rawNuT));
    turb.nuT[i] = nuT;

    if (nuT > maxNuT) maxNuT = nuT;
    sumNuT += nuT;
    wetCount++;

    resK += Math.abs(kClamped - kOld);
    resEps += Math.abs(epsClamped - epsOld);
  }

  turb.k.set(nextK);
  turb.epsOrOmega.set(nextEps);

  return {
    maxNuT,
    meanNuT: wetCount > 0 ? sumNuT / wetCount : 0,
    maxK: Math.max(...Array.from(turb.k)),
    maxPk: Math.max(...Array.from(turb.pK)),
    residualK: wetCount > 0 ? resK / wetCount : 0,
    residualEpsOrOmega: wetCount > 0 ? resEps / wetCount : 0,
  };
}

/**
 * 3. k-ω SST (Shear Stress Transport) Model
 * Blends k-ω near boundaries with k-ε in the outer flow
 */
function stepKOmegaSst(
  mesh: RiverGridMesh,
  hydro: HydrodynamicsState,
  turb: TurbulenceState,
  params: TurbulenceParameters,
  dt: number
): TurbulenceDiagnostics {
  const n = mesh.cells.length;
  const nextK = new Float32Array(n);
  const nextOmega = new Float32Array(n);

  let maxNuT = 0;
  let sumNuT = 0;
  let wetCount = 0;

  for (let i = 0; i < n; i++) {
    const h = hydro.depth[i];
    if (h < H_DRY_TURB) {
      turb.nuT[i] = 0;
      turb.k[i] = 1e-6;
      turb.epsOrOmega[i] = 1.0;
      turb.pK[i] = 0;
      nextK[i] = 1e-6;
      nextOmega[i] = 1.0;
      continue;
    }

    const cell = mesh.cells[i];
    const kOld = Math.max(1e-6, turb.k[i]);
    const omegaOld = Math.max(1e-3, turb.epsOrOmega[i]);
    const nuTOld = Math.max(1e-6, turb.nuT[i]);

    const S = computeStrainRateMagnitude(mesh, hydro, i);
    const Pk = nuTOld * Math.pow(S, 2);
    turb.pK[i] = Pk;

    // Blending function F1 based on depth
    const yDist = Math.max(0.01, h * 0.5);
    const arg1 = Math.min(
      Math.max(Math.sqrt(kOld) / (params.betaStar * omegaOld * yDist), 500 / (Math.pow(yDist, 2) * omegaOld)),
      10.0
    );
    const F1 = Math.tanh(Math.pow(arg1, 4));

    const alpha = F1 * params.alpha1 + (1 - F1) * params.alpha2;
    const beta = F1 * params.beta1 + (1 - F1) * params.beta2;

    // Time advancement with positivity limiter
    const kNew = (kOld + dt * Pk) / (1.0 + dt * params.betaStar * omegaOld);
    const omegaNew = (omegaOld + dt * (alpha * (omegaOld / kOld) * Pk)) / (1.0 + dt * beta * omegaOld);

    const kClamped = Math.max(1e-6, Math.min(50.0, kNew));
    const omegaClamped = Math.max(1e-3, Math.min(1000.0, omegaNew));

    nextK[i] = kClamped;
    nextOmega[i] = omegaClamped;

    // SST Limiter for eddy viscosity
    const F2 = Math.tanh(Math.pow(Math.max((2 * Math.sqrt(kClamped)) / (params.betaStar * omegaClamped * yDist), 500 / (Math.pow(yDist, 2) * omegaClamped)), 2));
    const denom = Math.max(params.a1 * omegaClamped, S * F2);
    const rawNuT = (params.a1 * kClamped) / Math.max(1e-6, denom);

    const nuT = Math.min(params.eddyViscosityCapM2s, Math.max(1e-6, rawNuT));
    turb.nuT[i] = nuT;

    if (nuT > maxNuT) maxNuT = nuT;
    sumNuT += nuT;
    wetCount++;
  }

  turb.k.set(nextK);
  turb.epsOrOmega.set(nextOmega);

  return {
    maxNuT,
    meanNuT: wetCount > 0 ? sumNuT / wetCount : 0,
    maxK: Math.max(...Array.from(turb.k)),
    maxPk: Math.max(...Array.from(turb.pK)),
    residualK: 0,
    residualEpsOrOmega: 0,
  };
}

/**
 * Calculates strain-rate tensor magnitude |S| = sqrt(2*S_ij*S_ij)
 */
function computeStrainRateMagnitude(
  mesh: RiverGridMesh,
  hydro: HydrodynamicsState,
  cellIdx: number
): number {
  const cell = mesh.cells[cellIdx];
  const u0 = hydro.u[cellIdx];
  const v0 = hydro.v[cellIdx];

  let dudx = 0;
  let dudy = 0;
  let dvdx = 0;
  let dvdy = 0;
  let count = 0;

  for (let f = 0; f < cell.neighbors.length; f++) {
    const nId = cell.neighbors[f];
    if (nId >= 0 && nId < mesh.cells.length && hydro.depth[nId] >= H_DRY_TURB) {
      const neighbor = mesh.cells[nId];
      const dx = neighbor.centerX - cell.centerX;
      const dy = neighbor.centerY - cell.centerY;
      const dist = Math.hypot(dx, dy);

      if (dist > 0.05) {
        const du = hydro.u[nId] - u0;
        const dv = hydro.v[nId] - v0;
        dudx += (du / dist) * (dx / dist);
        dudy += (du / dist) * (dy / dist);
        dvdx += (dv / dist) * (dx / dist);
        dvdy += (dv / dist) * (dy / dist);
        count++;
      }
    }
  }

  if (count > 0) {
    dudx /= count;
    dudy /= count;
    dvdx /= count;
    dvdy /= count;
  }

  const sxx = dudx;
  const syy = dvdy;
  const sxy = 0.5 * (dudy + dvdx);

  return Math.sqrt(Math.max(1e-6, 2 * (sxx * sxx + syy * syy) + 4 * (sxy * sxy)));
}
