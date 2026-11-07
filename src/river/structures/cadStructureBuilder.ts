/**
 * CAD Hydraulic Structure Builder from Interactive Map Points
 *
 * Maps user-drawn spatial transects directly to 2D curvilinear CFD mesh cells
 * and computes hydraulic crest elevations, channel stationing, and flux modifiers.
 */

import { RiverGridMesh, RiverCoordinate } from '../types/riverReach';
import {
  RiverHydraulicStructure,
  RiverStructureType,
  RiverLeveeStructure,
  RiverWeirStructure,
  RiverBridgeStructure,
  RiverCulvertStructure,
  RiverGateStructure,
  RiverEmbankmentStructure,
} from './structureTypes';

/**
 * Find cells in the 2D grid that intersect or are spanned by the transect between pt1 and pt2
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
 * Create a fully configured RiverHydraulicStructure from 2 map points
 */
export function createStructureFromMapPoints(
  pt1: RiverCoordinate,
  pt2: RiverCoordinate,
  type: RiverStructureType,
  mesh: RiverGridMesh
): RiverHydraulicStructure {
  const { cellIndices, stationM, avgBedElevM } = findCellsIntersectingTransect(pt1, pt2, mesh);
  const coords = [pt1, pt2];
  const id = `${type}-${Date.now()}`;

  switch (type) {
    case 'levee': {
      const levee: RiverLeveeStructure = {
        id,
        name: `CAD Flood Levee (Station ${stationM.toFixed(0)}m)`,
        type: 'levee',
        enabled: true,
        coordinates: coords,
        cellIndices,
        stationM,
        crestElevationM: parseFloat((avgBedElevM + 3.8).toFixed(2)),
        topWidthM: 4.5,
        sideSlopeHtoV: 2.5,
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
        coordinates: coords,
        cellIndices,
        stationM,
        weirType: 'broad-crested',
        crestElevationM: parseFloat((avgBedElevM + 2.2).toFixed(2)),
        crestLengthM: mesh.meanWidthM,
        dischargeCoefficient: 1.70,
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
        coordinates: coords,
        cellIndices,
        stationM,
        deckElevationM: parseFloat((avgBedElevM + 6.5).toFixed(2)),
        lowChordElevationM: parseFloat((avgBedElevM + 4.8).toFixed(2)),
        pierCount: 3,
        pierWidthM: 1.6,
        pierDragCoeff: 1.25,
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
        coordinates: coords,
        cellIndices,
        stationM,
        barrelCount: 2,
        diameterOrSpanM: 2.5,
        riseM: 2.5,
        lengthM: 25.0,
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
        coordinates: coords,
        cellIndices,
        stationM,
        gateType: 'sluice',
        gateWidthM: Math.min(25.0, mesh.meanWidthM * 0.4),
        openingM: 1.5,
        crestElevationM: parseFloat((avgBedElevM + 1.0).toFixed(2)),
        dischargeCoefficient: 0.60,
        cadProperties: { layerName: 'ACTIVE_CONTROL', color: '#3b82f6' },
      };
      return gate;
    }

    case 'embankment':
    default: {
      const emb: RiverEmbankmentStructure = {
        id,
        name: `CAD River Embankment (Station ${stationM.toFixed(0)}m)`,
        type: 'embankment',
        enabled: true,
        coordinates: coords,
        cellIndices,
        stationM,
        crestElevationM: parseFloat((avgBedElevM + 3.2).toFixed(2)),
        topWidthM: 6.0,
        sideSlopeHtoV: 2.0,
        overtopDischargeCoeff: 1.45,
        cadProperties: { layerName: 'RIVER_TRAINING', color: '#ef4444' },
      };
      return emb;
    }
  }
}
