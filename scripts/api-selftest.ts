/**
 * End-to-end check against a locally running server.
 *   npx tsx scripts/api-selftest.ts
 * Requires `npm run dev` (or `npx tsx server.ts`) to be listening on :3000.
 */
import { delineateCatchment } from '../src/utils/delineationEngine';
import { buildSnapshotPayload } from '../src/utils/exportUtils';
import { generateGoogleEarthKML } from '../src/utils/exportUtils';
import ExcelJS from 'exceljs';
import { DOMParser } from '@xmldom/xmldom';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

console.log('\n[1] Health');
{
  const r = await fetch(`${BASE}/api/health`);
  check('GET /api/health returns ok', r.ok && (await r.json()).status === 'ok');
}

console.log('\n[2] Real delineation');
const outcome = await delineateCatchment({
  targetChainage: 69340,
  lat: 25.5788,
  lng: 91.8933,
  corridorBearing: 45,
});
if (!outcome.report) {
  check('delineation produced a report', false, outcome.failure?.message ?? 'no outcome');
  process.exit(1);
}
const report = outcome.report!;
console.log(
  `        area=${report.catchmentAreaKm2} km²  L=${report.lengthOfStreamKm} km  ` +
    `origin=${report.levelStreamOriginM} m  highest=${report.highestContourM} m  ` +
    `Δh=${report.elevationDropM} m  scope=${report.scopeAppliedM} m  ` +
    `cells=${report.contributingCells}  coverage=${(report.demCoverage * 100).toFixed(0)}%`
);
console.log(`        source="${report.elevationSource}"`);
check('report has a catchment area', report.catchmentAreaKm2 > 0);
check('report has a stream length', report.lengthOfStreamKm > 0);
check(
  'report names a real elevation provider',
  /Copernicus|SRTM|Open-Elevation/i.test(report.elevationSource),
  report.elevationSource
);
check('report has a drawn catchment ring', report.catchmentPolygon.length >= 8);
check('report has a drawn channel', report.streamCoordinates.length >= 2);
check(
  'DMS coordinates are well formed',
  /^\d+°\d{2}'\d{2}\.\d{2}"[NS]$/.test(report.latitudeDMS) &&
    /^\d+°\d{2}'\d{2}\.\d{2}"[EW]$/.test(report.longitudeDMS),
  `${report.latitudeDMS} ${report.longitudeDMS}`
);

const payload = buildSnapshotPayload(report);

console.log('\n[3] KML export');
{
  const kml = generateGoogleEarthKML(report);
  const doc = new DOMParser().parseFromString(kml, 'text/xml') as any;
  const errors = doc.getElementsByTagName('parsererror');
  check('KML parses as valid XML', errors.length === 0, errors[0]?.textContent?.slice(0, 120));

  const names = Array.from(doc.getElementsByTagName('name')).map((n: any) => n.textContent);
  check('KML contains the placemark', names.some((n: string) => /Untitled Placemark/.test(n)));
  check('KML contains a LineString for the stream', doc.getElementsByTagName('LineString').length > 0);
  check('KML contains a Polygon for the catchment', doc.getElementsByTagName('Polygon').length > 0);

  // KML colours are aabbggrr: cyan must be a=ff b=ff g=ff r=00.
  const styles = Array.from(doc.getElementsByTagName('Style')).map((s: any) =>
    Array.from(s.getElementsByTagName('color')).map((c: any) => c.textContent)
  );
  const hasCyan = styles.some((cols: string[]) => cols.includes('ffffff00'));
  check('KML cyan outline uses aabbggrr cyan (ffffff00)', hasCyan, JSON.stringify(styles));
  check('KML translucent cyan fill is present', styles.some((c: string[]) => c.includes('66ffff00')));
  check('KML red stream colour is present', styles.some((c: string[]) => c.includes('ff0000ff')));

  // The LinearRing must be explicitly closed.
  const ring = doc.getElementsByTagName('LinearRing')[0];
  const ringCoords = ring?.getElementsByTagName('coordinates')[0]?.textContent?.trim().split(/\s+/) ?? [];
  check(
    'KML polygon ring is closed',
    ringCoords.length > 3 && ringCoords[0] === ringCoords[ringCoords.length - 1],
    `${ringCoords.length} vertices`
  );

  check('KML does not claim Google Earth attribution', !/Google Earth MSL Datum/.test(kml));
  check('KML reports the real elevation source', kml.includes(report.elevationSource));
  check('KML reports the actual scope', kml.includes(`${report.scopeAppliedM} m`));
  check('KML does not assert an unearned ">= 5m" claim', !/≥ 5m|≥5m/.test(kml));
}

