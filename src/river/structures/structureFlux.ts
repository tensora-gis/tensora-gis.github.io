/**
 * Hydraulic Structures Flux Formulations & Physics Interactions
 *
 * Implements rigorous fluid dynamics formulations for:
 * 1. Levees & Dykes (Lateral flow barrier & broad-crested overtopping)
 * 2. Weirs (Broad-crested & sharp-crested with Villemonte submergence)
 * 3. Bridges & Piers (Yarnell contraction energy loss, low-chord pressure flow, deck overflow)
 * 4. Culverts (FHWA HDS-5 governing inlet/outlet control flow)
 * 5. Sluice & Radial Gates (Free and submerged underflow orifice discharge)
 * 6. Transportation Road Embankments (Submerged roadway overflow)
 */

import {
  RiverHydraulicStructure,
  RiverLeveeStructure,
  RiverWeirStructure,
  RiverBridgeStructure,
  RiverCulvertStructure,
  RiverGateStructure,
  RiverEmbankmentStructure,
  RiverStructureType,
} from './structureTypes';
import { RiverGridCell, RiverGridMesh, RiverCoordinate } from '../types/riverReach';

const G = 9.80665; // m/s^2

export interface StructureFluxCorrection {
  blocked: boolean;
  effectiveCrestElevationM?: number;
  overrideDischargeM3s?: number;
  addedHeadlossM?: number;
  description: string;
}

/**
 * Evaluates the hydraulic influence of a structure on flow across two adjacent cells.
 */
export function evaluateStructureInteraction(
  struct: RiverHydraulicStructure,
  cellA: RiverGridCell,
  cellB: RiverGridCell,
  hA: number,
  hB: number,
  faceLength: number
): StructureFluxCorrection {
  if (!struct.enabled) {
    return { blocked: false, description: 'Disabled' };
  }

  const etaA = cellA.bedElevation + hA;
  const etaB = cellB.bedElevation + hB;

  switch (struct.type) {
    case 'levee':
      return evaluateLevee(struct, etaA, etaB, faceLength);
    case 'weir':
      return evaluateWeir(struct, etaA, etaB, faceLength);
    case 'bridge':
      return evaluateBridge(struct, cellA, cellB, hA, hB, faceLength);
    case 'culvert':
      return evaluateCulvert(struct, etaA, etaB);
    case 'gate':
      return evaluateGate(struct, etaA, etaB);
    case 'embankment':
      return evaluateEmbankment(struct, etaA, etaB, faceLength);
    default:
      return { blocked: false, description: 'Standard' };
  }
}

/**
 * 1. Levee / Flood Wall Barrier Evaluation
 */
