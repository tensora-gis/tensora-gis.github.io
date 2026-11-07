/**
 * 2D River Hydraulic Structures Physics Module
 *
 * Implements rigorous fluid dynamics formulations for:
 * 1. Levees & Dykes (Lateral flow barrier & overtopping weir flow)
 * 2. Weirs (Broad-crested & sharp-crested with Villemonte submergence correction)
 * 3. Bridges & Piers (Yarnell / drag headloss & pressure orifice deck flow)
 * 4. Culverts (FHWA HDS-5 inlet/outlet control flow)
 * 5. Sluice & Radial Gates (Free and submerged orifice discharge)
 * 6. Road Embankments (Submerged roadway overflow)
 */

import {
  RiverStructure,
  RiverLeveeStructure,
  RiverWeirStructure,
  RiverBridgeStructure,
  RiverCulvertStructure,
  RiverGateStructure,
  RiverEmbankmentStructure,
  RiverMeshCell,
} from '../types/riverAnalysis';

const G = 9.80665; // Acceleration due to gravity (m/s^2)

export interface StructureFluxCorrection {
  faceIndex?: number;
  blocked: boolean;
  effectiveCrestElevationM?: number;
  overrideDischargeM3s?: number;
  addedHeadlossM?: number;
  description: string;
}

/**
 * Evaluates the hydraulic influence of a structure on flow across two adjacent cells.
 *
 * @param struct Hydraulic structure
 * @param cellA Upstream/first cell
 * @param cellB Downstream/second cell
 * @param hA Water depth in cell A (m)
 * @param hB Water depth in cell B (m)
 * @param faceLength Length of boundary face between cells (m)
 */
export function evaluateStructureInteraction(
  struct: RiverStructure,
  cellA: RiverMeshCell,
  cellB: RiverMeshCell,
  hA: number,
  hB: number,
  faceLength: number
): StructureFluxCorrection {
  if (!struct.enabled) {
    return { blocked: false, description: 'Disabled' };
  }

  const etaA = cellA.bedElevation + hA; // Water stage in cell A
  const etaB = cellB.bedElevation + hB; // Water stage in cell B

  switch (struct.type) {
    case 'levee': {
      return evaluateLevee(struct, etaA, etaB, faceLength);
    }
    case 'weir': {
      return evaluateWeir(struct, etaA, etaB, faceLength);
    }
    case 'bridge': {
      return evaluateBridge(struct, cellA, cellB, hA, hB, faceLength);
    }
    case 'culvert': {
      return evaluateCulvert(struct, etaA, etaB);
    }
    case 'gate': {
      return evaluateGate(struct, etaA, etaB);
    }
    case 'embankment': {
      return evaluateEmbankment(struct, etaA, etaB, faceLength);
    }
    default:
      return { blocked: false, description: 'Standard' };
  }
}

/**
 * Levee / Flood Wall Barrier Evaluation
 */
function evaluateLevee(
  levee: RiverLeveeStructure,
  etaA: number,
  etaB: number,
  faceLength: number
): StructureFluxCorrection {
  const maxEta = Math.max(etaA, etaB);

  // If water level is below levee crest, 100% barrier block
  if (maxEta <= levee.crestElevationM) {
    return {
      blocked: true,
      effectiveCrestElevationM: levee.crestElevationM,
      overrideDischargeM3s: 0,
      description: `Levee crest ${levee.crestElevationM.toFixed(2)}m holds back floodwater (dry overbank)`,
    };
  }

  // Levee overtopped: compute broad-crested weir overflow discharge
  const headwater = Math.max(etaA, etaB);
  const tailwater = Math.min(etaA, etaB);
  const headAboveCrest = headwater - levee.crestElevationM;

  // Villemonte submergence factor
  let submergenceCoeff = 1.0;
  if (tailwater > levee.crestElevationM) {
    const tailHead = tailwater - levee.crestElevationM;
    const submRatio = tailHead / headAboveCrest;
    if (submRatio > 0 && submRatio < 1) {
      submergenceCoeff = Math.pow(1 - Math.pow(submRatio, 1.5), 0.385);
    } else if (submRatio >= 1) {
      submergenceCoeff = 0.05;
    }
  }

  // Q = C_d * L * H^(3/2)
  const cd = 1.6; // Metric broad-crested discharge coefficient
  const length = Math.max(1, faceLength);
  const qOvertopping = submergenceCoeff * cd * length * Math.pow(Math.max(0, headAboveCrest), 1.5);
  const direction = etaA >= etaB ? 1 : -1;

  return {
    blocked: false,
    effectiveCrestElevationM: levee.crestElevationM,
    overrideDischargeM3s: direction * qOvertopping,
    description: `Levee overtopped by ${headAboveCrest.toFixed(2)}m (Overflow Q = ${qOvertopping.toFixed(1)} m³/s)`,
  };
}

