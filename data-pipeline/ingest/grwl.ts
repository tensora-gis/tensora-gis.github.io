/**
 * GRWL (Global River Widths from Landsat) Ingestion Module
 *
 * Satellite-derived river widths at mean discharge (Allen & Pavelsky).
 * License: CC BY 4.0
 */

export interface GrwlRecord {
  segmentId: string;
  reachId?: string;
  widthM: number;
  lat: number;
  lng: number;
}

export function parseGrwlRecord(raw: any): GrwlRecord {
  return {
    segmentId: String(raw.segment_id || raw.id),
    reachId: raw.reach_id ? String(raw.reach_id) : undefined,
    widthM: Number(raw.width_m || 80),
    lat: Number(raw.lat),
    lng: Number(raw.lon || raw.lng),
  };
}
