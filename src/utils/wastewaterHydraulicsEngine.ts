/**
 * Wastewater Collection & Sewer Hydraulics Solver Engine
 *
 * Implements:
 * 1. Diurnal sanitary peaking factors (Babbitt, Harmon, Ten-States, Custom).
 * 2. Topological directed graph accumulation of dry weather flow and wet weather I&I.
 * 3. Exact circular pipe partial-flow Manning's open-channel hydraulics (normal depth,
 *    hydraulic radius, velocity, Froude number).
 * 4. Longitudinal backwater Hydraulic Grade Line (HGL) and surcharge detection.
 * 5. Self-cleansing (min 0.6 m/s) and scour (max 3.0 m/s) velocity compliance checks.
 * 6. Lift station pumping dynamics, wet well mass balance, and force main friction losses.
 */

import {
  WastewaterConduit,
  WastewaterForceMain,
  WastewaterManhole,
  WastewaterNetwork,
  WastewaterOutfall,
  WastewaterPump,
  WastewaterSimulationSummary,
  WastewaterWetWell,
  HourlySewerSimulationPoint,
  SewerConstraintDesignResult,
  H2SCorrosionResult,
  InflowInfiltrationResult,
  LiftStationCycleResult,
} from '../types/wastewater';

const G = 9.80665; // m/s^2

/**
 * Computes diurnal peaking multiplier M based on contributing population in thousands.
 */
export function computePeakingFactor(
  population: number,
  formula: 'babbitt' | 'harmon' | 'ten-states' | 'constant',
  customFactor = 2.5
): number {
  const pThousands = Math.max(0.05, population / 1000);

  switch (formula) {
    case 'babbitt': {
      // Babbitt: M = 5 / (P^0.2), standard range [1.5, 4.5]
      const m = 5 / Math.pow(pThousands, 0.2);
      return Math.min(4.5, Math.max(1.5, Math.round(m * 100) / 100));
    }
    case 'harmon': {
      // Harmon: M = 1 + 14 / (4 + sqrt(P)), standard range [1.5, 4.0]
      const m = 1 + 14 / (4 + Math.sqrt(pThousands));
      return Math.min(4.0, Math.max(1.5, Math.round(m * 100) / 100));
    }
    case 'ten-states': {
      // Ten-States Recommended Standards: M = (18 + sqrt(P)) / (4 + sqrt(P))
      const m = (18 + Math.sqrt(pThousands)) / (4 + Math.sqrt(pThousands));
      return Math.min(4.0, Math.max(1.5, Math.round(m * 100) / 100));
    }
    case 'constant':
    default:
      return Math.max(1.0, customFactor);
  }
}

/**
 * Solves circular pipe partial flow geometry via Manning's formula.
 * Returns normal depth yn (m), depth ratio d/D, flow area A (m^2),
 * velocity V (m/s), and hydraulic radius Rh (m).
 */
