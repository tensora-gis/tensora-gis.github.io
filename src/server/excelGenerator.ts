import ExcelJS from 'exceljs';
import { decimalToDMS } from '../utils/geoUtils';
import { generateHydrologySnapshot, SnapshotParams } from './snapshotGenerator';

const HEADER_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FF0F172A' },
};
const LABEL_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFF1F5F9' },
};
const THIN_BORDER = {
  top: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
  left: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
  bottom: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
  right: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
};

function styleHeaderRow(row: ExcelJS.Row): void {
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = THIN_BORDER;
  });
}

/** Excel worksheet names are capped at 31 chars and must be unique. */
function uniqueSheetName(workbook: ExcelJS.Workbook, base: string): string {
  const clean = (base || 'Sheet').replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || 'Sheet';
  if (!workbook.worksheets.some((ws) => ws.name === clean)) return clean;
  let n = 2;
  for (;;) {
    const suffix = `_${n}`;
    const candidate = clean.slice(0, 31 - suffix.length) + suffix;
    if (!workbook.worksheets.some((ws) => ws.name === candidate)) return candidate;
    n++;
  }
}



/**
 * Builds the three-sheet workbook required by the specification:
 *   1. Hydrology Summary (the six headline values + the measured basis)
 *   2. Complete Chainage Register (every station, DMS + decimal + elevation)
 *   3. Catchment Boundary Polygon Vertices
 * with the rendered delineation snapshot embedded beneath the summary.
 */
export async function createHydrologyExcelWorkbook(
  reportData: SnapshotParams,
  snapshotBuffer?: Buffer
): Promise<Buffer> {
  let imgBuffer = snapshotBuffer;
  if (!imgBuffer) {
    const snap = await generateHydrologySnapshot(reportData);
    imgBuffer = snap.buffer;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tensora GIS - Hydrology Catchment Engine';
  workbook.created = new Date();

  // ---- Sheet 1: Hydrology Summary ----------------------------------------
  const ws = workbook.addWorksheet(uniqueSheetName(workbook, `CH_${reportData.targetChainageFormatted ?? 'Report'}`), {
    views: [{ showGridLines: true }],
  });
  ws.columns = [{ width: 30 }, { width: 44 }];

  const headline: [string, string][] = [
    ['LATITUDE :', reportData.latitudeDMS],
    ['LONGITUDE :', reportData.longitudeDMS],
    ['CATCHMENT AREA (A):', `${reportData.catchmentAreaKm2} km²`],
    ['LENGTH OF STREAM (L):', `${reportData.lengthOfStreamKm} km`],
    ['LEVEL STREAM ORIGIN:', `${reportData.levelStreamOriginM} m MSL`],
    ['HIGHEST CONTOUR:', `${reportData.highestContourM} m MSL`],
  ];

  for (const [label, value] of headline) {
    const row = ws.addRow([label, value]);
    row.height = 24;
    const cellA = row.getCell(1);
    const cellB = row.getCell(2);
    cellA.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cellA.fill = LABEL_FILL;
    cellB.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0284C7' } };
    cellA.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellB.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellA.border = THIN_BORDER;
    cellB.border = THIN_BORDER;
  }

  ws.addRow([]);
  const scopeM = reportData.scopeAppliedM ?? 500;
  const provenance: [string, string][] = [
    ['ELEVATION DROP (Δh):', `${reportData.elevationDropM} m`],
    [
      'ANALYSIS SCOPE:',
      `${scopeM} m${reportData.scopeExpandedDueToFlatRelief ? ' (auto-expanded from 500 m: relief below 5 m)' : ''}`,
    ],
    ['RELIEF IN SCOPE:', reportData.reliefWithinScopeM !== undefined ? `${reportData.reliefWithinScopeM} m` : 'Not recorded'],
    ['MEETS 5 m THRESHOLD:', reportData.meetsReliefThreshold === undefined ? 'Not recorded' : reportData.meetsReliefThreshold ? 'Yes' : 'No'],
    ['ELEVATION SOURCE:', reportData.elevationSource ?? 'Not recorded'],
    [
      'ORIGIN DATUM:',
      reportData.elevationOriginKind === 'survey' ? 'Uploaded survey sheet' : 'Sampled from DEM',
    ],
    ['DEM COVERAGE:', reportData.demCoverage !== undefined ? `${(reportData.demCoverage * 100).toFixed(1)}%` : 'Not recorded'],
  ];
  for (const [label, value] of provenance) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF334155' } };
    row.getCell(2).font = { name: 'Arial', size: 9, color: { argb: 'FF334155' } };
    row.getCell(1).fill = LABEL_FILL;
    row.getCell(1).border = THIN_BORDER;
    row.getCell(2).border = THIN_BORDER;
  }

  ws.addRow([]);
  if (imgBuffer && imgBuffer.length > 0) {
    const imageId = workbook.addImage({ buffer: imgBuffer as never, extension: 'png' });
    ws.addImage(imageId, { tl: { col: 0, row: ws.rowCount + 1 }, ext: { width: 720, height: 510 } });
  }

  // ---- Sheet 2: Complete Chainage Register -------------------------------
  const register = workbook.addWorksheet('Chainage_Register', { views: [{ showGridLines: true }] });
  register.columns = [
    { width: 16, header: 'Chainage' },
    { width: 24, header: 'Latitude (DMS)' },
    { width: 24, header: 'Longitude (DMS)' },
    { width: 16, header: 'Latitude (DD)' },
    { width: 16, header: 'Longitude (DD)' },
    { width: 18, header: 'Elevation (m MSL)' },
  ];
  styleHeaderRow(register.getRow(1));

  const stations = reportData.chainages ?? [];
  if (stations.length === 0) {
    const note = register.addRow([
      'No chainage stations were supplied with this request, so the register is empty.',
    ]);
    note.getCell(1).font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };
  } else {
    for (const ch of stations) {
      register.addRow([
        ch.formatted ?? String(ch.chainage),
        decimalToDMS(ch.lat, true),
        decimalToDMS(ch.lng, false),
        Math.round(ch.lat * 1e7) / 1e7,
        Math.round(ch.lng * 1e7) / 1e7,
        'Not sampled',
      ]);
    }
  }

  // ---- Sheet 3: Catchment Boundary Vertices ------------------------------
  const boundary = workbook.addWorksheet('Catchment_Boundary', { views: [{ showGridLines: true }] });
  boundary.columns = [
    { width: 10, header: 'Vertex' },
    { width: 16, header: 'Latitude (DD)' },
    { width: 16, header: 'Longitude (DD)' },
    { width: 24, header: 'Latitude (DMS)' },
    { width: 24, header: 'Longitude (DMS)' },
  ];
  styleHeaderRow(boundary.getRow(1));

  (reportData.catchmentPolygon ?? []).forEach(([lat, lng], idx) => {
    boundary.addRow([
      idx + 1,
      Math.round(lat * 1e7) / 1e7,
      Math.round(lng * 1e7) / 1e7,
      decimalToDMS(lat, true),
      decimalToDMS(lng, false),
    ]);
  });

  const outBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(outBuffer as ArrayBuffer);
}
