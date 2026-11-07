/**
 * 2D River Hydrodynamic Data Export Utilities
 *
 * Implements standard spatial and numerical data exports:
 * 1. GeoJSON (Inundation flood footprints, velocity vectors, hydraulic structures)
 * 2. GeoTIFF / ESRI ASCII Raster Grids (Peak water depth & WSE)
 * 3. Engineering CSV tables (Station hydraulic registers & gauge time-series)
 */

import {
  RiverMesh,
  RiverFlowState,
  RiverStructure,
  RiverSimulationSummary,
  RiverMonitoringGauge,
} from '../types/riverAnalysis';

/**
 * Exports maximum flood inundation footprint and flow vector fields to standard GeoJSON.
 */
export function exportRiverToGeoJSON(
  mesh: RiverMesh,
  state: RiverFlowState,
  structures: RiverStructure[] = [],
  gauges: RiverMonitoringGauge[] = []
): string {
  const features: any[] = [];

  // 1. Wet Inundation Cell Polygons (h >= 0.05 m)
  for (let i = 0; i < mesh.cells.length; i++) {
    const h = state.depth[i];
    if (h >= 0.05) {
      const cell = mesh.cells[i];
      // Close the polygon ring
      const ring = [...cell.corners, cell.corners[0]].map(([lat, lng]) => [lng, lat]);

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
        properties: {
          cellId: cell.id,
          depthM: Math.round(h * 100) / 100,
          wseM: Math.round(state.wse[i] * 100) / 100,
          bedElevationM: cell.bedElevation,
          velocityMs: Math.round(state.velocityMag[i] * 100) / 100,
          uMs: Math.round(state.u[i] * 100) / 100,
          vMs: Math.round(state.v[i] * 100) / 100,
          froude: Math.round(state.froude[i] * 100) / 100,
          shearStressPa: Math.round(state.shearStress[i] * 10) / 10,
        },
      });
    }
  }

  // 2. Velocity Vector Arrow Points (Sampling every 2nd or 3rd cell to keep GeoJSON light)
  for (let i = 0; i < mesh.cells.length; i++) {
    const h = state.depth[i];
    const vel = state.velocityMag[i];
    if (h >= 0.05 && vel >= 0.02) {
      const cell = mesh.cells[i];
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [cell.centerLng, cell.centerLat],
        },
        properties: {
          type: 'velocity_vector',
          velocityMagnitudeMs: Math.round(vel * 100) / 100,
          uMs: Math.round(state.u[i] * 100) / 100,
          vMs: Math.round(state.v[i] * 100) / 100,
          flowDirectionDeg: Math.round(((Math.atan2(state.u[i], state.v[i]) * 180) / Math.PI + 360) % 360),
          depthM: Math.round(h * 100) / 100,
        },
      });
    }
  }

  // 3. Hydraulic Structures
  for (const s of structures) {
    if (s.coordinates.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: {
          type: s.coordinates.length === 1 ? 'Point' : 'LineString',
          coordinates: s.coordinates.map((c) => [c.lng, c.lat]),
        },
        properties: {
          structureId: s.id,
          name: s.name,
          structureType: s.type,
          enabled: s.enabled,
        },
      });
    }
  }

  // 4. Monitoring Gauges
  for (const g of gauges) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [g.lng, g.lat],
      },
      properties: {
        gaugeId: g.id,
        name: g.name,
        stationM: g.stationChainageM,
      },
    });
  }

  const geoJson = {
    type: 'FeatureCollection',
    name: `${mesh.name}_2D_CFD_Inundation`,
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    },
    features,
  };

  return JSON.stringify(geoJson, null, 2);
}

/**
 * Exports 2D water depth or WSE as an ESRI ASCII Raster Grid (.asc),
 * natively compatible with GDAL, QGIS, ArcGIS, and easily translated to GeoTIFF.
 */
export function exportRiverToAsciiRaster(
  mesh: RiverMesh,
  state: RiverFlowState,
  variable: 'depth' | 'wse' = 'depth'
): string {
  const ncols = mesh.ny;
  const nrows = mesh.nx;
  const xllcorner = mesh.bounds[1];
  const yllcorner = mesh.bounds[0];
  const cellsize = (mesh.bounds[2] - mesh.bounds[0]) / nrows;
  const NODATA_VALUE = -9999;

  const header = [
    `ncols         ${ncols}`,
    `nrows         ${nrows}`,
    `xllcorner     ${xllcorner.toFixed(6)}`,
    `yllcorner     ${yllcorner.toFixed(6)}`,
    `cellsize      ${cellsize.toFixed(8)}`,
    `NODATA_value  ${NODATA_VALUE}`,
  ].join('\n');

  const rows: string[] = [];

  for (let i = nrows - 1; i >= 0; i--) {
    const rowVals: string[] = [];
    for (let j = 0; j < ncols; j++) {
      const idx = i * ncols + j;
      if (idx >= 0 && idx < mesh.cells.length) {
        const val = variable === 'depth' ? state.depth[idx] : state.wse[idx];
        if (state.depth[idx] < 0.01) {
          rowVals.push(String(NODATA_VALUE));
        } else {
          rowVals.push(val.toFixed(2));
        }
      } else {
        rowVals.push(String(NODATA_VALUE));
      }
    }
    rows.push(rowVals.join(' '));
  }

  return `${header}\n${rows.join('\n')}\n`;
}

