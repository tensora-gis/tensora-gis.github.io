/**
 * SWORD (SWOT River Database) Topology Ingestion Module
 *
 * Extracts reach topology, reach IDs, node connectivity, and Strahler stream orders.
 * License: Open / CC-BY-4.0 (NASA / CNES)
 */

export interface SwordReach {
  reachId: string;
  riverName: string;
  strahlerOrder: number;
  nextDownstreamReachId?: string;
  coordinates: [number, number][]; // [lon, lat]
  lengthM: number;
  slopeMmPerKm: number;
}

export function parseSwordTopologyRecord(raw: any): SwordReach {
  return {
    reachId: String(raw.reach_id || raw.id),
    riverName: String(raw.river_name || raw.name || 'Unnamed River'),
    strahlerOrder: Number(raw.strahler_order || raw.order || 5),
    nextDownstreamReachId: raw.next_down ? String(raw.next_down) : undefined,
    coordinates: Array.isArray(raw.coords) ? raw.coords : [],
    lengthM: Number(raw.length_m || 3000),
    slopeMmPerKm: Number(raw.slope || 100),
  };
}
