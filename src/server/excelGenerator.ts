import ExcelJS from 'exceljs';
import { generateHydrologySnapshot, SnapshotParams } from './snapshotGenerator';

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
 * Builds the single-sheet Hydrology Summary workbook:
 *   - The six headline values with units
 *   - The measured secondary parameters
 *   - The rendered 70%-framed delineation snapshot embedded beneath the summary table.
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
  ws.columns = [{ width: 28 }, { width: 20 }, { width: 14 }];

  const headline: [string, any, string][] = [
    ['LATITUDE :', reportData.latitudeDMS, ''],
    ['LONGITUDE :', reportData.longitudeDMS, ''],
    ['CATCHMENT AREA (A):', reportData.catchmentAreaKm2, 'km2'],
    ['LENGTH OF STREAM (L):', reportData.lengthOfStreamKm, 'km'],
    ['LEVEL STREAM ORIGIN:', reportData.levelStreamOriginM, 'm'],
    ['HIGHEST CONTOUR:', reportData.highestContourM, 'm'],
  ];

  for (const [label, value, unit] of headline) {
    const row = ws.addRow([label, value, unit]);
    row.height = 24;
    const cellA = row.getCell(1);
    const cellB = row.getCell(2);
    const cellC = row.getCell(3);
    cellA.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cellA.fill = LABEL_FILL;
    cellB.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0284C7' } };
    cellC.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF64748B' } };
    cellA.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellB.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellC.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellA.border = THIN_BORDER;
    cellB.border = THIN_BORDER;
    cellC.border = THIN_BORDER;
  }

  ws.addRow([]);
  const scopeM = reportData.scopeAppliedM ?? 500;
  const provenance: [string, any, string][] = [
    ['ELEVATION DROP (Δh):', reportData.elevationDropM, 'm'],
    ['TARGET CHAINAGE:', reportData.targetChainageFormatted ?? String(reportData.targetChainage), ''],
    [
      'ANALYSIS SCOPE:',
      scopeM,
      reportData.scopeExpandedDueToFlatRelief ? 'm (expanded: relief < 5m)' : 'm',
    ],
    ['RELIEF IN SCOPE:', reportData.reliefWithinScopeM !== undefined ? reportData.reliefWithinScopeM : '—', 'm'],
    ['MEETS 5 m THRESHOLD:', reportData.meetsReliefThreshold === undefined ? '—' : reportData.meetsReliefThreshold ? 'Yes' : 'No', ''],
    ['ELEVATION SOURCE:', reportData.elevationSource ?? 'Not recorded', ''],
    [
      'ORIGIN DATUM:',
      reportData.elevationOriginKind === 'survey' ? 'Uploaded survey sheet' : 'Sampled from DEM',
      '',
    ],
    ['DEM COVERAGE:', reportData.demCoverage !== undefined ? Number((reportData.demCoverage * 100).toFixed(1)) : 100, '%'],
  ];
  for (const [label, value, unit] of provenance) {
    const row = ws.addRow([label, value, unit]);
    row.height = 20;
    const cellA = row.getCell(1);
    const cellB = row.getCell(2);
    const cellC = row.getCell(3);
    cellA.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF334155' } };
    cellB.font = { name: 'Arial', size: 9, color: { argb: 'FF334155' } };
    cellC.font = { name: 'Arial', size: 9, color: { argb: 'FF64748B' } };
    cellA.fill = LABEL_FILL;
    cellA.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellB.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellC.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellA.border = THIN_BORDER;
    cellB.border = THIN_BORDER;
    cellC.border = THIN_BORDER;
  }

  ws.addRow([]);
  if (imgBuffer && imgBuffer.length > 0) {
    const imageId = workbook.addImage({ buffer: imgBuffer as never, extension: 'png' });
    ws.addImage(imageId, { tl: { col: 0, row: ws.rowCount + 1 }, ext: { width: 840, height: 574 } });
  }

  const outBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(outBuffer as ArrayBuffer);
}
