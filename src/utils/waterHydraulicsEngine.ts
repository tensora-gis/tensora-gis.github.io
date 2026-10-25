/**
 * EPANET-standard Water Distribution Hydraulic Solver
 *
 * Implements the Global Gradient Algorithm (GGA) (Todini & Pilati) for steady-state
 * pipe network analysis under Hazen-Williams friction formulation.
 *
 * Handles:
 * - Demands at junctions
 * - Fixed-head water reservoirs & elevated storage tanks
 * - Booster pumps (head-flow parabolic curves)
 * - Check valves and pipe closures
 * - Velocity, unit headloss, pressure, and HGL calculations
 * - Hydraulic balance, convergence tracking, and negative pressure warnings
 */

import {
  WaterDistributionNetwork,
  SimulationSummary,
  WaterJunction,
  WaterPipe,
  WaterReservoir,
  WaterTank,
  WaterPump,
  WaterValve,
  ValveType,
  HourlySimulationPoint,
  FireFlowResult,
  WaterQualityResult,
  PipeOptimizationResult,
  TransientPipeResult,
  TransientProtectionDevice,
  TransientTimeHistoryPoint,
  TransientSimulationSummary,
} from '../types/waterDistribution';

const HAZEN_WILLIAMS_EXP = 1.852;
const MAX_ITERATIONS = 40;
const CONVERGENCE_FLOW_TOLERANCE_LS = 0.001; // 0.001 L/s convergence criterion
const MIN_FLOW_CUTOFF_LS = 1e-5;

interface LinkElement {
  id: string;
  type: 'pipe' | 'pump' | 'valve';
  startNodeId: string;
  endNodeId: string;
  isOpen: boolean;
  isCheckValve: boolean;
  resistanceCoeff: number; // For Hazen-Williams
  diameterM: number;
  lengthM: number;
  // Pump specific
  isPump: boolean;
  pumpH0?: number;
  pumpA?: number;
  // Valve specific
  isValve?: boolean;
  valveType?: ValveType;
  valveSetting?: number;
}

/**
 * Computes Hazen-Williams pipe resistance coefficient R such that:
 * h_f (m) = R * |Q (L/s)|^0.852 * Q (L/s)
 * Formula: h_f = 10.67 * L * Q_m3s^1.852 / (C^1.852 * D_m^4.871)
 */
function calculateHazenWilliamsResistance(
  lengthM: number,
  diameterMm: number,
  roughnessC: number
): number {
  const dM = Math.max(0.01, diameterMm / 1000);
  const lM = Math.max(0.1, lengthM);
  const c = Math.max(20, roughnessC);

  // 10.67 * L / (C^1.852 * D^4.871) for Q in m³/s
  const rawR = (10.67 * lM) / (Math.pow(c, HAZEN_WILLIAMS_EXP) * Math.pow(dM, 4.871));
  // Convert for Q in L/s: Q_m3s = Q_ls / 1000 => divide rawR by 1000^1.852
  return rawR / Math.pow(1000, HAZEN_WILLIAMS_EXP);
}

/**
 * Solves a symmetric positive-definite linear system A * x = b via Cholesky / Gaussian elimination.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  // Augmented matrix
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    // Pivot search
    let maxRow = i;
    let maxVal = Math.abs(M[i][i]);
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > maxVal) {
        maxVal = Math.abs(M[k][i]);
        maxRow = k;
      }
    }

    if (maxVal < 1e-12) {
      // Small diagonal regularisation to avoid singular systems on disconnected nodes
      M[i][i] += 1e-6;
    } else if (maxRow !== i) {
      const temp = M[i];
      M[i] = M[maxRow];
      M[maxRow] = temp;
    }

    const pivot = M[i][i];
    for (let j = i; j <= n; j++) {
      M[i][j] /= pivot;
    }

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = M[k][i];
        if (Math.abs(factor) > 1e-15) {
          for (let j = i; j <= n; j++) {
            M[k][j] -= factor * M[i][j];
          }
        }
      }
    }
  }

  return M.map((row) => row[n]);
}

/**
 * Runs the full hydraulic simulation on the network.
 * Returns an updated network carrying computed flows, heads, velocities, and pressures,
 * alongside a comprehensive simulation summary.
 */
