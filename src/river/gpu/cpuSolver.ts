/**
 * Reference CPU 2D Finite-Volume Shallow-Water + RANS + Sediment Solver
 *
 * Implements:
 * 1. Audusse et al. (2004) well-balanced hydrostatic reconstruction (preserves C-property)
 * 2. HLL approximate Riemann solver across arbitrary quad mesh cell faces
 * 3. Semi-implicit Manning friction integration to prevent velocity oscillations in shallow water
 * 4. Wet-dry bed tracking with positive depth preservation (H_dry = 0.001 m)
 * 5. Direct coupling with depth-averaged RANS turbulence (Mixing length, k-eps, k-omega SST)
 * 6. Direct coupling with 6 hydraulic structure formulations
 * 7. Direct coupling with sediment transport & Exner bed morphodynamics
 */

import {
  RiverGridMesh,
  HydrodynamicsState,
  RiverBoundaryConditions,
} from '../types/riverReach';
import {
  TurbulenceParameters,
  TurbulenceState,
} from '../types/turbulence';
import {
  SedimentParameters,
  SedimentState,
} from '../types/sediment';
import { RiverHydraulicStructure } from '../structures/structureTypes';
import { computeStructureFluxModifier } from '../structures/structureFlux';
import { stepTurbulenceModel } from '../turbulence/turbulenceModels';
import { stepSedimentTransport } from '../sediment/sedimentTransport';

const G = 9.81;
const H_DRY = 0.001; // 1 mm dry threshold

export interface CpuSolverContext {
  mesh: RiverGridMesh;
  hydro: HydrodynamicsState;
  turb: TurbulenceState;
  sed: SedimentState;
  boundaries: RiverBoundaryConditions;
  structures: RiverHydraulicStructure[];
  turbParams: TurbulenceParameters;
  sedParams: SedimentParameters;
  stepCount: number;
}

export function createInitialHydroState(
  mesh: RiverGridMesh,
  boundaries: RiverBoundaryConditions
): HydrodynamicsState {
  const numCells = mesh.cells.length;
  const depth = new Float32Array(numCells);
  const wse = new Float32Array(numCells);
  const u = new Float32Array(numCells);
  const v = new Float32Array(numCells);
  const velocityMag = new Float32Array(numCells);
  const froude = new Float32Array(numCells);
  const shearStress = new Float32Array(numCells);
  const isWet = new Uint8Array(numCells);

  const initH = Math.max(0.01, boundaries.initialWaterDepthM || 1.0);
  const qIn = boundaries.upstreamDischargeM3s || 0;
  const estWidth = Math.max(5.0, mesh.meanWidthM || 20.0);
  const meanVel = qIn > 0 ? Math.min(5.0, qIn / (estWidth * initH)) : 0.0;
  const ny = Math.max(1, mesh.ny);

  for (let c = 0; c < numCells; c++) {
    const cell = mesh.cells[c];
    depth[c] = initH;
    wse[c] = cell.bedElevation + initH;

    if (meanVel > 0) {
      // Parabolic boundary layer across channel width
      const eta = (cell.j + 0.5) / ny;
      const prof = 1.5 * 4.0 * eta * (1.0 - eta);

      // Streamwise unit tangent vector
      let dirX = 1.0;
      let dirY = 0.0;
      const nextStreamwise = (cell.i + 1) * ny + cell.j;
      if (cell.i + 1 < mesh.nx && mesh.cells[nextStreamwise]) {
        const dX = mesh.cells[nextStreamwise].centerX - cell.centerX;
        const dY = mesh.cells[nextStreamwise].centerY - cell.centerY;
        const len = Math.hypot(dX, dY);
        if (len > 1e-4) {
          dirX = dX / len;
          dirY = dY / len;
        }
      } else if (cell.i > 0) {
        const prevStreamwise = (cell.i - 1) * ny + cell.j;
        if (mesh.cells[prevStreamwise]) {
          const dX = cell.centerX - mesh.cells[prevStreamwise].centerX;
          const dY = cell.centerY - mesh.cells[prevStreamwise].centerY;
          const len = Math.hypot(dX, dY);
          if (len > 1e-4) {
            dirX = dX / len;
            dirY = dY / len;
          }
        }
      }

      const cellVel = meanVel * prof;
      u[c] = cellVel * dirX;
      v[c] = cellVel * dirY;
      velocityMag[c] = cellVel;
      froude[c] = cellVel / Math.sqrt(G * initH);
      shearStress[c] =
        (1000.0 * G * cell.manningN * cell.manningN * cellVel * cellVel) /
        Math.max(Math.cbrt(initH), 0.05);
    } else {
      u[c] = 0.0;
      v[c] = 0.0;
      velocityMag[c] = 0.0;
      froude[c] = 0.0;
      shearStress[c] = 0.0;
    }
    isWet[c] = 1;
  }

  return {
    timeSec: 0,
    stepCount: 0,
    depth,
    wse,
    u,
    v,
    velocityMag,
    froude,
    shearStress,
    isWet,
  };
}

