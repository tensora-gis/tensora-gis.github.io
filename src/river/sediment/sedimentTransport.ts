/**
 * Coupled 2D Sediment Transport & Morphodynamic Bed Evolution Solver
 *
 * Couples:
 * 1. Suspended sediment advective-diffusive transport with RANS eddy viscosity nu_t
 * 2. Total sediment transport capacity via classical formulas
 * 3. Exner bed evolution equation with conservative finite-volume face fluxes
 * 4. Depth change safety limiter (5% of h per morphodynamic update)
 * 5. Cumulative scour and siltation volumetric accounting
 */

import { RiverGridMesh } from '../types/riverReach';
import { HydrodynamicsState } from '../types/riverReach';
import { TurbulenceState, TurbulenceParameters } from '../types/turbulence';
import { SedimentParameters, SedimentState } from '../types/sediment';
import {
  computeBedShearStress,
  computeShieldsParameter,
  computeDimensionlessGrainDiameter,
  computeCriticalShields,
  computeSettlingVelocity,
  computeUnitSedimentTransportCapacity,
} from './transportFormulas';

export function createInitialSedimentState(mesh: RiverGridMesh): SedimentState {
  const numCells = mesh.cells.length;
  return {
    concentrationKgM3: new Float32Array(numCells),
    transportRateM2s: new Float32Array(numCells),
    shields: new Float32Array(numCells),
    criticalShearStressPa: new Float32Array(numCells),
    bedElevationChangeM: new Float32Array(numCells),
    cumulativeScourVolumeM3: 0,
    cumulativeDepositionVolumeM3: 0,
  };
}

/**
 * Perform one coupled sediment transport step.
 *
 * @param dtSec Time step for hydrodynamics
 * @param mesh Computational mesh
 * @param hydro Current hydrodynamics state
 * @param turb Current turbulence state (provides nuT for suspended diffusion)
 * @param sed Current sediment state (updated in-place or returned updated)
 * @param sedParams Sediment parameters
 * @param turbParams Turbulence parameters (provides Schmidt number)
 * @param isMorphodynamicStep Whether to advance the Exner bed evolution equation on this step
 */