/**
 * Weir (Broad or Sharp-Crested) Evaluation
 */
function evaluateWeir(
  weir: RiverWeirStructure,
  etaA: number,
  etaB: number,
  faceLength: number
): StructureFluxCorrection {
  const headwater = Math.max(etaA, etaB);
  const tailwater = Math.min(etaA, etaB);

  if (headwater <= weir.crestElevationM) {
    return {
      blocked: true,
      effectiveCrestElevationM: weir.crestElevationM,
      overrideDischargeM3s: 0,
      description: `Weir crest ${weir.crestElevationM.toFixed(2)}m not reached`,
    };
  }

  const H1 = headwater - weir.crestElevationM;
  const H2 = tailwater > weir.crestElevationM ? tailwater - weir.crestElevationM : 0;
  const submRatio = H1 > 0 ? H2 / H1 : 0;

  let Cs = 1.0;
  if (submRatio > 0.67) {
    // Submergence begins reducing free discharge
    Cs = Math.max(0.1, Math.pow(1 - Math.pow(submRatio, 1.5), 0.385));
  }

  const cd = weir.dischargeCoefficient || (weir.weirType === 'sharp-crested' ? 1.84 : 1.70);
  const L = weir.crestLengthM > 0 ? weir.crestLengthM : Math.max(1, faceLength);
  const qWeir = Cs * cd * L * Math.pow(H1, 1.5);
  const direction = etaA >= etaB ? 1 : -1;

  return {
    blocked: false,
    effectiveCrestElevationM: weir.crestElevationM,
    overrideDischargeM3s: direction * qWeir,
    description: `${weir.weirType} weir: H1 = ${H1.toFixed(2)}m, Q = ${qWeir.toFixed(1)} m³/s (Submergence: ${(submRatio * 100).toFixed(0)}%)`,
  };
}

/**
 * Bridge & Pier Resistance Evaluation
 */
function evaluateBridge(
  bridge: RiverBridgeStructure,
  cellA: RiverMeshCell,
  cellB: RiverMeshCell,
  hA: number,
  hB: number,
  faceLength: number
): StructureFluxCorrection {
  const etaA = cellA.bedElevation + hA;
  const etaB = cellB.bedElevation + hB;
  const maxEta = Math.max(etaA, etaB);

  // Case 1: Overtopping above bridge deck (Weir flow over deck)
  if (maxEta > bridge.deckElevationM) {
    const headOverDeck = maxEta - bridge.deckElevationM;
    const qOverDeck = 1.6 * faceLength * Math.pow(headOverDeck, 1.5);
    return {
      blocked: false,
      addedHeadlossM: 0.3,
      overrideDischargeM3s: (etaA >= etaB ? 1 : -1) * qOverDeck,
      description: `Bridge deck submerged by ${headOverDeck.toFixed(2)}m (Roadway overflow)`,
    };
  }

  // Case 2: Pressure orifice flow under deck (Low-chord submerged)
  if (maxEta > bridge.lowChordElevationM) {
    const openingH = bridge.lowChordElevationM - Math.min(cellA.bedElevation, cellB.bedElevation);
    const openingArea = Math.max(1, openingH * (faceLength - bridge.pierCount * bridge.pierWidthM));
    const deltaH = Math.max(0.01, Math.abs(etaA - etaB));
    const cd = 0.8;
    const qPressure = cd * openingArea * Math.sqrt(2 * G * deltaH);
    return {
      blocked: false,
      addedHeadlossM: 0.25,
      overrideDischargeM3s: (etaA >= etaB ? 1 : -1) * qPressure,
      description: `Pressure flow beneath bridge low-chord (${bridge.lowChordElevationM.toFixed(2)}m)`,
    };
  }

  // Case 3: Free surface flow with pier drag / contraction loss
  // Yarnell pier energy headloss
  const pierContractionRatio = Math.min(0.4, (bridge.pierCount * bridge.pierWidthM) / Math.max(1, faceLength));
  const vApprox = Math.sqrt(2 * G * Math.max(0.001, Math.abs(etaA - etaB)));
  const yarnellLoss = bridge.pierDragCoeff * pierContractionRatio * (Math.pow(vApprox, 2) / (2 * G));

  return {
    blocked: false,
    addedHeadlossM: Math.max(0.02, yarnellLoss),
    description: `Bridge piers (${bridge.pierCount} x ${bridge.pierWidthM}m, Contraction: ${(pierContractionRatio * 100).toFixed(1)}%)`,
  };
}

/**
 * Culvert Barrel Flow (Inlet / Outlet Control)
 */