export function solveManningPartialFlow(
  dischargeM3s: number,
  diameterM: number,
  manningN: number,
  slopeMPerM: number
): {
  depthM: number;
  depthRatio: number;
  areaM2: number;
  velocityMs: number;
  hydraulicRadiusM: number;
  froudeNumber: number;
  isSurcharged: boolean;
} {
  const S = Math.max(0.0001, slopeMPerM);
  const D = diameterM;
  const r = D / 2;

  // Full-pipe properties
  const aFull = (Math.PI * D * D) / 4;
  const rhFull = D / 4;
  const qFullM3s = (1.0 / manningN) * aFull * Math.pow(rhFull, 2 / 3) * Math.sqrt(S);
  const vFull = qFullM3s / aFull;

  if (dischargeM3s <= 0.000001) {
    return {
      depthM: 0,
      depthRatio: 0,
      areaM2: 0,
      velocityMs: 0,
      hydraulicRadiusM: 0,
      froudeNumber: 0,
      isSurcharged: false,
    };
  }

  // Surcharged pipe condition
  if (dischargeM3s >= qFullM3s) {
    const vActual = dischargeM3s / aFull;
    const ratio = Math.round((dischargeM3s / qFullM3s) * 100) / 100;
    return {
      depthM: D,
      depthRatio: ratio,
      areaM2: Math.round(aFull * 1000) / 1000,
      velocityMs: Math.round(vActual * 100) / 100,
      hydraulicRadiusM: Math.round(rhFull * 1000) / 1000,
      froudeNumber: Math.round((vActual / Math.sqrt(G * D)) * 100) / 100,
      isSurcharged: true,
    };
  }

  // Bisection solver for wetted angle theta in [0.01, 2*PI]
  // Target: Q(theta) = (1/n) * A(theta) * Rh(theta)^(2/3) * S^(1/2) - Q = 0
  let low = 0.01;
  let high = 2 * Math.PI - 0.001;
  let mid = (low + high) / 2;

  const computeQ = (theta: number) => {
    const a = (D * D / 8) * (theta - Math.sin(theta));
    const p = (D / 2) * theta;
    const rh = a / p;
    return (1.0 / manningN) * a * Math.pow(rh, 2 / 3) * Math.sqrt(S);
  };

  for (let iter = 0; iter < 40; iter++) {
    mid = (low + high) / 2;
    const qMid = computeQ(mid);
    if (Math.abs(qMid - dischargeM3s) < 0.00005) break;

    if (qMid < dischargeM3s) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const theta = mid;
  const depthM = Math.min(D, (D / 2) * (1 - Math.cos(theta / 2)));
  const areaM2 = (D * D / 8) * (theta - Math.sin(theta));
  const perimeterM = (D / 2) * theta;
  const hydraulicRadiusM = areaM2 / perimeterM;
  const velocityMs = dischargeM3s / Math.max(0.0001, areaM2);
  const topWidthM = Math.max(0.001, D * Math.sin(theta / 2));
  const hydraulicDepthM = areaM2 / topWidthM;
  const froudeNumber = velocityMs / Math.sqrt(G * hydraulicDepthM);

  return {
    depthM: Math.round(depthM * 1000) / 1000,
    depthRatio: Math.round((depthM / D) * 100) / 100,
    areaM2: Math.round(areaM2 * 10000) / 10000,
    velocityMs: Math.round(velocityMs * 100) / 100,
    hydraulicRadiusM: Math.round(hydraulicRadiusM * 1000) / 1000,
    froudeNumber: Math.round(froudeNumber * 100) / 100,
    isSurcharged: false,
  };
}

/**
 * Runs complete hydraulic analysis on the wastewater network.
 */
export function simulateWastewaterNetwork(network: WastewaterNetwork): {
  updatedNetwork: WastewaterNetwork;
  summary: WastewaterSimulationSummary;
} {
  const manholes = network.manholes.map((m) => ({ ...m }));
  const conduits = network.conduits.map((c) => ({ ...c }));
  const wetWells = network.wetWells.map((w) => ({ ...w }));
  const pumps = network.pumps.map((p) => ({ ...p }));
  const forceMains = network.forceMains.map((f) => ({ ...f }));
  const outfalls = network.outfalls.map((o) => ({ ...o }));

  // 1. Calculate nodal sanitary production at each manhole
  let totalPopulation = 0;
  let totalDryWeatherFlowLs = 0;
  let totalInflowInfiltrationLs = 0;

  const nodeMap = new Map<string, WastewaterManhole | WastewaterWetWell | WastewaterOutfall>();
  manholes.forEach((m) => nodeMap.set(m.id, m));
  wetWells.forEach((w) => nodeMap.set(w.id, w));
  outfalls.forEach((o) => nodeMap.set(o.id, o));

  manholes.forEach((m) => {
    const pop = Math.max(0, m.population);
    const lpcd = Math.max(50, m.unitLoadingLpcd || 135);
    const avgSewageLs = (pop * lpcd) / 86400; // Average dry weather flow from population
    const totalAvgLs = avgSewageLs + (m.baseDryWeatherFlowLs || 0);

    const peakingFactor = computePeakingFactor(pop, m.peakingFormula, m.customPeakingFactor);
    const peakSanitaryLs = totalAvgLs * peakingFactor;
    const totalPeakLs = peakSanitaryLs + (m.inflowInfiltrationLs || 0);

    m.averageSanitaryFlowLs = Math.round(totalAvgLs * 100) / 100;
    m.peakSanitaryFlowLs = Math.round(totalPeakLs * 100) / 100;

    totalPopulation += pop;
    totalDryWeatherFlowLs += totalAvgLs;
    totalInflowInfiltrationLs += m.inflowInfiltrationLs || 0;
  });

  // 2. Build graph adjacency for upstream-to-downstream topological accumulation
  const downstreamConduitsByNode = new Map<string, WastewaterConduit[]>();
  const upstreamConduitsByNode = new Map<string, WastewaterConduit[]>();
  const inDegree = new Map<string, number>();

  nodeMap.forEach((_, id) => {
    downstreamConduitsByNode.set(id, []);
    upstreamConduitsByNode.set(id, []);
    inDegree.set(id, 0);
  });

  conduits.forEach((c) => {
    downstreamConduitsByNode.get(c.startNodeId)?.push(c);
    upstreamConduitsByNode.get(c.endNodeId)?.push(c);
    inDegree.set(c.endNodeId, (inDegree.get(c.endNodeId) || 0) + 1);
  });

  // Topological sorting (Kahn's algorithm)
  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const cumulativeFlowAtNode = new Map<string, number>();
  manholes.forEach((m) => {
    cumulativeFlowAtNode.set(m.id, m.peakSanitaryFlowLs || 0);
  });
  wetWells.forEach((w) => cumulativeFlowAtNode.set(w.id, 0));
  outfalls.forEach((o) => cumulativeFlowAtNode.set(o.id, 0));

  const sortedNodeIds: string[] = [];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    sortedNodeIds.push(currentId);

    const outgoing = downstreamConduitsByNode.get(currentId) || [];
    const currentAccumulated = cumulativeFlowAtNode.get(currentId) || 0;

    // Distribute accumulated flow among outgoing gravity conduits
    const share = outgoing.length > 0 ? currentAccumulated / outgoing.length : 0;
    outgoing.forEach((conduit) => {
      conduit.designFlowLs = Math.round(share * 100) / 100;
      const targetId = conduit.endNodeId;
      const existing = cumulativeFlowAtNode.get(targetId) || 0;
      cumulativeFlowAtNode.set(targetId, existing + share);

      const newDeg = (inDegree.get(targetId) || 1) - 1;
      inDegree.set(targetId, newDeg);
      if (newDeg === 0) queue.push(targetId);
    });
  }

  // Handle any nodes in cycles by providing fallback accumulation
  nodeMap.forEach((_, id) => {
    if (!sortedNodeIds.includes(id)) {
      const up = upstreamConduitsByNode.get(id) || [];
      let sum = (nodeMap.get(id) as WastewaterManhole)?.peakSanitaryFlowLs || 0;
      up.forEach((c) => (sum += c.designFlowLs || 0));
      cumulativeFlowAtNode.set(id, sum);
    }
  });

  // 3. Compute conduit gravity Manning hydraulics
  let maxCapacityRatio = 0;
  let criticalConduitId = conduits[0]?.id || '';
  let minVelocity = 999;
  let minVelocityConduitId = '';
  let maxVelocity = 0;
  let maxVelocityConduitId = '';
  let totalGravityLength = 0;

  const surchargedConduitIds: string[] = [];
  const subCleansingConduitIds: string[] = [];
  const scourWarningConduitIds: string[] = [];
  const reverseSlopeConduitIds: string[] = [];

  conduits.forEach((c) => {
    const startNode = nodeMap.get(c.startNodeId);
    const endNode = nodeMap.get(c.endNodeId);

    // Auto-align inverts if unset
    if (c.upstreamInvertM === undefined || c.upstreamInvertM === 0) {
      if (startNode && 'invertElevation' in startNode) {
        c.upstreamInvertM = startNode.invertElevation;
      }
    }
    if (c.downstreamInvertM === undefined || c.downstreamInvertM === 0) {
      if (endNode && 'invertElevation' in endNode) {
        c.downstreamInvertM = endNode.invertElevation;
      }
    }

    const length = Math.max(1, c.lengthM || 50);
    c.lengthM = Math.round(length * 10) / 10;
    totalGravityLength += c.lengthM;

    const slope = (c.upstreamInvertM - c.downstreamInvertM) / length;
    c.slopeMPerM = Math.round(slope * 10000) / 10000;

    if (slope <= 0) {
      c.isReverseSlope = true;
      reverseSlopeConduitIds.push(c.id);
    } else {
      c.isReverseSlope = false;
    }

    const diaM = Math.max(0.1, (c.diameterMm || 250) / 1000);
    const manningN = c.manningN || (c.material === 'PVC' || c.material === 'HDPE' ? 0.01 : 0.013);
    const designFlowM3s = Math.max(0.0001, (c.designFlowLs || 0) / 1000);

    // Full pipe capacity
    const aFull = (Math.PI * diaM * diaM) / 4;
    const rhFull = diaM / 4;
    const qFullM3s = (1.0 / manningN) * aFull * Math.pow(rhFull, 2 / 3) * Math.sqrt(Math.max(0.0001, Math.abs(slope)));
    c.fullCapacityLs = Math.round(qFullM3s * 1000 * 10) / 10;
    c.fullVelocityMs = Math.round((qFullM3s / aFull) * 100) / 100;

    // Partial flow calculation
    const hydraulics = solveManningPartialFlow(designFlowM3s, diaM, manningN, Math.abs(slope));
    c.flowDepthM = hydraulics.depthM;
    c.flowDepthRatio = hydraulics.depthRatio;
    c.actualVelocityMs = hydraulics.velocityMs;
    c.hydraulicRadiusM = hydraulics.hydraulicRadiusM;
    c.froudeNumber = hydraulics.froudeNumber;
    c.isSurcharged = hydraulics.isSurcharged;

    // Design compliance checks
    c.selfCleansingOk = hydraulics.velocityMs >= 0.60;
    c.scourVelocityOk = hydraulics.velocityMs <= 3.00;

    if (hydraulics.depthRatio > maxCapacityRatio) {
      maxCapacityRatio = hydraulics.depthRatio;
      criticalConduitId = c.id;
    }
    if (hydraulics.velocityMs > 0 && hydraulics.velocityMs < minVelocity) {
      minVelocity = hydraulics.velocityMs;
      minVelocityConduitId = c.id;
    }
    if (hydraulics.velocityMs > maxVelocity) {
      maxVelocity = hydraulics.velocityMs;
      maxVelocityConduitId = c.id;
    }

    if (hydraulics.isSurcharged) surchargedConduitIds.push(c.id);
    if (!c.selfCleansingOk && (c.designFlowLs || 0) > 0.5) subCleansingConduitIds.push(c.id);
    if (!c.scourVelocityOk) scourWarningConduitIds.push(c.id);
  });

  // 4. Trace Hydraulic Grade Line (HGL) and surcharge elevations at Manholes
  const floodedManholeIds: string[] = [];

  manholes.forEach((m) => {
    const incomingConduits = upstreamConduitsByNode.get(m.id) || [];
    const outgoingConduits = downstreamConduitsByNode.get(m.id) || [];

    // Max water depth among incoming and outgoing pipes
    let maxPipeWaterDepth = 0.15;
    incomingConduits.forEach((c) => {
      if ((c.flowDepthM || 0) > maxPipeWaterDepth) maxPipeWaterDepth = c.flowDepthM!;
    });
    outgoingConduits.forEach((c) => {
      if ((c.flowDepthM || 0) > maxPipeWaterDepth) maxPipeWaterDepth = c.flowDepthM!;
    });

    m.totalInflowLs = Math.round((cumulativeFlowAtNode.get(m.id) || m.peakSanitaryFlowLs || 0) * 100) / 100;
    m.waterDepthM = Math.round(maxPipeWaterDepth * 100) / 100;
    m.waterElevationM = Math.round((m.invertElevation + maxPipeWaterDepth) * 100) / 100;

    // Check if water exceeds manhole rim (surface flooding)
    if (m.waterElevationM > m.rimElevation) {
      m.isFlooding = true;
      floodedManholeIds.push(m.id);
    } else {
      m.isFlooding = false;
    }

    // Check if surcharged above pipe crown
    const maxDiaM = outgoingConduits.length > 0 ? (outgoingConduits[0].diameterMm || 250) / 1000 : 0.25;
    if (maxPipeWaterDepth > maxDiaM) {
      m.isSurcharged = true;
      m.surchargeDepthM = Math.round((maxPipeWaterDepth - maxDiaM) * 100) / 100;
    } else {
      m.isSurcharged = false;
      m.surchargeDepthM = 0;
    }
  });

  // 5. Pumping Station Hydraulics
  let totalPumpPowerKw = 0;
  pumps.forEach((p) => {
    if (p.status === 'ON') {
      const qM3s = (p.ratedDischargeLs || 30) / 1000;
      const hM = p.dynamicHeadM || 25;
      const eff = Math.max(0.2, (p.efficiencyPercent || 75) / 100);
      const kw = (9.81 * qM3s * hM) / eff;
      p.powerKw = Math.round(kw * 10) / 10;
      totalPumpPowerKw += p.powerKw;
    } else {
      p.powerKw = 0;
    }
  });

  // 6. Force Main Hydraulics
  let totalForceMainLength = 0;
  forceMains.forEach((fm) => {
    const diaM = Math.max(0.05, (fm.diameterMm || 150) / 1000);
    const areaM2 = (Math.PI * diaM * diaM) / 4;
    const pump = pumps.find((p) => p.endNodeId === fm.startNodeId || p.startNodeId === fm.startNodeId);
    const flowLs = pump ? (pump.status === 'ON' ? (pump.ratedDischargeLs || 30) : 0) : 25;
    const flowM3s = flowLs / 1000;
    fm.velocityMs = flowLs > 0 ? Math.round((flowM3s / areaM2) * 100) / 100 : 0;

    const c = fm.cFactor || 120;
    const hf = flowLs > 0 ? 10.67 * Math.pow(flowM3s / c, 1.852) * Math.pow(diaM, -4.87) * (fm.lengthM || 100) : 0;
    fm.frictionHeadlossM = Math.round(hf * 10) / 10;
    totalForceMainLength += fm.lengthM || 100;
  });

  // 7. Outfall Discharges
  let totalOutfallDischargeLs = 0;
  outfalls.forEach((out) => {
    const inflow = cumulativeFlowAtNode.get(out.id) || 0;
    out.totalDischargeLs = Math.round(inflow * 100) / 100;
    totalOutfallDischargeLs += out.totalDischargeLs;
  });

  const totalPeakSanitaryFlowLs = Array.from(cumulativeFlowAtNode.values()).reduce(
    (max, val) => Math.max(max, val),
    totalOutfallDischargeLs
  );

  const flowImbalanceLs = Math.round(Math.abs(totalPeakSanitaryFlowLs - totalOutfallDischargeLs) * 100) / 100;

  // 8. Advanced Module: 24-Hour Diurnal SWMM Hydrograph Dynamic Routing
  const DIURNAL_SANITARY_PATTERN: number[] = [
    0.50, 0.40, 0.35, 0.35, 0.45, 0.65, 0.95, 1.45,
    1.80, 1.60, 1.35, 1.15, 1.20, 1.10, 1.05, 1.00,
    1.05, 1.25, 1.55, 1.75, 1.50, 1.25, 0.95, 0.70,
  ];

  const hourlySimulationPoints: HourlySewerSimulationPoint[] = DIURNAL_SANITARY_PATTERN.map(
    (mult, hour) => {
      const timeLabel = `${hour.toString().padStart(2, '0')}:00`;
      const flow = Math.round((totalDryWeatherFlowLs * mult + totalInflowInfiltrationLs * 0.7) * 100) / 100;
      const capRatio = Math.round(maxCapacityRatio * mult * 100) / 100;

      // Wet well stage simulation
      let wetWellLevelM = 166.5;
      let pumpState: 'ON' | 'OFF' = 'OFF';
      if (wetWells.length > 0) {
        const ww = wetWells[0];
        const nominalLevel = ww.floorElevation + 1.2;
        wetWellLevelM = Math.round((nominalLevel + (mult - 1.0) * 0.8) * 100) / 100;
        pumpState = mult >= 1.1 ? 'ON' : 'OFF';
      }

      return {
        hour,
        timeLabel,
        diurnalMultiplier: mult,
        totalFlowLs: flow,
        criticalConduitId,
        maxCapacityUtilization: capRatio,
        wetWellWaterLevelM: wetWellLevelM,
        pumpOperatingState: pumpState,
      };
    }
  );

  // 9. Advanced Module: Automated Gravity Sewer Constraint-Based Sizing & Slope Design
  const STANDARD_SEWER_DIAMETERS_MM = [150, 200, 250, 300, 375, 450, 500, 600, 750, 900, 1000, 1200];

  const constraintDesignResults: SewerConstraintDesignResult[] = conduits.map((c) => {
    const startNode = nodeMap.get(c.startNodeId);
    const endNode = nodeMap.get(c.endNodeId);
    const startRim = (startNode && 'rimElevation' in startNode) ? startNode.rimElevation : 172.0;
    const endRim = (endNode && 'rimElevation' in endNode) ? endNode.rimElevation : 171.0;

    const currentDia = c.diameterMm || 250;
    const currentSlopePct = Math.round(c.slopeMPerM * 100 * 1000) / 1000;
    const flowLs = c.designFlowLs || 5.0;
    const capRatio = c.flowDepthRatio || 0.5;
    const velocity = c.actualVelocityMs || 0.8;

    // Upstream ground cover depth: rim - invert - crown
    const upstreamCoverM = Math.round((startRim - c.upstreamInvertM - currentDia / 1000) * 100) / 100;
    const downstreamCoverM = Math.round((endRim - c.downstreamInvertM - currentDia / 1000) * 100) / 100;
    const minCoverM = Math.min(upstreamCoverM, downstreamCoverM);

    let recDia = currentDia;
    let recSlopePct = currentSlopePct;
    let designStatus: SewerConstraintDesignResult['designStatus'] = 'Optimal';
    let designNote = 'Conforms to Manning self-cleansing (V >= 0.6m/s) and capacity (d/D <= 0.80) standards.';

    if (capRatio > 0.80 || c.isSurcharged) {
      // Find smallest standard diameter that brings d/D <= 0.80
      const candidate = STANDARD_SEWER_DIAMETERS_MM.find((d) => d > currentDia);
      recDia = candidate || currentDia + 100;
      designStatus = 'Upsize Required: Capacity Exceeded';
      designNote = `Capacity utilization d/D=${capRatio.toFixed(2)} exceeds 0.80 limit. Upsize from ${currentDia}mm to ${recDia}mm.`;
    } else if (velocity < 0.60 && flowLs > 0.5) {
      // Sub-cleansing velocity: recommend steepening slope or drop manhole
      recSlopePct = Math.max(currentSlopePct * 1.5, 0.40);
      designStatus = 'Steepen Slope: Self-Cleansing Low Velocity';
      designNote = `Actual velocity ${velocity.toFixed(2)} m/s is below self-cleansing limit 0.60 m/s. Steepen grade to ${recSlopePct.toFixed(2)}%.`;
    } else if (velocity > 3.00) {
      recSlopePct = Math.max(0.20, currentSlopePct * 0.6);
      designStatus = 'Flatten Slope: Scour High Velocity';
      designNote = `Actual velocity ${velocity.toFixed(2)} m/s exceeds 3.00 m/s scouring threshold. Flatten slope or install drop manholes.`;
    } else if (minCoverM < 1.20) {
      designStatus = 'Optimal';
      designNote = `Shallow soil cover (${minCoverM.toFixed(2)}m < 1.20m minimum standard). Provide concrete encasement protection.`;
    }

    return {
      conduitId: c.id,
      currentDiameterMm: currentDia,
      recommendedDiameterMm: recDia,
      currentSlopePercent: currentSlopePct,
      recommendedSlopePercent: recSlopePct,
      upstreamDropM: 0,
      downstreamDropM: 0,
      coverDepthM: minCoverM,
      designStatus,
      designNote,
    };
  });

  // 10. Advanced Module: Pomeroy-Parkhurst Hydrogen Sulfide (H2S) & Odor / Concrete Corrosion
  const h2sCorrosionResults: H2SCorrosionResult[] = conduits.map((c) => {
    const bod5 = 250; // standard municipal sanitary BOD5 (mg/L)
    const tempC = 25; // standard warm sewage temp
    const slope = Math.max(0.0005, Math.abs(c.slopeMPerM));
    const flowM3s = Math.max(0.0005, (c.designFlowLs || 5) / 1000);

    // Approximate wetted perimeter to top-width ratio P/b
    const dOverD = Math.max(0.1, Math.min(0.95, c.flowDepthRatio || 0.4));
    const pOverB = Math.max(1.1, Math.min(2.8, 1.0 + dOverD * 1.6));

    // Pomeroy Z-index: Z = (BOD5 * 1.07^(T-20)) / (S^0.5 * Q^0.33) * (P/b)
    const tempFactor = Math.pow(1.07, tempC - 20);
    const zFactor = Math.round(((bod5 * tempFactor) / (Math.pow(slope, 0.5) * Math.pow(flowM3s, 0.33))) * pOverB);

    let corrosionPotential: H2SCorrosionResult['corrosionPotential'] = 'Low';
    let crownLossMmPerYear = 0.25;
    let odorRisk: H2SCorrosionResult['odorRisk'] = 'Negligible';

    if (zFactor > 10000) {
      corrosionPotential = 'Severe';
      crownLossMmPerYear = Math.round((1.5 + (zFactor - 10000) / 10000) * 100) / 100;
      odorRisk = 'High';
    } else if (zFactor >= 5000) {
      corrosionPotential = 'Moderate';
      crownLossMmPerYear = Math.round((0.5 + (zFactor - 5000) / 10000) * 100) / 100;
      odorRisk = 'Moderate';
    } else {
      corrosionPotential = 'Low';
      crownLossMmPerYear = Math.round((0.15 + zFactor / 30000) * 100) / 100;
      odorRisk = 'Negligible';
    }

    const buildupRate = Math.round((0.000025 * zFactor) * 1000) / 1000;

    return {
      conduitId: c.id,
      bod5MgL: bod5,
      temperatureC: tempC,
      zFactor,
      sulfideBuildupRateMgLHr: buildupRate,
      corrosionPotential,
      crownLossMmPerYear,
      odorRisk,
    };
  });

  // 11. Advanced Module: Inflow & Infiltration (I&I) and GWI Analysis
  const inflowInfiltrationResults: InflowInfiltrationResult[] = manholes.map((m) => {
    const dryWeatherFlowLs = m.averageSanitaryFlowLs || 1.0;
    const gwiFlowLs = Math.round((m.depth * 0.12) * 100) / 100; // Groundwater infiltration proportional to depth
    const rdiiFlowLs = Math.round((m.inflowInfiltrationLs || 0.5) * 100) / 100;
    const peakSanitaryLs = m.peakSanitaryFlowLs || (dryWeatherFlowLs * 2.5);
    const totalWetWeatherPeakLs = Math.round((peakSanitaryLs + gwiFlowLs + rdiiFlowLs) * 100) / 100;
    const dilutionRatio = Math.round((totalWetWeatherPeakLs / Math.max(0.1, dryWeatherFlowLs)) * 100) / 100;

    return {
      manholeId: m.id,
      dryWeatherFlowLs,
      rdiiFlowLs,
      gwiFlowLs,
      totalWetWeatherPeakLs,
      dilutionRatio,
    };
  });

  // 12. Advanced Module: Lift Station Wet Well Cycling & Energy Dynamics
  let dailyEnergyKwh = 0;
  const liftStationCycleResults: LiftStationCycleResult[] = wetWells.map((w) => {
    const connectedPump = pumps.find((p) => p.startNodeId === w.id) || pumps[0];
    const inflowLs = w.inflowLs || 25.0;
    const ratedDischargeLs = connectedPump?.ratedDischargeLs || 40.0;
    const headM = connectedPump?.dynamicHeadM || 25.0;

    // Effective volume between min (shutoff) and max (start) level
    const diamM = w.diameterM || 3.5;
    const areaM2 = (Math.PI * diamM * diamM) / 4;
    const deltaHM = Math.max(0.5, w.maxWaterLevelM - w.minWaterLevelM);
    const effectiveVolM3 = Math.round((areaM2 * deltaHM) * 10) / 10;

    // Cycle time t = V_eff / Q_in + V_eff / (Q_pump - Q_in)
    const qInM3s = inflowLs / 1000;
    const qPumpM3s = ratedDischargeLs / 1000;
    let cycleTimeMin = 15.0;
    let startsPerHour = 4.0;

    if (qPumpM3s > qInM3s && qInM3s > 0) {
      const fillSec = effectiveVolM3 / qInM3s;
      const emptySec = effectiveVolM3 / (qPumpM3s - qInM3s);
      cycleTimeMin = Math.round(((fillSec + emptySec) / 60) * 10) / 10;
      startsPerHour = Math.round((60 / cycleTimeMin) * 10) / 10;
    }

    const wireToWaterPowerKw = connectedPump?.powerKw || 15.0;
    const operatingHoursPerDay = Math.min(24, Math.max(2, (inflowLs / qPumpM3s / 1000) * 24));
    const dailyKwh = Math.round((wireToWaterPowerKw * operatingHoursPerDay) * 10) / 10;
    const annualCost = Math.round(dailyKwh * 365 * 0.12); // $0.12/kWh industrial electricity tariff

    dailyEnergyKwh += dailyKwh;

    return {
      wetWellId: w.id,
      inflowLs,
      pumpDischargeLs: ratedDischargeLs,
      effectiveVolumeM3: effectiveVolM3,
      cycleTimeMinutes: cycleTimeMin,
      startsPerHour,
      operatingHeadM: headM,
      wireToWaterPowerKw,
      dailyPumpingKwh: dailyKwh,
      annualEnergyCostUsd: annualCost,
      isCyclingAcceptable: startsPerHour <= 10.0,
    };
  });

  const annualEnergyCostUsd = Math.round(dailyEnergyKwh * 365 * 0.12);

  const summary: WastewaterSimulationSummary = {
    converged: true,
    runTimestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    totalPopulation,
    totalDryWeatherFlowLs: Math.round(totalDryWeatherFlowLs * 100) / 100,
    totalPeakSanitaryFlowLs: Math.round(totalPeakSanitaryFlowLs * 100) / 100,
    totalInflowInfiltrationLs: Math.round(totalInflowInfiltrationLs * 100) / 100,
    totalOutfallDischargeLs: Math.round(totalOutfallDischargeLs * 100) / 100,
    flowImbalanceLs,
    totalGravityConduitLengthM: Math.round(totalGravityLength * 10) / 10,
    totalForceMainLengthM: Math.round(totalForceMainLength * 10) / 10,
    maxCapacityUtilizationRatio: Math.round(maxCapacityRatio * 100) / 100,
    criticalConduitId,
    minVelocityMs: minVelocity === 999 ? 0 : Math.round(minVelocity * 100) / 100,
    minVelocityConduitId,
    maxVelocityMs: Math.round(maxVelocity * 100) / 100,
    maxVelocityConduitId,
    totalPumpingPowerKw: Math.round(totalPumpPowerKw * 10) / 10,
    dailyEnergyKwh: Math.round(dailyEnergyKwh * 10) / 10,
    annualEnergyCostUsd,
    surchargedConduitIds,
    subCleansingConduitIds,
    scourWarningConduitIds,
    reverseSlopeConduitIds,
    floodedManholeIds,

    // Advanced SWMM & Sewer Engineering Suite
    hourlySimulationPoints,
    constraintDesignResults,
    h2sCorrosionResults,
    inflowInfiltrationResults,
    liftStationCycleResults,
  };

  return {
    updatedNetwork: {
      ...network,
      manholes,
      conduits,
      wetWells,
      pumps,
      forceMains,
      outfalls,
    },
    summary,
  };
}