export function stepSedimentTransport(
  dtSec: number,
  mesh: RiverGridMesh,
  hydro: HydrodynamicsState,
  turb: TurbulenceState,
  sed: SedimentState,
  sedParams: SedimentParameters,
  turbParams: TurbulenceParameters,
  isMorphodynamicStep: boolean
): void {
  if (!sedParams.enabled) return;

  const numCells = mesh.cells.length;
  const d50M = sedParams.d50Mm * 0.001;
  const rhoW = sedParams.waterDensityKgM3;
  const s = sedParams.specificGravity;
  const rhoS = s * rhoW;
  const porosity = sedParams.bedPorosity;
  const sigmaC = turbParams.schmidtNumberSediment || 1.0;

  const dStar = computeDimensionlessGrainDiameter(d50M, s);
  const thetaCr = computeCriticalShields(dStar);
  const tauCr = thetaCr * (s - 1.0) * rhoW * 9.81 * d50M;
  const ws =
    sedParams.settlingVelocityMs !== undefined && sedParams.settlingVelocityMs > 0
      ? sedParams.settlingVelocityMs
      : computeSettlingVelocity(d50M, s);

  // 1. Compute local shear stress, Shields, and transport capacity per cell
  for (let c = 0; c < numCells; c++) {
    const h = hydro.depth[c];
    const u = hydro.u[c];
    const v = hydro.v[c];
    const cell = mesh.cells[c];

    sed.criticalShearStressPa[c] = tauCr;

    if (h <= 0.005) {
      sed.transportRateM2s[c] = 0;
      sed.shields[c] = 0;
      continue;
    }

    const tauB = computeBedShearStress(h, u, v, cell.manningN, rhoW);
    const theta = computeShieldsParameter(tauB, d50M, s, rhoW);
    sed.shields[c] = theta;

    const qs = computeUnitSedimentTransportCapacity(
      sedParams.formula,
      h,
      u,
      v,
      tauB,
      d50M,
      s,
      rhoW
    );
    sed.transportRateM2s[c] = qs;
  }

  // 2. Suspended Sediment Advection-Diffusion:
  // d(h*C)/dt + div(h*C*V) = div( nu_t/sigma_c * h * grad(C) ) + ws*(C_eq - C)
  const nextC = new Float32Array(numCells);

  for (let c = 0; c < numCells; c++) {
    const cell = mesh.cells[c];
    const h = hydro.depth[c];
    const C = sed.concentrationKgM3[c];
    const u = hydro.u[c];
    const v = hydro.v[c];
    const velMag = Math.hypot(u, v);
    const qs = sed.transportRateM2s[c];

    if (h <= 0.005) {
      nextC[c] = 0;
      continue;
    }

    // Equilibrium suspended concentration C_eq (kg/m^3)
    // Volumetric fraction approx qs / (h * V) multiplied by sediment mass density rhoS
    const cEq = velMag > 0.01 ? Math.min(100.0, (qs * rhoS) / (h * velMag)) : 0.0;

    let fluxSum = 0; // Net flux into cell
    const numFaces = cell.neighbors.length;

    for (let f = 0; f < numFaces; f++) {
      const nbr = cell.neighbors[f];
      const length = cell.faceLengths[f];
      const [nx, ny] = cell.faceNormals[f];

      if (nbr >= 0) {
        // Internal face between cell and nbr
        const hNbr = hydro.depth[nbr];
        const uNbr = hydro.u[nbr];
        const vNbr = hydro.v[nbr];
        const cNbr = sed.concentrationKgM3[nbr];

        // Normal velocity at face
        const uFace = 0.5 * (u + uNbr);
        const vFace = 0.5 * (v + vNbr);
        const vn = uFace * nx + vFace * ny;
        const hFace = 0.5 * (h + hNbr);

        // Upwind concentration
        const cUpwind = vn >= 0 ? C : cNbr;
        const advFlux = vn * hFace * cUpwind * length;

        // Turbulent diffusion flux: Gamma_t = nuT_face / sigma_c
        const nuTFace = 0.5 * (turb.nuT[c] + turb.nuT[nbr]);
        const gammaT = nuTFace / sigmaC;

        const dx = mesh.cells[nbr].centerX - cell.centerX;
        const dy = mesh.cells[nbr].centerY - cell.centerY;
        const dist = Math.max(Math.hypot(dx, dy), 1.0);
        const diffFlux = -gammaT * hFace * ((cNbr - C) / dist) * length;

        fluxSum += -(advFlux + diffFlux);
      } else {
        // Boundary face
        if (cell.isBoundary === 'upstream') {
          // Inflowing boundary: slight ambient concentration or equilibrium
          const vn = u * nx + v * ny;
          if (vn < 0) {
            const advFlux = vn * h * cEq * length;
            fluxSum += -advFlux;
          }
        } else if (cell.isBoundary === 'downstream') {
          const vn = u * nx + v * ny;
          if (vn > 0) {
            const advFlux = vn * h * C * length;
            fluxSum += -advFlux;
          }
        }
      }
    }

    // Source/sink term: E - D = ws * (C_eq - C)
    const sourceSink = ws * (cEq - C);

    // Update concentration C
    const dH_C = (fluxSum / cell.areaM2 + sourceSink) * dtSec;
    const newHC = Math.max(0, h * C + dH_C);
    nextC[c] = newHC / Math.max(h, 0.005);
  }

  // Update concentration buffer
  sed.concentrationKgM3.set(nextC);

  // 3. Exner Bed Evolution Equation (if morphodynamic sub-stepping triggered)
  // (1 - p) * d(z_b)/dt = - div(q_s)
  if (isMorphodynamicStep) {
    const morphDtSec = dtSec * (sedParams.decoupledIntervalSteps || 1);
    let stepScourVol = 0;
    let stepDepoVol = 0;

    for (let c = 0; c < numCells; c++) {
      const cell = mesh.cells[c];
      const h = hydro.depth[c];
      if (h <= 0.005) continue;

      const u = hydro.u[c];
      const v = hydro.v[c];
      const velMag = Math.hypot(u, v);
      const dirX = velMag > 0.001 ? u / velMag : 1.0;
      const dirY = velMag > 0.001 ? v / velMag : 0.0;
      const qsC = sed.transportRateM2s[c];

      let netSedFluxOut = 0;
      const numFaces = cell.neighbors.length;

      for (let f = 0; f < numFaces; f++) {
        const nbr = cell.neighbors[f];
        const length = cell.faceLengths[f];
        const [nx, ny] = cell.faceNormals[f];

        // Alignment of flow with face outward normal
        const flowDotN = dirX * nx + dirY * ny;

        let qsFace = qsC;
        if (nbr >= 0) {
          const qsNbr = sed.transportRateM2s[nbr];
          // Upwind transport rate
          qsFace = flowDotN >= 0 ? qsC : qsNbr;
        }

        const faceFlux = qsFace * flowDotN * length;
        netSedFluxOut += faceFlux;
      }

      // Delta z_b = - morphDt / (1 - p) * (div q_s)
      const divQs = netSedFluxOut / cell.areaM2;
      let dzB = -(morphDtSec / (1.0 - porosity)) * divQs;

      // Numerical bed change cap: max 5% of local depth per step
      const maxDz = Math.max(0.0001, h * sedParams.bedChangeCapPct);
      if (dzB > maxDz) dzB = maxDz;
      if (dzB < -maxDz) dzB = -maxDz;

      sed.bedElevationChangeM[c] += dzB;
      cell.bedElevation += dzB;

      const dVol = dzB * cell.areaM2;
      if (dVol < 0) {
        stepScourVol += Math.abs(dVol);
      } else {
        stepDepoVol += dVol;
      }
    }

    sed.cumulativeScourVolumeM3 += stepScourVol;
    sed.cumulativeDepositionVolumeM3 += stepDepoVol;
  }
}
