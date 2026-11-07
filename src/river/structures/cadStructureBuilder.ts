/**
 * CAD Hydraulic Structure Builder from Interactive Map Points & Polylines
 *
 * Maps user-drawn spatial transects and freehand CAD polylines directly to
 * 2D curvilinear CFD mesh cells. Supports all civil river structures:
 * - Levees & Floodwalls
 * - Weirs
 * - Bridges
 * - Culverts
 * - Sluice & Radial Gates
 * - Road Embankments
 * - Spur Dikes / Groynes (bank-anchored flow deflectors)
 * - Standalone Bridge Piers (circular, round-nose, sharp-nose, square)
 * - Custom Flow Training Deflectors & Guide Banks
 */

import { RiverGridMesh, RiverCoordinate, RiverGridCell } from '../types/riverReach';
import {
  RiverHydraulicStructure,
  RiverStructureType,
  RiverLeveeStructure,
  RiverWeirStructure,
  RiverBridgeStructure,
  RiverCulvertStructure,
  RiverGateStructure,
  RiverEmbankmentStructure,
  RiverSpurdikeStructure,
  RiverBridgePierStructure,
  RiverCustomDeflectorStructure,
} from './structureTypes';

/**
 * Finds cells closest to or intersected by an arbitrary polyline / point set
 */
export function findCellsIntersectingPolyline(
  points: RiverCoordinate[],
  mesh: RiverGridMesh
): { cellIndices: number[]; stationM: number; avgBedElevM: number } {
  if (points.length === 0) {
    return { cellIndices: [], stationM: 0, avgBedElevM: 100.0 };
  }

  const affected = new Set<number>();
  let bedElevSum = 0;
  let stationSum = 0;

  // For each segment in the polyline (or single point)
  const segments = points.length === 1 ? [[points[0], points[0]]] : [];
  for (let p = 0; p < points.length - 1; p++) {
    segments.push([points[p], points[p + 1]]);
  }

  for (const [pA, pB] of segments) {
    // Sample 5 interpolation points along the segment
    const numSub = points.length === 1 ? 1 : 5;
    for (let s = 0; s <= numSub; s++) {
      const t = numSub === 1 ? 0 : s / numSub;
      const subLat = pA.lat + t * (pB.lat - pA.lat);
      const subLng = pA.lng + t * (pB.lng - pA.lng);

      // Find closest mesh cell to this sub-point
      let closestIdx = -1;
      let minDistM = Infinity;

      for (let c = 0; c < mesh.cells.length; c++) {
        const cell = mesh.cells[c];
        const dy = (cell.centerLat - subLat) * 111320.0;
        const dx = (cell.centerLng - subLng) * 111320.0 * Math.cos((subLat * Math.PI) / 180.0);
        const d = Math.hypot(dx, dy);
        if (d < minDistM) {
          minDistM = d;
          closestIdx = c;
        }
      }

      if (closestIdx >= 0 && minDistM < Math.max(40.0, mesh.meanWidthM * 0.4)) {
        affected.add(closestIdx);
      }
    }
  }

  const cellIndices = Array.from(affected);
  for (const idx of cellIndices) {
    const cell = mesh.cells[idx];
    bedElevSum += cell.bedElevation;
    stationSum += (cell.i / Math.max(1, mesh.nx)) * mesh.reachLengthM;
  }

  const count = Math.max(1, cellIndices.length);
  return {
    cellIndices,
    stationM: stationSum / count,
    avgBedElevM: bedElevSum / count,
  };
}

/**
 * Find cells in the 2D grid that intersect or are spanned across the full channel transect
 */
export function findCellsIntersectingTransect(
  pt1: RiverCoordinate,
  pt2: RiverCoordinate,
  mesh: RiverGridMesh
): { cellIndices: number[]; stationM: number; avgBedElevM: number } {
  const midLat = 0.5 * (pt1.lat + pt2.lat);
  const midLng = 0.5 * (pt1.lng + pt2.lng);

  // 1. Find the closest cell to the midpoint to determine streamwise station i
  let closestCellIdx = 0;
  let minDist = Infinity;

  for (let c = 0; c < mesh.cells.length; c++) {
    const cell = mesh.cells[c];
    const dy = (cell.centerLat - midLat) * 111320.0;
    const dx = (cell.centerLng - midLng) * 111320.0 * Math.cos((midLat * Math.PI) / 180.0);
    const d = Math.hypot(dx, dy);
    if (d < minDist) {
      minDist = d;
      closestCellIdx = c;
    }
  }

  const centerCell = mesh.cells[closestCellIdx];
  const iStation = centerCell ? centerCell.i : Math.floor(mesh.nx / 2);
  const approxStationM = (iStation / Math.max(1, mesh.nx)) * mesh.reachLengthM;

  // 2. Collect all cells across the channel at this streamwise section
  const affectedIndices: number[] = [];
  let bedElevSum = 0;

  for (let j = 0; j < mesh.ny; j++) {
    const idx = iStation * mesh.ny + j;
    if (idx < mesh.cells.length) {
      affectedIndices.push(idx);
      bedElevSum += mesh.cells[idx].bedElevation;
    }
  }

  const avgBedElevM = affectedIndices.length > 0 ? bedElevSum / affectedIndices.length : 100.0;

  return {
    cellIndices: affectedIndices,
    stationM: approxStationM,
    avgBedElevM,
  };
}

