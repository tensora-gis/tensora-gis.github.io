/**
 * Automated Verification Script for Stormwater Modelling Excel Export & Snapshot Framing
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

  console.log('\n--- 2. Testing Server Excel Workbook Generation ---');
  const excelBuf = await createHydrologyExcelWorkbook(snapshotParams, snap.buffer);
  check('Excel workbook created', excelBuf && excelBuf.length > 5000, `Excel size: ${excelBuf.length}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(excelBuf as never);

  const summarySheet = wb.worksheets[0];
  check('Sheet 1 exists and is named after chainage', summarySheet.name.includes('37+100'));

  // Verify headline rows in Sheet 1:
  // Row 1: LATITUDE : | 24°56'46.56"N
  // Row 2: LONGITUDE : | 86°36'3.09"E
  // Row 3: CATCHMENT AREA (A): | 0.045 | km2
  // Row 4: LENGTH OF STREAM (L): | 0.753 | km
  // Row 5: LEVEL STREAM ORIGIN: | 109 | m
  // Row 6: HIGHEST CONTOUR: | 117 | m
  const row1 = summarySheet.getRow(1);
  const row2 = summarySheet.getRow(2);
  const row3 = summarySheet.getRow(3);
  const row4 = summarySheet.getRow(4);
  const row5 = summarySheet.getRow(5);
  const row6 = summarySheet.getRow(6);

  check('Row 1 is LATITUDE :', row1.getCell(1).value === 'LATITUDE :' && row1.getCell(2).value === `24°56'46.56"N`);
  check('Row 2 is LONGITUDE :', row2.getCell(1).value === 'LONGITUDE :' && row2.getCell(2).value === `86°36'3.09"E`);
  check('Row 3 is CATCHMENT AREA (A):', row3.getCell(1).value === 'CATCHMENT AREA (A):' && row3.getCell(2).value === 0.045 && row3.getCell(3).value === 'km2');
  check('Row 4 is LENGTH OF STREAM (L):', row4.getCell(1).value === 'LENGTH OF STREAM (L):' && row4.getCell(2).value === 0.753 && row4.getCell(3).value === 'km');
  check('Row 5 is LEVEL STREAM ORIGIN:', row5.getCell(1).value === 'LEVEL STREAM ORIGIN:' && row5.getCell(2).value === 109 && row5.getCell(3).value === 'm');
  check('Row 6 is HIGHEST CONTOUR:', row6.getCell(1).value === 'HIGHEST CONTOUR:' && row6.getCell(2).value === 117 && row6.getCell(3).value === 'm');

  // Verify secondary rows
  const row8 = summarySheet.getRow(8);
  const row9 = summarySheet.getRow(9);
  check('Row 8 is ELEVATION DROP (Δh):', row8.getCell(1).value === 'ELEVATION DROP (Δh):' && row8.getCell(2).value === 8 && row8.getCell(3).value === 'm');
  check('Row 9 is TARGET CHAINAGE:', row9.getCell(1).value === 'TARGET CHAINAGE:' && row9.getCell(2).value === '37+100');

  // Verify embedded screenshot in summary sheet
  const images = summarySheet.getImages();
  check('Summary sheet contains embedded snapshot image', images.length > 0, `Image count: ${images.length}`);
  if (images.length > 0) {
    const imgInfo = images[0];
    console.log(`        Embedded image range: col=${imgInfo.range.tl.col}, row=${imgInfo.range.tl.row}`);
    check('Embedded image is positioned below table', (imgInfo.range.tl.row as number) >= 15);
  }

  // Verify Sheet 2 and Sheet 3
  const regSheet = wb.getWorksheet('Chainage_Register');
  const bndSheet = wb.getWorksheet('Catchment_Boundary');
  check('Chainage_Register sheet exists', !!regSheet && regSheet.rowCount >= 6);
  check('Catchment_Boundary sheet exists', !!bndSheet && bndSheet.rowCount >= samplePolygon.length);

  console.log('\n--- 3. Testing Client-side Workbook Generation with Snapshot ---');
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

  const clientSummary = clientWb.worksheets[0];
  check('Client workbook summary sheet exists', clientSummary.name.includes('37+100'));
  const clientImages = clientSummary.getImages();
  check('Client summary sheet has embedded snapshot image', clientImages.length > 0, `Image count: ${clientImages.length}`);

  const cRow1 = clientSummary.getRow(1);
  const cRow3 = clientSummary.getRow(3);
  check('Client Row 1 matches exact requested format', cRow1.getCell(1).value === 'LATITUDE :' && cRow1.getCell(2).value === `24°56'46.56"N`);
  check('Client Row 3 matches exact requested format', cRow3.getCell(1).value === 'CATCHMENT AREA (A):' && cRow3.getCell(2).value === 0.045 && cRow3.getCell(3).value === 'km2');

  console.log(`\n========================================`);
  console.log(`  VERIFICATION RESULT: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runVerification().catch((e) => {
  console.error('Fatal error during verification:', e);
  process.exit(1);
});
