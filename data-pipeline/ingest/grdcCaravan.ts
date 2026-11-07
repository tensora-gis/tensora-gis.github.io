/**
 * GRDC-Caravan Observed Discharge Ingestion Module
 *
 * Ingests observed gauge discharge subset.
 * License: CC-BY-4.0 (Redistributable Caravan subset only).
 */

export interface GrdcCaravanRecord {
  gaugeId: string;
  reachId: string;
  stationName: string;
  country: string;
  drainageAreaKm2: number;
  meanObservedDischargeM3s: number;
  license: 'CC-BY-4.0';
}

export function parseGrdcCaravan(raw: any): GrdcCaravanRecord {
  return {
    gaugeId: String(raw.gauge_id),
    reachId: String(raw.reach_id),
    stationName: String(raw.station_name),
    country: String(raw.country || ''),
    drainageAreaKm2: Number(raw.area_km2 || 1000),
    meanObservedDischargeM3s: Number(raw.q_mean || 80),
    license: 'CC-BY-4.0',
  };
}
