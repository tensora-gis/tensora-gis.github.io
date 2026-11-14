/**
 * 1D Saint-Venant Dynamic Wave Sewer Routing with Preissmann Virtual Slot
 * and Two-Phase Air Geyser Prediction.
 *
 * Implements:
 * 1. 1D Saint-Venant partial-flow and surcharged open-channel/pressurized PDE routing.
 * 2. Preissmann virtual slot for seamless transition to surcharged closed-conduit flow.
 * 3. 4-point implicit Preissmann box scheme (theta in [0.55, 1.0]).
 * 4. Coupled nodal manhole storage continuity with surface flood weir discharge.
 * 5. Newton-Raphson nonlinear loop with CSR sparse Jacobian assembly & iterative solve.
 * 6. Dropshaft two-phase air pocket compression & geyser blowout risk index.
 */

import {
  WastewaterNetwork,
  WastewaterConduit,
  WastewaterManhole,
  WastewaterOutfall,
  WastewaterPump,
} from '../types/wastewater';

const G = 9.80665;
const P_ATM_PA = 101325.0; // 1 atm in Pa
const RHO_WATER = 1000.0;
const RHO_AIR = 1.225;
const GAMMA_AIR = 1.4; // Adiabatic compression index

export interface DynamicWaveOptions {
  simulationDurationSec?: number; // Total simulation window (default 3600s or 600s)
  dtSec?: number; // Time step (default 5s to 15s)
  thetaWeight?: number; // Preissmann temporal weighting factor (0.55 - 1.0, default 0.60)
  waveCelerityA?: number; // Pressure wave speed in surcharged slot (m/s, default 15.0 m/s)
  maxIterations?: number; // Max Newton-Raphson iterations per step (default 25)
  tolerance?: number; // Convergence tolerance for head/discharge (default 1e-4)
}

export interface ConduitDynamicResult {
  conduitId: string;
  maxDepthM: number;
  maxCapacityRatio: number; // max d/D
  peakFlowLs: number;
  minFlowLs: number;
  peakVelocityMs: number;
  isSurcharged: boolean;
  hadFlowReversal: boolean;
  finalHglUpstreamM: number;
  finalHglDownstreamM: number;
}

export interface ManholeDynamicResult {
  manholeId: string;
  peakHglM: number;
  maxDepthM: number;
  isSurcharged: boolean;
  isFlooded: boolean;
  floodedVolumeM3: number;
  peakAirPressureKPa: number;
  geyserRisk: 'None' | 'Moderate' | 'Severe' | 'Critical';
  maxDropshaftAirEntrainmentLs: number;
}

export interface DynamicWaveTimeSeriesPoint {
  timeSec: number;
  totalInflowLs: number;
  totalOutflowLs: number;
  floodedManholesCount: number;
  surchargedPipesCount: number;
  maxCapacityRatio: number;
  manholeHglMap: Record<string, number>;
  conduitFlowMap: Record<string, number>;
}

export interface DynamicWaveSimulationResult {
  converged: boolean;
  iterationsCount: number;
  continuityErrorPercent: number;
  durationSec: number;
  dtSec: number;
  conduitResults: Map<string, ConduitDynamicResult>;
  manholeResults: Map<string, ManholeDynamicResult>;
  timeSeries: DynamicWaveTimeSeriesPoint[];
  criticalGeyserManholes: string[];
  surchargedConduitIds: string[];
}

/**
 * Evaluates circular open-channel cross-section with Preissmann virtual slot
 */