/**
 * Compute Courant-Friedrichs-Lewy (CFL) stable time step
 */
export function computeStableTimeStep(
  mesh: RiverGridMesh,
  hydro: HydrodynamicsState,
  cfl: number = 0.5,
  maxDt: number = 1.0
): number {
  let minDt = maxDt;

  for (let c = 0; c < mesh.cells.length; c++) {
    const h = hydro.depth[c];
    if (h <= H_DRY) continue;

    const cell = mesh.cells[c];
    const vel = hydro.velocityMag[c];
    const waveSpeed = Math.sqrt(G * h);
    const maxSpeed = vel + waveSpeed;

    const charLength = Math.sqrt(cell.areaM2);
    const dtCell = (cfl * charLength) / Math.max(maxSpeed, 0.1);
    if (dtCell < minDt) {
      minDt = dtCell;
    }
  }

  return Math.max(0.01, Math.min(minDt, maxDt));
}

/**
 * HLL Riemann Solver with Audusse Hydrostatic Bed Reconstruction
 */
function computeHllFlux(
  hL: number,
  uL: number,
  vL: number,
  zL: number,
  hR: number,
  uR: number,
  vR: number,
  zR: number,
  nx: number,
  ny: number
): { fluxH: number; fluxHu: number; fluxHv: number } {
  // 1. Audusse Hydrostatic Reconstruction at interface
  const zMax = Math.max(zL, zR);
  const etaL = hL + zL;
  const etaR = hR + zR;

  const hStarL = Math.max(0.0, etaL - zMax);
  const hStarR = Math.max(0.0, etaR - zMax);

  // If both sides are dry after reconstruction
  if (hStarL <= H_DRY && hStarR <= H_DRY) {
    return { fluxH: 0, fluxHu: 0, fluxHv: 0 };
  }

  // Project velocities onto face normal (vn) and tangential (vt)
  const vnL = uL * nx + vL * ny;
  const vtL = -uL * ny + vL * nx;

  const vnR = uR * nx + vR * ny;
  const vtR = -uR * ny + vR * nx;

  // Wave speeds sL and sR
  const cL = Math.sqrt(G * hStarL);
  const cR = Math.sqrt(G * hStarR);

  const sL = Math.min(vnL - cL, vnR - cR);
  const sR = Math.max(vnL + cL, vnR + cR);

  // Flux evaluation in normal coordinates [h*vn, h*vn^2 + 0.5*g*h^2, h*vn*vt]
  const fluxNormL_h = hStarL * vnL;
  const fluxNormL_u = hStarL * vnL * vnL + 0.5 * G * hStarL * hStarL;
  const fluxNormL_v = hStarL * vnL * vtL;

  const fluxNormR_h = hStarR * vnR;
  const fluxNormR_u = hStarR * vnR * vnR + 0.5 * G * hStarR * hStarR;
  const fluxNormR_v = hStarR * vnR * vtR;

  let fNormH: number;
  let fNormU: number;
  let fNormV: number;

  if (sL >= 0.0) {
    // Supersonic flow to the right
    fNormH = fluxNormL_h;
    fNormU = fluxNormL_u;
    fNormV = fluxNormL_v;
  } else if (sR <= 0.0) {
    // Supersonic flow to the left
    fNormH = fluxNormR_h;
    fNormU = fluxNormR_u;
    fNormV = fluxNormR_v;
  } else {
    // Subsonic flow: HLL weighted average
    const denom = sR - sL;
    fNormH = (sR * fluxNormL_h - sL * fluxNormR_h + sR * sL * (hStarR - hStarL)) / denom;
    fNormU =
      (sR * fluxNormL_u -
        sL * fluxNormR_u +
        sR * sL * (hStarR * vnR - hStarL * vnL)) /
      denom;
    fNormV =
      (sR * fluxNormL_v -
        sL * fluxNormR_v +
        sR * sL * (hStarR * vtR - hStarL * vtL)) /
      denom;
  }

  // Rotate back to Cartesian coordinates (x, y)
  // flux_x = fNormU * nx - fNormV * ny
  // flux_y = fNormU * ny + fNormV * nx
  const fluxHu = fNormU * nx - fNormV * ny;
  const fluxHv = fNormU * ny + fNormV * nx;

  return {
    fluxH: fNormH,
    fluxHu,
    fluxHv,
  };
}