/**
 * Universal CAD Structure Creator supporting arbitrary polylines & all 9 structure types
 */
export function createStructureFromMapPolyline(
  points: RiverCoordinate[],
  type: RiverStructureType,
  mesh: RiverGridMesh,
  options: any = {}
): RiverHydraulicStructure {
  // Use localized polyline intersection for spur dikes, piers, and deflectors; full transect for cross-river weirs/bridges/culverts if 2 pts
  const isFullCrossChannel =
    points.length === 2 && (type === 'weir' || type === 'bridge' || type === 'culvert');

  const { cellIndices, stationM, avgBedElevM } = isFullCrossChannel
    ? findCellsIntersectingTransect(points[0], points[1], mesh)
    : findCellsIntersectingPolyline(points, mesh);

  const fallbackIndices = cellIndices.length > 0 ? cellIndices : [Math.floor(mesh.cells.length / 2)];
  const id = `${type}-${Date.now()}`;

  switch (type) {
    case 'spurdike': {
      const spurdike: RiverSpurdikeStructure = {
        id,
        name: `CAD Spur Dike / Groyne (${options.bank || 'Left'} Bank, Station ${stationM.toFixed(0)}m)`,
        type: 'spurdike',
        enabled: true,
        coordinates: points,
        cellIndices: fallbackIndices,
        stationM,
        crestElevationM: options.crestElevationM ?? parseFloat((avgBedElevM + 2.8).toFixed(2)),
        lengthM: options.lengthM ?? 30.0,
        crestWidthM: options.crestWidthM ?? 3.5,
        permeability: options.permeability ?? 0.0,
        deflectionAngleDeg: options.deflectionAngleDeg ?? 90.0,
        bank: options.bank ?? 'left',
        headSlopeHtoV: 2.0,
        headScourDepthM: 1.85,
        cadProperties: { layerName: 'RIVER_TRAINING', color: '#10b981' },
      };
      return spurdike;
    }

    case 'bridge-pier': {
      const pier: RiverBridgePierStructure = {
        id,
        name: `CAD Bridge Pier (${options.shape || 'Round-Nose'}, Station ${stationM.toFixed(0)}m)`,
        type: 'bridge-pier',
        enabled: true,
        coordinates: points,
        cellIndices: fallbackIndices,
        stationM,
        shape: options.shape || 'round-nose',
        widthM: options.widthM ?? 1.8,
        lengthM: options.lengthM ?? 6.0,
        topElevationM: options.topElevationM ?? parseFloat((avgBedElevM + 7.5).toFixed(2)),
        dragCoefficientCd: options.dragCoefficientCd ?? 1.0,
        scourDepthM: 2.1,
        cadProperties: { layerName: 'BRIDGE_SUBSTRUCTURE', color: '#8b5cf6' },
      };
      return pier;
    }

    case 'custom-deflector': {
      const deflector: RiverCustomDeflectorStructure = {
        id,
        name: `CAD River Training Deflector (Station ${stationM.toFixed(0)}m)`,
        type: 'custom-deflector',
        enabled: true,
        coordinates: points,
        cellIndices: fallbackIndices,
        stationM,
        heightM: options.heightM ?? 3.5,
        wallThicknessM: options.wallThicknessM ?? 1.0,
        deflectionEfficiency: options.deflectionEfficiency ?? 0.85,
        dragCoeff: 1.2,
        cadProperties: { layerName: 'GUIDE_BANKS', color: '#06b6d4' },
      };
      return deflector;
    }

    case 'levee': {
      const levee: RiverLeveeStructure = {
        id,
        name: `CAD Flood Levee (Station ${stationM.toFixed(0)}m)`,
        type: 'levee',
        enabled: true,
        coordinates: points,
        cellIndices: fallbackIndices,
        stationM,
        crestElevationM: options.crestElevationM ?? parseFloat((avgBedElevM + 3.8).toFixed(2)),
        topWidthM: options.topWidthM ?? 4.5,
        sideSlopeHtoV: options.sideSlopeHtoV ?? 2.5,
        cadProperties: { layerName: 'CIVIL_DEFENSE', color: '#f59e0b' },
      };
      return levee;
    }

    case 'weir': {
      const weir: RiverWeirStructure = {
        id,
        name: `CAD Overflow Weir (Station ${stationM.toFixed(0)}m)`,
        type: 'weir',
        enabled: true,
        coordinates: points,
        cellIndices: fallbackIndices,
        stationM,
        weirType: options.weirType || 'broad-crested',
        crestElevationM: options.crestElevationM ?? parseFloat((avgBedElevM + 2.2).toFixed(2)),
        crestLengthM: mesh.meanWidthM,
        dischargeCoefficient: options.dischargeCoefficient ?? 1.70,
        cadProperties: { layerName: 'FLOW_REGULATION', color: '#06b6d4' },
      };
      return weir;
    }

    case 'bridge': {
      const bridge: RiverBridgeStructure = {
        id,
        name: `CAD Multi-Span Bridge (Station ${stationM.toFixed(0)}m)`,
        type: 'bridge',
        enabled: true,
        coordinates: points,
        cellIndices: fallbackIndices,
        stationM,
        deckElevationM: options.deckElevationM ?? parseFloat((avgBedElevM + 6.5).toFixed(2)),
        lowChordElevationM: options.lowChordElevationM ?? parseFloat((avgBedElevM + 4.8).toFixed(2)),
        pierCount: options.pierCount ?? 3,
        pierWidthM: options.pierWidthM ?? 1.6,
        pierDragCoeff: options.pierDragCoeff ?? 1.25,
        cadProperties: { layerName: 'TRANSPORT_INFRA', color: '#a855f7' },
      };
      return bridge;
    }

    case 'culvert': {
      const culvert: RiverCulvertStructure = {
        id,
        name: `CAD Box Culvert (Station ${stationM.toFixed(0)}m)`,
        type: 'culvert',
        enabled: true,
        coordinates: points,
        cellIndices: fallbackIndices,
        stationM,
        barrelCount: options.barrelCount ?? 2,
        diameterOrSpanM: options.diameterOrSpanM ?? 2.5,
        riseM: options.riseM ?? 2.5,
        lengthM: options.lengthM ?? 25.0,
        inletInvertM: avgBedElevM,
        outletInvertM: avgBedElevM - 0.2,
        manningN: 0.013,
        inletLossCoeff: 0.5,
        cadProperties: { layerName: 'DRAINAGE_INFRA', color: '#10b981' },
      };
      return culvert;
    }

    case 'gate': {
      const gate: RiverGateStructure = {
        id,
        name: `CAD Sluice / Radial Gate (Station ${stationM.toFixed(0)}m)`,
        type: 'gate',
        enabled: true,
        coordinates: points,
        cellIndices: fallbackIndices,
        stationM,
        gateType: options.gateType || 'sluice',
        gateWidthM: options.gateWidthM ?? Math.min(25.0, mesh.meanWidthM * 0.4),
        openingM: options.openingM ?? 1.5,
        crestElevationM: options.crestElevationM ?? parseFloat((avgBedElevM + 1.0).toFixed(2)),
        dischargeCoefficient: options.dischargeCoefficient ?? 0.60,
        cadProperties: { layerName: 'ACTIVE_CONTROL', color: '#3b82f6' },
      };
      return gate;
    }

    case 'embankment':
    default: {
      const emb: RiverEmbankmentStructure = {
        id,
        name: `CAD Transportation Road Embankment (Station ${stationM.toFixed(0)}m)`,
        type: 'embankment',
        enabled: true,
        coordinates: points,
        cellIndices: fallbackIndices,
        stationM,
        crestElevationM: options.crestElevationM ?? parseFloat((avgBedElevM + 3.2).toFixed(2)),
        topWidthM: options.topWidthM ?? 12.0,
        sideSlopeHtoV: 2.0,
        overtopDischargeCoeff: 1.45,
        cadProperties: { layerName: 'ROAD_NETWORK', color: '#ef4444' },
      };
      return emb;
    }
  }
}

/**
 * Backward compatibility helper for 2-point map placement
 */
export function createStructureFromMapPoints(
  pt1: RiverCoordinate,
  pt2: RiverCoordinate,
  type: RiverStructureType,
  mesh: RiverGridMesh
): RiverHydraulicStructure {
  return createStructureFromMapPolyline([pt1, pt2], type, mesh);
}
