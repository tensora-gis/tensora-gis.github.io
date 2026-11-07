/**
 * SWOT RiverSP Altimetry Ingestion Module
 *
 * Satellite radar altimetry Water Surface Elevation (WSE) & surface slopes for WSE calibration.
 * Source: NASA / CNES SWOT Open Mission Data
 */

export interface SwotRiverSpRecord {
  reachId: string;
  passDate: string;
  wseM: number;
  wseUncertaintyM: number;
  slopeMmPerKm: number;
  observedWidthM: number;
}

export function parseSwotRiverSp(raw: any): SwotRiverSpRecord {
  return {
    reachId: String(raw.reach_id),
    passDate: String(raw.pass_date || new Date().toISOString().split('T')[0]),
    wseM: Number(raw.wse || 100.0),
    wseUncertaintyM: Number(raw.wse_u || 0.15),
    slopeMmPerKm: Number(raw.slope || 120),
    observedWidthM: Number(raw.width || 150),
  };
}
