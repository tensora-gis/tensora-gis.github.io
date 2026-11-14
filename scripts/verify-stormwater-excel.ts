/**
 * Automated Verification Script for Stormwater Cross-Drainage DPR Excel Export
 * Compliant with IRC:SP:13-2022, IRC:SP:42-2014, IRC:78-2014, and IS 458:2021.
 *
 * Asserts:
 * 1. 70%-framed North-up Catchment Snapshot Generation
 * 2. 5-Worksheet Cross-Drainage DPR Package (Server-side & Client-side parity):
 *    - 00_Codal_Constants (Lookup tables: P, Cd, Cy, Inglis, Lacey Ksf, limits)
 *    - 01_CD_Executive_Summary (Catchment params, KPI scorecard, embedded 70% snapshot)
 *    - 02_Hydrology_Worked_Calcs (IRC:SP:13 Steps 1.1-1.6 with live formulas & CONCAT substitutions)
 *    - 03_Culvert_Hydraulics_Scour (IRC:SP:13 / IRC:78 Steps 2.1-2.4 with live formulas)
 *    - 04_Catchment_Hypsometry (Elevation-area distribution & longitudinal stream coordinates)
 * 3. Live Excel formulas evaluate without #REF! or #NAME?
 * 4. Conditional formatting on Compliance Status columns
 */
import ExcelJS from 'exceljs';
import { generateHydrologySnapshot, SnapshotParams } from '../src/server/snapshotGenerator';
import { createHydrologyExcelWorkbook } from '../src/server/excelGenerator';
import { buildClientHydrologyWorkbook } from '../src/utils/exportUtils';
import { HydrologyReport } from '../src/types/hydrology';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.error(`  FAIL: ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

function verifyFormulaIntegrity(ws: ExcelJS.Worksheet): { formulaCount: number; refErrors: number; nameErrors: number } {
  let formulaCount = 0;
  let refErrors = 0;
  let nameErrors = 0;

  ws.eachRow((row) => {
    row.eachCell((cell) => {
      const val = cell.value;
      if (val && typeof val === 'object' && 'formula' in val) {
        formulaCount++;
        const f = String(val.formula);
        if (f.includes('#REF!')) {
          console.error(`    [${ws.name}] #REF! error at ${cell.address}: ${f}`);
          refErrors++;
        }
        if (f.includes('#NAME?')) {
          console.error(`    [${ws.name}] #NAME? error at ${cell.address}: ${f}`);
          nameErrors++;
        }
        if (val.result !== undefined) {
          const r = String(val.result);
          if (r.includes('#REF!')) refErrors++;
          if (r.includes('#NAME?')) nameErrors++;
        }
      }
    });
  });

  return { formulaCount, refErrors, nameErrors };
}

