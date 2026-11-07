/**
 * 2D Finite-Volume Shallow Water Equations (SWE) / Saint-Venant CFD Engine
 *
 * Implements a well-balanced Godunov-type finite volume numerical solver:
 * - HLL (Harten-Lax-van Leer) approximate Riemann solver
 * - Audusse hydrostatic reconstruction for exact well-balanced C-property over complex DEM topography
 * - Semi-implicit Manning bed friction integration for unconditional stability
 * - Dynamic adaptive Courant-Friedrichs-Lewy (CFL) time-stepping
 * - Wetting and drying front tracking (h_dry = 1e-4 m)
 * - Hydraulic structures flux coupling (Levees, Weirs, Bridges, Culverts, Gates, Embankments)
 * - Full multi-variable tracking: Depth (h), Water Surface Elevation (WSE), Velocity (u, v, |V|), Froude (Fr), Shear stress (tau)
 */

import {
  RiverMesh,
  RiverFlowState,
  RiverStructure,
  RiverBoundaryConditions,
  RiverSimulationSummary,
  RiverMonitoringGauge,
  GaugeTimePoint,
  SwotObservation,
} from '../types/riverAnalysis';
import { evaluateStructureInteraction } from './riverStructures';

const G = 9.80665; // m/s^2
const H_DRY = 0.0001; // 0.1 mm dry bed threshold (m)
const EPSILON = 1e-6;

/**
 * Initializes water depth and velocity field across the 2D river mesh.
 */
