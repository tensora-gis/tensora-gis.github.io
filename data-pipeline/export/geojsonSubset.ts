/**
 * Global River GeoJSON Subset Exporter
 *
 * Implements Section 4.2 of the Global River Digital Twin Plan.
 * Exports a <5MB compact GeoJSON FeatureCollection of major world rivers
 * for instant vector display on the Leaflet map at cold start.
 */

import { GLOBAL_RIVER_DATABASE } from '../../src/river/data/globalRiverDatabase';

export function exportBundledGeoJsonSubset(): string {
  const features = GLOBAL_RIVER_DATABASE.map((entry) => {
    const coords = entry.centerline.map((pt) => [
      parseFloat(pt.lng.toFixed(5)),
      parseFloat(pt.lat.toFixed(5)),
      parseFloat((pt.bedElevationM || 100).toFixed(1)),
    ]);

    return {
      type: 'Feature',
      id: entry.id,
      properties: {
        id: entry.id,
        name: entry.name,
        reach: entry.reachName,
        continent: entry.continent,
        countries: entry.countries,
        basin: entry.basin,
        order: entry.strahlerOrder,
        catchment_km2: entry.catchmentAreaKm2,
        q_mean: entry.meanDischargeM3s,
        width_m: entry.meanWidthM,
        slope: entry.averageSlope,
        tier: entry.swotWseM > 0 ? 'Calibrated (SWOT)' : 'Estimated (Global)',
      },
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
    };
  });

  const collection = {
    type: 'FeatureCollection',
    name: 'Tensora_Global_River_Knowledge_Graph_Subset',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features,
  };

  return JSON.stringify(collection, null, 2);
}