function evaluateLevee(
  levee: RiverLeveeStructure,
  etaA: number,
  etaB: number,
  faceLength: number
): StructureFluxCorrection {
  const maxEta = Math.max(etaA, etaB);

  // If water level is below levee crest: 100% barrier block
  if (maxEta <= levee.crestElevationM) {
    return {
      blocked: true,
      effectiveCrestElevationM: levee.crestElevationM,
      overrideDischargeM3s: 0,
      description: `Levee crest ${levee.crestElevationM.toFixed(2)}m holds back floodwater`,
    };
  }

  // Levee overtopped: compute broad-crested weir overflow discharge
  const headwater = Math.max(etaA, etaB);
  const tailwater = Math.min(etaA, etaB);
  const headAboveCrest = headwater - levee.crestElevationM;

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

  const cd = 1.60; // Broad-crested weir coefficient
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
 * 2. Weir (Broad or Sharp-Crested) Evaluation
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
 * 3. Bridge & Pier Resistance Evaluation
 */
function evaluateBridge(
  bridge: RiverBridgeStructure,
  cellA: RiverGridCell,
  cellB: RiverGridCell,
  hA: number,
  hB: number,
  faceLength: number
): StructureFluxCorrection {
  const etaA = cellA.bedElevation + hA;
  const etaB = cellB.bedElevation + hB;
  const maxEta = Math.max(etaA, etaB);

  // Case 1: Overtopping above bridge deck
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

  // Case 3: Free surface flow with pier drag / contraction loss (Yarnell formulation)
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
 * 4. Culvert Barrel Flow (FHWA HDS-5 Inlet / Outlet Control)
 */
function evaluateCulvert(
  culvert: RiverCulvertStructure,
  etaUp: number,
  etaDn: number
): StructureFluxCorrection {
  const hw = etaUp - culvert.inletInvertM;

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

  // FHWA HDS-5 Inlet Control
  let qInlet = 0;
  if (hw / D < 1.2) {
    qInlet = totalArea * Math.sqrt(G * D) * 0.5 * Math.pow(hw / D, 1.5);
  } else {
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

  const qGoverning = Math.max(0.01, Math.min(qInlet, qOutlet));
  const isSubmerged = hw / D >= 1.2;

  return {
    blocked: false,
    overrideDischargeM3s: qGoverning,
    description: `${culvert.barrelCount}x Ø${(D * 1000).toFixed(0)}mm Culvert: Q = ${qGoverning.toFixed(1)} m³/s (${isSubmerged ? 'Submerged' : 'Free Inlet'})`,
  };
}

/**
 * 5. Sluice & Radial Gate Orifice Flow
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

  if (yUp <= a) {
    const qFreeWeir = 1.7 * b * Math.pow(yUp, 1.5);
    return {
      blocked: false,
      overrideDischargeM3s: qFreeWeir,
      description: `Gate free overflow: Q = ${qFreeWeir.toFixed(1)} m³/s`,
    };
  }

  let qGate = 0;
  if (yDn <= a) {
    qGate = cd * b * a * Math.sqrt(2 * G * yUp);
  } else {
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
 * 6. Roadway Embankment Weir Overflow
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

/**
 * Spatial query: finds all grid cells intersected by or adjacent to a CAD alignment polyline.
 */
export function findMeshCellsAlongPolyline(
  mesh: RiverGridMesh,
  coords: RiverCoordinate[]
): number[] {
  if (coords.length === 0) return [];
  const matched = new Set<number>();

  for (const cell of mesh.cells) {
    const thresholdDeg = (Math.sqrt(cell.areaM2) / 111320) * 1.5;

    for (let k = 0; k < coords.length - 1; k++) {
      const p1 = coords[k];
      const p2 = coords[k + 1];
      const d = distToSegment(cell.centerLat, cell.centerLng, p1.lat, p1.lng, p2.lat, p2.lng);
      if (d <= thresholdDeg) {
        matched.add(cell.id);
        break;
      }
    }

    if (coords.length === 1) {
      const d = Math.hypot(cell.centerLat - coords[0].lat, cell.centerLng - coords[0].lng);
      if (d <= thresholdDeg) {
        matched.add(cell.id);
      }
    }
  }

  return Array.from(matched).sort((a, b) => a - b);
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

/**
 * Factory for creating custom CAD-built hydraulic structures.
 */
export function createCustomCadStructure(
  name: string,
  type: RiverStructureType,
  coordinates: RiverCoordinate[],
  mesh: RiverGridMesh,
  options: {
    crestElevationM?: number;
    topWidthM?: number;
    sideSlopeHtoV?: number;
    invertElevationM?: number;
    layerName?: string;
    color?: string;
    weirType?: 'broad-crested' | 'sharp-crested';
    dischargeCoeff?: number;
    pierCount?: number;
    pierWidthM?: number;
    barrelCount?: number;
    diameterOrSpanM?: number;
    gateWidthM?: number;
    openingM?: number;
  } = {}
): RiverHydraulicStructure {
  const id = `cad-${type}-${Date.now().toString().slice(-5)}`;
  const cellIndices = findMeshCellsAlongPolyline(mesh, coordinates);

  let refBedElev = 100.0;
  if (cellIndices.length > 0) {
    let sumBed = 0;
    for (const cId of cellIndices) {
      const c = mesh.cells[cId];
      if (c) sumBed += c.bedElevation;
    }
    refBedElev = sumBed / cellIndices.length;
  }

  const baseProps = {
    id,
    name: name || `Custom CAD ${type.toUpperCase()} ${id}`,
    enabled: true,
    coordinates,
    cellIndices,
    cadProperties: {
      layerName: options.layerName || `CAD_${type.toUpperCase()}`,
      color: options.color || (type === 'levee' ? '#a855f7' : type === 'bridge' ? '#f97316' : type === 'weir' ? '#06b6d4' : type === 'culvert' ? '#10b981' : '#ec4899'),
      hatchStyle: 'solid' as const,
    },
  };

  switch (type) {
    case 'levee':
      return {
        ...baseProps,
        type: 'levee',
        crestElevationM: options.crestElevationM ?? Math.round((refBedElev + 3.0) * 10) / 10,
        topWidthM: options.topWidthM ?? 3.0,
        sideSlopeHtoV: options.sideSlopeHtoV ?? 2.0,
      } as RiverLeveeStructure;

    case 'weir':
      return {
        ...baseProps,
        type: 'weir',
        crestElevationM: options.crestElevationM ?? Math.round((refBedElev + 1.5) * 10) / 10,
        crestLengthM: options.topWidthM ?? Math.max(10, mesh.meanWidthM),
        weirType: options.weirType || 'broad-crested',
        dischargeCoefficient: options.dischargeCoeff || 1.70,
      } as RiverWeirStructure;

    case 'bridge':
      return {
        ...baseProps,
        type: 'bridge',
        deckElevationM: options.crestElevationM ?? Math.round((refBedElev + 5.0) * 10) / 10,
        lowChordElevationM: (options.crestElevationM ?? Math.round((refBedElev + 5.0) * 10) / 10) - 1.2,
        pierCount: options.pierCount ?? 2,
        pierWidthM: options.pierWidthM ?? 1.2,
        pierDragCoeff: options.dischargeCoeff ?? 1.25,
      } as RiverBridgeStructure;

    case 'culvert': {
      const inv = options.invertElevationM ?? refBedElev;
      return {
        ...baseProps,
        type: 'culvert',
        barrelCount: options.barrelCount ?? 2,
        diameterOrSpanM: options.diameterOrSpanM ?? 2.0,
        riseM: options.diameterOrSpanM ?? 2.0,
        lengthM: 25.0,
        inletInvertM: inv,
        outletInvertM: inv - 0.2,
        manningN: 0.013,
        inletLossCoeff: 0.5,
      } as RiverCulvertStructure;
    }

    case 'gate':
      return {
        ...baseProps,
        type: 'gate',
        gateType: 'sluice',
        gateWidthM: options.gateWidthM ?? 6.0,
        openingM: options.openingM ?? 0.8,
        crestElevationM: options.crestElevationM ?? refBedElev,
        dischargeCoefficient: options.dischargeCoeff ?? 0.62,
      } as RiverGateStructure;

    case 'embankment':
      return {
        ...baseProps,
        type: 'embankment',
        crestElevationM: options.crestElevationM ?? Math.round((refBedElev + 3.5) * 10) / 10,
        topWidthM: options.topWidthM ?? 8.0,
        sideSlopeHtoV: options.sideSlopeHtoV ?? 2.0,
        overtopDischargeCoeff: options.dischargeCoeff ?? 1.45,
      } as RiverEmbankmentStructure;
  }
}

/**
 * Computes direct flux reduction factor for a structure between adjacent cell states
 */
export function computeStructureFluxModifier(
  struct: RiverHydraulicStructure,
  hL: number,
  zL: number,
  hR: number,
  zR: number,
  faceLength: number
): { fluxReductionFactor: number } {
  if (!struct || !struct.enabled) return { fluxReductionFactor: 1.0 };
  const etaL = zL + hL;
  const etaR = zR + hR;
  const etaMax = Math.max(etaL, etaR);

  let crestElev: number | undefined;
  if ('crestElevationM' in struct) {
    crestElev = struct.crestElevationM;
  } else if ('deckElevationM' in struct) {
    crestElev = struct.deckElevationM;
  }

  if (crestElev !== undefined) {
    if (etaMax < crestElev) {
      return { fluxReductionFactor: 0.0 };
    } else {
      const head = etaMax - crestElev;
      const factor = Math.min(1.0, Math.max(0.05, head / Math.max(0.5, hL)));
      return { fluxReductionFactor: factor };
    }
  }

  return { fluxReductionFactor: 1.0 };
}
