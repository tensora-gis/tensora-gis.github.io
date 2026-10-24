/**
 * Wastewater Terrain & Real Earth DEM Elevation Service
 *
 * Connects manholes, wet wells, conduits, and outfalls to the real global
 * Copernicus GLO-30 / SRTM DEM dataset via Open-Meteo API.
 */

import { fetchRealEarthElevations, sampleGroundElevation } from './waterTerrainService';
import { haversineDistanceM } from './geoUtils';
import { WastewaterNetwork } from '../types/wastewater';

export interface WastewaterTerrainProfilePoint {
  lat: number;
  lng: number;
  distanceFromStartM: number;
  groundElevationM: number;
}

/**
 * Samples real ground elevation for a coordinate point and returns height above MSL.
 */
export async function sampleWastewaterGroundElevation(
  lat: number,
  lng: number
): Promise<number | null> {
  return await sampleGroundElevation(lat, lng);
}

/**
 * Samples real ground elevations in batch for all wastewater nodes (manholes, wet wells, outfalls).
 * Updates rim elevations from the DEM, and preserves user depth to update inverts.
 */
export async function sampleAllWastewaterElevations(
  network: WastewaterNetwork
): Promise<{
  updatedNetwork: WastewaterNetwork;
  sampledCount: number;
  provider: string;
}> {
  const nodesToSample: { id: string; lat: number; lng: number; type: 'manhole' | 'wet-well' | 'outfall' }[] = [
    ...network.manholes.map((m) => ({ id: m.id, lat: m.lat, lng: m.lng, type: 'manhole' as const })),
    ...network.wetWells.map((w) => ({ id: w.id, lat: w.lat, lng: w.lng, type: 'wet-well' as const })),
    ...network.outfalls.map((o) => ({ id: o.id, lat: o.lat, lng: o.lng, type: 'outfall' as const })),
  ];

  if (nodesToSample.length === 0) {
    return { updatedNetwork: network, sampledCount: 0, provider: 'none' };
  }

  const queryPoints = nodesToSample.map((n) => ({ lat: n.lat, lng: n.lng }));
  const result = await fetchRealEarthElevations(queryPoints);

  const elevationById = new Map<string, number>();
  nodesToSample.forEach((node, idx) => {
    const elev = result.elevations[idx];
    if (elev !== null && isFinite(elev)) {
      elevationById.set(node.id, Math.round(elev * 10) / 10);
    }
  });

  const updatedManholes = network.manholes.map((m) => {
    const elev = elevationById.get(m.id);
    if (elev !== undefined) {
      const depth = Math.max(1.2, m.depth || m.rimElevation - m.invertElevation || 2.0);
      const invert = Math.round((elev - depth) * 10) / 10;
      return {
        ...m,
        rimElevation: elev,
        depth: Math.round(depth * 10) / 10,
        invertElevation: invert,
      };
    }
    return m;
  });

  const updatedWetWells = network.wetWells.map((w) => {
    const elev = elevationById.get(w.id);
    if (elev !== undefined) {
      const floorDrop = Math.max(2.5, w.rimElevation - w.floorElevation || 4.0);
      const floor = Math.round((elev - floorDrop) * 10) / 10;
      return {
        ...w,
        rimElevation: elev,
        floorElevation: floor,
        minWaterLevelM: Math.round((floor + 0.8) * 10) / 10,
        maxWaterLevelM: Math.round((floor + 2.5) * 10) / 10,
        alarmLevelM: Math.round((floor + 3.2) * 10) / 10,
      };
    }
    return w;
  });

  const updatedOutfalls = network.outfalls.map((o) => {
    const elev = elevationById.get(o.id);
    if (elev !== undefined) {
      const invert = Math.round((elev - 1.0) * 10) / 10;
      return {
        ...o,
        invertElevation: invert,
        receivingWaterElevation: Math.round((invert + 0.5) * 10) / 10,
      };
    }
    return o;
  });

  // Also update conduit inverts and slopes according to connected manholes
  const nodeElevMap = new Map<string, number>();
  updatedManholes.forEach((m) => nodeElevMap.set(m.id, m.invertElevation));
  updatedWetWells.forEach((w) => nodeElevMap.set(w.id, w.floorElevation));
  updatedOutfalls.forEach((o) => nodeElevMap.set(o.id, o.invertElevation));

  const updatedConduits = network.conduits.map((c) => {
    const upInv = nodeElevMap.get(c.startNodeId) ?? c.upstreamInvertM;
    const dnInv = nodeElevMap.get(c.endNodeId) ?? c.downstreamInvertM;
    const length = Math.max(1, c.lengthM);
    const slope = Math.round(((upInv - dnInv) / length) * 10000) / 10000;
    return {
      ...c,
      upstreamInvertM: upInv,
      downstreamInvertM: dnInv,
      slopeMPerM: slope,
    };
  });

  return {
    updatedNetwork: {
      ...network,
      manholes: updatedManholes,
      wetWells: updatedWetWells,
      outfalls: updatedOutfalls,
      conduits: updatedConduits,
    },
    sampledCount: elevationById.size,
    provider: result.provider,
  };
}

/**
 * Calculates geodesic surface distance between two points in meters.
 */
export function calculateWastewaterDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  return Math.round(haversineDistanceM(lat1, lng1, lat2, lng2) * 10) / 10;
}