/**
 * Advance the CPU 2D Shallow Water Solver by dtSec
 */
export function stepCpuSolver(ctx: CpuSolverContext, dtSec: number): void {
  const { mesh, hydro, boundaries, structures, turbParams, sedParams } = ctx;
  const numCells = mesh.cells.length;

  const nextH = new Float32Array(numCells);
  const nextHu = new Float32Array(numCells);
  const nextHv = new Float32Array(numCells);

  // Initialize accumulators with current values
  for (let c = 0; c < numCells; c++) {
    const h = hydro.depth[c];
    nextH[c] = h;
    nextHu[c] = h * hydro.u[c];
    nextHv[c] = h * hydro.v[c];
  }

  // Pre-index structures by cell and build solid cell mask
  const structMap = new Map<number, RiverHydraulicStructure>();
  const solidMask = new Uint8Array(numCells);

  for (const s of structures) {
    if (s.enabled) {
      for (const cellIdx of s.cellIndices) {
        if (cellIdx >= 0 && cellIdx < numCells) {
          structMap.set(cellIdx, s);
          const isSolid =
            s.type === 'obstacle' ||
            (s as any).solidMasking === true ||
            (s.type === 'circle' && (s as any).solidMasking !== false) ||
            ((s.type === 'polygon' || s.type === 'rectangle' || s.type === 'line' || s.type === 'polyline') && (s as any).solidMasking);
          if (isSolid) {
            solidMask[cellIdx] = 1;
          }
        }
      }
    }
  }

  // Rainfall source term (m/s)
  const rainfallRateMs = (boundaries.rainfallMmPerHour || 0) / (3600.0 * 1000.0);

  // Map tributary confluences to cells
  const tribInflowMap = new Map<number, number>();
  if (boundaries.tributaryInflows && boundaries.tributaryInflows.length > 0) {
    for (const trib of boundaries.tributaryInflows) {
      if (trib.cellIndices && trib.cellIndices.length > 0) {
        const qPerCell = trib.dischargeM3s / trib.cellIndices.length;
        for (const idx of trib.cellIndices) {
          tribInflowMap.set(idx, (tribInflowMap.get(idx) || 0) + qPerCell);
        }
      }
    }
  }

  // Compute fluxes across all faces for each cell
  for (let c = 0; c < numCells; c++) {
    if (solidMask[c] === 1) {
      nextH[c] = 0.0;
      nextHu[c] = 0.0;
      nextHv[c] = 0.0;
      continue;
    }

    const cell = mesh.cells[c];
    const hL = hydro.depth[c];
    const uL = hydro.u[c];
    const vL = hydro.v[c];
    const zL = cell.bedElevation;

    let fluxSumH = 0;
    let fluxSumHu = 0;
    let fluxSumHv = 0;
    let diffSumHu = 0;
    let diffSumHv = 0;

    const numFaces = cell.neighbors.length;

    for (let f = 0; f < numFaces; f++) {
      const nbr = cell.neighbors[f];
      const length = cell.faceLengths[f];
      const [nx, ny] = cell.faceNormals[f];

      let hR = hL;
      let uR = uL;
      let vR = vL;
      let zR = zL;

      if (nbr >= 0 && solidMask[nbr] === 1) {
        // Internal solid obstacle: strict no-slip wall (u_wall = 0, v_wall = 0)
        uR = -uL;
        vR = -vL;
        hR = hL;
        zR = zL;

        // No-slip wall viscous shear force
        const dWall = 0.5 * Math.max(1.0, Math.sqrt(cell.areaM2));
        const nuEff = 1e-4 + (ctx.turb.nuT ? ctx.turb.nuT[c] : 0.0);
        diffSumHu += nuEff * hL * ((0.0 - uL) / dWall) * length;
        diffSumHv += nuEff * hL * ((0.0 - vL) / dWall) * length;
      } else if (nbr >= 0) {
        // Internal face with fluid neighbor
        hR = hydro.depth[nbr];
        uR = hydro.u[nbr];
        vR = hydro.v[nbr];
        zR = mesh.cells[nbr].bedElevation;

        // Fluid-fluid viscous & turbulent momentum diffusion
        const nbrCell = mesh.cells[nbr];
        const dist = Math.max(0.5, Math.hypot(nbrCell.centerX - cell.centerX, nbrCell.centerY - cell.centerY));
        const hFace = 0.5 * (hL + hR);
        const nuEffFace = 1e-4 + 0.5 * ((ctx.turb.nuT ? ctx.turb.nuT[c] : 0.0) + (ctx.turb.nuT ? ctx.turb.nuT[nbr] : 0.0));
        diffSumHu += nuEffFace * hFace * ((uR - uL) / dist) * length;
        diffSumHv += nuEffFace * hFace * ((vR - vL) / dist) * length;
      } else {
        // Boundary face
        if (nbr === -1 || (f === 3 && cell.isBoundary === 'upstream')) {
          // Upstream discharge BC: Q_in = boundaries.upstreamDischargeM3s
          const qIn = boundaries.upstreamDischargeM3s;
          if (qIn > 0) {
            const hUp = Math.max(0.01, boundaries.initialWaterDepthM || 1.0);
            const estWidth = Math.max(5.0, mesh.meanWidthM || 20.0);
            const meanInflowVel = qIn / (estWidth * hUp);
            // Parabolic profile across channel width (zero at banks, 1.5x at center)
            const eta = (cell.j + 0.5) / Math.max(1, mesh.ny);
            const prof = 1.5 * 4.0 * eta * (1.0 - eta);
            const inflowVel = Math.min(15.0, meanInflowVel * prof);

            hR = hUp;
            uR = -inflowVel * nx;
            vR = -inflowVel * ny;
            zR = zL;
          } else {
            // Lake-at-rest or closed upstream: reflective wall
            const vnL = uL * nx + vL * ny;
            const vtL = -uL * ny + vL * nx;
            uR = (-vnL) * nx - vtL * ny;
            vR = (-vnL) * ny + vtL * nx;
            hR = hL;
            zR = zL;
          }
        } else if (nbr === -2 || (f === 1 && cell.isBoundary === 'downstream')) {
          // Downstream stage or normal depth BC
          if (boundaries.downstreamType === 'fixed-stage') {
            hR = Math.max(0.0, boundaries.downstreamStageM - zL);
            uR = uL;
            vR = vL;
            zR = zL;
          } else {
            // Normal depth: zero gradient extrapolation
            hR = hL;
            uR = uL;
            vR = vL;
            zR = zL;
          }
        } else {
          // Impermeable solid bank wall (no-slip / reflective wall BC)
          const vnL = uL * nx + vL * ny;
          const vtL = -uL * ny + vL * nx;
          uR = (-vnL) * nx - vtL * ny;
          vR = (-vnL) * ny + vtL * nx;
          hR = hL;
          zR = zL;

          const dWall = 0.5 * Math.max(1.0, Math.sqrt(cell.areaM2));
          const nuEff = 1e-4 + (ctx.turb.nuT ? ctx.turb.nuT[c] : 0.0);
          diffSumHu += nuEff * hL * ((0.0 - uL) / dWall) * length;
          diffSumHv += nuEff * hL * ((0.0 - vL) / dWall) * length;
        }
      }

      // Compute standard HLL flux
      let { fluxH, fluxHu, fluxHv } = computeHllFlux(
        hL,
        uL,
        vL,
        zL,
        hR,
        uR,
        vR,
        zR,
        nx,
        ny
      );

      // Check if this cell or neighbor has a custom CAD hydraulic structure
      const structC = structMap.get(c);
      if (structC) {
        const mod = computeStructureFluxModifier(structC, hL, zL, hR, zR, length);
        if (mod.fluxReductionFactor < 1.0) {
          fluxH *= mod.fluxReductionFactor;
          fluxHu *= mod.fluxReductionFactor;
          fluxHv *= mod.fluxReductionFactor;
        }
      }

      fluxSumH += fluxH * length;
      fluxSumHu += fluxHu * length;
      fluxSumHv += fluxHv * length;
    }

    // Topographic bed slope source term (Audusse well-balanced)
    // S_b = -g * h * grad(z_bed)
    let sBx = 0;
    let sBy = 0;
    for (let f = 0; f < numFaces; f++) {
      const nbr = cell.neighbors[f];
      const length = cell.faceLengths[f];
      const [nx, ny] = cell.faceNormals[f];
      const zNbr = nbr >= 0 ? mesh.cells[nbr].bedElevation : zL;
      const zStar = Math.max(zL, zNbr);
      const deltaZ = zStar - zL;
      sBx += -0.5 * G * (2.0 * hL - deltaZ) * deltaZ * nx * length;
      sBy += -0.5 * G * (2.0 * hL - deltaZ) * deltaZ * ny * length;
    }

    // Advance cell state
    const area = cell.areaM2;
    const tribQ = tribInflowMap.get(c) || 0;
    const dH = (-fluxSumH / area + rainfallRateMs + tribQ / area) * dtSec;
    const newH = Math.max(0.0, hL + dH);

    let newHu = nextHu[c] + (-fluxSumHu / area + sBx / area + diffSumHu / area) * dtSec;
    let newHv = nextHv[c] + (-fluxSumHv / area + sBy / area + diffSumHv / area) * dtSec;

    // Semi-implicit bed friction integration:
    // (hu)^(n+1) = (hu)^* / (1 + dt * g * n^2 * |V| / h^(4/3))
    if (newH > H_DRY) {
      const velMag = Math.hypot(newHu, newHv) / newH;
      const hFourThirds = Math.pow(newH, 1.333333);
      const frictionDenom =
        1.0 +
        (dtSec * G * cell.manningN * cell.manningN * velMag) /
          Math.max(hFourThirds, 0.01);

      newHu /= frictionDenom;
      newHv /= frictionDenom;
    } else {
      newHu = 0.0;
      newHv = 0.0;
    }

    nextH[c] = newH;
    nextHu[c] = newHu;
    nextHv[c] = newHv;
  }

  // Update primary hydrodynamics state buffers
  for (let c = 0; c < numCells; c++) {
    const cell = mesh.cells[c];
    if (solidMask[c] === 1) {
      hydro.depth[c] = 0.0;
      hydro.wse[c] = cell.bedElevation;
      hydro.u[c] = 0.0;
      hydro.v[c] = 0.0;
      hydro.velocityMag[c] = 0.0;
      hydro.froude[c] = 0.0;
      hydro.shearStress[c] = 0.0;
      hydro.isWet[c] = 0;
      continue;
    }

    const h = nextH[c];
    hydro.depth[c] = h;
    hydro.wse[c] = cell.bedElevation + h;

    if (h > H_DRY) {
      const u = nextHu[c] / h;
      const v = nextHv[c] / h;
      hydro.u[c] = u;
      hydro.v[c] = v;
      const velMag = Math.hypot(u, v);
      hydro.velocityMag[c] = velMag;
      hydro.froude[c] = velMag / Math.sqrt(G * h);
      hydro.shearStress[c] =
        (1000.0 * G * cell.manningN * cell.manningN * velMag * velMag) /
        Math.max(Math.cbrt(h), 0.05);
      hydro.isWet[c] = 1;
    } else {
      hydro.depth[c] = 0.0;
      hydro.u[c] = 0.0;
      hydro.v[c] = 0.0;
      hydro.velocityMag[c] = 0.0;
      hydro.froude[c] = 0.0;
      hydro.shearStress[c] = 0.0;
      hydro.isWet[c] = 0;
    }
  }

  hydro.timeSec += dtSec;
  hydro.stepCount += 1;
  ctx.stepCount += 1;

  // Step 2: Coupled RANS Turbulence Transport
  stepTurbulenceModel(mesh, hydro, ctx.turb, turbParams, dtSec);

  // Step 3: Coupled Sediment Transport & Exner Morphodynamics
  const isMorpho =
    sedParams.enabled &&
    ctx.stepCount % (sedParams.decoupledIntervalSteps || 1) === 0;

  stepSedimentTransport(
    dtSec,
    mesh,
    hydro,
    ctx.turb,
    ctx.sed,
    sedParams,
    turbParams,
    isMorpho
  );
}
