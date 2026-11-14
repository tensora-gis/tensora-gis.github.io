import ExcelJS from 'exceljs';
import { generateHydrologySnapshot, SnapshotParams } from './snapshotGenerator';
import { populateStormwaterDprWorkbook } from '../utils/stormwaterDprBuilder';
import { DprProjectMetadata } from '../utils/dprExcelBase';

/**
 * Builds the 5-Worksheet Cross-Drainage (CD) Structure DPR Excel Package
 * compliant with IRC:SP:13-2022, IRC:SP:42-2014, IRC:78-2014, and IS 458:2021.
 *
 * Worksheets:
 * 1. 00_Codal_Constants (Lookup tables: P, Cd, Cy, Inglis, Lacey Ksf, limits)
 * 2. 01_CD_Executive_Summary (Catchment params, KPI scorecard, embedded 70% snapshot)
 * 3. 02_Hydrology_Worked_Calcs (IRC:SP:13 worked steps 1.1-1.6 with live formulas)
 * 4. 03_Culvert_Hydraulics_Scour (IRC:SP:13 / IRC:78 worked culvert & scour with live formulas)
 * 5. 04_Catchment_Hypsometry (Elevation-area distribution & main stream coordinates)
 */
export async function createHydrologyExcelWorkbook(
  reportData: SnapshotParams,
  snapshotBuffer?: Buffer,
  metadata?: DprProjectMetadata
): Promise<Buffer> {
  let imgBuffer = snapshotBuffer;
  if (!imgBuffer) {
    const snap = await generateHydrologySnapshot(reportData);
    imgBuffer = snap.buffer;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tensora GIS — Indian Codal DPR Engine (IRC:SP:13 / IRC:78)';
  workbook.created = new Date();

  await populateStormwaterDprWorkbook(workbook, reportData, imgBuffer, metadata);

  const outBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(outBuffer as ArrayBuffer);
}