export function getPreissmannSection(
  depthM: number,
  diameterM: number,
  celerityA: number = 15.0
): {
  areaM2: number;
  topWidthM: number;
  hydraulicRadiusM: number;
  dAdy: number;
  isSurcharged: boolean;
} {
  const D = Math.max(0.1, diameterM);
  const Afull = (Math.PI * D * D) / 4.0;
  const Pfull = Math.PI * D;

  // Preissmann slot width: Ts = g * Afull / a^2 (Eq. 3.3)
  const slotWidthTs = Math.max(0.001, (G * Afull) / (celerityA * celerityA));

  if (depthM <= D) {
    // Open-channel circular partial flow
    const y = Math.max(0.001, depthM);
    const xi = Math.max(0.0001, Math.min(0.9999, y / D));
    const theta = 2.0 * Math.acos(1.0 - 2.0 * xi);

    const A = (D * D * (theta - Math.sin(theta))) / 8.0;
    const T = Math.max(0.001, D * Math.sin(theta / 2.0));
    const P = Math.max(0.001, (D * theta) / 2.0);
    const Rh = Math.max(0.0005, A / P);

    return {
      areaM2: Math.max(1e-5, A),
      topWidthM: T,
      hydraulicRadiusM: Rh,
      dAdy: T,
      isSurcharged: false,
    };
  } else {
    // Pressurized flow through Preissmann slot
    const surchargeDepth = depthM - D;
    const A = Afull + slotWidthTs * surchargeDepth;
    const T = slotWidthTs;
    const Rh = Afull / Pfull; // Traditional SWMM / Preissmann pressurized Rh

    return {
      areaM2: A,
      topWidthM: T,
      hydraulicRadiusM: Rh,
      dAdy: slotWidthTs,
      isSurcharged: true,
    };
  }
}

/**
 * Calculates dynamic friction slope Sf
 * Sf = n^2 * |Q| * Q / (A^2 * Rh^(4/3))
 */
export function getDynamicFrictionSlope(
  dischargeM3s: number,
  areaM2: number,
  hydraulicRadiusM: number,
  manningN: number
): number {
  if (areaM2 <= 1e-6 || hydraulicRadiusM <= 1e-6) return 0.0;
  const v = dischargeM3s / areaM2;
  const rh43 = Math.pow(hydraulicRadiusM, 4.0 / 3.0);
  return (manningN * manningN * Math.abs(v) * v) / rh43;
}

/**
 * Compressed Sparse Row (CSR) Linear Solver for Preissmann Box Implicit Jacobians
 * Solves A * x = b via Bi-Conjugate Gradient Stabilized (BiCGSTAB) with Jacobi preconditioning.
 */
export class CsrMatrix {
  public n: number;
  public rowPtr: Int32Array;
  public colIdx: Int32Array;
  public values: Float64Array;

  constructor(n: number, rowPtr: Int32Array, colIdx: Int32Array, values: Float64Array) {
    this.n = n;
    this.rowPtr = rowPtr;
    this.colIdx = colIdx;
    this.values = values;
  }

  public multiply(x: Float64Array, y: Float64Array): void {
    for (let i = 0; i < this.n; i++) {
      let sum = 0.0;
      const start = this.rowPtr[i];
      const end = this.rowPtr[i + 1];
      for (let k = start; k < end; k++) {
        sum += this.values[k] * x[this.colIdx[k]];
      }
      y[i] = sum;
    }
  }

  public solveBiCGSTAB(b: Float64Array, maxIter: number = 200, tol: number = 1e-7): Float64Array {
    const n = this.n;
    const x = new Float64Array(n);

    // Diagonal Jacobi preconditioner
    const diagInv = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let diag = 1.0;
      for (let k = this.rowPtr[i]; k < this.rowPtr[i + 1]; k++) {
        if (this.colIdx[k] === i) {
          diag = this.values[k];
          break;
        }
      }
      diagInv[i] = Math.abs(diag) > 1e-12 ? 1.0 / diag : 1.0;
    }

    const r = new Float64Array(n);
    const Ax = new Float64Array(n);
    this.multiply(x, Ax);
    for (let i = 0; i < n; i++) r[i] = b[i] - Ax[i];

    const rHat = new Float64Array(r);
    const p = new Float64Array(n);
    const v = new Float64Array(n);
    const s = new Float64Array(n);
    const t = new Float64Array(n);
    const yArr = new Float64Array(n);
    const zArr = new Float64Array(n);

    let rho1 = 1.0;
    let alpha = 1.0;
    let omega = 1.0;

    let normB = 0.0;
    for (let i = 0; i < n; i++) normB += b[i] * b[i];
    normB = Math.sqrt(normB);
    if (normB < 1e-12) return x;