function evaluateCulvert(
  culvert: RiverCulvertStructure,
  etaUp: number,
  etaDn: number
): StructureFluxCorrection {
  const hw = etaUp - culvert.inletInvertM; // Headwater above inlet invert

  if (hw <= 0.05) {
    return {
      blocked: true,
      overrideDischargeM3s: 0,
      description: 'Culvert dry: Headwater below inlet invert',
    };
  }

  const D = culvert.diameterOrSpanM;
  const A_barrel = (Math.PI * D * D) / 4;
  const totalArea = culvert.barrelCount * A_barrel;

  // FHWA HDS-5 Inlet Control: Submerged vs Unsubmerged
  let qInlet = 0;
  if (hw / D < 1.2) {
    // Unsubmerged weir-like entrance
    qInlet = totalArea * Math.sqrt(G * D) * 0.5 * Math.pow(hw / D, 1.5);
  } else {
    // Submerged orifice entrance
    qInlet = totalArea * 0.62 * Math.sqrt(2 * G * (hw - 0.5 * D));
  }

  // Outlet Control: Full pipe friction
  const n = culvert.manningN || 0.013;
  const L = Math.max(5, culvert.lengthM);
  const R = D / 4;
  const kEntrance = culvert.inletLossCoeff || 0.5;
  const kFriction = (2 * G * Math.pow(n, 2) * L) / Math.pow(R, 4 / 3);
  const deltaH = Math.max(0.01, etaUp - Math.max(etaDn, culvert.outletInvertM + 0.5 * D));
  const qOutlet = totalArea * Math.sqrt((2 * G * deltaH) / (1 + kEntrance + kFriction));

  // The governing flow is the minimum of inlet and outlet control
  const qGoverning = Math.max(0.01, Math.min(qInlet, qOutlet));
  const isSubmerged = hw / D >= 1.2;

  return {
    blocked: false,
    overrideDischargeM3s: qGoverning,
    description: `${culvert.barrelCount}x Ø${(D * 1000).toFixed(0)}mm Culvert: Q = ${qGoverning.toFixed(1)} m³/s (${isSubmerged ? 'Submerged' : 'Free Inlet'})`,
  };
}

/**
 * Sluice & Radial Gate Orifice Flow
 */
function evaluateGate(
  gate: RiverGateStructure,
  etaUp: number,
  etaDn: number
): StructureFluxCorrection {
  const yUp = etaUp - gate.crestElevationM;
  const yDn = etaDn - gate.crestElevationM;

  if (yUp <= 0.05 || gate.openingM <= 0.01) {
    return {
      blocked: true,
      overrideDischargeM3s: 0,
      description: `Gate closed or dry (Opening: ${(gate.openingM * 100).toFixed(0)} cm)`,
    };
  }

  const b = gate.gateWidthM;
  const a = gate.openingM;
  const cd = gate.dischargeCoefficient || 0.60;

  // If headwater is below top of opening, free weir flow
  if (yUp <= a) {
    const qFreeWeir = 1.7 * b * Math.pow(yUp, 1.5);
    return {
      blocked: false,
      overrideDischargeM3s: qFreeWeir,
      description: `Gate free overflow: Q = ${qFreeWeir.toFixed(1)} m³/s`,
    };
  }

  // Underflow orifice flow
  let qGate = 0;
  if (yDn <= a) {
    // Free underflow orifice
    qGate = cd * b * a * Math.sqrt(2 * G * yUp);
  } else {
    // Submerged underflow orifice
    const deltaY = Math.max(0.01, yUp - yDn);
    qGate = cd * b * a * Math.sqrt(2 * G * deltaY);
  }

  return {
    blocked: false,
    overrideDischargeM3s: qGate,
    description: `${gate.gateType} gate (Open: ${a.toFixed(2)}m): Q = ${qGate.toFixed(1)} m³/s`,
  };
}

/**
 * Roadway Embankment Weir Overflow
 */
function evaluateEmbankment(
  embankment: RiverEmbankmentStructure,
  etaA: number,
  etaB: number,
  faceLength: number
): StructureFluxCorrection {
  const headwater = Math.max(etaA, etaB);

  if (headwater <= embankment.crestElevationM) {
    return {
      blocked: true,
      effectiveCrestElevationM: embankment.crestElevationM,
      overrideDischargeM3s: 0,
      description: `Embankment crest ${embankment.crestElevationM.toFixed(2)}m intact`,
    };
  }

  const hOver = headwater - embankment.crestElevationM;
  const cd = embankment.overtopDischargeCoeff || 1.45;
  const qOver = cd * Math.max(1, faceLength) * Math.pow(hOver, 1.5);

  return {
    blocked: false,
    effectiveCrestElevationM: embankment.crestElevationM,
    overrideDischargeM3s: (etaA >= etaB ? 1 : -1) * qOver,
    description: `Embankment overtopping: depth ${hOver.toFixed(2)}m, Q = ${qOver.toFixed(1)} m³/s`,
  };
}