console.log('\n[4] POST /api/snapshot');
{
  const r = await fetch(`${BASE}/api/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, width: 800, height: 600 }),
  });
  const data = await r.json();
  check('snapshot request succeeds', r.ok, JSON.stringify(data).slice(0, 160));
  check('snapshot returns a PNG data URL', typeof data.imageDataUrl === 'string' && data.imageDataUrl.startsWith('data:image/png'));
  if (data.imageDataUrl) {
    const bytes = Math.round((data.imageDataUrl.length - 22) * 0.75);
    console.log(`        image ≈ ${(bytes / 1024).toFixed(0)} KB at ${data.width}x${data.height}`);
    check('snapshot image is substantial, not a blank frame', bytes > 20000, `${bytes} bytes`);
  }
}

console.log('\n[5] Snapshot input validation');
{
  /** Requests abort themselves so a slow basemap cannot stall the suite. */
  const postSnapshot = async (body: unknown, timeoutMs = 90000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(`${BASE}/api/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  };

  // (0,0) is a legitimate coordinate and must not be rejected by a falsy check.
  // Strip the Shillong-derived overlays so the payload stays geographically
  // coherent about the origin.
  const {
    tributaryPaths: _t, contours: _c, alignmentCoordinates: _a, allTracks: _al,
    chainages: _ch, ...originRest
  } = payload;
  const originPayload = {
    ...originRest,
    latitudeDD: 0,
    longitudeDD: 0,
    width: 320,
    height: 240,
    streamCoordinates: [[0, 0], [0.0001, 0.0001]],
    catchmentPolygon: [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001]],
  };
  const t0 = Date.now();
  const origin = await postSnapshot(originPayload);
  const originSecs = ((Date.now() - t0) / 1000).toFixed(1);
  check(
    'coordinate (0, 0) is accepted, not treated as missing',
    origin.status !== 400,
    `status=${origin.status} after ${originSecs}s`
  );
  console.log(`        (0,0) snapshot returned ${origin.status} in ${originSecs}s`);

  // A location with no imagery must still render in bounded time.
  check(
    'a snapshot with no usable basemap still returns in bounded time',
    Number(originSecs) < 90,
    `${originSecs}s`
  );

  const bad = await postSnapshot({ ...payload, latitudeDD: 'not-a-number', width: 320, height: 240 });
  check('malformed coordinates are rejected with 400', bad.status === 400, `status=${bad.status}`);

  const missing = await postSnapshot({ targetChainageFormatted: 'x', width: 320, height: 240 });
  check('a payload with no geometry is rejected with 400', missing.status === 400, `status=${missing.status}`);

  const noArray = await postSnapshot({ ...payload, catchmentPolygon: undefined, width: 320, height: 240 });
  check('a payload missing the polygon array is rejected with 400', noArray.status === 400, `status=${noArray.status}`);

  // Geometry belonging to a different site must be rejected, not rendered:
  // this is what previously made the server exhaust its heap.
  const incoherent = await postSnapshot({
    ...payload,
    latitudeDD: 0,
    longitudeDD: 0,
    width: 320,
    height: 240,
    streamCoordinates: [[0, 0], [0.0001, 0.0001]],
    catchmentPolygon: [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001]],
  });
  check(
    'geometry from a different site is rejected with 400',
    incoherent.status === 400,
    `status=${incoherent.status}`
  );

  const nonFinite = await postSnapshot({
    ...payload,
    width: 320,
    height: 240,
    catchmentPolygon: [[NaN, 91.89], [25.58, 91.89]],
  });
  check('non-finite polygon vertices are rejected with 400', nonFinite.status === 400, `status=${nonFinite.status}`);
}

console.log('\n[5b] Snapshot survives a hostile frame extent');
{
  // Even if validation is bypassed, the renderer must not run away. The tile
  // loop used to iterate ~1.25 billion times and OOM the process.
  const wide = {
    ...payload,
    width: 320,
    height: 240,
    catchmentPolygon: [
      [25.5788, 91.8933],
      [25.5797, 91.8933],
      [25.5797, 91.8942],
      [25.5788, 91.8942],
    ],
    streamCoordinates: [
      [25.5788, 91.8933],
      [25.5792, 91.8938],
    ],
    tributaryPaths: [],
    contours: [],
  };
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(wide),
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  check('a wide frame still renders', r.ok, `status=${r.status}`);
  check('a wide frame renders in bounded time', Number(secs) < 90, `${secs}s`);
  console.log(`        wide frame returned ${r.status} in ${secs}s`);
}

console.log('\n[6] POST /api/export-excel');
{
  const r = await fetch(`${BASE}/api/export-excel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const buf = Buffer.from(await r.arrayBuffer());
  check('Excel request succeeds', r.ok, `status=${r.status}`);
  check('Excel response is a .xlsx (ZIP magic PK)', buf.subarray(0, 2).toString() === 'PK');
  check('Excel response has a filename', /Hydrology_Report_CH_/.test(r.headers.get('content-disposition') ?? ''));
  console.log(`        workbook ≈ ${(buf.length / 1024).toFixed(0)} KB`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  const names = wb.worksheets.map((w) => w.name);
  check('workbook has a hydrology summary sheet', names.some((n) => n.startsWith('CH_')), names.join(', '));
  check('workbook contains only the 1st summary sheet', wb.worksheets.length === 1, `sheets=${wb.worksheets.length}`);
  check('Chainage Register sheet is eliminated', !names.includes('Chainage_Register'), names.join(', '));
  check('Catchment Boundary sheet is eliminated', !names.includes('Catchment_Boundary'), names.join(', '));
}

console.log('\n[7] Excel rejects malformed requests');
{
  const r = await fetch(`${BASE}/api/export-excel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitudeDD: 27.2, longitudeDD: 77.8 }),
  });
  check('Excel export rejects a payload with no geometry', r.status === 400, `status=${r.status}`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(60)}\n`);
process.exit(failed === 0 ? 0 : 1);