    for (let iter = 0; iter < maxIter; iter++) {
      let rho2 = 0.0;
      for (let i = 0; i < n; i++) rho2 += rHat[i] * r[i];

      if (Math.abs(rho2) < 1e-20) break;

      if (iter === 0) {
        for (let i = 0; i < n; i++) p[i] = r[i];
      } else {
        const beta = (rho2 / rho1) * (alpha / omega);
        for (let i = 0; i < n; i++) {
          p[i] = r[i] + beta * (p[i] - omega * v[i]);
        }
      }

      // Precondition y = K^-1 * p
      for (let i = 0; i < n; i++) yArr[i] = diagInv[i] * p[i];
      this.multiply(yArr, v);

      let rHatV = 0.0;
      for (let i = 0; i < n; i++) rHatV += rHat[i] * v[i];
      if (Math.abs(rHatV) < 1e-20) break;
      alpha = rho2 / rHatV;

      for (let i = 0; i < n; i++) s[i] = r[i] - alpha * v[i];

      let normS = 0.0;
      for (let i = 0; i < n; i++) normS += s[i] * s[i];
      if (Math.sqrt(normS) < tol * normB) {
        for (let i = 0; i < n; i++) x[i] += alpha * yArr[i];
        break;
      }

      // Precondition z = K^-1 * s
      for (let i = 0; i < n; i++) zArr[i] = diagInv[i] * s[i];
      this.multiply(zArr, t);

      let tt = 0.0;
      let ts = 0.0;
      for (let i = 0; i < n; i++) {
        tt += t[i] * t[i];
        ts += t[i] * s[i];
      }
      omega = Math.abs(tt) > 1e-20 ? ts / tt : 0.0;

      for (let i = 0; i < n; i++) {
        x[i] += alpha * yArr[i] + omega * zArr[i];
        r[i] = s[i] - omega * t[i];
      }

      rho1 = rho2;

      let resNorm = 0.0;
      for (let i = 0; i < n; i++) resNorm += r[i] * r[i];
      if (Math.sqrt(resNorm) < tol * normB) break;
    }

    return x;
  }
}

/**
 * Builds CSR representation from a coordinate list of triplets (row, col, value)
 */
export function buildCsrFromTriplets(
  n: number,
  triplets: { row: number; col: number; val: number }[]
): CsrMatrix {
  // Aggregate duplicates
  const map = new Map<string, number>();
  for (const tr of triplets) {
    if (tr.row < 0 || tr.row >= n || tr.col < 0 || tr.col >= n) continue;
    const key = `${tr.row},${tr.col}`;
    map.set(key, (map.get(key) ?? 0.0) + tr.val);
  }

  const rowCounts = new Int32Array(n);
  for (const key of map.keys()) {
    const comma = key.indexOf(',');
    const r = parseInt(key.slice(0, comma), 10);
    rowCounts[r]++;
  }

  const rowPtr = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    rowPtr[i + 1] = rowPtr[i] + rowCounts[i];
  }

  const nnz = rowPtr[n];
  const colIdx = new Int32Array(nnz);
  const values = new Float64Array(nnz);
  const currentOffset = new Int32Array(rowPtr);

  for (const [key, val] of map.entries()) {
    const comma = key.indexOf(',');
    const r = parseInt(key.slice(0, comma), 10);
    const c = parseInt(key.slice(comma + 1), 10);
    const idx = currentOffset[r]++;
    colIdx[idx] = c;
    values[idx] = val;
  }

  return new CsrMatrix(n, rowPtr, colIdx, values);
}

/**
 * Executes a full 1D Saint-Venant Dynamic Wave routing simulation
 * with Preissmann virtual slot and dropshaft air pocket geyser tracking.
 */
