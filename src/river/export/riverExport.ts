/**
 * Multi-Format River CFD Data Exporter
 *
 * Implements:
 * 1. 6-Sheet Professional Engineering Excel (.xlsx) via ExcelJS
 * 2. GeoJSON FeatureCollection with 2D cell hydraulic attributes
 * 3. ESRI ASCII Raster Grid (.asc)
 * 4. CSV Hydraulic Profiles & Gauge Hydrograph Timeseries
 */

import type ExcelJS from 'exceljs';
import {
  RiverGridMesh,
  HydrodynamicsState,
  RiverCfdSummary,
  RiverReachDefinition,
} from '../types/riverReach';
import { TurbulenceState, TurbulenceParameters } from '../types/turbulence';
import { SedimentState, SedimentParameters } from '../types/sediment';
import { RiverHydraulicStructure } from '../structures/structureTypes';
import { SwotCalibrationResult } from '../calibration/swotCalibration';

const HEADER_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FF1E293B' }, // Slate 800
};

const HEADER_FONT = {
  name: 'Segoe UI',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' },
};

const SUBHEADER_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFF1F5F9' }, // Slate 100
};

const THIN_BORDER = {
  top: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  left: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
};

export interface FullRiverExportPayload {
  reach: RiverReachDefinition;
  mesh: RiverGridMesh;
  hydro: HydrodynamicsState;
  turb: TurbulenceState;
  sed: SedimentState;
  structures: RiverHydraulicStructure[];
  summary: RiverCfdSummary;
  turbParams: TurbulenceParameters;
  sedParams: SedimentParameters;
  calibrationResult?: SwotCalibrationResult | null;
}

/**
 * Generate 6-Sheet Comprehensive River CFD Excel Workbook
 */