async function runVerification() {
  console.log('--- 1. Testing Server-side Snapshot Generation (70% framing, North-up) ---');

  const samplePolygon: [number, number][] = [
    [24.9462, 86.6008],
    [24.9475, 86.6025],
    [24.9482, 86.6050],
    [24.9468, 86.6065],
    [24.9450, 86.6045],
    [24.9442, 86.6020],
    [24.9462, 86.6008],
  ];

  const sampleStream: [number, number][] = [
    [24.9480, 86.6048],
    [24.9472, 86.6035],
    [24.9462, 86.6015],
    [24.946267, 86.600858],
  ];

  const sampleTracks: [number, number][][] = [
    [
      [24.9440, 86.5980],
      [24.9455, 86.6000],
      [24.946267, 86.600858],
      [24.9475, 86.6025],
      [24.9490, 86.6045],
    ],
  ];

  const sampleStations = [
    { id: '1', chainage: 36900, formatted: '36900.000', lat: 24.9440, lng: 86.5980, dmsLat: '', dmsLng: '', distanceFromStartM: 0 },
    { id: '2', chainage: 37000, formatted: '37000.000', lat: 24.9455, lng: 86.6000, dmsLat: '', dmsLng: '', distanceFromStartM: 100 },
    { id: '3', chainage: 37100, formatted: '37100.000', lat: 24.946267, lng: 86.600858, dmsLat: '', dmsLng: '', distanceFromStartM: 200 },
    { id: '4', chainage: 37200, formatted: '37200.000', lat: 24.9475, lng: 86.6025, dmsLat: '', dmsLng: '', distanceFromStartM: 300 },
    { id: '5', chainage: 37300, formatted: '37300.000', lat: 24.9490, lng: 86.6045, dmsLat: '', dmsLng: '', distanceFromStartM: 400 },
  ];

  const snapshotParams: SnapshotParams = {
    targetChainageFormatted: '37+100',
    targetChainage: 37100,
    latitudeDMS: `24°56'46.56"N`,
    longitudeDMS: `86°36'3.09"E`,
    latitudeDD: 24.946267,
    longitudeDD: 86.600858,
    catchmentAreaKm2: 0.045,
    lengthOfStreamKm: 0.753,
    levelStreamOriginM: 109,
    highestContourM: 117,
    elevationDropM: 8,
    scopeAppliedM: 500,
    scopeExpandedDueToFlatRelief: false,
    reliefWithinScopeM: 12,
    meetsReliefThreshold: true,
    elevationSource: 'FABDEM (Copernicus GLO-30)',
    elevationOriginKind: 'dem',
    demCoverage: 1.0,
    catchmentPolygon: samplePolygon,
    streamCoordinates: sampleStream,
    allTracks: sampleTracks,
    chainages: sampleStations,
  };

  const snap = await generateHydrologySnapshot(snapshotParams);
  check('Snapshot generated buffer', snap.buffer && snap.buffer.length > 5000, `Buffer size: ${snap.buffer.length}`);
  check('Snapshot returned dataUrl', typeof snap.dataUrl === 'string' && snap.dataUrl.startsWith('data:image/png'));
  check('Snapshot dimensions', snap.width === 1200 && snap.height === 820);

  console.log('\n--- 2. Testing Server 5-Worksheet Cross-Drainage DPR Workbook Generation ---');
  const excelBuf = await createHydrologyExcelWorkbook(snapshotParams, snap.buffer);
  check('Excel workbook created', excelBuf && excelBuf.length > 5000, `Excel size: ${excelBuf.length}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(excelBuf as never);

  check('Server workbook has exactly 5 worksheets', wb.worksheets.length === 5, `Sheets count: ${wb.worksheets.length}`);

  const expectedSheets = [
    '00_Codal_Constants',
    '01_CD_Executive_Summary',
    '02_Hydrology_Worked_Calcs',
    '03_Culvert_Hydraulics_Scour',
    '04_Catchment_Hypsometry',
  ];

  for (let i = 0; i < expectedSheets.length; i++) {
    const sName = expectedSheets[i];
    const ws = wb.worksheets[i];
    check(`Sheet ${i + 1} is '${sName}'`, ws && ws.name === sName, `Actual: ${ws?.name}`);
  }

  // --- Verify Sheet 1: 00_Codal_Constants ---
  console.log('\n--- Verifying Sheet 00_Codal_Constants ---');
  const ws00 = wb.getWorksheet('00_Codal_Constants')!;
  check('00_Codal_Constants exists', !!ws00);
  check('Runoff Coeff P (Cultivated) = 0.50 at C11', ws00.getCell('C11').value === 0.5);
  check('Dickens Cd (Central/Hilly) = 16.75 at C17', ws00.getCell('C17').value === 16.75);
  check('Ryves Cy (25-160km) = 8.50 at C20', ws00.getCell('C20').value === 8.5);
  check('Lacey Silt Factor Ksf (Medium Sand) = 1.00 at C27', ws00.getCell('C27').value === 1.0);
  check('Min velocity = 0.60 m/s at C34', ws00.getCell('C34').value === 0.6);
  check('Max velocity = 3.00 m/s at C35', ws00.getCell('C35').value === 3.0);
  check('Max afflux ha = 0.30 m at C36', ws00.getCell('C36').value === 0.3);
  check('Max HW/D ratio = 1.20 at C37', ws00.getCell('C37').value === 1.2);
  check('Max scour factor = 2.00 at C39', ws00.getCell('C39').value === 2.0);
  check('Areal spread factor f = 1.00 at C40', ws00.getCell('C40').value === 1.0);

  // --- Verify Sheet 2: 01_CD_Executive_Summary ---
  console.log('\n--- Verifying Sheet 01_CD_Executive_Summary ---');
  const ws01 = wb.getWorksheet('01_CD_Executive_Summary')!;
  check('01_CD_Executive_Summary exists', !!ws01);

  // Rows 9 to 16 contain the geographic parameters
  check('Row 9 is LATITUDE :', ws01.getCell('A9').value === 'LATITUDE :' && ws01.getCell('B9').value === `24°56'46.56"N`);
  check('Row 10 is LONGITUDE :', ws01.getCell('A10').value === 'LONGITUDE :' && ws01.getCell('B10').value === `86°36'3.09"E`);
  check('Row 11 is CATCHMENT AREA (A):', ws01.getCell('A11').value === 'CATCHMENT AREA (A):' && ws01.getCell('B11').value === 0.045 && ws01.getCell('C11').value === 'km2');
  check('Row 12 is LENGTH OF STREAM (L):', ws01.getCell('A12').value === 'LENGTH OF STREAM (L):' && ws01.getCell('B12').value === 0.753 && ws01.getCell('C12').value === 'km');
  check('Row 13 is LEVEL STREAM ORIGIN:', ws01.getCell('A13').value === 'LEVEL STREAM ORIGIN:' && ws01.getCell('B13').value === 109 && ws01.getCell('C13').value === 'm');
  check('Row 14 is HIGHEST CONTOUR:', ws01.getCell('A14').value === 'HIGHEST CONTOUR:' && ws01.getCell('B14').value === 117 && ws01.getCell('C14').value === 'm');
  check('Row 15 is ELEVATION DROP (Δh):', ws01.getCell('A15').value === 'ELEVATION DROP (Δh):' && ws01.getCell('B15').value === 8 && ws01.getCell('C15').value === 'm');
  check('Row 16 is TARGET CHAINAGE:', ws01.getCell('A16').value === 'TARGET CHAINAGE:' && ws01.getCell('B16').value === '37+100');

  // Verify KPI Scorecard rows (Rows 26-35)
  const qDesignCell = ws01.getCell('C26').value as any;
  check('KPI Q_design formula links to 02_Hydrology_Worked_Calcs', qDesignCell && typeof qDesignCell.formula === 'string' && qDesignCell.formula.includes('02_Hydrology_Worked_Calcs'));

  const wCell = ws01.getCell('C27').value as any;
  check('KPI Lacey waterway W links to 03_Culvert_Hydraulics_Scour', wCell && typeof wCell.formula === 'string' && wCell.formula.includes('03_Culvert_Hydraulics_Scour'));

  const vCell = ws01.getCell('C30').value as any;
  check('KPI Barrel Velocity V links to 03_Culvert_Hydraulics_Scour', vCell && typeof vCell.formula === 'string' && vCell.formula.includes('03_Culvert_Hydraulics_Scour'));

  const haCell = ws01.getCell('C31').value as any;
  check('KPI Afflux ha links to 03_Culvert_Hydraulics_Scour', haCell && typeof haCell.formula === 'string' && haCell.formula.includes('03_Culvert_Hydraulics_Scour'));

  const dmaxCell = ws01.getCell('C34').value as any;
  check('KPI Scour d_max links to 03_Culvert_Hydraulics_Scour', dmaxCell && typeof dmaxCell.formula === 'string' && dmaxCell.formula.includes('03_Culvert_Hydraulics_Scour'));

  // Embedded snapshot image in executive summary
  const summaryImages = ws01.getImages();
  check('01_CD_Executive_Summary contains embedded snapshot image', summaryImages.length > 0, `Image count: ${summaryImages.length}`);
  if (summaryImages.length > 0) {
    const imgInfo = summaryImages[0];
    check('Embedded snapshot image positioned below KPI table (row >= 30)', (imgInfo.range.tl.row as number) >= 30);
  }

  // --- Verify Sheet 3: 02_Hydrology_Worked_Calcs ---
  console.log('\n--- Verifying Sheet 02_Hydrology_Worked_Calcs ---');
  const ws02 = wb.getWorksheet('02_Hydrology_Worked_Calcs')!;
  check('02_Hydrology_Worked_Calcs exists', !!ws02);

  const f02 = verifyFormulaIntegrity(ws02);
  check('Sheet 02 has live formulas', f02.formulaCount >= 10, `Formulas: ${f02.formulaCount}`);
  check('Sheet 02 has 0 #REF! errors', f02.refErrors === 0, `Errors: ${f02.refErrors}`);
  check('Sheet 02 has 0 #NAME? errors', f02.nameErrors === 0, `Errors: ${f02.nameErrors}`);

  // Step 1.1: ΔH (Row 23)
  const step11_sub = ws02.getCell('D23').value as any;
  const step11_val = ws02.getCell('E23').value as any;
  const step11_stat = ws02.getCell('I23').value as any;
  check('Step 1.1 ΔH substitution uses CONCAT', step11_sub && String(step11_sub.formula).startsWith('CONCAT'));
  check('Step 1.1 ΔH formula is D9-D10', step11_val && step11_val.formula === 'D9-D10');
  check('Step 1.1 ΔH evaluated result is 8.00 m', step11_val && Number(step11_val.result) === 8);
  check('Step 1.1 compliance formula uses IF', step11_stat && String(step11_stat.formula).startsWith('IF'));

  // Step 1.2: tc (Row 24)
  const step12_val = ws02.getCell('E24').value as any;
  check('Step 1.2 tc formula matches Kirpich IRC formula', step12_val && String(step12_val.formula).includes('0.87*POWER'));
  check('Step 1.2 tc evaluated result is positive number', step12_val && Number(step12_val.result) > 0);

  // Step 1.3: Ic (Row 25)
  const step13_val = ws02.getCell('E25').value as any;
  check('Step 1.3 Ic formula matches IRC Cl. 4.4.3', step13_val && String(step13_val.formula).includes('(D14/D15)'));
  check('Step 1.3 Ic evaluated result is positive number', step13_val && Number(step13_val.result) > 0);

  // Step 1.4: Qr (Row 26)
  const step14_val = ws02.getCell('E26').value as any;
  check('Step 1.4 Qr formula matches Rational formula 0.028*...', step14_val && String(step14_val.formula).includes('0.028*'));
  check('Step 1.4 Qr evaluated result is positive number', step14_val && Number(step14_val.result) > 0);

  // Step 1.5a/b/c: Empirical flood envelopes (Rows 27-29)
  const step15a_val = ws02.getCell('E27').value as any;
  const step15b_val = ws02.getCell('E28').value as any;
  const step15c_val = ws02.getCell('E29').value as any;
  check('Step 1.5a Dickens formula uses POWER(D12,0.75)', step15a_val && String(step15a_val.formula).includes('0.75'));
  check('Step 1.5b Ryves formula uses POWER(D12,2/3)', step15b_val && String(step15b_val.formula).includes('2/3'));
  check('Step 1.5c Inglis formula uses SQRT(D12+10.4)', step15c_val && String(step15c_val.formula).includes('SQRT(D12+10.4)'));

  // Step 1.6: Governing Q_design (Row 30)
  const step16_val = ws02.getCell('E30').value as any;
  const step16_stat = ws02.getCell('I30').value as any;
  check('Step 1.6 Q_design formula uses MAX(E26,E27,E28)', step16_val && step16_val.formula === 'MAX(E26,E27,E28)');
  check('Step 1.6 compliance checks empirical vs Rational 1.5x envelope', step16_stat && String(step16_stat.formula).includes('1.5*E26'));

  // Conditional formatting on sheet 02
  check('Sheet 02 has conditional formatting rules', ((ws02 as any).conditionalFormattings?.length ?? 0) > 0);

  // --- Verify Sheet 4: 03_Culvert_Hydraulics_Scour ---
  console.log('\n--- Verifying Sheet 03_Culvert_Hydraulics_Scour ---');
  const ws03 = wb.getWorksheet('03_Culvert_Hydraulics_Scour')!;
  check('03_Culvert_Hydraulics_Scour exists', !!ws03);

  const f03 = verifyFormulaIntegrity(ws03);
  check('Sheet 03 has live formulas', f03.formulaCount >= 10, `Formulas: ${f03.formulaCount}`);
  check('Sheet 03 has 0 #REF! errors', f03.refErrors === 0, `Errors: ${f03.refErrors}`);
  check('Sheet 03 has 0 #NAME? errors', f03.nameErrors === 0, `Errors: ${f03.nameErrors}`);

  // Step 2.1: Lacey Waterway W (Row 19)
  const step21_val = ws03.getCell('E19').value as any;
  check('Step 2.1 Lacey Waterway formula is 4.825*SQRT(D15)', step21_val && step21_val.formula === '4.825*SQRT(D15)');
  check('Step 2.1 Lacey Waterway evaluated result is positive number', step21_val && Number(step21_val.result) > 0);

  // Step 2.2a: Aw (Row 20)
  const step22a_val = ws03.getCell('E20').value as any;
  check('Step 2.2a Barrel area formula is PI()*POWER(D10/2,2)', step22a_val && step22a_val.formula === 'PI()*POWER(D10/2,2)');

  // Step 2.2b: Q_full (Row 21)
  const step22b_val = ws03.getCell('E21').value as any;
  check('Step 2.2b Manning capacity formula is live', step22b_val && String(step22b_val.formula).includes('POWER(D10/4,2/3)'));

  // Step 2.2c: Velocity V (Row 22)
  const step22c_val = ws03.getCell('E22').value as any;
  const step22c_stat = ws03.getCell('I22').value as any;
  check('Step 2.2c Barrel velocity formula is D15/(D9*E20)', step22c_val && step22c_val.formula === 'D15/(D9*E20)');
  check('Step 2.2c velocity compliance checks 0.60 to 3.00 m/s range', step22c_stat && String(step22c_stat.formula).includes("'00_Codal_Constants'!C34"));

  // Step 2.3a: Afflux ha (Row 23)
  const step23a_val = ws03.getCell('E23').value as any;
  const step23a_stat = ws03.getCell('I23').value as any;
  check('Step 2.3a Afflux formula uses V^2 / 19.62', step23a_val && String(step23a_val.formula).includes('POWER(E22,2)/19.62'));
  check('Step 2.3a Afflux compliance checks ha <= 0.30 m', step23a_stat && String(step23a_stat.formula).includes("'00_Codal_Constants'!C36"));

  // Step 2.3b: HW/D (Row 24)
  const step23b_val = ws03.getCell('E24').value as any;
  const step23b_stat = ws03.getCell('I24').value as any;
  check('Step 2.3b HW/D ratio formula is (D10+E23)/D10', step23b_val && step23b_val.formula === '(D10+E23)/D10');
  check('Step 2.3b HW/D compliance checks HW/D <= 1.20', step23b_stat && String(step23b_stat.formula).includes("'00_Codal_Constants'!C37"));

  // Step 2.4a/b: Scour dsm and dmax (Rows 25-26)
  const step24a_val = ws03.getCell('E25').value as any;
  const step24b_val = ws03.getCell('E26').value as any;
  check('Step 2.4a Regime scour dsm formula uses 1.34*POWER(...)', step24a_val && String(step24a_val.formula).includes('1.34*POWER'));
  check('Step 2.4b Max scour dmax formula multiplies dsm by codal factor', step24b_val && String(step24b_val.formula).includes('E25'));

  // Conditional formatting on sheet 03
  check('Sheet 03 has conditional formatting rules', ((ws03 as any).conditionalFormattings?.length ?? 0) > 0);

  // --- Verify Sheet 5: 04_Catchment_Hypsometry ---
  console.log('\n--- Verifying Sheet 04_Catchment_Hypsometry ---');
  const ws04 = wb.getWorksheet('04_Catchment_Hypsometry')!;
  check('04_Catchment_Hypsometry exists', !!ws04);
  check('Sheet 04 contains at least 25 rows of hypsometric & profile data', ws04.rowCount >= 25, `RowCount: ${ws04.rowCount}`);
  check('Sheet 04 Row 9 is Band 1 hypsometry', ws04.getCell('A9').value === 'Band 1');

  // --- Client-side Workbook Generation Parity ---
  console.log('\n--- 3. Testing Client-side Workbook Generation with Snapshot Parity ---');
  const sampleReport: HydrologyReport = {
    targetChainage: 37100,
    targetChainageFormatted: '37+100',
    latitudeDMS: `24°56'46.56"N`,
    longitudeDMS: `86°36'3.09"E`,
    latitudeDD: 24.946267,
    longitudeDD: 86.600858,
    catchmentAreaKm2: 0.045,
    lengthOfStreamKm: 0.753,
    levelStreamOriginM: 109,
    highestContourM: 117,
    elevationDropM: 8,
    scopeAppliedM: 500,
    scopeExpandedDueToFlatRelief: false,
    reliefWithinScopeM: 12,
    meetsReliefThreshold: true,
    streamCoordinates: sampleStream,
    catchmentPolygon: samplePolygon,
    elevationSource: 'FABDEM (Copernicus GLO-30)',
    elevationOriginKind: 'dem',
    demCoverage: 1.0,
    contributingCells: 154,
    flowArrivesAtCrossing: true,
    flowArrivalBearingDeg: 35,
    streamHeadElevationM: 117,
    headDistanceM: 753,
    headCoordinates: [24.9480, 86.6048],
    analysisCellSizeM: 10,
    streamSlopePercent: 1.06,
    timeOfConcentrationHours: 0.35,
    flowDirectionDeg: 0,
    processedTimestamp: new Date().toISOString(),
  };

  const clientBlob = await buildClientHydrologyWorkbook(
    sampleReport,
    {
      name: 'Alignment',
      coordinates: sampleTracks[0],
      chainages: sampleStations,
      totalLengthM: 400,
      startChainage: 36900,
      endChainage: 37300,
    },
    snap.dataUrl
  );
  check('Client workbook blob generated', clientBlob && clientBlob.size > 5000, `Blob size: ${clientBlob.size}`);

  const clientBuf = Buffer.from(await clientBlob.arrayBuffer());
  const clientWb = new ExcelJS.Workbook();
  await clientWb.xlsx.load(clientBuf as never);

  check('Client workbook has exactly 5 worksheets', clientWb.worksheets.length === 5, `Sheets count: ${clientWb.worksheets.length}`);

  for (let i = 0; i < expectedSheets.length; i++) {
    const sName = expectedSheets[i];
    const cWs = clientWb.worksheets[i];
    check(`Client Sheet ${i + 1} is '${sName}'`, cWs && cWs.name === sName);
  }

  const clientExecSummary = clientWb.getWorksheet('01_CD_Executive_Summary')!;
  check('Client 01_CD_Executive_Summary exists', !!clientExecSummary);
  check('Client summary sheet has embedded snapshot image', clientExecSummary.getImages().length > 0, `Image count: ${clientExecSummary.getImages().length}`);

  check('Client Row 9 is LATITUDE :', clientExecSummary.getCell('A9').value === 'LATITUDE :' && clientExecSummary.getCell('B9').value === `24°56'46.56"N`);
  check('Client Row 11 is CATCHMENT AREA (A):', clientExecSummary.getCell('A11').value === 'CATCHMENT AREA (A):' && clientExecSummary.getCell('B11').value === 0.045 && clientExecSummary.getCell('C11').value === 'km2');

  const clientWs02 = clientWb.getWorksheet('02_Hydrology_Worked_Calcs')!;
  const cF02 = verifyFormulaIntegrity(clientWs02);
  check('Client Sheet 02 has 0 #REF! errors', cF02.refErrors === 0);
  check('Client Sheet 02 has 0 #NAME? errors', cF02.nameErrors === 0);

  const clientWs03 = clientWb.getWorksheet('03_Culvert_Hydraulics_Scour')!;
  const cF03 = verifyFormulaIntegrity(clientWs03);
  check('Client Sheet 03 has 0 #REF! errors', cF03.refErrors === 0);
  check('Client Sheet 03 has 0 #NAME? errors', cF03.nameErrors === 0);

  console.log('\n--- 4. Testing International (FHWA HDS-5 / AASHTO) Standards Parity ---');

  const intlBuf = await createHydrologyExcelWorkbook(
    snapshotParams,
    Buffer.from(snap.dataUrl.split(',')[1], 'base64'),
    { designStandard: 'INTERNATIONAL' }
  );
  check('International Excel workbook generated', !!intlBuf && intlBuf.length > 5000);

  const intlWb = new ExcelJS.Workbook();
  await intlWb.xlsx.load(intlBuf as never);

  const intlWs00 = intlWb.getWorksheet('00_Codal_Constants')!;
  check('Intl 00_Codal_Constants exists', !!intlWs00);
  check('Intl Sheet 00 C11 is Runoff Coeff C (0.50)', intlWs00.getCell('C11').value === 0.5);
  check('Intl Sheet 00 C17 is USGS Regional a (18.50)', intlWs00.getCell('C17').value === 18.5);
  check('Intl Sheet 00 C20 is USGS Exponent b (0.68)', intlWs00.getCell('C20').value === 0.68);
  check('Intl Sheet 00 C34 is Min Velocity (0.90 m/s)', intlWs00.getCell('C34').value === 0.9);
  check('Intl Sheet 00 C35 is Max Velocity (4.50 m/s)', intlWs00.getCell('C35').value === 4.5);
  check('Intl Sheet 00 C36 is Max Backwater ha (0.15 m)', intlWs00.getCell('C36').value === 0.15);
  check('Intl Sheet 00 C37 is Max HW/D ratio (1.50)', intlWs00.getCell('C37').value === 1.5);

  const intlWs01 = intlWb.getWorksheet('01_CD_Executive_Summary')!;
  check('Intl 01_CD_Executive_Summary exists', !!intlWs01);
  const intlTitle = String(intlWs01.getCell('A1').value);
  check('Intl Project Title references FHWA/AASHTO', intlTitle.includes('FHWA') || intlTitle.includes('AASHTO'), intlTitle);

  const intlWs02 = intlWb.getWorksheet('02_Hydrology_Worked_Calcs')!;
  check('Intl 02_Hydrology_Worked_Calcs exists', !!intlWs02);
  const intlF02 = verifyFormulaIntegrity(intlWs02);
  check('Intl Sheet 02 has 0 #REF! errors', intlF02.refErrors === 0);
  check('Intl Sheet 02 has 0 #NAME? errors', intlF02.nameErrors === 0);
  const step14Formula = String((intlWs02.getCell('E26').value as { formula?: string })?.formula || '');
  check('Intl Step 1.4 uses AASHTO 0.00278 factor', step14Formula.includes('0.00278'), step14Formula);

  const intlWs03 = intlWb.getWorksheet('03_Culvert_Hydraulics_Scour')!;
  check('Intl 03_Culvert_Hydraulics_Scour exists', !!intlWs03);
  const intlF03 = verifyFormulaIntegrity(intlWs03);
  check('Intl Sheet 03 has 0 #REF! errors', intlF03.refErrors === 0);
  check('Intl Sheet 03 has 0 #NAME? errors', intlF03.nameErrors === 0);
  const step21Formula = String((intlWs03.getCell('E19').value as { formula?: string })?.formula || '');
  check('Intl Step 2.1 uses FHWA 3.65 waterway multiplier', step21Formula.includes('3.65'), step21Formula);

  // Client-side international workbook generation
  const clientIntlBlob = await buildClientHydrologyWorkbook(
    sampleReport,
    {
      name: 'Alignment',
      coordinates: sampleTracks[0],
      chainages: sampleStations,
      totalLengthM: 400,
      startChainage: 36900,
      endChainage: 37300,
    },
    snap.dataUrl,
    { designStandard: 'INTERNATIONAL' }
  );
  check('Client Intl workbook generated', clientIntlBlob && clientIntlBlob.size > 5000);

  const clientIntlBuf = Buffer.from(await clientIntlBlob.arrayBuffer());
  const clientIntlWb = new ExcelJS.Workbook();
  await clientIntlWb.xlsx.load(clientIntlBuf as never);

  const cIntlWs02 = clientIntlWb.getWorksheet('02_Hydrology_Worked_Calcs')!;
  const cIntlF02 = verifyFormulaIntegrity(cIntlWs02);
  check('Client Intl Sheet 02 has 0 #REF! errors', cIntlF02.refErrors === 0);
  check('Client Intl Sheet 02 has 0 #NAME? errors', cIntlF02.nameErrors === 0);

  const cIntlWs03 = clientIntlWb.getWorksheet('03_Culvert_Hydraulics_Scour')!;
  const cIntlF03 = verifyFormulaIntegrity(cIntlWs03);
  check('Client Intl Sheet 03 has 0 #REF! errors', cIntlF03.refErrors === 0);
  check('Client Intl Sheet 03 has 0 #NAME? errors', cIntlF03.nameErrors === 0);

  console.log(`\n========================================`);
  console.log(`  VERIFICATION RESULT: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runVerification().catch((e) => {
  console.error('Fatal error during verification:', e);
  process.exit(1);
});
