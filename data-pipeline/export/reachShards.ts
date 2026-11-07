/**
 * Spatial Sharding Utility for 8.5M Global River Knowledge Graph
 *
 * Implements Section 3 of the Global River Digital Twin Plan (Draft v4.0).
 * Partitions global reaches into ~1° × 1° spatial tiles (<5 MB per shard)
 * so that all ~8.5 million reaches across every tributary on Earth can be
 * loaded on demand without exceeding repository limits or browser memory.
 */

import { RiverReachDefinition } from '../../src/river/types/riverReach';

export interface SpatialShardMetadata {
  tileId: string;
  latFloor: number;
  lngFloor: number;
  bounds: [number, number, number, number]; // [minLat, minLng, maxLat, maxLng]
  reachCount: number;
  byteSizeEstimate: number;
}

export interface CompactReachRecord {
  id: string;
  name: string;
  strahlerOrder?: number;
  dischargeM3s: number;
  meanWidthM: number;
  lengthM: number;
  accuracyTier: string;
  coordinates: [number, number][]; // [lng, lat]
  elevationStartM?: number;
  elevationEndM?: number;
  slopeMmPerKm?: number;
}

export interface SpatialReachShard {
  tileId: string;
  version: string;
  bounds: [number, number, number, number];
  reaches: CompactReachRecord[];
}

/**
 * Returns canonical tile key for a given latitude and longitude (1° × 1° cell)
 */
export function getTileKey(lat: number, lng: number): string {
  const latFloor = Math.floor(lat);
  const lngFloor = Math.floor(lng);
  const latSign = latFloor >= 0 ? `N${latFloor}` : `S${Math.abs(latFloor)}`;
  const lngSign = lngFloor >= 0 ? `E${lngFloor}` : `W${Math.abs(lngFloor)}`;
  return `tile_${latSign}_${lngSign}`;
}

/**
 * Parses tile key back into latitude and longitude floor coordinates
 */
export function parseTileKey(tileKey: string): { latFloor: number; lngFloor: number } {
  const match = tileKey.match(/^tile_([NS])(\d+)_([EW])(\d+)$/);
  if (!match) {
    throw new Error(`Invalid tile key format: ${tileKey}`);
  }
  const latFloor = (match[1] === 'N' ? 1 : -1) * parseInt(match[2], 10);
  const lngFloor = (match[3] === 'E' ? 1 : -1) * parseInt(match[4], 10);
  return { latFloor, lngFloor };
}

/**
 * Returns all 1° × 1° tile keys overlapping a given bounding box [minLat, minLng, maxLat, maxLng]
 */
export function getTileKeysForBounds(bounds: [number, number, number, number]): string[] {
  const [minLat, minLng, maxLat, maxLng] = bounds;
  const startLat = Math.floor(minLat);
  const endLat = Math.floor(maxLat);
  const startLng = Math.floor(minLng);
  const endLng = Math.floor(maxLng);

  const keys: string[] = [];
  for (let lat = startLat; lat <= endLat; lat++) {
    for (let lng = startLng; lng <= endLng; lng++) {
      keys.push(getTileKey(lat, lng));
    }
  }
  return keys;
}

/**
 * Partitions an array of reach definitions into 1° × 1° spatial shards
 */
export function partitionReachesIntoShards(
  reaches: RiverReachDefinition[]
): Map<string, RiverReachDefinition[]> {
  const shards = new Map<string, RiverReachDefinition[]>();

  for (const reach of reaches) {
    const centerPoint = reach.centerline[Math.floor(reach.centerline.length / 2)] || reach.centerline[0];
    const tileKey = getTileKey(centerPoint.lat, centerPoint.lng);

    if (!shards.has(tileKey)) {
      shards.set(tileKey, []);
    }
    shards.get(tileKey)!.push(reach);
  }

  return shards;
}

/**
 * Serializes a spatial shard into a compact, compressed-ready JSON representation
 */
export function serializeReachShard(
  tileId: string,
  reaches: RiverReachDefinition[]
): SpatialReachShard {
  const { latFloor, lngFloor } = parseTileKey(tileId);

  const compactRecords: CompactReachRecord[] = reaches.map((r) => ({
    id: r.id,
    name: r.name,
    dischargeM3s: r.upstreamDischargeEstimateM3s || 100.0,
    meanWidthM: r.meanWidthM,
    lengthM: r.reachLengthM,
    accuracyTier: r.accuracyTier || 'Estimated (Global)',
    coordinates: r.centerline.map((c) => [c.lng, c.lat]),
    elevationStartM: r.centerline[0]?.bedElevationM,
    elevationEndM: r.centerline[r.centerline.length - 1]?.bedElevationM,
  }));

  return {
    tileId,
    version: '4.0',
    bounds: [latFloor, lngFloor, latFloor + 1, lngFloor + 1],
    reaches: compactRecords,
  };
}