export async function createRiverExcelWorkbook(
  payload: FullRiverExportPayload
): Promise<ArrayBuffer> {
  const {
    reach,
    mesh,
    hydro,
    turb,
    sed,
    structures,
    summary,
    turbParams,
    sedParams,
    calibrationResult,
  } = payload;

  const ExcelJSModule = (await import('exceljs')).default;
  const workbook = new ExcelJSModule.Workbook();
  workbook.creator = 'Tensora GIS — River Analysis & CFD Engine';
  workbook.created = new Date();

  // =========================================================================
  // Sheet 1: Executive Summary
  // =========================================================================
  const ws1 = workbook.addWorksheet('Executive Summary', {
    views: [{ showGridLines: true }],
  });
  ws1.columns = [{ width: 34 }, { width: 24 }, { width: 18 }, { width: 20 }];

  ws1.addRow(['TENSORA GIS — 2D SHALLOW-WATER RIVER CFD MODELLING REPORT']);
  ws1.getRow(1).font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF0F172A' } };

  ws1.addRow(['Generated Date:', new Date().toISOString(), 'Solver Backend:', summary.backendUsed.toUpperCase()]);
  ws1.addRow(['Reach Name:', reach.name, 'Reach Length:', `${reach.reachLengthM.toFixed(1)} m`]);
  ws1.addRow(['Turbulence Model:', turbParams.model.toUpperCase(), 'Sediment Formula:', sedParams.formula.toUpperCase()]);
  ws1.addRow([]);

  // Headline Table
  const titleRow1 = ws1.addRow(['Metric Description', 'Simulated Value', 'Units', 'Engineering Notes']);
  titleRow1.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
  });

  const summaryRows: [string, any, string, string][] = [
    ['Total Simulation Duration', summary.totalTimeSimulatedSec.toFixed(2), 's', 'Completed timesteps'],
    ['Total Number of Finite-Volume Cells', mesh.cells.length, 'cells', `${mesh.nx} x ${mesh.ny} structured quad grid`],
    ['Maximum Water Depth (h_max)', summary.maxWaterDepthM.toFixed(3), 'm', 'Peak flow depth along reach'],
    ['Maximum Water Surface Elevation (WSE_max)', summary.maxWseM.toFixed(3), 'm MSL', 'Peak flood stage'],
    ['Maximum Flow Velocity (|V|_max)', summary.maxVelocityMs.toFixed(3), 'm/s', 'Critical scour potential'],
    ['Mean Channel Velocity', summary.meanVelocityMs.toFixed(3), 'm/s', 'Depth-averaged reach mean'],
    ['Total Inundation Area', summary.totalInundationAreaHa.toFixed(3), 'ha', 'Wet water surface coverage'],
    ['Total Water Volume in Domain', summary.totalWaterVolumeM3.toFixed(1), 'm³', 'Instantaneous channel storage'],
    ['Mass Conservation Balance Error', summary.massConservationErrorPercent.toFixed(4), '%', 'Continuity verification (<1% ideal)'],
    ['Critical/Supercritical Cells (Fr >= 1.0)', summary.criticalFroudeCellsCount, 'cells', 'Potential hydraulic jumps / chutes'],
    ['Maximum Eddy Viscosity (nu_t,max)', summary.turbulenceSummary?.maxNuT.toFixed(4) || '0', 'm²/s', 'RANS depth-averaged diffusion'],
    ['Net Sediment Bed Volume Change', summary.sedimentSummary?.netBedVolumeChangeM3.toFixed(2) || '0', 'm³', 'Negative = net scour, Positive = net deposition'],
    ['Active Hydraulic Structures Count', structures.filter((s) => s.enabled).length, 'structures', 'Levees, weirs, bridges, culverts, gates'],
  ];

  for (const r of summaryRows) {
    const row = ws1.addRow(r);
    row.eachCell((c) => {
      c.border = THIN_BORDER;
    });
  }

  // =========================================================================
  // Sheet 2: Hydrodynamics 2D Flow Field
  // =========================================================================
  const ws2 = workbook.addWorksheet('2D Hydrodynamics', {
    views: [{ showGridLines: true }],
  });
  ws2.columns = [
    { width: 10 }, // Cell ID
    { width: 14 }, // Centroid Lat
    { width: 14 }, // Centroid Lng
    { width: 14 }, // Bed Elev (m)
    { width: 14 }, // Depth h (m)
    { width: 14 }, // WSE (m)
    { width: 14 }, // Velocity u (m/s)
    { width: 14 }, // Velocity v (m/s)
    { width: 14 }, // Vel Mag (m/s)
    { width: 12 }, // Froude
    { width: 14 }, // Shear Stress (Pa)
    { width: 10 }, // Wet State
  ];

  const headerRow2 = ws2.addRow([
    'Cell ID',
    'Latitude',
    'Longitude',
    'Bed Elev (m)',
    'Depth h (m)',
    'WSE (m MSL)',
    'Vel u (m/s)',
    'Vel v (m/s)',
    'Vel Mag (m/s)',
    'Froude Fr',
    'Shear Tau (Pa)',
    'Wet Status',
  ]);
  headerRow2.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
  });

  const numCells = mesh.cells.length;
  for (let c = 0; c < numCells; c++) {
    const cell = mesh.cells[c];
    const row = ws2.addRow([
      cell.id,
      cell.centerLat.toFixed(6),
      cell.centerLng.toFixed(6),
      cell.bedElevation.toFixed(3),
      hydro.depth[c].toFixed(3),
      hydro.wse[c].toFixed(3),
      hydro.u[c].toFixed(3),
      hydro.v[c].toFixed(3),
      hydro.velocityMag[c].toFixed(3),
      hydro.froude[c].toFixed(3),
      hydro.shearStress[c].toFixed(2),
      hydro.isWet[c] ? 'WET' : 'DRY',
    ]);
    row.eachCell((cellObj) => {
      cellObj.border = THIN_BORDER;
    });
  }

  // =========================================================================
  // Sheet 3: RANS Turbulence Diagnostics
  // =========================================================================
  const ws3 = workbook.addWorksheet('RANS Turbulence', {
    views: [{ showGridLines: true }],
  });
  ws3.columns = [
    { width: 10 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 22 },
  ];

  const headerRow3 = ws3.addRow([
    'Cell ID',
    'Eddy Viscosity nu_t (m²/s)',
    'TKE k (m²/s²)',
    'Dissipation eps (m²/s³)',
    'Production P_k (m²/s³)',
    'Turbulent Length Scale (m)',
  ]);
  headerRow3.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
  });

  for (let c = 0; c < numCells; c++) {
    const h = hydro.depth[c];
    const kVal = turb.k[c];
    const epsVal = turb.epsOrOmega[c];
    const lengthScale = epsVal > 1.0e-5 ? (0.09 * Math.pow(kVal, 1.5)) / epsVal : 0;

    const row = ws3.addRow([
      c,
      turb.nuT[c].toFixed(5),
      kVal.toFixed(5),
      epsVal.toFixed(5),
      turb.pK[c].toFixed(5),
      Math.min(h, lengthScale).toFixed(4),
    ]);
    row.eachCell((cellObj) => {
      cellObj.border = THIN_BORDER;
    });
  }

  // =========================================================================
  // Sheet 4: Sediment & Morphodynamics
  // =========================================================================
  const ws4 = workbook.addWorksheet('Sediment Transport', {
    views: [{ showGridLines: true }],
  });
  ws4.columns = [
    { width: 10 },
    { width: 16 },
    { width: 18 },
    { width: 20 },
    { width: 22 },
    { width: 18 },
    { width: 14 },
  ];

  const headerRow4 = ws4.addRow([
    'Cell ID',
    'Shields Theta',
    'Critical Tau (Pa)',
    'Transport Rate qs (m²/s)',
    'Suspended Conc C (kg/m³)',
    'Bed Change Dz_b (m)',
    'Morphology',
  ]);
  headerRow4.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
  });

  for (let c = 0; c < numCells; c++) {
    const bedChange = sed.bedElevationChangeM[c];
    let morphDesc = 'STABLE';
    if (bedChange < -0.005) morphDesc = 'SCOUR';
    else if (bedChange > 0.005) morphDesc = 'DEPOSITION';

    const row = ws4.addRow([
      c,
      sed.shields[c].toFixed(4),
      sed.criticalShearStressPa[c].toFixed(2),
      sed.transportRateM2s[c].toFixed(6),
      sed.concentrationKgM3[c].toFixed(4),
      bedChange.toFixed(4),
      morphDesc,
    ]);
    row.eachCell((cellObj) => {
      cellObj.border = THIN_BORDER;
    });
  }

  // =========================================================================
  // Sheet 5: Hydraulic Structures
  // =========================================================================
  const ws5 = workbook.addWorksheet('Hydraulic Structures', {
    views: [{ showGridLines: true }],
  });
  ws5.columns = [
    { width: 14 },
    { width: 24 },
    { width: 16 },
    { width: 10 },
    { width: 16 },
    { width: 20 },
    { width: 22 },
    { width: 22 },
  ];

  const headerRow5 = ws5.addRow([
    'Structure ID',
    'Structure Name',
    'Structure Type',
    'Status',
    'CAD Layer',
    'Affected Cells',
    'Key Elevation (m MSL)',
    'Governing Geometry',
  ]);
  headerRow5.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
  });

  if (structures.length === 0) {
    ws5.addRow(['N/A', 'No structures placed in reach', 'NONE', 'N/A', 'Default', '0', '-', '-']);
  } else {
    for (const s of structures) {
      let keyElev = 0;
      let geomDesc = '';

      if (s.type === 'levee') {
        keyElev = s.crestElevationM;
        geomDesc = `Top width: ${s.topWidthM}m, Slope: 1:${s.sideSlopeHtoV}`;
      } else if (s.type === 'weir') {
        keyElev = s.crestElevationM;
        geomDesc = `Length: ${s.crestLengthM}m, Cd: ${s.dischargeCoefficient}`;
      } else if (s.type === 'bridge') {
        keyElev = s.deckElevationM;
        geomDesc = `Low chord: ${s.lowChordElevationM}m, Piers: ${s.pierCount} x ${s.pierWidthM}m`;
      } else if (s.type === 'culvert') {
        keyElev = s.inletInvertM;
        geomDesc = `Barrels: ${s.barrelCount}, Span: ${s.diameterOrSpanM}m, Rise: ${s.riseM}m`;
      } else if (s.type === 'gate') {
        keyElev = s.crestElevationM;
        geomDesc = `Opening: ${s.openingM}m, Width: ${s.gateWidthM}m`;
      } else if (s.type === 'embankment') {
        keyElev = s.crestElevationM;
        geomDesc = `Top width: ${s.topWidthM}m, Cd: ${s.overtopDischargeCoeff}`;
      }

      const row = ws5.addRow([
        s.id,
        s.name,
        s.type.toUpperCase(),
        s.enabled ? 'ACTIVE' : 'BYPASSED',
        s.cadProperties?.layerName || 'CIVIL_HYDRAULIC',
        s.cellIndices.length,
        keyElev.toFixed(2),
        geomDesc,
      ]);
      row.eachCell((cellObj) => {
        cellObj.border = THIN_BORDER;
      });
    }
  }

  // =========================================================================
  // Sheet 6: NASA SWOT Satellite Calibration
  // =========================================================================
  const ws6 = workbook.addWorksheet('SWOT Calibration', {
    views: [{ showGridLines: true }],
  });
  ws6.columns = [{ width: 32 }, { width: 24 }, { width: 14 }, { width: 34 }];

  const headerRow6 = ws6.addRow([
    'Calibration Parameter',
    'Value',
    'Units',
    'Evaluation Notes',
  ]);
  headerRow6.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
  });

  const calData: [string, any, string, string][] = [
    [
      'NASA SWOT Observed WSE',
      calibrationResult ? calibrationResult.observedWseM.toFixed(3) : 'N/A',
      'm MSL',
      'Satellite KaRIn radar pass elevation',
    ],
    [
      'Simulated Mean WSE',
      calibrationResult ? calibrationResult.simulatedMeanWseM.toFixed(3) : summary.maxWseM.toFixed(3),
      'm MSL',
      'Area-weighted wet cell mean',
    ],
    [
      'Elevation Discrepancy (Sim - Obs)',
      calibrationResult ? calibrationResult.differenceM.toFixed(3) : '0.000',
      'm',
      'Systematic datum or friction offset',
    ],
    [
      'WSE Root-Mean-Square Error (RMSE)',
      calibrationResult ? calibrationResult.wseRmseM.toFixed(3) : '0.000',
      'm',
      'Benchmark criteria: <0.15m excellent, <0.40m good',
    ],
    [
      'Calibrated Manning Roughness n',
      calibrationResult ? calibrationResult.calibratedManningN.toFixed(4) : reach.defaultManningN.toFixed(4),
      '-',
      'Optimized channel roughness coefficient',
    ],
    [
      'Agreement Status',
      calibrationResult ? calibrationResult.agreementStatus : 'UNTESTED',
      '-',
      calibrationResult ? calibrationResult.recommendation : 'Run SWOT calibration evaluation',
    ],
  ];

  for (const r of calData) {
    const row = ws6.addRow(r);
    row.eachCell((cellObj) => {
      cellObj.border = THIN_BORDER;
    });
  }

  return await workbook.xlsx.writeBuffer();
}