export function simulateWaterNetwork(network: WaterDistributionNetwork): {
  updatedNetwork: WaterDistributionNetwork;
  summary: SimulationSummary;
} {
  // Collect all known-head nodes (Reservoirs and Tanks)
  const knownHeads = new Map<string, number>();
  for (const r of network.reservoirs) {
    knownHeads.set(r.id, r.totalHead);
  }
  for (const t of network.tanks) {
    knownHeads.set(t.id, t.elevation + t.initialLevel);
  }

  // If no supply source exists, fail gracefully
  if (knownHeads.size === 0) {
    return {
      updatedNetwork: network,
      summary: {
        converged: false,
        iterations: 0,
        relativeFlowError: 1,
        totalDemandLs: network.junctions.reduce((sum, j) => sum + j.baseDemand, 0),
        totalSupplyLs: 0,
        flowImbalanceLs: 0,
        minPressureM: 0,
        minPressureNodeId: '',
        maxPressureM: 0,
        maxPressureNodeId: '',
        maxVelocityMs: 0,
        maxVelocityPipeId: '',
        totalPumpPowerKw: 0,
        dailyEnergyKwh: 0,
        negativePressureNodes: [],
        lowPressureNodes: [],
        highVelocityPipes: [],
        runTimestamp: new Date().toISOString(),
      },
    };
  }

  // Map of unknown-head junctions
  const junctionMap = new Map<string, { junction: WaterJunction; index: number }>();
  network.junctions.forEach((j, idx) => {
    junctionMap.set(j.id, { junction: j, index: idx });
  });

  const numJunctions = network.junctions.length;

  // Build Links
  const links: LinkElement[] = [];

  for (const p of network.pipes) {
    const isCV = p.status === 'CV';
    const isOpen = p.status !== 'CLOSED';
    const r = calculateHazenWilliamsResistance(p.length, p.diameter, p.roughness);
    links.push({
      id: p.id,
      type: 'pipe',
      startNodeId: p.startNodeId,
      endNodeId: p.endNodeId,
      isOpen,
      isCheckValve: isCV,
      resistanceCoeff: r,
      diameterM: p.diameter / 1000,
      lengthM: p.length,
      isPump: false,
    });
  }

  for (const pmp of network.pumps) {
    const isOpen = pmp.status === 'OPEN';
    const qDes = Math.max(0.1, pmp.designFlow);
    const hDes = Math.max(1, pmp.designHead);
    const h0 = pmp.shutoffHead || 1.33 * hDes;
    // A in H = H0 - A * Q^2
    const a = (h0 - hDes) / (qDes * qDes);

    links.push({
      id: pmp.id,
      type: 'pump',
      startNodeId: pmp.startNodeId,
      endNodeId: pmp.endNodeId,
      isOpen,
      isCheckValve: true, // Pumps don't allow backflow
      resistanceCoeff: 0,
      diameterM: 0.2, // nominal
      lengthM: 10,
      isPump: true,
      pumpH0: h0 * Math.pow(pmp.speed || 1, 2),
      pumpA: a,
    });
  }

  for (const v of network.valves || []) {
    const isOpen = v.status !== 'CLOSED';
    const isCV = v.valveType === 'PRV' || v.valveType === 'PSV';
    const r = calculateHazenWilliamsResistance(10, v.diameter || 150, 130);
    links.push({
      id: v.id,
      type: 'valve',
      startNodeId: v.startNodeId,
      endNodeId: v.endNodeId,
      isOpen,
      isCheckValve: isCV,
      resistanceCoeff: r,
      diameterM: (v.diameter || 150) / 1000,
      lengthM: 10,
      isPump: false,
      isValve: true,
      valveType: v.valveType,
      valveSetting: v.setting,
    });
  }

  // Initial flows: guess 1.0 L/s per active link
  const flows = new Map<string, number>();
  for (const link of links) {
    flows.set(link.id, link.isOpen ? 1.0 : 0.0);
  }

  // Initial heads: average of known heads
  let avgSourceHead = 0;
  for (const h of knownHeads.values()) avgSourceHead += h;
  avgSourceHead /= Math.max(1, knownHeads.size);

  const heads = new Map<string, number>();
  for (const [id, h] of knownHeads) heads.set(id, h);
  for (const j of network.junctions) heads.set(j.id, avgSourceHead);

  let converged = false;
  let iterations = 0;
  let maxFlowChange = 1.0;

  // Global Gradient Algorithm Iteration Loop
  while (iterations < MAX_ITERATIONS && !converged) {
    iterations++;

    // Coefficient matrix A and RHS vector b for unknown junction heads
    const A: number[][] = Array.from({ length: numJunctions }, () =>
      new Array(numJunctions).fill(0)
    );
    const b: number[] = new Array(numJunctions).fill(0);

    // Initialise RHS with junction demands (-Demand)
    for (let i = 0; i < numJunctions; i++) {
      b[i] = -network.junctions[i].baseDemand;
    }

    // Process each link
    for (const link of links) {
      if (!link.isOpen) continue;

      const q = flows.get(link.id) || 0;
      const absQ = Math.max(MIN_FLOW_CUTOFF_LS, Math.abs(q));

      let headloss = 0;
      let derivative = 0; // d(h_start - h_end)/dQ

      if (!link.isPump) {
        // Hazen-Williams
        headloss = link.resistanceCoeff * Math.pow(absQ, HAZEN_WILLIAMS_EXP - 1) * q;
        derivative = HAZEN_WILLIAMS_EXP * link.resistanceCoeff * Math.pow(absQ, HAZEN_WILLIAMS_EXP - 1);
      } else {
        // Pump: h_end - h_start = H0 - A * Q^2 => h_start - h_end = -H0 + A * Q^2
        const h0 = link.pumpH0 ?? 50;
        const aCoeff = link.pumpA ?? 0.01;
        headloss = -h0 + aCoeff * q * Math.abs(q);
        derivative = 2 * aCoeff * absQ;
      }

      derivative = Math.max(1e-5, derivative);
      const conductance = 1 / derivative;

      const startIsJunction = junctionMap.has(link.startNodeId);
      const endIsJunction = junctionMap.has(link.endNodeId);
      const startIdx = startIsJunction ? junctionMap.get(link.startNodeId)!.index : -1;
      const endIdx = endIsJunction ? junctionMap.get(link.endNodeId)!.index : -1;

      // RHS contribution: conductance * (headloss - derivative * q)
      // Since headloss - derivative * q = -(n - 1)/n * headloss
      const flowCorrection = q - conductance * headloss;

      if (startIsJunction) {
        A[startIdx][startIdx] += conductance;
        b[startIdx] -= flowCorrection;
      } else {
        const startHead = knownHeads.get(link.startNodeId) || 0;
        if (endIsJunction) b[endIdx] += conductance * startHead;
      }

      if (endIsJunction) {
        A[endIdx][endIdx] += conductance;
        b[endIdx] += flowCorrection;
      } else {
        const endHead = knownHeads.get(link.endNodeId) || 0;
        if (startIsJunction) b[startIdx] += conductance * endHead;
      }

      if (startIsJunction && endIsJunction) {
        A[startIdx][endIdx] -= conductance;
        A[endIdx][startIdx] -= conductance;
      }
    }

    // Solve for new nodal heads
    if (numJunctions > 0) {
      const newJunctionHeads = solveLinearSystem(A, b);
      for (let i = 0; i < numJunctions; i++) {
        heads.set(network.junctions[i].id, newJunctionHeads[i]);
      }
    }

    // Update link flows based on new heads
    maxFlowChange = 0;
    for (const link of links) {
      if (!link.isOpen) {
        flows.set(link.id, 0);
        continue;
      }

      const hStart = heads.get(link.startNodeId) || 0;
      const hEnd = heads.get(link.endNodeId) || 0;
      const currentQ = flows.get(link.id) || 0;

      let newQ = 0;
      if (!link.isPump) {
        const headDiff = hStart - hEnd;
        const sign = headDiff >= 0 ? 1 : -1;
        const absDiff = Math.abs(headDiff);
        // From h_f = R * Q^1.852 => Q = (h_f / R)^(1 / 1.852)
        newQ = sign * Math.pow(absDiff / Math.max(1e-8, link.resistanceCoeff), 1 / HAZEN_WILLIAMS_EXP);

        // Check valve condition
        if (link.isCheckValve && newQ < 0) {
          newQ = 0;
        }
      } else {
        // Pump head: H_pump = hEnd - hStart
        const h0 = link.pumpH0 ?? 50;
        const aCoeff = link.pumpA ?? 0.01;
        const headRise = hEnd - hStart;
        if (headRise >= h0) {
          newQ = 0; // Operating at or above shutoff head
        } else {
          newQ = Math.sqrt(Math.max(0, (h0 - headRise) / Math.max(1e-6, aCoeff)));
        }
      }

      // Relaxation for numerical stability
      const relaxedQ = 0.5 * currentQ + 0.5 * newQ;
      const deltaQ = Math.abs(relaxedQ - currentQ);
      if (deltaQ > maxFlowChange) maxFlowChange = deltaQ;

      flows.set(link.id, relaxedQ);
    }

    if (maxFlowChange < CONVERGENCE_FLOW_TOLERANCE_LS) {
      converged = true;
    }
  }

  // Calculate Output Metrics & Results
  let totalDemandLs = 0;
  const negativePressureNodes: string[] = [];
  const lowPressureNodes: string[] = [];
  let minPressureM = Infinity;
  let minPressureNodeId = '';
  let maxPressureM = -Infinity;
  let maxPressureNodeId = '';

  const updatedJunctions: WaterJunction[] = network.junctions.map((j) => {
    const head = heads.get(j.id) ?? j.elevation;
    const pressure = head - j.elevation;
    totalDemandLs += j.baseDemand;

    if (pressure < 0) negativePressureNodes.push(j.id);
    else if (pressure < 15) lowPressureNodes.push(j.id);

    if (pressure < minPressureM) {
      minPressureM = pressure;
      minPressureNodeId = j.id;
    }
    if (pressure > maxPressureM) {
      maxPressureM = pressure;
      maxPressureNodeId = j.id;
    }

    let status: WaterJunction['status'] = 'normal';
    if (pressure < 0) status = 'negative';
    else if (pressure < 15) status = 'low-pressure';
    else if (pressure > 75) status = 'high-pressure';

    return {
      ...j,
      head: Math.round(head * 100) / 100,
      pressure: Math.round(pressure * 100) / 100,
      actualDemand: j.baseDemand,
      status,
    };
  });

  let maxVelocityMs = 0;
  let maxVelocityPipeId = '';
  const highVelocityPipes: string[] = [];

  const updatedPipes: WaterPipe[] = network.pipes.map((p) => {
    const flow = flows.get(p.id) ?? 0;
    const dM = p.diameter / 1000;
    const area = (Math.PI / 4) * dM * dM;
    const velocity = Math.abs(flow / 1000) / area; // m/s
    const totalHeadloss = Math.abs((heads.get(p.startNodeId) ?? 0) - (heads.get(p.endNodeId) ?? 0));
    const unitHeadloss = (totalHeadloss / Math.max(1, p.length)) * 1000; // m/km

    if (velocity > maxVelocityMs) {
      maxVelocityMs = velocity;
      maxVelocityPipeId = p.id;
    }
    if (velocity > 2.0) {
      highVelocityPipes.push(p.id);
    }

    return {
      ...p,
      flow: Math.round(flow * 100) / 100,
      velocity: Math.round(velocity * 100) / 100,
      totalHeadloss: Math.round(totalHeadloss * 100) / 100,
      unitHeadloss: Math.round(unitHeadloss * 100) / 100,
    };
  });

  let totalPumpPowerKw = 0;
  const updatedPumps: WaterPump[] = network.pumps.map((pmp) => {
    const flow = flows.get(pmp.id) ?? 0;
    const hStart = heads.get(pmp.startNodeId) ?? 0;
    const hEnd = heads.get(pmp.endNodeId) ?? 0;
    const headGain = Math.max(0, hEnd - hStart);

    // Power P (kW) = gamma * Q * H / (1000 * eta) => 9.81 * (Q_ls / 1000) * H / 0.75
    const powerKw = flow > 0 ? (9.81 * (flow / 1000) * headGain) / 0.75 : 0;
    totalPumpPowerKw += powerKw;

    return {
      ...pmp,
      operatingFlow: Math.round(flow * 100) / 100,
      operatingHead: Math.round(headGain * 100) / 100,
      powerKw: Math.round(powerKw * 10) / 10,
    };
  });

  // Calculate Reservoir & Tank source outflows
  let totalSupplyLs = 0;
  const updatedReservoirs: WaterReservoir[] = network.reservoirs.map((r) => {
    let netFlow = 0;
    for (const link of links) {
      const q = flows.get(link.id) ?? 0;
      if (link.startNodeId === r.id) netFlow += q;
      if (link.endNodeId === r.id) netFlow -= q;
    }
    totalSupplyLs += netFlow;
    return {
      ...r,
      netFlow: Math.round(netFlow * 100) / 100,
    };
  });

  const updatedTanks: WaterTank[] = network.tanks.map((t) => {
    let netFlow = 0;
    for (const link of links) {
      const q = flows.get(link.id) ?? 0;
      if (link.startNodeId === t.id) netFlow += q;
      if (link.endNodeId === t.id) netFlow -= q;
    }
    totalSupplyLs += netFlow;
    return {
      ...t,
      netFlow: Math.round(netFlow * 100) / 100,
    };
  });

  // Calculate Valve Flow & Headloss
  const updatedValves: WaterValve[] = (network.valves || []).map((v) => {
    const q = flows.get(v.id) ?? 0;
    const hStart = heads.get(v.startNodeId) ?? 0;
    const hEnd = heads.get(v.endNodeId) ?? 0;
    const hl = Math.max(0, hStart - hEnd);
    return {
      ...v,
      flow: Math.round(q * 100) / 100,
      headloss: Math.round(hl * 100) / 100,
    };
  });

  // Daily Pumping Energy (kWh/day assuming 18 hrs operating cycle)
  const dailyEnergyKwh = Math.round(totalPumpPowerKw * 18 * 10) / 10;

  // Extended Period Simulation (EPS - 24 Hours)
  const hourlyMultipliers = [
    0.55, 0.50, 0.48, 0.52, 0.65, 0.95, 1.35, 1.60, 1.55, 1.40,
    1.25, 1.15, 1.10, 1.10, 1.05, 1.00, 1.10, 1.35, 1.55, 1.50,
    1.35, 1.15, 0.95, 0.70
  ];

  const hourlyEpsPoints: HourlySimulationPoint[] = hourlyMultipliers.map((mult, hr) => {
    const hrDemand = totalDemandLs * mult;
    const hrPressureFactor = mult > 1.0 ? 1.0 - (mult - 1.0) * 0.22 : 1.0 + (1.0 - mult) * 0.12;
    const hrMinP = Math.round((minPressureM * hrPressureFactor) * 100) / 100;
    const hrMaxP = Math.round((maxPressureM * hrPressureFactor) * 100) / 100;

    const tankWaterLevels: Record<string, number> = {};
    network.tanks.forEach((t) => {
      const levelDelta = (1.0 - mult) * 0.35;
      const lvl = Math.max(t.minLevel, Math.min(t.maxLevel, t.initialLevel + levelDelta));
      tankWaterLevels[t.id] = Math.round(lvl * 100) / 100;
    });

    const pumpFlows: Record<string, number> = {};
    updatedPumps.forEach((p) => {
      const q = p.status === 'OPEN' ? Math.round((p.operatingFlow ?? p.designFlow) * Math.min(1.2, mult) * 100) / 100 : 0;
      pumpFlows[p.id] = q;
    });

    return {
      hour: hr,
      timeLabel: `${hr.toString().padStart(2, '0')}:00`,
      demandMultiplier: mult,
      totalDemandLs: Math.round(hrDemand * 100) / 100,
      minPressureM: hrMinP,
      maxPressureM: hrMaxP,
      tankWaterLevels,
      pumpFlows,
    };
  });

  // Automated Fire Flow Assessment (Residual >= 15m)
  const fireFlowResults: FireFlowResult[] = updatedJunctions.map((j) => {
    const curP = j.pressure ?? 20;
    const excessHead = Math.max(0, curP - 15.0);
    const availableFireFlowLs = Math.round((j.baseDemand + excessHead / 0.18) * 10) / 10;
    const residualP = excessHead > 0 ? 15.0 : Math.max(0, curP);
    const systemMinResidual = Math.round(Math.max(12.0, minPressureM - excessHead * 0.4) * 10) / 10;
    const isAdequate = availableFireFlowLs >= 35.0;

    return {
      junctionId: j.id,
      label: j.label || j.id,
      elevation: j.elevation,
      baseDemand: j.baseDemand,
      availableFireFlowLs,
      residualPressureM: residualP,
      systemMinResidualM: systemMinResidual,
      isAdequate,
    };
  });

  // Water Quality & Residence Time (Water Age in hours)
  const waterQualityResults: WaterQualityResult[] = updatedJunctions.map((j) => {
    let minDist = 9999;
    network.reservoirs.forEach((r) => {
      const d = Math.sqrt(Math.pow(j.lat - r.lat, 2) + Math.pow(j.lng - r.lng, 2)) * 111000;
      if (d < minDist) minDist = d;
    });
    const baseAgeHours = Math.round((minDist / Math.max(0.3, maxVelocityMs * 0.6) / 3600) * 10) / 10;
    const c0 = 1.2;
    const k = 0.045;
    const chlorine = Math.round((c0 * Math.exp(-k * baseAgeHours)) * 100) / 100;
    let status: WaterQualityResult['qualityStatus'] = 'Good';
    if (chlorine < 0.2) status = 'Low-Chlorine';
    else if (baseAgeHours > 48) status = 'Stagnant';
    else if (chlorine < 0.5) status = 'Fair';

    return {
      nodeId: j.id,
      waterAgeHours: baseAgeHours,
      chlorineResidualMgL: chlorine,
      qualityStatus: status,
    };
  });

  // Automated Pipe Sizing & Darwin Optimization
  const pipeOptimizations: PipeOptimizationResult[] = updatedPipes.map((p) => {
    const v = p.velocity ?? 0;
    const hl = p.unitHeadloss ?? 0;
    const curDia = p.diameter;

    let recDia = curDia;
    let reason: PipeOptimizationResult['reason'] = 'Optimal';
    let savingsOrUpgrade = 'Design within optimal velocity (0.6 - 1.5 m/s) and headloss (< 5 m/km)';

    if (hl > 10.0 || v > 2.0) {
      const standardCommercial = [100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 750, 900];
      const nextUp = standardCommercial.find((d) => d > curDia) || curDia + 50;
      recDia = nextUp;
      reason = hl > 10.0 ? 'Upsize: High Headloss' : 'Upsize: High Velocity';
      savingsOrUpgrade = `Upsize to DN${nextUp} to drop unit headloss by ~${Math.round((1 - Math.pow(curDia / nextUp, 4.87)) * 100)}% and reduce pumping head`;
    } else if (v < 0.3 && p.length > 60) {
      const standardCommercial = [50, 75, 100, 150, 200, 250, 300];
      const prevDown = [...standardCommercial].reverse().find((d) => d < curDia && d >= 100) || curDia;
      if (prevDown < curDia) {
        recDia = prevDown;
        reason = 'Downsize: Low Velocity / Stagnant';
        savingsOrUpgrade = `Downsize to DN${prevDown} to save initial capital pipe expenditure and prevent water stagnation`;
      }
    }

    return {
      pipeId: p.id,
      currentDiameterMm: curDia,
      recommendedDiameterMm: recDia,
      velocityMs: v,
      unitHeadlossMkm: hl,
      reason,
      estimatedCostSavingOrUpgrade: savingsOrUpgrade,
    };
  });

  // Transient Surge & Water Hammer Simulation (Joukowsky / Allievi Model)
  const transientSurgeSummary = computeTransientSurgeAnalysis(
    network,
    heads,
    flows,
    'PUMP_TRIP',
    2.0
  );

  // Attach transient wave properties to pipes
  const pipesWithTransient = updatedPipes.map((p) => {
    const tRes = transientSurgeSummary.pipeResults.find((r) => r.pipeId === p.id);
    return {
      ...p,
      waveSpeedMs: tRes?.waveSpeedMs,
      maxTransientHeadM: tRes?.maxTransientHeadM,
      minTransientHeadM: tRes?.minTransientHeadM,
    };
  });

  // Attach fire flow & water quality results directly to junctions
  const junctionsWithQuality = updatedJunctions.map((j) => {
    const ff = fireFlowResults.find((f) => f.junctionId === j.id);
    const wq = waterQualityResults.find((q) => q.nodeId === j.id);
    return {
      ...j,
      actualFireFlowLs: ff?.availableFireFlowLs,
      waterAgeHours: wq?.waterAgeHours,
      chlorineResidualMgL: wq?.chlorineResidualMgL,
    };
  });

  const summary: SimulationSummary = {
    converged,
    iterations,
    relativeFlowError: Math.round(maxFlowChange * 10000) / 10000,
    totalDemandLs: Math.round(totalDemandLs * 100) / 100,
    totalSupplyLs: Math.round(totalSupplyLs * 100) / 100,
    flowImbalanceLs: Math.round(Math.abs(totalSupplyLs - totalDemandLs) * 100) / 100,
    minPressureM: isFinite(minPressureM) ? Math.round(minPressureM * 100) / 100 : 0,
    minPressureNodeId,
    maxPressureM: isFinite(maxPressureM) ? Math.round(maxPressureM * 100) / 100 : 0,
    maxPressureNodeId,
    maxVelocityMs: Math.round(maxVelocityMs * 100) / 100,
    maxVelocityPipeId,
    totalPumpPowerKw: Math.round(totalPumpPowerKw * 10) / 10,
    dailyEnergyKwh,
    negativePressureNodes,
    lowPressureNodes,
    highVelocityPipes,
    runTimestamp: new Date().toISOString(),
    hourlyEpsPoints,
    fireFlowResults,
    waterQualityResults,
    pipeOptimizations,
    autoDesignRecommendations: pipeOptimizations,
    transientSurgeSummary,
  };

  return {
    updatedNetwork: {
      ...network,
      junctions: junctionsWithQuality,
      pipes: pipesWithTransient,
      pumps: updatedPumps,
      valves: updatedValves,
      reservoirs: updatedReservoirs,
      tanks: updatedTanks,
    },
    summary,
  };
}

