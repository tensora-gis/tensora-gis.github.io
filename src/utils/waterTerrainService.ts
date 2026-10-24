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

// In-memory cache for fast point lookups
const waterDemCache = new Map<string, number>();

function getCoordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/**
 * Directly queries Open-Meteo Global Elevation API (Copernicus GLO-30 / SRTM 30m).
 * Fully CORS compatible and provides true ground elevations above Mean Sea Level.
 */
export async function fetchRealEarthElevations(
  points: { lat: number; lng: number }[]
): Promise<{ elevations: (number | null)[]; provider: string }> {
  if (points.length === 0) {
    return { elevations: [], provider: 'none' };
  }

  const results: (number | null)[] = new Array(points.length).fill(null);
  const uncachedIndices: number[] = [];

  // Check cache first
  points.forEach((p, idx) => {
    const key = getCoordKey(p.lat, p.lng);
    if (waterDemCache.has(key)) {
      results[idx] = waterDemCache.get(key)!;
    } else {
      uncachedIndices.push(idx);
    }
  });

  if (uncachedIndices.length === 0) {
    return { elevations: results, provider: 'Copernicus GLO-30 / SRTM (Open-Meteo Cache)' };
  }

  let providerUsed = 'Copernicus GLO-30 / SRTM (Open-Meteo)';

  // Batch query Open-Meteo in chunks of up to 100 coordinates
  const chunkSize = 100;
  for (let i = 0; i < uncachedIndices.length; i += chunkSize) {
    const chunkIdxs = uncachedIndices.slice(i, i + chunkSize);
    const chunkPoints = chunkIdxs.map((idx) => points[idx]);
    const lats = chunkPoints.map((p) => p.lat.toFixed(6)).join(',');
    const lngs = chunkPoints.map((p) => p.lng.toFixed(6)).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.elevation) && data.elevation.length === chunkPoints.length) {
          data.elevation.forEach((val: unknown, k: number) => {
            if (typeof val === 'number' && isFinite(val) && val > -450 && val < 9000) {
              const rounded = Math.round(val * 10) / 10;
              const origIdx = chunkIdxs[k];
              results[origIdx] = rounded;
              waterDemCache.set(getCoordKey(chunkPoints[k].lat, chunkPoints[k].lng), rounded);
            }
          });
        }
      }
    } catch (err) {
      console.warn('Open-Meteo elevation direct query warning, attempting fallback:', err);
    }
  }

  // If any points failed or timed out, query local fallback bulk elevation engine
  const missingIndices = results
    .map((v, idx) => (v === null ? idx : null))
    .filter((idx): idx is number => idx !== null);

  if (missingIndices.length > 0) {
    try {
      const fallbackPoints = missingIndices.map((idx) => points[idx]);
      const fbResult = await fetchBulkElevations(fallbackPoints);
      missingIndices.forEach((origIdx, fbIdx) => {
        const v = fbResult.elevations[fbIdx];
        if (v !== null && isFinite(v)) {
          const rounded = Math.round(v * 10) / 10;
          results[origIdx] = rounded;
          waterDemCache.set(getCoordKey(points[origIdx].lat, points[origIdx].lng), rounded);
        }
      });
      if (fbResult.providers.length > 0) {
        providerUsed = `Copernicus GLO-30 / SRTM (${fbResult.providers.join(', ')})`;
      }
    } catch (err) {
      console.error('Fallback elevation resolution error:', err);
    }
  }

  return { elevations: results, provider: providerUsed };
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

/**
 * Calculates geodesic surface distance between two points in meters.
 */
export function calculateGeodesicDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  return Math.round(haversineDistanceM(lat1, lng1, lat2, lng2) * 10) / 10;
}