/**
 * Generate GeoJSON FeatureCollection of 2D Computational Cells
 */
export function exportRiverToGeoJson(
  mesh: RiverGridMesh,
  hydro: HydrodynamicsState,
  turb: TurbulenceState,
  sed: SedimentState
): string {
  const features = mesh.cells.map((cell, idx) => {
    // Quad polygon coordinates: corners in [lng, lat] format for GeoJSON
    const polyCoords = cell.corners.map(([lat, lng]) => [lng, lat]);
    // Close polygon
    polyCoords.push([cell.corners[0][1], cell.corners[0][0]]);

    return {
      type: 'Feature' as const,
      properties: {
        id: cell.id,
        i: cell.i,
        j: cell.j,
        bedElevationM: cell.bedElevation,
        depthM: hydro.depth[idx],
        wseM: hydro.wse[idx],
        uMs: hydro.u[idx],
        vMs: hydro.v[idx],
        velocityMagMs: hydro.velocityMag[idx],
        froude: hydro.froude[idx],
        shearStressPa: hydro.shearStress[idx],
        eddyViscosityNuT: turb.nuT[idx],
        turbulentKineticEnergyK: turb.k[idx],
        suspendedConcentrationKgM3: sed.concentrationKgM3[idx],
        sedimentTransportRateM2s: sed.transportRateM2s[idx],
        bedElevationChangeM: sed.bedElevationChangeM[idx],
        isWet: hydro.isWet[idx] === 1,
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [polyCoords],
      },
    };
  });

  const geoJson = {
    type: 'FeatureCollection' as const,
    name: `${mesh.name}_2D_CFD_Results`,
    crs: {
      type: 'name' as const,
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    },
    features,
  };

  return JSON.stringify(geoJson, null, 2);
}