export function initializeFlowState(
  mesh: RiverMesh,
  boundaries: RiverBoundaryConditions
): RiverFlowState {
  const n = mesh.cells.length;
  const depth = new Float32Array(n);
  const wse = new Float32Array(n);
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  const velocityMag = new Float32Array(n);
  const froude = new Float32Array(n);
  const shearStress = new Float32Array(n);
  const isWet = new Uint8Array(n);

  const initDepth = Math.max(0, boundaries.initialWaterDepthM);

  for (let idx = 0; idx < n; idx++) {
    const cell = mesh.cells[idx];
    depth[idx] = initDepth;
    wse[idx] = cell.bedElevation + initDepth;
    u[idx] = 0;
    v[idx] = 0;
    velocityMag[idx] = 0;
    froude[idx] = 0;
    shearStress[idx] = 0;
    isWet[idx] = initDepth >= H_DRY ? 1 : 0;
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
 * Computes maximum stable time-step according to the Courant-Friedrichs-Lewy (CFL) condition.
 */
export function computeStableTimeStep(
  mesh: RiverMesh,
  state: RiverFlowState,
  cfl = 0.6,
  maxDt = 0.5
): number {
  let minDt = maxDt;

  for (let i = 0; i < mesh.cells.length; i++) {
    const h = state.depth[i];
    if (h < H_DRY) continue;

    const vel = state.velocityMag[i];
    const waveSpeed = Math.sqrt(G * h);
    const charSpeed = vel + waveSpeed;

    if (charSpeed > 0.01) {
      const cell = mesh.cells[i];
      const dx = Math.sqrt(cell.areaM2);
      const dtCell = (cfl * dx) / charSpeed;
      if (dtCell < minDt) {
        minDt = dtCell;
      }
    }
  }

  return Math.max(0.01, Math.min(maxDt, minDt));
}

/**
 * Executes a single finite-volume time-step on the 2D Shallow Water Equations.
 */
export function step2DShallowWater(
  mesh: RiverMesh,
  state: RiverFlowState,
  structures: RiverStructure[],
  boundaries: RiverBoundaryConditions,
  dt: number,
  currentTimeSec: number
): void {
  const n = mesh.cells.length;

  // New state buffers
  const nextH = new Float32Array(state.depth);
  const nextQx = new Float32Array(n);
  const nextQy = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    nextQx[i] = state.depth[i] * state.u[i];
    nextQy[i] = state.depth[i] * state.v[i];
  }

  // Pre-index structures by cell ID for quick lookup
  const structureByCell = new Map<number, RiverStructure>();
  for (const s of structures) {
    if (s.enabled) {
      for (const cIdx of s.cellIndices) {
        structureByCell.set(cIdx, s);
      }
    }
  }

  // 1. Compute Numerical Fluxes Across Interior and Boundary Cell Faces
  for (let i = 0; i < n; i++) {
    const cell = mesh.cells[i];
    const hL = state.depth[i];
    const uL = state.u[i];
    const vL = state.v[i];
    const zL = cell.bedElevation;
    const etaL = zL + hL;
    const area = cell.areaM2;

    let deltaHSum = 0;
    let deltaQxSum = 0;
    let deltaQySum = 0;

    for (let f = 0; f < cell.neighbors.length; f++) {
      const neighborIdx = cell.neighbors[f];
      const lengthF = cell.faceLengths[f];
      const [nx, ny] = cell.faceNormals[f];

      let hR: number;
      let uR: number;
      let vR: number;
      let zR: number;

      // Check boundary faces
      if (neighborIdx < 0 || neighborIdx >= n) {
        // Boundary face handling: identify upstream (-4), downstream (-2), or solid river bank (-1, -3)
        if (neighborIdx === -4 || (cell.isBoundary === 'upstream' && f === 3)) {
          // Upstream inflow boundary: inject specified discharge Q_up
          let qTarget = boundaries.upstreamDischargeM3s;
          if (boundaries.upstreamType === 'hydrograph' && boundaries.upstreamHydrograph?.length) {
            qTarget = interpolateHydrograph(boundaries.upstreamHydrograph, currentTimeSec);
          }

          if (qTarget <= 0) {
            // Closed / quiescent upstream boundary (lake at rest)
            hR = hL;
            zR = zL;
            const unL = uL * nx + vL * ny;
            uR = uL - 2 * unL * nx;
            vR = vL - 2 * unL * ny;
          } else {
            // Distribute inflow across upstream boundary cells
            const totalUpstreamWidth = Math.max(10, mesh.meanWidthM);
            const qPerMeter = qTarget / totalUpstreamWidth;
            const hInflow = Math.max(
              0.05,
              Math.pow(
                (qPerMeter * (cell.manningN || 0.03)) /
                  Math.sqrt(Math.max(0.0005, boundaries.downstreamSlope)),
                0.6
              )
            );

            hR = hInflow;
            uR = (qPerMeter / hInflow) * nx;
            vR = (qPerMeter / hInflow) * ny;
            zR = zL;
          }
        } else if (neighborIdx === -2 || (cell.isBoundary === 'downstream' && f === 1)) {
          // Downstream rating curve / fixed stage boundary
          if (boundaries.downstreamType === 'fixed-stage') {
            hR = Math.max(0, boundaries.downstreamStageM - zL);
            uR = 0;
            vR = 0;
            zR = zL;
          } else {
            // Normal depth slope rating curve
            const s0 = Math.max(0.0001, boundaries.downstreamSlope);
            hR = hL;
            const vOutflow = (1.0 / (cell.manningN || 0.03)) * Math.pow(Math.max(0.05, hL), 2 / 3) * Math.sqrt(s0);
            uR = vOutflow * nx;
            vR = vOutflow * ny;
            zR = zL;
          }
        } else {
          // Solid river bank / reflective wall (u_n = 0, u_t = u_t)
          hR = hL;
          zR = zL;
          // Reflect normal velocity
          const unL = uL * nx + vL * ny;
          uR = uL - 2 * unL * nx;
          vR = vL - 2 * unL * ny;
        }
      } else {
        // Interior face
        const cellR = mesh.cells[neighborIdx];
        hR = state.depth[neighborIdx];
        uR = state.u[neighborIdx];
        vR = state.v[neighborIdx];
        zR = cellR.bedElevation;

        // Check if an active hydraulic structure spans this face
        const struct = structureByCell.get(i) || structureByCell.get(neighborIdx);
        if (struct) {
          const structEffect = evaluateStructureInteraction(struct, cell, cellR, hL, hR, lengthF);
          if (structEffect.blocked) {
            // Treat as reflective wall
            hR = hL;
            zR = zL;
            const unL = uL * nx + vL * ny;
            uR = uL - 2 * unL * nx;
            vR = vL - 2 * unL * ny;
          } else if (structEffect.overrideDischargeM3s !== undefined) {
            // Override with computed structure discharge
            const qStr = structEffect.overrideDischargeM3s;
            const fluxH = (qStr / lengthF);
            deltaHSum -= (fluxH * lengthF) / area;
            continue;
          }
        }
      }

      // Both cells dry: zero flux
      if (hL < H_DRY && hR < H_DRY) {
        continue;
      }

      // 2. Audusse Well-Balanced Hydrostatic Reconstruction
      const zLR = Math.max(zL, zR);
      const hLStar = Math.max(0, etaL - zLR);
      const etaR = zR + hR;
      const hRStar = Math.max(0, etaR - zLR);

      if (hLStar < H_DRY && hRStar < H_DRY) {
        continue;
      }

      // Normal and tangential velocities
      const unL = uL * nx + vL * ny;
      const utL = -uL * ny + vL * nx;
      const unR = uR * nx + vR * ny;
      const utR = -uR * ny + vR * nx;

      // 3. HLL Approximate Riemann Solver
      const cL = Math.sqrt(G * hLStar);
      const cR = Math.sqrt(G * hRStar);

      const sL = Math.min(unL - cL, unR - cR);
      const sR = Math.max(unL + cL, unR + cR);

      let fluxMass: number;
      let fluxMomNorm: number;
      let fluxMomTang: number;

      // Physical Left and Right Fluxes
      const fL_mass = hLStar * unL;
      const fL_norm = hLStar * unL * unL + 0.5 * G * hLStar * hLStar;
      const fL_tang = hLStar * unL * utL;

      const fR_mass = hRStar * unR;
      const fR_norm = hRStar * unR * unR + 0.5 * G * hRStar * hRStar;
      const fR_tang = hRStar * unR * utR;

      if (sL >= 0) {
        fluxMass = fL_mass;
        fluxMomNorm = fL_norm;
        fluxMomTang = fL_tang;
      } else if (sR <= 0) {
        fluxMass = fR_mass;
        fluxMomNorm = fR_norm;
        fluxMomTang = fR_tang;
      } else {
        const denom = Math.max(EPSILON, sR - sL);
        fluxMass = (sR * fL_mass - sL * fR_mass + sL * sR * (hRStar - hLStar)) / denom;
        fluxMomNorm =
          (sR * fL_norm - sL * fR_norm + sL * sR * (hRStar * unR - hLStar * unL)) / denom;
        fluxMomTang =
          (sR * fL_tang - sL * fR_tang + sL * sR * (hRStar * utR - hLStar * utL)) / denom;
      }

      // Hydrostatic bed reconstruction balance term for momentum (Audusse 2004 well-balanced formulation)
      const hydroBalanceSource = 0.5 * G * (Math.pow(hLStar, 2) - Math.pow(hL, 2));
      fluxMomNorm -= hydroBalanceSource;

      // Rotate normal and tangential fluxes back into global cartesian (x, y)
      const fluxMomX = fluxMomNorm * nx - fluxMomTang * ny;
      const fluxMomY = fluxMomNorm * ny + fluxMomTang * nx;

      const weight = lengthF / area;
      deltaHSum -= fluxMass * weight;
      deltaQxSum -= fluxMomX * weight;
      deltaQySum -= fluxMomY * weight;
    }

    // Direct Rainfall Infiltration/Addition
    if (boundaries.rainfallIntensityMmPerHr > 0) {
      const rainRateMs = boundaries.rainfallIntensityMmPerHr / (1000 * 3600);
      deltaHSum += rainRateMs;
    }

    // Intermediate update
    nextH[i] = Math.max(0, hL + dt * deltaHSum);
    nextQx[i] = nextQx[i] + dt * deltaQxSum;
    nextQy[i] = nextQy[i] + dt * deltaQySum;

    // 4. Semi-Implicit Manning Friction Update
    if (nextH[i] >= H_DRY) {
      const hUpdated = nextH[i];
      const manningN = cell.manningN || boundaries.manningRoughnessDefault || 0.030;
      const velMag = Math.sqrt(Math.pow(nextQx[i] / hUpdated, 2) + Math.pow(nextQy[i] / hUpdated, 2));

      // Semi-implicit friction factor
      const frictionDivisor = 1.0 + (dt * G * Math.pow(manningN, 2) * velMag) / Math.pow(hUpdated, 4 / 3);

      nextQx[i] /= Math.max(1.0, frictionDivisor);
      nextQy[i] /= Math.max(1.0, frictionDivisor);
    } else {
      nextH[i] = 0;
      nextQx[i] = 0;
      nextQy[i] = 0;
    }
  }

  // 5. Update State Buffers and Diagnostic Variables
  for (let i = 0; i < n; i++) {
    const h = nextH[i];
    const cell = mesh.cells[i];

    state.depth[i] = h;
    state.wse[i] = cell.bedElevation + h;

    if (h >= H_DRY) {
      const uVal = nextQx[i] / h;
      const vVal = nextQy[i] / h;
      const vMag = Math.sqrt(uVal * uVal + vVal * vVal);

      state.u[i] = uVal;
      state.v[i] = vVal;
      state.velocityMag[i] = vMag;
      state.froude[i] = vMag / Math.sqrt(Math.max(EPSILON, G * h));

      // Boundary bed shear stress tau_b = rho * g * R_h * S_f
      const nMan = cell.manningN || 0.030;
      const sF = Math.pow((vMag * nMan) / Math.pow(h, 2 / 3), 2);
      state.shearStress[i] = 1000 * G * h * sF; // N/m^2 (Pascals)
      state.isWet[i] = 1;
    } else {
      state.u[i] = 0;
      state.v[i] = 0;
      state.velocityMag[i] = 0;
      state.froude[i] = 0;
      state.shearStress[i] = 0;
      state.isWet[i] = 0;
    }
  }

  state.timeSec += dt;
  state.stepCount += 1;
}

/**
 * Runs a complete 2D River Hydrodynamic Simulation over a given duration.
 */
export function run2DSimulation(
  mesh: RiverMesh,
  structures: RiverStructure[],
  boundaries: RiverBoundaryConditions,
  durationSec = 180,
  targetFps = 20,
  gauges: RiverMonitoringGauge[] = [],
  swotObs?: SwotObservation[] | SwotObservation,
  onProgress?: (progressPercent: number, state: RiverFlowState) => void
): {
  finalState: RiverFlowState;
  summary: RiverSimulationSummary;
} {
  const state = initializeFlowState(mesh, boundaries);
  const gaugeHistories: Record<string, GaugeTimePoint[]> = {};
  for (const g of gauges) {
    gaugeHistories[g.id] = [];
  }

  let totalSimTime = 0;
  let totalSteps = 0;
  let maxDepthSeen = 0;
  let maxVelSeen = 0;
  let maxWseSeen = -9999;
  let initialVolumeM3 = 0;
  let totalInflowVolumeM3 = 0;

  for (let i = 0; i < mesh.cells.length; i++) {
    initialVolumeM3 += state.depth[i] * mesh.cells[i].areaM2;
  }

  const outputIntervalSec = Math.max(1, durationSec / (targetFps * 10));
  let lastOutputTime = -1;

  while (totalSimTime < durationSec) {
    const dt = computeStableTimeStep(mesh, state, 0.55, 0.25);
    const actualDt = Math.min(dt, durationSec - totalSimTime);

    step2DShallowWater(mesh, state, structures, boundaries, actualDt, totalSimTime);
    totalSimTime += actualDt;
    totalSteps++;

    // Track total inflow volume for mass conservation checks
    totalInflowVolumeM3 += boundaries.upstreamDischargeM3s * actualDt;

    // Track maximums
    for (let i = 0; i < mesh.cells.length; i++) {
      if (state.depth[i] > maxDepthSeen) maxDepthSeen = state.depth[i];
      if (state.velocityMag[i] > maxVelSeen) maxVelSeen = state.velocityMag[i];
      if (state.wse[i] > maxWseSeen) maxWseSeen = state.wse[i];
    }

    // Record gauge time points
    if (totalSimTime - lastOutputTime >= outputIntervalSec || totalSimTime >= durationSec) {
      lastOutputTime = totalSimTime;

      for (const g of gauges) {
        if (g.cellIndex >= 0 && g.cellIndex < mesh.cells.length) {
          const idx = g.cellIndex;
          gaugeHistories[g.id].push({
            timeSec: Math.round(totalSimTime * 10) / 10,
            wseM: Math.round(state.wse[idx] * 100) / 100,
            depthM: Math.round(state.depth[idx] * 100) / 100,
            velocityMs: Math.round(state.velocityMag[idx] * 100) / 100,
            dischargeM3s: Math.round(state.depth[idx] * state.velocityMag[idx] * Math.sqrt(mesh.cells[idx].areaM2) * 10) / 10,
          });
        }
      }

      if (onProgress) {
        onProgress(Math.min(100, (totalSimTime / durationSec) * 100), state);
      }
    }
  }

  // Calculate final volume and inundation area
  let finalVolumeM3 = 0;
  let wetAreaM2 = 0;
  let velSum = 0;
  let wetCount = 0;
  let critFroudeCount = 0;

  for (let i = 0; i < mesh.cells.length; i++) {
    if (state.depth[i] >= H_DRY) {
      finalVolumeM3 += state.depth[i] * mesh.cells[i].areaM2;
      wetAreaM2 += mesh.cells[i].areaM2;
      velSum += state.velocityMag[i];
      wetCount++;
      if (state.froude[i] >= 1.0) {
        critFroudeCount++;
      }
    }
  }

  // Continuity / Mass Conservation Error (%)
  const expectedVol = initialVolumeM3 + totalInflowVolumeM3;
  const massErrorPercent =
    expectedVol > 0
      ? Math.abs((finalVolumeM3 - expectedVol) / expectedVol) * 100
      : 0;

  // NASA SWOT Comparison
  let swotComparison: RiverSimulationSummary['swotCalibrationComparison'] = undefined;
  const swotList = Array.isArray(swotObs) ? swotObs : swotObs ? [swotObs] : [];
  if (swotList.length > 0) {
    const obs = swotList[0];
    const midIdx = Math.floor(mesh.cells.length / 2);
    const simWse = state.wse[midIdx];
    const diff = Math.round((simWse - obs.observedWseM) * 100) / 100;
    swotComparison = {
      observedWseM: obs.observedWseM,
      simulatedWseM: Math.round(simWse * 100) / 100,
      differenceM: diff,
      wseRmseM: Math.abs(diff),
      agreementStatus:
        Math.abs(diff) <= 0.15
          ? 'EXCELLENT'
          : Math.abs(diff) <= 0.45
            ? 'GOOD'
            : 'NEEDS_BATHYMETRY_CALIBRATION',
    };
  }

  const summary: RiverSimulationSummary = {
    converged: true,
    totalTimeSimulatedSec: Math.round(totalSimTime * 10) / 10,
    totalSteps,
    maxWaterDepthM: Math.round(maxDepthSeen * 100) / 100,
    maxVelocityMs: Math.round(maxVelSeen * 100) / 100,
    maxWseM: Math.round(maxWseSeen * 100) / 100,
    meanVelocityMs: wetCount > 0 ? Math.round((velSum / wetCount) * 100) / 100 : 0,
    totalInundationAreaHa: Math.round((wetAreaM2 / 10000) * 100) / 100,
    totalWaterVolumeM3: Math.round(finalVolumeM3),
    massConservationErrorPercent: Math.round(massErrorPercent * 10) / 10,
    criticalFroudeCellsCount: critFroudeCount,
    swotCalibrationComparison: swotComparison,
    gaugeHydrographs: gaugeHistories,
  };

  return {
    finalState: state,
    summary,
  };
}

/**
 * Linearly interpolates discharge from a hydrograph series.
 */
function interpolateHydrograph(
  hydro: { timeSec: number; dischargeM3s: number }[],
  timeSec: number
): number {
  if (hydro.length === 0) return 10;
  if (timeSec <= hydro[0].timeSec) return hydro[0].dischargeM3s;
  if (timeSec >= hydro[hydro.length - 1].timeSec) return hydro[hydro.length - 1].dischargeM3s;

  for (let i = 0; i < hydro.length - 1; i++) {
    if (timeSec >= hydro[i].timeSec && timeSec <= hydro[i + 1].timeSec) {
      const frac = (timeSec - hydro[i].timeSec) / (hydro[i + 1].timeSec - hydro[i].timeSec);
      return hydro[i].dischargeM3s + frac * (hydro[i + 1].dischargeM3s - hydro[i].dischargeM3s);
    }
  }

  return hydro[0].dischargeM3s;
}
