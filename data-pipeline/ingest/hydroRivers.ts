/**
 * HydroRIVERS / FAO Global Rivers Ingestion Module
 *
 * Ingests reach drainage area, river slope, and flow direction network.
 * License: Open / FAO rivers CC-BY-4.0
 */

export interface HydroRiversRecord {
  hydroId: number;
  basinId: number;
  catchmentAreaKm2: number;
  flowDistanceToSinkKm: number;
  slopeDegrees: number;
  meanAnnualDischargeM3s: number;
}

export function parseHydroRiversRecord(raw: any): HydroRiversRecord {
  return {
    hydroId: Number(raw.HYRIV_ID || raw.id),
    basinId: Number(raw.MAIN_RIV || raw.basin),
    catchmentAreaKm2: Number(raw.UPLAND_SKM || raw.catchment || 1000),
    flowDistanceToSinkKm: Number(raw.DIST_DN_KM || 50),
    slopeDegrees: Number(raw.SLOPE_DEG || 0.05),
    meanAnnualDischargeM3s: Number(raw.DIS_AV_CMS || 50),
  };
}