/**
 * Generates an engineering-grade tabular CSV report of station hydraulics and monitoring hydrographs.
 */
export function exportRiverHydraulicsCSV(
  mesh: RiverMesh,
  state: RiverFlowState,
  summary: RiverSimulationSummary,
  structures: RiverStructure[] = []
): string {
  const lines: string[] = [];

  // Header & Executive Summary
  lines.push('# TENSORA GIS - 2D FINITE-VOLUME SHALLOW WATER CFD HYDRAULIC REPORT');
  lines.push(`# Project Reach: ${mesh.name}`);
  lines.push(`# Date of Simulation: ${new Date().toISOString()}`);
  lines.push(`# Reach Total Length: ${mesh.reachLengthM.toFixed(1)} m`);
  lines.push(`# Computational Cells: ${mesh.cells.length}`);
  lines.push(`# Maximum Water Depth: ${summary.maxWaterDepthM.toFixed(2)} m`);
  lines.push(`# Peak Flow Velocity: ${summary.maxVelocityMs.toFixed(2)} m/s`);
  lines.push(`# Peak Water Surface Elevation: ${summary.maxWseM.toFixed(2)} m MSL`);
  lines.push(`# Inundation Area: ${summary.totalInundationAreaHa.toFixed(2)} ha`);
  lines.push(`# Mass Conservation Balance Error: ${summary.massConservationErrorPercent.toFixed(2)}%`);
  lines.push('');

  // Cross-Section Average Hydraulics Table
  lines.push('CROSS-SECTION REACH HYDRAULICS SUMMARY');
  lines.push(
    'Station_m,Mean_Bed_Elev_m,Min_Bed_Elev_m,Water_Surface_Elev_m,Max_Depth_m,Mean_Depth_m,Mean_Velocity_ms,Max_Velocity_ms,Top_Width_m,Froude_Number,Max_Shear_Stress_Pa,Active_Structures'
  );

  const nx = mesh.nx;
  const ny = mesh.ny;

  for (let i = 0; i < nx; i++) {
    const stationM = (i / nx) * mesh.reachLengthM;
    let bedSum = 0;
    let minBed = 9999;
    let maxWse = -9999;
    let maxDepth = 0;
    let depthSum = 0;
    let velSum = 0;
    let maxVel = 0;
    let maxFroude = 0;
    let maxTau = 0;
    let wetCount = 0;
    const structureNames: string[] = [];

    for (let j = 0; j < ny; j++) {
      const idx = i * ny + j;
      const cell = mesh.cells[idx];
      const h = state.depth[idx];
      const wse = state.wse[idx];
      const vel = state.velocityMag[idx];

      bedSum += cell.bedElevation;
      if (cell.bedElevation < minBed) minBed = cell.bedElevation;

      if (h >= 0.05) {
        wetCount++;
        depthSum += h;
        velSum += vel;
        if (h > maxDepth) maxDepth = h;
        if (wse > maxWse) maxWse = wse;
        if (vel > maxVel) maxVel = vel;
        if (state.froude[idx] > maxFroude) maxFroude = state.froude[idx];
        if (state.shearStress[idx] > maxTau) maxTau = state.shearStress[idx];
      }

      if (cell.structureId) {
        const s = structures.find((st) => st.id === cell.structureId);
        if (s && !structureNames.includes(s.name)) {
          structureNames.push(s.name);
        }
      }
    }

    const meanBed = bedSum / ny;
    const meanDepth = wetCount > 0 ? depthSum / wetCount : 0;
    const meanVel = wetCount > 0 ? velSum / wetCount : 0;
    const topWidth = (wetCount / ny) * mesh.meanWidthM;
    const finalWse = maxWse > -9000 ? maxWse : minBed;

    lines.push(
      [
        stationM.toFixed(1),
        meanBed.toFixed(2),
        minBed.toFixed(2),
        finalWse.toFixed(2),
        maxDepth.toFixed(2),
        meanDepth.toFixed(2),
        meanVel.toFixed(2),
        maxVel.toFixed(2),
        topWidth.toFixed(1),
        maxFroude.toFixed(2),
        maxTau.toFixed(1),
        structureNames.length > 0 ? `"${structureNames.join('; ')}"` : 'None',
      ].join(',')
    );
  }

  lines.push('');

  // Monitoring Gauges Hydrograph Time-Series Table
  if (Object.keys(summary.gaugeHydrographs).length > 0) {
    lines.push('MONITORING GAUGES HYDROGRAPH TIME-SERIES');
    for (const [gaugeId, timePoints] of Object.entries(summary.gaugeHydrographs)) {
      lines.push(`Gauge ID: ${gaugeId}`);
      lines.push('Time_sec,WSE_m,Depth_m,Velocity_ms,Discharge_m3s');
      for (const pt of timePoints) {
        lines.push(
          `${pt.timeSec.toFixed(1)},${pt.wseM.toFixed(2)},${pt.depthM.toFixed(2)},${pt.velocityMs.toFixed(2)},${pt.dischargeM3s.toFixed(1)}`
        );
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Triggers browser download of text content as a file.
 */
export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