/**
 * Generate ESRI ASCII Raster Grid (.asc)
 */
export function exportRiverToAsciiGrid(
  mesh: RiverGridMesh,
  field: 'depth' | 'wse' | 'velocity' | 'bed',
  hydro: HydrodynamicsState
): string {
  const ncols = mesh.ny;
  const nrows = mesh.nx;
  const [minLat, minLng] = mesh.bounds;
  const nodata = -9999;

  let header = `ncols         ${ncols}\n`;
  header += `nrows         ${nrows}\n`;
  header += `xllcorner     ${minLng.toFixed(6)}\n`;
  header += `yllcorner     ${minLat.toFixed(6)}\n`;
  header += `cellsize      0.0001\n`;
  header += `NODATA_value  ${nodata}\n`;

  let body = '';
  for (let i = 0; i < nrows; i++) {
    const rowVals: string[] = [];
    for (let j = 0; j < ncols; j++) {
      const idx = i * ncols + j;
      if (idx < mesh.cells.length) {
        let val = nodata;
        if (field === 'depth') val = hydro.depth[idx];
        else if (field === 'wse') val = hydro.wse[idx];
        else if (field === 'velocity') val = hydro.velocityMag[idx];
        else if (field === 'bed') val = mesh.cells[idx].bedElevation;
        rowVals.push(val.toFixed(3));
      } else {
        rowVals.push(`${nodata}`);
      }
    }
    body += rowVals.join(' ') + '\n';
  }

  return header + body;
}

/**
 * Trigger download of Blob in browser
 */
export function triggerFileDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