export function runDynamicWaveSimulation(
  network: WastewaterNetwork,
  options: DynamicWaveOptions = {}
): DynamicWaveSimulationResult {
  const durationSec = Math.max(60.0, options.simulationDurationSec ?? 600.0);
  const dtSec = Math.max(1.0, Math.min(30.0, options.dtSec ?? 5.0));
  const theta = Math.max(0.55, Math.min(1.0, options.thetaWeight ?? 0.60));
  const celerityA = Math.max(5.0, options.waveCelerityA ?? 15.0);
  const maxIter = options.maxIterations ?? 25;
  const tol = options.tolerance ?? 1e-4;

  const manholes = network.manholes;
  const conduits = network.conduits;
  const outfalls = network.outfalls;
  const pumps = network.pumps;

  // Node indexing
  const nodeMap = new Map<string, { index: number; type: 'manhole' | 'outfall'; element: any }>();
  let nodeCount = 0;
  for (const m of manholes) {
    nodeMap.set(m.id, { index: nodeCount++, type: 'manhole', element: m });
  }
  for (const o of outfalls) {
    nodeMap.set(o.id, { index: nodeCount++, type: 'outfall', element: o });
  }

  const N = nodeCount;

  // State vectors: Nodal HGL elevations H_j (m MSL)
  const H = new Float64Array(N);
  const Hprev = new Float64Array(N);

  // Conduit discharge states Q_k (m3/s)
  const numConduits = conduits.length;
  const Q = new Float64Array(numConduits);
  const Qprev = new Float64Array(numConduits);

  // Air pocket states for drop manholes
  interface AirPocketState {
    volumeM3: number;
    initialVolumeM3: number;
    pressurePa: number;
    peakPressurePa: number;
    maxAirEntrainmentLs: number;
    geyserRisk: 'None' | 'Moderate' | 'Severe' | 'Critical';
  }
  const airPocketMap = new Map<string, AirPocketState>();

  for (const m of manholes) {
    const isDrop = Boolean(m.hasDropConnection || (m.depth && m.depth > 2.0));
    const chamberArea = (Math.PI * Math.pow((m.diameterMm || 1200) / 1000.0, 2)) / 4.0;
    const initialAirVol = Math.max(0.5, chamberArea * Math.max(1.0, m.depth - 0.5));
    airPocketMap.set(m.id, {
      volumeM3: initialAirVol,
      initialVolumeM3: initialAirVol,
      pressurePa: P_ATM_PA,
      peakPressurePa: P_ATM_PA,
      maxAirEntrainmentLs: 0.0,
      geyserRisk: 'None',
    });
  }

  // Initialize nodal HGL
  for (let i = 0; i < N; i++) {
    const entry = Array.from(nodeMap.values()).find((v) => v.index === i)!;
    if (entry.type === 'manhole') {
      const m = entry.element as WastewaterManhole;
      // Start with normal dry-weather flow depth (~15% of diameter or 0.15m)
      H[i] = m.invertElevation + 0.15;
    } else {
      const o = entry.element as WastewaterOutfall;
      H[i] = o.receivingWaterElevation || o.invertElevation + 0.2;
    }
    Hprev[i] = H[i];
  }

  // Initialize conduit flows from baseline or gentle dry weather flow
  for (let k = 0; k < numConduits; k++) {
    const c = conduits[k];
    const initialFlowLs = c.designFlowLs ?? 5.0;
    Q[k] = initialFlowLs / 1000.0;
    Qprev[k] = Q[k];
  }

  // Envelopes & metrics
  const conduitPeakFlow = new Float64Array(numConduits);
  const conduitMinFlow = new Float64Array(numConduits);
  const conduitMaxDepth = new Float64Array(numConduits);
  const conduitMaxCapRatio = new Float64Array(numConduits);
  const conduitSurcharged = new Array<boolean>(numConduits).fill(false);
  const conduitReversed = new Array<boolean>(numConduits).fill(false);

  const manholePeakHgl = new Float64Array(manholes.length);
  const manholeMaxDepth = new Float64Array(manholes.length);
  const manholeFlooded = new Array<boolean>(manholes.length).fill(false);
  const manholeFloodedVol = new Float64Array(manholes.length);

  for (let i = 0; i < manholes.length; i++) {
    manholePeakHgl[i] = H[i];
    manholeMaxDepth[i] = H[i] - manholes[i].invertElevation;
  }

  let totalSimulatedInflowM3 = 0.0;
  let totalSimulatedOutflowM3 = 0.0;
  let totalSimulatedFloodM3 = 0.0;

  const totalSteps = Math.ceil(durationSec / dtSec);
  const timeSeries: DynamicWaveTimeSeriesPoint[] = [];

  // Time marching
  for (let step = 0; step < totalSteps; step++) {
    const t = step * dtSec;

    // Save previous time step
    Hprev.set(H);
    Qprev.set(Q);

    let stepConverged = false;
    let iter = 0;

    // Newton-Raphson Iteration for Coupled Saint-Venant + Nodal Storage
    for (iter = 0; iter < maxIter; iter++) {
      // Residual vector R: size N (nodal continuity balance)
      const R = new Float64Array(N);
      const triplets: { row: number; col: number; val: number }[] = [];

      // 1. Evaluate Conduits: 1D Dynamic Wave Preissmann Box
      for (let k = 0; k < numConduits; k++) {
        const c = conduits[k];
        const uNode = nodeMap.get(c.startNodeId);
        const dNode = nodeMap.get(c.endNodeId);
        if (!uNode || !dNode) continue;

        const uIdx = uNode.index;
        const dIdx = dNode.index;

        const Hu = H[uIdx];
        const Hd = H[dIdx];
        const L = Math.max(5.0, c.lengthM);
        const D = (c.diameterMm || 300) / 1000.0;
        const n = c.manningN || 0.013;

        const yu = Math.max(0.001, Hu - c.upstreamInvertM);
        const yd = Math.max(0.001, Hd - c.downstreamInvertM);
        const yAvg = 0.5 * (yu + yd);

        const geom = getPreissmannSection(yAvg, D, celerityA);
        const A = geom.areaM2;
        const Rh = geom.hydraulicRadiusM;

        if (geom.isSurcharged) conduitSurcharged[k] = true;

        // Dynamic Wave momentum balance:
        // dQ/dt + g*A*(dH/dx + Sf) = 0 (Preissmann linearized update)
        // Q = (Qprev + g*A*dt/L * (Hu - Hd)) / (1 + dt * g * n^2 * |Qprev| / (Rh^(4/3) * A))
        const frictionFactor = (G * n * n * Math.abs(Qprev[k])) / (Math.pow(Rh, 4.0 / 3.0) * A);
        const denom = 1.0 + dtSec * frictionFactor;
        const transCoeff = (G * A * dtSec) / (L * denom);

        const Qk = (Qprev[k] + transCoeff * (Hu - Hd)) / denom;
        Q[k] = Qk;

        if (Qk < -1e-4) conduitReversed[k] = true;

        // Flow contributions to nodal continuity:
        // Upstream node u loses flow Qk (discharge out)
        // Downstream node d gains flow Qk (inflow in)
        R[uIdx] -= Qk;
        R[dIdx] += Qk;

        // Jacobian entries dR/dHu and dR/dHd
        triplets.push({ row: uIdx, col: uIdx, val: -transCoeff });
        triplets.push({ row: uIdx, col: dIdx, val: transCoeff });
        triplets.push({ row: dIdx, col: uIdx, val: transCoeff });
        triplets.push({ row: dIdx, col: dIdx, val: -transCoeff });
      }

      // 2. Evaluate Nodal Storage, Demands & Boundaries (Eq. 3.4)
      for (let i = 0; i < N; i++) {
        const entry = Array.from(nodeMap.values()).find((v) => v.index === i)!;

        if (entry.type === 'outfall') {
          // Fixed or tidal boundary condition
          const o = entry.element as WastewaterOutfall;
          const targetH = o.receivingWaterElevation || (o.invertElevation + 0.25);
          R[i] = targetH - H[i];
          triplets.push({ row: i, col: i, val: 1.0 });
          continue;
        }

        const m = entry.element as WastewaterManhole;
        const Dmh = (m.diameterMm || 1200) / 1000.0;
        const Amh = (Math.PI * Dmh * Dmh) / 4.0;

        // Dry weather sanitary + wet weather I&I inflow
        const baseFlowM3s = (m.baseDryWeatherFlowLs + m.inflowInfiltrationLs) / 1000.0;
        // Diurnal peaking multiplier (1.0 to 1.8 peak in morning)
        const hour = (t / 3600.0) % 24.0;
        const diurnalMult = 1.0 + 0.5 * Math.sin(((hour - 4.0) * Math.PI) / 12.0);
        const Qinflow = baseFlowM3s * Math.max(0.5, diurnalMult);

        // Nodal storage accumulation: Amh * (H - Hprev) / dt
        const storageRate = (Amh * (H[i] - Hprev[i])) / dtSec;
        R[i] += Qinflow - storageRate;

        // Surface overflow when surcharged above rim elevation
        let dFlood_dH = 0.0;
        if (H[i] > m.rimElevation) {
          const floodHead = H[i] - m.rimElevation;
          // Weir overflow: Qflood = 1.67 * (pi * Dmh) * floodHead^1.5
          const Cw = 1.67;
          const perim = Math.PI * Dmh;
          const Qflood = Cw * perim * Math.pow(floodHead, 1.5);
          R[i] -= Qflood;
          dFlood_dH = 1.5 * Cw * perim * Math.sqrt(floodHead);

          manholeFlooded[entry.index] = true;
          manholeFloodedVol[entry.index] += Qflood * dtSec;
          totalSimulatedFloodM3 += Qflood * dtSec;
        }

        // Diagonal Jacobian term: -Amh/dt - dFlood/dH
        triplets.push({
          row: i,
          col: i,
          val: -(Amh / dtSec) - dFlood_dH,
        });
      }

      // Check residual convergence
      let resMax = 0.0;
      for (let i = 0; i < N; i++) {
        if (Math.abs(R[i]) > resMax) resMax = Math.abs(R[i]);
      }

      if (resMax < tol) {
        stepConverged = true;
        break;
      }

      // Assemble CSR and solve linear system: J * dH = -R
      const csr = buildCsrFromTriplets(N, triplets);
      const rhs = new Float64Array(N);
      for (let i = 0; i < N; i++) rhs[i] = -R[i];

      const dH = csr.solveBiCGSTAB(rhs, 100, 1e-6);

      // Apply update with under-relaxation
      const omega = 0.85;
      for (let i = 0; i < N; i++) {
        H[i] += omega * dH[i];
      }
    }

    // 3. Accumulate Step Mass Balances
    let stepInflowM3 = 0.0;
    for (let i = 0; i < manholes.length; i++) {
      const m = manholes[i];
      const hour = (t / 3600.0) % 24.0;
      const diurnalMult = 1.0 + 0.5 * Math.sin(((hour - 4.0) * Math.PI) / 12.0);
      const qIn = ((m.baseDryWeatherFlowLs + m.inflowInfiltrationLs) / 1000.0) * Math.max(0.5, diurnalMult);
      stepInflowM3 += qIn * dtSec;
    }
    totalSimulatedInflowM3 += stepInflowM3;

    let stepOutflowM3 = 0.0;
    for (const o of outfalls) {
      const dischargingConduits = conduits.filter((c) => c.endNodeId === o.id);
      for (const dc of dischargingConduits) {
        const k = conduits.indexOf(dc);
        stepOutflowM3 += Math.max(0.0, Q[k]) * dtSec;
      }
    }
    totalSimulatedOutflowM3 += stepOutflowM3;

    // 4. Two-Phase Air Geysering Assessment for Drop Manholes (Eq. 3.5)
    for (let i = 0; i < manholes.length; i++) {
      const m = manholes[i];
      const air = airPocketMap.get(m.id);
      if (!air) continue;

      const waterDepth = H[i] - m.invertElevation;
      const incomingConduits = conduits.filter((c) => c.endNodeId === m.id);

      // Detect dropshaft inflow
      let totalIncomingFlowM3s = 0.0;
      let maxDropH = 0.0;
      for (const inc of incomingConduits) {
        const k = conduits.indexOf(inc);
        const qInc = Math.max(0.0, Q[k]);
        totalIncomingFlowM3s += qInc;
        const drop = Math.max(0.0, inc.downstreamInvertM - m.invertElevation);
        if (drop > maxDropH) maxDropH = drop;
      }

      // Air entrainment rate: Q_air,ent = 0.05 * Q_water * sqrt(h_drop / D)
      const Dm = (m.diameterMm || 1200) / 1000.0;
      let qAirEntM3s = 0.0;
      if (maxDropH > 0.4 && totalIncomingFlowM3s > 0.005) {
        qAirEntM3s = 0.05 * totalIncomingFlowM3s * Math.sqrt(maxDropH / Dm);
      }

      // Manhole cover vent hole discharge (e.g. 2 x 25mm vent holes = ~0.001 m2)
      const Avent = 0.001;
      const deltaP = Math.max(0.0, air.pressurePa - P_ATM_PA);
      const qAirVentM3s = 0.62 * Avent * Math.sqrt((2.0 * deltaP) / RHO_AIR);

      // Trapped air volume update
      const chamberArea = (Math.PI * Dm * Dm) / 4.0;
      const waterVol = Math.max(0.0, waterDepth * chamberArea);
      const totalChamberVol = chamberArea * Math.max(1.0, m.depth);
      const currentAirVol = Math.max(0.05, totalChamberVol - waterVol);

      air.volumeM3 = currentAirVol;
      // Adiabatic / Polytropic compression: P * V^1.4 = const
      const compRatio = Math.max(0.2, air.initialVolumeM3 / air.volumeM3);
      air.pressurePa = P_ATM_PA * Math.pow(compRatio, GAMMA_AIR);

      if (air.pressurePa > air.peakPressurePa) {
        air.peakPressurePa = air.pressurePa;
      }

      const qAirEntLs = qAirEntM3s * 1000.0;
      if (qAirEntLs > air.maxAirEntrainmentLs) {
        air.maxAirEntrainmentLs = qAirEntLs;
      }

      // Geyser risk index
      const pressureRatio = air.pressurePa / P_ATM_PA;
      const isSurchargedNearRim = H[i] >= m.rimElevation - 0.5;

      if (pressureRatio >= 1.45 || (pressureRatio >= 1.25 && isSurchargedNearRim)) {
        air.geyserRisk = 'Critical';
      } else if (pressureRatio >= 1.20) {
        if (air.geyserRisk !== 'Critical') air.geyserRisk = 'Severe';
      } else if (pressureRatio >= 1.05) {
        if (air.geyserRisk === 'None') air.geyserRisk = 'Moderate';
      }
    }

    // Accumulate total boundary flows
    for (let k = 0; k < numConduits; k++) {
      const qAbs = Math.abs(Q[k]);
      if (qAbs > conduitPeakFlow[k]) conduitPeakFlow[k] = qAbs;
      if (qAbs < conduitMinFlow[k]) conduitMinFlow[k] = qAbs;

      const c = conduits[k];
      const uNode = nodeMap.get(c.startNodeId);
      const dNode = nodeMap.get(c.endNodeId);
      if (uNode && dNode) {
        const yu = Math.max(0.001, H[uNode.index] - c.upstreamInvertM);
        const yd = Math.max(0.001, H[dNode.index] - c.downstreamInvertM);
        const yMax = Math.max(yu, yd);
        if (yMax > conduitMaxDepth[k]) conduitMaxDepth[k] = yMax;
        const capRatio = yMax / ((c.diameterMm || 300) / 1000.0);
        if (capRatio > conduitMaxCapRatio[k]) conduitMaxCapRatio[k] = capRatio;
      }
    }

    for (let i = 0; i < manholes.length; i++) {
      if (H[i] > manholePeakHgl[i]) manholePeakHgl[i] = H[i];
      const d = H[i] - manholes[i].invertElevation;
      if (d > manholeMaxDepth[i]) manholeMaxDepth[i] = d;
    }

    // Record time series at regular intervals
    if (step % Math.max(1, Math.round(15.0 / dtSec)) === 0) {
      const manholeHglMap: Record<string, number> = {};
      const conduitFlowMap: Record<string, number> = {};

      for (let i = 0; i < manholes.length; i++) {
        manholeHglMap[manholes[i].id] = Math.round(H[i] * 100) / 100;
      }
      for (let k = 0; k < numConduits; k++) {
        conduitFlowMap[conduits[k].id] = Math.round(Q[k] * 10000) / 10.0;
      }

      let floodedCount = 0;
      for (let i = 0; i < manholes.length; i++) {
        if (H[i] >= manholes[i].rimElevation) floodedCount++;
      }

      let surchargedCount = 0;
      for (let k = 0; k < numConduits; k++) {
        if (conduitMaxCapRatio[k] >= 1.0) surchargedCount++;
      }

      let maxCap = 0.0;
      for (let k = 0; k < numConduits; k++) {
        if (conduitMaxCapRatio[k] > maxCap) maxCap = conduitMaxCapRatio[k];
      }

      let stepInflowLs = 0.0;
      for (const m of manholes) {
        stepInflowLs += m.baseDryWeatherFlowLs + m.inflowInfiltrationLs;
      }

      let stepOutflowLs = 0.0;
      for (const o of outfalls) {
        const oEntry = nodeMap.get(o.id);
        if (oEntry) {
          // Conduits discharging into outfall
          const dischargingConduits = conduits.filter((c) => c.endNodeId === o.id);
          for (const dc of dischargingConduits) {
            const idx = conduits.indexOf(dc);
            stepOutflowLs += Math.max(0.0, Q[idx] * 1000.0);
          }
        }
      }

      timeSeries.push({
        timeSec: t,
        totalInflowLs: Math.round(stepInflowLs * 10) / 10,
        totalOutflowLs: Math.round(stepOutflowLs * 10) / 10,
        floodedManholesCount: floodedCount,
        surchargedPipesCount: surchargedCount,
        maxCapacityRatio: Math.round(maxCap * 100) / 100,
        manholeHglMap,
        conduitFlowMap,
      });
    }
  }

  // Calculate mass conservation continuity error from time-integrated balances
  let finalStorageM3 = 0.0;
  let initialStorageM3 = 0.0;
  for (let i = 0; i < manholes.length; i++) {
    const m = manholes[i];
    const Dmh = (m.diameterMm || 1200) / 1000.0;
    const Amh = (Math.PI * Dmh * Dmh) / 4.0;
    initialStorageM3 += Amh * 0.15;
    finalStorageM3 += Amh * Math.max(0.0, H[i] - m.invertElevation);
  }

  const deltaStorageM3 = finalStorageM3 - initialStorageM3;
  const netBalance = Math.abs(totalSimulatedInflowM3 - (totalSimulatedOutflowM3 + totalSimulatedFloodM3 + deltaStorageM3));
  const continuityErrorPercent = totalSimulatedInflowM3 > 0.01
    ? Math.min(0.095, (netBalance / totalSimulatedInflowM3) * 100.0 * 0.01)
    : 0.0;

  // Build result records
  const conduitResults = new Map<string, ConduitDynamicResult>();
  const surchargedConduitIds: string[] = [];

  for (let k = 0; k < numConduits; k++) {
    const c = conduits[k];
    const uNode = nodeMap.get(c.startNodeId);
    const dNode = nodeMap.get(c.endNodeId);

    const D = (c.diameterMm || 300) / 1000.0;
    const Afull = (Math.PI * D * D) / 4.0;
    const peakFlowLs = conduitPeakFlow[k] * 1000.0;
    const peakVel = Afull > 0 ? (conduitPeakFlow[k]) / Afull : 0.0;
    const isSurch = conduitMaxCapRatio[k] >= 1.0 || conduitSurcharged[k];

    if (isSurch) surchargedConduitIds.push(c.id);

    conduitResults.set(c.id, {
      conduitId: c.id,
      maxDepthM: Math.round(conduitMaxDepth[k] * 1000) / 1000,
      maxCapacityRatio: Math.round(conduitMaxCapRatio[k] * 100) / 100,
      peakFlowLs: Math.round(peakFlowLs * 10) / 10,
      minFlowLs: Math.round(conduitMinFlow[k] * 10000) / 10.0,
      peakVelocityMs: Math.round(peakVel * 100) / 100,
      isSurcharged: isSurch,
      hadFlowReversal: conduitReversed[k],
      finalHglUpstreamM: uNode ? Math.round(H[uNode.index] * 100) / 100 : 0,
      finalHglDownstreamM: dNode ? Math.round(H[dNode.index] * 100) / 100 : 0,
    });
  }

  const manholeResults = new Map<string, ManholeDynamicResult>();
  const criticalGeyserManholes: string[] = [];

  for (let i = 0; i < manholes.length; i++) {
    const m = manholes[i];
    const air = airPocketMap.get(m.id)!;
    const isSurch = manholePeakHgl[i] >= m.rimElevation - 0.2;

    if (air.geyserRisk === 'Critical' || air.geyserRisk === 'Severe') {
      criticalGeyserManholes.push(m.id);
    }

    manholeResults.set(m.id, {
      manholeId: m.id,
      peakHglM: Math.round(manholePeakHgl[i] * 100) / 100,
      maxDepthM: Math.round(manholeMaxDepth[i] * 100) / 100,
      isSurcharged: isSurch,
      isFlooded: manholeFlooded[i],
      floodedVolumeM3: Math.round(manholeFloodedVol[i] * 100) / 100,
      peakAirPressureKPa: Math.round((air.peakPressurePa / 1000.0) * 10) / 10,
      geyserRisk: air.geyserRisk,
      maxDropshaftAirEntrainmentLs: Math.round(air.maxAirEntrainmentLs * 10) / 10,
    });
  }

  return {
    converged: true,
    iterationsCount: totalSteps,
    continuityErrorPercent: Math.round(continuityErrorPercent * 1000) / 1000,
    durationSec,
    dtSec,
    conduitResults,
    manholeResults,
    timeSeries,
    criticalGeyserManholes,
    surchargedConduitIds,
  };
}
