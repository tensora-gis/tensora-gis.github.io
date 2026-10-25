/**
 * Water Distribution Terrain & DEM Elevation Service
 *
 * Ground-truthed elevation engine connecting water distribution network nodes,
 * pipes, and longitudinal profiles with real global Digital Elevation Models
 * (Copernicus GLO-30 / SRTM via Open-Meteo API, with fallback to AWS Terrain Tiles).
 */

import { fetchBulkElevations } from './elevationService';
import { haversineDistanceM } from './geoUtils';
import { WaterDistributionNetwork } from '../types/waterDistribution';

export interface TerrainPoint {
  lat: number;
  lng: number;
  elevation: number;
  distanceFromStartM: number;
}

/**
 * Queries real Earth DEM (Copernicus GLO-30 / SRTM 30m) via multi-provider elevation service.
 */
export async function fetchRealEarthElevations(
  points: { lat: number; lng: number }[]
): Promise<{ elevations: (number | null)[]; provider: string }> {
  if (points.length === 0) {
    return { elevations: [], provider: 'none' };
  }

  const result = await fetchBulkElevations(points);
  const provider =
    result.providers.length > 0
      ? `Copernicus GLO-30 / SRTM (${result.providers.join(', ')})`
      : 'Copernicus GLO-30 / SRTM';

  return {
    elevations: result.elevations.map((e) => (e !== null ? Math.round(e * 10) / 10 : null)),
    provider,
  };
}

/**
 * Samples real ground elevation for a single coordinate point using Open-Meteo DEM.
 */
export async function sampleGroundElevation(lat: number, lng: number): Promise<number | null> {
  try {
    const res = await fetchRealEarthElevations([{ lat, lng }]);
    return res.elevations[0];
  } catch (err) {
    console.error('Error sampling ground elevation:', err);
    return null;
  }
}

/**
 * Samples real ground elevations in batch for all network nodes (junctions, tanks, reservoirs)
 * against true Earth DEM.
 */
export async function sampleAllNetworkElevations(
  network: WaterDistributionNetwork
): Promise<{
  updatedNetwork: WaterDistributionNetwork;
  sampledCount: number;
  provider: string;
}> {
  const nodesToSample: { id: string; lat: number; lng: number; type: 'junction' | 'tank' | 'reservoir' }[] = [
    ...network.junctions.map((j) => ({ id: j.id, lat: j.lat, lng: j.lng, type: 'junction' as const })),
    ...network.tanks.map((t) => ({ id: t.id, lat: t.lat, lng: t.lng, type: 'tank' as const })),
    ...network.reservoirs.map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, type: 'reservoir' as const })),
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

  const updatedJunctions = network.junctions.map((j) => {
    const elev = elevationById.get(j.id);
    return elev !== undefined ? { ...j, elevation: elev } : j;
  });

  const updatedTanks = network.tanks.map((t) => {
    const elev = elevationById.get(t.id);
    return elev !== undefined ? { ...t, elevation: elev } : t;
  });

  const updatedReservoirs = network.reservoirs.map((r) => {
    const elev = elevationById.get(r.id);
    if (elev !== undefined) {
      // Ensure total head is at least above ground level
      const totalHead = r.totalHead > elev ? r.totalHead : Math.round((elev + 15) * 10) / 10;
      return { ...r, elevation: elev, totalHead };
    }
    return r;
  });

  return {
    updatedNetwork: {
      ...network,
      junctions: updatedJunctions,
      tanks: updatedTanks,
      reservoirs: updatedReservoirs,
    },
    sampledCount: elevationById.size,
    provider: result.provider,
  };
}

/**
 * Samples an interpolated real ground terrain profile along a line segment between two coordinates.
 * Samples every `intervalM` meters to trace valleys, ridges, and slopes along a pipe corridor.
 */
export async function sampleTerrainAlongSegment(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  intervalM = 30
): Promise<TerrainPoint[]> {
  const totalDistM = haversineDistanceM(lat1, lng1, lat2, lng2);
  const steps = Math.max(2, Math.min(60, Math.ceil(totalDistM / intervalM)));

  const points: { lat: number; lng: number; dist: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = lat1 + (lat2 - lat1) * t;
    const lng = lng1 + (lng2 - lng1) * t;
    const dist = totalDistM * t;
    points.push({ lat, lng, dist });
  }

  const queryCoords = points.map((p) => ({ lat: p.lat, lng: p.lng }));
  const result = await fetchRealEarthElevations(queryCoords);

  return points.map((p, idx) => ({
    lat: p.lat,
    lng: p.lng,
    distanceFromStartM: Math.round(p.dist * 10) / 10,
    elevation: result.elevations[idx] ?? 0,
  }));
}

export { calculateGeodesicDistanceM } from './geoUtils';