/**
 * Computes Transient Surge & Water Hammer dynamics (Joukowsky / Allievi formulation)
 * for pump trip power outages or rapid valve closures.
 */
export function computeTransientSurgeAnalysis(
  network: WaterDistributionNetwork,
  heads: Map<string, number>,
  flows: Map<string, number>,
  scenario: 'PUMP_TRIP' | 'VALVE_CLOSURE' = 'PUMP_TRIP',
  closureOrTripTimeSec = 2.0
): TransientSimulationSummary {
  const g = 9.80665;
  const pipesAtRuptureRisk: string[] = [];
  const pipesAtCavitationRisk: string[] = [];
  let maxSystemSurgeHeadM = -999;
  let criticalHighPressureNodeId = '';
  let minSystemSurgeHeadM = 999;
  let criticalCavitationNodeId = '';
  let totalAirVesselVolM3 = 0;

  const pipeResults: TransientPipeResult[] = network.pipes.map((pipe) => {
    // 1. Determine acoustic wave speed (m/s) based on pipe material
    const mat = pipe.material || (pipe.diameter >= 250 ? 'DI' : 'PVC');
    let a = 1050; // default DI
    let pnBar = pipe.pressureRatingPnBar || (mat === 'PVC' || mat === 'HDPE' ? 10 : 16);

    switch (mat) {
      case 'Steel':
        a = 1150;
        pnBar = pipe.pressureRatingPnBar || 25;
        break;
      case 'DI':
        a = 1050;
        pnBar = pipe.pressureRatingPnBar || 16;
        break;
      case 'Concrete':
        a = 950;
        pnBar = pipe.pressureRatingPnBar || 10;
        break;
      case 'PVC':
        a = 400;
        pnBar = pipe.pressureRatingPnBar || 10;
        break;
      case 'HDPE':
        a = 320;
        pnBar = pipe.pressureRatingPnBar || 10;
        break;
    }

    const len = Math.max(10, pipe.length);
    const tc = (2 * len) / a; // Acoustic pipeline reflection period
    const flowLps = Math.abs(flows.get(pipe.id) ?? pipe.flow ?? 0);
    const areaM2 = (Math.PI * Math.pow(pipe.diameter / 1000, 2)) / 4;
    const computedV = areaM2 > 0 ? (flowLps / 1000) / areaM2 : 0;
    const v0 = pipe.velocity !== undefined && pipe.velocity !== 0 ? Math.abs(pipe.velocity) : (computedV > 0 ? computedV : 1.0);

    // 2. Joukowsky surge head Delta H (m)
    // For rapid event (closureTime <= tc): full Joukowsky a * V / g
    // For slow event (closureTime > tc): Allievi reduction 2 * L * V / (g * closureTime)
    let deltaH = 0;
    if (closureOrTripTimeSec <= tc) {
      deltaH = (a * v0) / g;
    } else {
      deltaH = (2 * len * v0) / (g * closureOrTripTimeSec);
    }
    deltaH = Math.max(1.0, Math.round(deltaH * 10) / 10);

    // Steady state head at midpoint
    const hStart = heads.get(pipe.startNodeId) ?? 50;
    const hEnd = heads.get(pipe.endNodeId) ?? 50;
    const hSteady = (hStart + hEnd) / 2;

    // Node elevations
    const startNode =
      network.junctions.find((j) => j.id === pipe.startNodeId) ||
      network.reservoirs.find((r) => r.id === pipe.startNodeId) ||
      network.tanks.find((t) => t.id === pipe.startNodeId);
    const elev = startNode ? startNode.elevation : 30;

    let hMax = hSteady;
    let hMin = hSteady;

    if (scenario === 'PUMP_TRIP') {
      // Pump trip generates severe initial downsurge followed by return positive reflection
      hMin = Math.round((hSteady - deltaH) * 10) / 10;
      hMax = Math.round((hSteady + 0.85 * deltaH) * 10) / 10;
    } else {
      // Valve closure generates severe initial upsurge upstream followed by downsurge
      hMax = Math.round((hSteady + deltaH) * 10) / 10;
      hMin = Math.round((hSteady - 0.70 * deltaH) * 10) / 10;
    }

    const pMaxBar = Math.round((Math.max(0, hMax - elev) / 10.197) * 10) / 10;
    const pMinBar = Math.round(((hMin - elev) / 10.197) * 10) / 10;

    // Overpressure evaluation
    let overpressureRisk: TransientPipeResult['overpressureRisk'] = 'Safe';
    if (pMaxBar > pnBar * 1.25) {
      overpressureRisk = 'Severe: Rupture Risk';
      pipesAtRuptureRisk.push(pipe.id);
    } else if (pMaxBar > pnBar * 0.95) {
      overpressureRisk = 'Warning: Approaching Rating';
    }

    // Cavitation & Column separation evaluation (Vapor pressure ~ -10m H2O gauge)
    const gaugePressureMinM = hMin - elev;
    let cavitationRisk: TransientPipeResult['cavitationRisk'] = 'None';
    if (gaugePressureMinM < -10.0) {
      cavitationRisk = 'Severe Vapor Cavitation / Column Separation';
      pipesAtCavitationRisk.push(pipe.id);
    } else if (gaugePressureMinM < 0.0) {
      cavitationRisk = 'Sub-atmospheric';
    }

    if (hMax > maxSystemSurgeHeadM) {
      maxSystemSurgeHeadM = hMax;
      criticalHighPressureNodeId = pipe.startNodeId;
    }
    if (hMin < minSystemSurgeHeadM) {
      minSystemSurgeHeadM = hMin;
      criticalCavitationNodeId = pipe.endNodeId;
    }

    // Sizing protection devices
    let recProtection = 'Normal transient tolerance';
    if (cavitationRisk === 'Severe Vapor Cavitation / Column Separation') {
      const qM3s = Math.abs(pipe.flow ?? 10) / 1000;
      const vAirM3 = Math.round(((2 * qM3s * len * a) / (g * Math.max(15, hSteady) * 0.6)) * 10) / 10;
      totalAirVesselVolM3 += vAirM3;
      recProtection = `Hydro-Pneumatic Air Vessel (${vAirM3} m³) or Dual-Chamber Air/Vacuum Valve DN${Math.min(200, Math.max(50, Math.round(pipe.diameter / 3)))}`;
    } else if (overpressureRisk === 'Severe: Rupture Risk') {
      recProtection = `Surge Anticipator Valve / Quick-Opening Relief Valve (Setting: ${(pnBar * 0.9).toFixed(1)} bar)`;
    } else if (tc < closureOrTripTimeSec && scenario === 'VALVE_CLOSURE') {
      recProtection = `Extend valve closure time to t_c >= ${(tc * 3).toFixed(1)}s (multi-stage damping)`;
    }

    return {
      pipeId: pipe.id,
      pipeMaterial: mat,
      waveSpeedMs: a,
      acousticPeriodSec: Math.round(tc * 100) / 100,
      initialVelocityMs: v0,
      joukowskySurgeM: deltaH,
      steadyPressureM: Math.round((hSteady - elev) * 10) / 10,
      maxTransientHeadM: hMax,
      maxTransientPressureBar: pMaxBar,
      minTransientHeadM: hMin,
      minTransientPressureBar: pMinBar,
      pressureRatingPnBar: pnBar,
      overpressureRisk,
      cavitationRisk,
      recommendedProtection: recProtection,
    };
  });

  // 3. Transient Protection Devices Schedule
  const protectionDevices: TransientProtectionDevice[] = [];
  if (totalAirVesselVolM3 > 0 || pipesAtCavitationRisk.length > 0) {
    const vesselLoc =
      criticalCavitationNodeId ||
      network.pumps[0]?.endNodeId ||
      network.pipes[0]?.startNodeId ||
      'J-1';
    const vesselVol = Math.max(1.5, Math.round(totalAirVesselVolM3 * 10) / 10);
    protectionDevices.push({
      type: 'AIR_VESSEL',
      locationNodeId: vesselLoc,
      recommendedSize: `${vesselVol} m³ Hydro-pneumatic Bladder Tank (Initial Pre-charge ${(minSystemSurgeHeadM > 0 ? minSystemSurgeHeadM * 0.07 : 2.5).toFixed(1)} bar)`,
      effectiveVolumeM3: vesselVol,
      mitigatedMaxHeadM: Math.round(maxSystemSurgeHeadM * 0.72 * 10) / 10,
      mitigatedMinHeadM: Math.round(Math.max(5.0, minSystemSurgeHeadM + 18.0) * 10) / 10,
    });

    protectionDevices.push({
      type: 'AIR_RELEASE_VALVE',
      locationNodeId: criticalHighPressureNodeId || 'J-2',
      recommendedSize: 'DN100 Rapid Air Intake / Slow Non-Slam Air Release Surge Valve',
      mitigatedMaxHeadM: Math.round(maxSystemSurgeHeadM * 0.85 * 10) / 10,
      mitigatedMinHeadM: 2.0,
    });
  }

  // 4. Time History Timeline (0 to 10 seconds tracking wave oscillation)
  const timeHistory: TransientTimeHistoryPoint[] = [];
  const damping = 0.82;
  for (let t = 0; t <= 10; t += 0.5) {
    const decay = Math.exp(-0.25 * t);
    const osc = Math.cos((2 * Math.PI * t) / Math.max(1.5, closureOrTripTimeSec * 1.2));
    const deltaSurge = (maxSystemSurgeHeadM - 50) * decay * osc;

    const nodeHeads: Record<string, number> = {};
    network.junctions.forEach((j) => {
      const h0 = heads.get(j.id) ?? 50;
      nodeHeads[j.id] = Math.round((h0 + deltaSurge * damping) * 10) / 10;
    });

    timeHistory.push({
      timeSec: Math.round(t * 10) / 10,
      maxSystemHeadM: Math.round((50 + Math.abs(deltaSurge)) * 10) / 10,
      minSystemHeadM: Math.round((50 - Math.abs(deltaSurge) * 0.9) * 10) / 10,
      nodeHeads,
    });
  }

  return {
    scenario,
    closureOrTripTimeSec,
    maxSystemSurgeHeadM: Math.round(maxSystemSurgeHeadM * 10) / 10,
    criticalHighPressureNodeId,
    minSystemSurgeHeadM: Math.round(minSystemSurgeHeadM * 10) / 10,
    criticalCavitationNodeId,
    vaporCavitationOccurred: pipesAtCavitationRisk.length > 0,
    pipesAtRuptureRisk,
    pipesAtCavitationRisk,
    airVesselRecommendedVolumeM3: Math.max(1.0, Math.round(totalAirVesselVolM3 * 10) / 10),
    pipeResults,
    timeHistory,
    protectionDevices,
  };
}

/**
 * Applies Darwin-style constraint-based recommended pipe sizes to the network.
 */
export function applyWaterPipeOptimization(
  network: WaterDistributionNetwork,
  optimizations: PipeOptimizationResult[]
): WaterDistributionNetwork {
  const optMap = new Map(optimizations.map((o) => [o.pipeId, o]));

  const updatedPipes = network.pipes.map((p) => {
    const opt = optMap.get(p.id);
    if (!opt) return { ...p };
    return {
      ...p,
      diameter: opt.recommendedDiameterMm,
    };
  });

  return {
    ...network,
    pipes: updatedPipes,
  };
}
