/**
 * Engine self-tests.
 *
 * Run with:  npx tsx scripts/engine-selftest.ts
 *
 * These exercise the hydrology engine against (a) an analytically-known
 * synthetic DEM, where the correct answer can be computed by hand, and
 * (b) the live global DEM, to confirm end-to-end behaviour.
 */
import {
  decimalToDMS,
  parseCoordinateInput,
  formatRailwayStationLabel,
  calculatePolygonAreaKm2,
  destinationPoint,
  haversineDistanceM,
} from '../src/utils/geoUtils';
import {
  buildDemGrid,
  demGridSamplePoints,
  applyBulkElevations,
  delineateUpstreamCatchment,
  DemUnavailableError,
  MIN_REQUIRED_DROP_M,
} from '../src/utils/flowDelineation';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function near(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

// ---------------------------------------------------------------------------
console.log('\n[1] Coordinate formatting and parsing');
// ---------------------------------------------------------------------------
check(
  'decimalToDMS matches the specification example',
  decimalToDMS(27.244844, true) === `27°14'41.44"N`,
  decimalToDMS(27.244844, true)
);
check(
  'decimalToDMS longitude with E hemisphere',
  decimalToDMS(77.8258667, false) === `77°49'33.12"E`,
  decimalToDMS(77.8258667, false)
);
check(
  'decimalToDMS carries 59.999" seconds into minutes, never emitting 60"',
  decimalToDMS(27 + (14 * 60 + 59.999) / 3600, true) === `27°15'00.00"N`,
  decimalToDMS(27 + (14 * 60 + 59.999) / 3600, true)
);
check(
  'decimalToDMS carries 59.9999 minutes into degrees',
  decimalToDMS(27 + (59 * 60 + 59.9999) / 3600, true) === `28°00'00.00"N`,
  decimalToDMS(27 + (59 * 60 + 59.9999) / 3600, true)
);
check('decimalToDMS handles negative latitude', decimalToDMS(-33.8688, true).endsWith('S'));

check(
  'station label carries 69+999.6 to 70+000, not 69+1000',
  formatRailwayStationLabel(69999.6) === '70+000',
  formatRailwayStationLabel(69999.6)
);
check('station label basic', formatRailwayStationLabel(69340) === '69+340');
check('station label negative', formatRailwayStationLabel(-1500) === '-1+500');

check('parse decimal', near(parseCoordinateInput('27.244844')!, 27.244844, 1e-9));
check(
  'parse DMS with N',
  near(parseCoordinateInput(`27°14'41.44"N`)!, 27.2448444, 1e-6)
);
check(
  'parse DMS with S returns negative',
  (parseCoordinateInput(`27°14'41.44"S`) ?? 0) < 0
);
check('parse DMS with W returns negative', (parseCoordinateInput(`77°49'33.12"W`) ?? 0) < 0);
check('rejects minutes >= 60', parseCoordinateInput(`27°94'0"N`) === null);
check('rejects garbage', parseCoordinateInput('not a coordinate') === null);
check(
  'DMS round-trips through decimal within 0.5 arcsec',
  (() => {
    const d = decimalToDMS(19.076, true);
    const back = parseCoordinateInput(d)!;
    return Math.abs(back - 19.076) < 0.5 / 3600;
  })()
);

// ---------------------------------------------------------------------------
console.log('\n[2] Geodesy');
// ---------------------------------------------------------------------------
{
  // Haversine on a 6371 km sphere: 1 degree of latitude ≈ 111.195 km.
  const d = haversineDistanceM(0, 0, 1, 0);
  check('one degree of latitude ≈ 111.19 km', near(d, 111195, 5), `${d.toFixed(0)} m`);
}
{
  // A 1 km x 1 km square built from measured N-S and E-W extents must give 1 km².
  // At 28 degrees N a degree of longitude is ~88% of a degree of latitude, so
  // the two sides must be measured separately - assuming they are equal is the
  // classic area error.
  const lat0 = 28.0;
  const nsM = haversineDistanceM(lat0, 77.0, lat0 + 0.009, 77.0);
  const ewM = haversineDistanceM(lat0, 77.0, lat0, 77.0 + 0.009);
  const ring: [number, number][] = [
    [lat0, 77.0],
    [lat0 + 0.009, 77.0],
    [lat0 + 0.009, 77.0 + 0.009],
    [lat0, 77.0 + 0.009],
  ];
  const area = calculatePolygonAreaKm2(ring);
  const expected = (nsM * ewM) / 1e6;
  check(
    'polygon area matches the measured N-S x E-W extents',
    near(area, expected, expected * 0.01),
    `area=${area.toFixed(4)} km², expected=${expected.toFixed(4)} km²`
  );
  check(
    'longitude degrees are correctly shorter than latitude degrees',
    ewM / nsM > 0.86 && ewM / nsM < 0.90,
    `ratio=${(ewM / nsM).toFixed(3)}`
  );
}
{
  const p = destinationPoint(28.0, 77.0, 1000, 45);
  const d = haversineDistanceM(28.0, 77.0, p[0], p[1]);
  check('destinationPoint moves the requested distance', near(d, 1000, 1), `${d.toFixed(1)} m`);
}

// ---------------------------------------------------------------------------
console.log('\n[3] Grid construction matches the requested scope');
// ---------------------------------------------------------------------------
{
  const g500 = buildDemGrid(28.0, 77.0, 40, 500);
  check('500 m scope grid is sized from the 30 m cell spacing', g500.size === 35, `size=${g500.size}`);

  const { points: pts500, cellIndices: idx500 } = demGridSamplePoints(g500);
  check('only in-scope cells are requested from the DEM', pts500.length === idx500.length);
  check(
    'requested cells are fewer than the full square grid',
    pts500.length < 35 * 35 && pts500.length > 700,
    `${pts500.length} of ${35 * 35}`
  );
  check(
    'every requested cell is inside the 500 m radius',
    pts500.every((p) => haversineDistanceM(28.0, 77.0, p.lat, p.lng) <= 500)
  );

  const g1000 = buildDemGrid(28.0, 77.0, 40, 1000);
  check('1,000 m scope grid is 69 cells across', g1000.size === 69, `size=${g1000.size}`);
  const { points: pts1000 } = demGridSamplePoints(g1000);
  check(
    'the 1,000 m scope requests roughly 4x the cells of the 500 m scope',
    pts1000.length > pts500.length * 3.5 && pts1000.length < pts500.length * 4.5,
    `${pts1000.length} vs ${pts500.length}`
  );

  // The culvert must sit exactly at the grid centre.
  const centre = g500.cells[g500.originR][g500.originC];
  check(
    'culvert lands on the grid centre cell',
    near(centre.lat, 28.0, 1e-9) && near(centre.lng, 77.0, 1e-9)
  );

  // The grid is square, so its corners reach past the radius. What must hold is
  // that the ANALYSIS DOMAIN stays inside the requested scope, otherwise the
  // reported scope would overstate the terrain actually covered.
  let inDomainMax = 0;
  let inDomainCount = 0;
  for (let r = 0; r < g500.size; r++) {
    for (let c = 0; c < g500.size; c++) {
      const d = haversineDistanceM(28.0, 77.0, g500.cells[r][c].lat, g500.cells[r][c].lng);
      if (g500.inDomain[r][c]) {
        inDomainMax = Math.max(inDomainMax, d);
        inDomainCount++;
      }
    }
  }
  check(
    'no in-scope cell lies beyond the 500 m radius',
    inDomainMax <= 500,
    `max=${inDomainMax.toFixed(1)} m`
  );
  // A square of half-width 510 m clipped to a 500 m disc keeps ~π/4 of it.
  check(
    'the in-domain mask is a disc, not the whole square',
    inDomainCount > 0.68 * g500.size * g500.size &&
      inDomainCount < 0.78 * g500.size * g500.size,
    `${inDomainCount}/${g500.size * g500.size} cells`
  );
}

// ---------------------------------------------------------------------------
console.log('\n[4] Delineation on an analytically-known valley');
// ---------------------------------------------------------------------------
/**
 * A perfect V-shaped valley whose axis runs along the corridor. The channel
 * must be found, the catchment must enclose the valley, and the highest
 * contour must equal the ridge elevation that was actually built in.
 */
function buildValleyDem(): { grid: ReturnType<typeof buildDemGrid>; ridgeM: number; gridMaxM: number } {
  const grid = buildDemGrid(28.0, 77.0, 0, 500); // corridor bearing due north
  const n = grid.size * grid.size;
  const elevations: number[] = new Array(n);

  const centre = grid.cells[grid.originR][grid.originC];
  const baseM = 200;
  const gridMaxM = 720; // grid corners reach ~721 m
  const slopePerM = 40 / gridMaxM; // 40 m of total relief across the grid

  for (let i = 0; i < n; i++) {
    const cell = grid.cells[Math.floor(i / grid.size)][i % grid.size];
    const d = haversineDistanceM(centre.lat, centre.lng, cell.lat, cell.lng);
    elevations[i] = Math.round((baseM + d * slopePerM) * 10) / 10;
  }
  const { cellIndices } = demGridSamplePoints(grid);
  applyBulkElevations(
    grid,
    cellIndices.map((i) => elevations[i]),
    cellIndices
  );

  // The true highest elevation inside the ANALYSIS SCOPE, which is what the
  // engine is expected to report.
  let ridgeM = -Infinity;
  for (let r = 0; r < grid.size; r++) {
    for (let c = 0; c < grid.size; c++) {
      if (!grid.inDomain[r][c]) continue;
      ridgeM = Math.max(ridgeM, grid.cells[r][c].elevation!);
    }
  }
  return { grid, ridgeM, gridMaxM };
}

{
  const { grid, ridgeM } = buildValleyDem();
  let res;
  try {
    const { cellIndices } = demGridSamplePoints(grid);
    res = delineateUpstreamCatchment({
      targetLat: 28.0,
      targetLng: 77.0,
      corridorBearingDeg: 0,
      radiusM: 500,
      elevations: cellIndices.map((i) => grid.cells[Math.floor(i / grid.size)][i % grid.size].elevation),
      cellIndices,
    });
  } catch (e) {
    check('valley delineation completes', false, (e as Error).message);
  }

  if (res) {
    check('valley delineation completes', true);
    check(
      'a channel is traced upstream',
      res.streamPath.length >= 2,
      `path points=${res.streamPath.length}`
    );
    check(
      'stream length is positive and within the scope',
      res.streamLengthKm > 0 && res.streamLengthKm < 1.5,
      `${res.streamLengthKm} km`
    );
    check(
      'catchment area is positive and plausible',
      res.catchmentAreaKm2 > 0.001 && res.catchmentAreaKm2 < 2,
      `${res.catchmentAreaKm2} km²`
    );
    check(
      'highest contour equals the true ridge elevation that was built in',
      near(res.highestContourM, ridgeM, 2.5),
      `reported=${res.highestContourM}, built=${ridgeM}`
    );
    check(
      'relief equals highest contour minus origin, unclamped',
      near(res.reliefM, res.highestContourM - res.originElevationM, 0.11),
      `relief=${res.reliefM}`
    );
    check(
      'relief is NOT forced up to 5 m on a 40 m valley',
      res.reliefM > 5,
      `relief=${res.reliefM}`
    );
    check(
      'origin elevation sits near the valley floor',
      near(res.originElevationM, 200, 3),
      `origin=${res.originElevationM}`
    );
    check(
      'polygon is closed and has enough vertices to be a real basin',
      res.catchmentPolygon.length >= 8,
      `vertices=${res.catchmentPolygon.length}`
    );
    check(
      'channel stays inside the 500 m analysis scope',
      res.streamPath.every(
        ([lat, lng]) => haversineDistanceM(28.0, 77.0, lat, lng) <= 540
      ),
      `max=${Math.max(
        ...res.streamPath.map(([la, ln]) => haversineDistanceM(28.0, 77.0, la, ln))
      ).toFixed(0)} m`
    );
    check(
      'catchment stays inside the 500 m analysis scope',
      res.catchmentPolygon.every(
        ([lat, lng]) => haversineDistanceM(28.0, 77.0, lat, lng) <= 600
      ),
      `max=${Math.max(
        ...res.catchmentPolygon.map(([la, ln]) => haversineDistanceM(28.0, 77.0, la, ln))
      ).toFixed(0)} m`
    );
    check('DEM coverage is full for a synthetic grid', res.demCoverage === 1);
    check(
      'contributing cells are counted',
      res.contributingCells > 10,
      `cells=${res.contributingCells}`
    );
    check('elevation profile is sampled', res.elevationProfile.length >= 2);
  }
}

// ---------------------------------------------------------------------------
console.log('\n[5] The engine refuses to invent data');
// ---------------------------------------------------------------------------
{
  // No samples at all: must throw, not fall back to a synthetic surface.
  const g = buildDemGrid(28.0, 77.0, 0, 500);
  const { cellIndices } = demGridSamplePoints(g);
  const empty: (number | null)[] = cellIndices.map(() => null);
  let threw = false;
  let message = '';
  try {
    delineateUpstreamCatchment({
      targetLat: 28.0,
      targetLng: 77.0,
      corridorBearingDeg: 0,
      radiusM: 500,
      elevations: empty,
      cellIndices,
    });
  } catch (e) {
    threw = e instanceof DemUnavailableError;
    message = (e as Error).message;
  }
  check('an empty DEM raises DemUnavailableError', threw, message);
  check(
    'the failure explains the coverage that was achieved',
    /coverage/i.test(message) || /no elevation data/i.test(message),
    message
  );
  check(
    'the failure message contains no invented elevation',
    !/\b17[01](\.\d+)?\b/.test(message),
    message
  );
}
{
  // Partial coverage below the threshold must also fail.
  const g = buildDemGrid(28.0, 77.0, 0, 500);
  const { cellIndices } = demGridSamplePoints(g);
  const partial: (number | null)[] = cellIndices.map((_, i) => (i % 2 === 0 ? 250 : null));
  let threw = false;
  try {
    delineateUpstreamCatchment({
      targetLat: 28.0,
      targetLng: 77.0,
      corridorBearingDeg: 0,
      radiusM: 500,
      elevations: partial,
      cellIndices,
    });
  } catch (e) {
    threw = e instanceof DemUnavailableError;
  }
  check('sub-threshold DEM coverage is rejected', threw);
}
{
  // A perfectly flat surface has no relief: it must fail rather than invent one.
  const g = buildDemGrid(28.0, 77.0, 0, 500);
  const { cellIndices } = demGridSamplePoints(g);
  const flat: (number | null)[] = cellIndices.map(() => 300);
  let threw = false;
  try {
    delineateUpstreamCatchment({
      targetLat: 28.0,
      targetLng: 77.0,
      corridorBearingDeg: 0,
      radiusM: 500,
      elevations: flat,
      cellIndices,
    });
  } catch (e) {
    threw = e instanceof DemUnavailableError;
  }
  check('a perfectly flat DEM does not produce a fabricated catchment', threw);
}

// ---------------------------------------------------------------------------
console.log('\n[6] Stormwater must ARRIVE at the chainage point');
// ---------------------------------------------------------------------------
/**
 * The reported failure, reproduced in miniature: a road on an embankment with
 * higher ground on ONE side only. Ground on the road side falls away, so naive
 * D8 from the crossing cell finds nothing at all.
 *
 * Layout (corridor runs north-south, bearing 0):
 *   upstream (-r) : a valley rising to +20 m over 450 m
 *   formation (r0): a bench 4 m above the valley floor
 *   downstream (+r): ground falling away from the road
 */
function runEmbankmentScenario(opts: { plateau: boolean; corridor: boolean }) {
  const grid = buildDemGrid(28.0, 77.0, 0, 500);
  const { cellIndices } = demGridSamplePoints(grid);
  const elevations: (number | null)[] = new Array(cellIndices.length);

  const centre = grid.cells[grid.originR][grid.originC];
  const FLOOR = 190;
  const BENCH = 4;

  cellIndices.forEach((flat, i) => {
    const r = Math.floor(flat / grid.size);
    const c = flat % grid.size;
    // Distance across the corridor (rows), signed: negative = upstream side.
    const acrossM = (r - grid.originR) * grid.spacingM;
    const alongM = (c - grid.originC) * grid.spacingM;

    let e: number;
    if (Math.abs(acrossM) <= grid.spacingM * 0.6) {
      // The formation bench.
      e = FLOOR + BENCH;
    } else if (acrossM < 0) {
      // Upstream: a valley rising steadily away from the road.
      const up = -acrossM - grid.spacingM;
      e = FLOOR + Math.min(20, (up / 450) * 20);
      // Quantise to whole metres, as a real DEM is, and optionally make a
      // plateau of the first 120 m to reproduce the flat-area failure.
      e = Math.round(e);
      if (opts.plateau && up < 120) e = FLOOR;
    } else {
      // Downstream: falls away from the road.
      e = FLOOR - Math.min(6, ((acrossM - grid.spacingM) / 450) * 6);
      e = Math.round(e);
    }
    // Slight fall along the corridor so there is a channel direction.
    elevations[i] = Math.round((e + alongM * 0.002) * 10) / 10;
  });
  void centre;

  let corridorPts: [number, number][] | undefined;
  if (opts.corridor) {
    corridorPts = [];
    for (let d = -600; d <= 600; d += 40) {
      const p = destinationPoint(28.0, 77.0, d, 0);
      corridorPts.push([p[0], p[1]]);
    }
  }

  try {
    const res = delineateUpstreamCatchment({
      targetLat: 28.0,
      targetLng: 77.0,
      corridorBearingDeg: 0,
      radiusM: 500,
      elevations,
      cellIndices,
      corridor: corridorPts,
      corridorStartChainage: 0,
    });
    return { ok: true as const, res };
  } catch (e) {
    return { ok: false as const, message: (e as Error).message };
  }
}

const FLOOR_EXPECTED = 190;

for (const plateau of [false, true]) {
  const label = plateau ? 'with a DEM plateau across the valley mouth' : 'with a continuous slope';
  console.log(`\n  --- embankment scenario ${label} ---`);
  const out = runEmbankmentScenario({ plateau, corridor: true });

  if (!out.ok) {
    check(`embankment ${label}: delineation completes`, false, out.message);
    continue;
  }
  const r = out.res;

  check(`embankment ${label}: stormwater arrives at the crossing`, r.flowArrivesAtCrossing);

  const end = r.streamPath[r.streamPath.length - 1];
  const endDist = haversineDistanceM(end[0], end[1], 28.0, 77.0);
  check(
    `embankment ${label}: stream terminates on the chainage coordinate`,
    endDist < 5,
    `ends ${endDist.toFixed(1)} m away`
  );

  check(
    `embankment ${label}: drop reaches ${MIN_REQUIRED_DROP_M} m`,
    r.reliefM >= MIN_REQUIRED_DROP_M,
    `dH = ${r.reliefM} m`
  );
  check(
    `embankment ${label}: drop is the true measured difference`,
    Math.abs(r.reliefM - Math.round((r.highestContourM - r.originElevationM) * 10) / 10) < 0.11,
    `dH=${r.reliefM} origin=${r.originElevationM} high=${r.highestContourM}`
  );
  check(
    `embankment ${label}: invert is near the valley floor, not the bench`,
    r.originElevationM < FLOOR_EXPECTED + 1.5,
    `invert=${r.originElevationM}`
  );
  check(`embankment ${label}: catchment is a real basin`, r.catchmentAreaKm2 > 0.002, `${r.catchmentAreaKm2} km2`);
  check(`embankment ${label}: formation excluded from contributing area`, r.contributingCells > 5, `${r.contributingCells} cells`);
  check(`embankment ${label}: highest contour is real, not the bench`, r.highestContourM > FLOOR_EXPECTED + 10, `${r.highestContourM}`);
  check(`embankment ${label}: arrival bearing is reported`, r.flowArrivalBearingDeg !== null);
}

// ---------------------------------------------------------------------------
console.log('\n[6] Live global DEM');
// ---------------------------------------------------------------------------
if (!process.argv.includes('--offline')) {
  const { delineateCatchment } = await import('../src/utils/delineationEngine');

  // A steep Himalayan valley, and a site near the reference corridor.
  // `flat` marks sites whose genuine relief is under 5 m within the widest
  // scope, so the correct behaviour there is an honest shortfall.
  const sites: [string, number, number, number, boolean][] = [
    ['Shillong (steep, high relief)', 25.5788, 91.8933, 45, false],
    ['Agra-Delhi reference corridor', 27.2448444, 77.8258667, 37.8, true],
    ['Deccan plateau (low relief)', 17.9, 75.9, 10, true],
  ];

  for (const [label, lat, lng, bearing, flat] of sites) {
    const t0 = Date.now();
    let outcome;
    try {
      outcome = await delineateCatchment({
        targetChainage: 1000,
        lat,
        lng,
        corridorBearing: bearing,
      });
    } catch (e) {
      check(`${label}: delineation runs`, false, (e as Error).message);
      continue;
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    if (outcome.failure) {
      check(
        `${label}: fails cleanly rather than inventing values`,
        /elevation|DEM|upslope|contributing/i.test(outcome.failure.message),
        outcome.failure.message
      );
      console.log(`        (${secs}s) ${outcome.failure.message.slice(0, 110)}…`);
      continue;
    }

    const r = outcome.report!;
    console.log(
      `        (${secs}s) area=${r.catchmentAreaKm2} km²  L=${r.lengthOfStreamKm} km  ` +
        `origin=${r.levelStreamOriginM} m  highest=${r.highestContourM} m  Δh=${r.elevationDropM} m  ` +
        `scope=${r.scopeAppliedM} m  coverage=${(r.demCoverage * 100).toFixed(0)}%  cells=${r.contributingCells}`
    );

    check(`${label}: returns a report`, !!r);
    check(`${label}: names the provider that answered`, /Copernicus|SRTM|Open-Elevation/i.test(r.elevationSource), r.elevationSource);
    check(`${label}: coverage is high`, r.demCoverage > 0.8, `${r.demCoverage}`);
    check(`${label}: area is positive`, r.catchmentAreaKm2 > 0);
    check(`${label}: stream length is positive`, r.lengthOfStreamKm > 0);
    check(
      `${label}: Δh matches the two reported elevations`,
      near(
        r.elevationDropM,
        Math.round((r.highestContourM - r.levelStreamOriginM) * 10) / 10,
        0.11
      )
    );
    check(
      `${label}: stormwater arrives at the chainage`,
      r.flowArrivesAtCrossing === true
    );
    // The drop is whatever the terrain gives. On the deliberately flat sites it
    // is genuinely under 5 m even at the widest scope, and the report must SAY
    // so rather than inflate the value to pass.
    if (flat) {
      check(
        `${label}: honestly reports that flat ground gives under 5 m`,
        r.elevationDropM < 5 && r.meetsReliefThreshold === false,
        `dH=${r.elevationDropM} meets=${r.meetsReliefThreshold}`
      );
    } else {
      check(
        `${label}: drop meets the 5 m design rule`,
        r.elevationDropM >= 5,
        `dH=${r.elevationDropM}`
      );
    }
    // The ladder is 500 / 1000 / 2000 m; the flag must describe the scope
    // actually used, not only the scope that failed.
    check(
      `${label}: reported scope is a real ladder step`,
      [500, 1000, 2000].includes(r.scopeAppliedM),
      `scope=${r.scopeAppliedM}`
    );
    check(
      `${label}: expansion flag matches the scope applied`,
      r.scopeExpandedDueToFlatRelief === (r.scopeAppliedM > 500),
      `scope=${r.scopeAppliedM} expanded=${r.scopeExpandedDueToFlatRelief}`
    );
    check(
      `${label}: relief inside the used scope is reported`,
      typeof r.reliefWithinScopeM === 'number' && r.reliefWithinScopeM >= 0,
      `relief=${r.reliefWithinScopeM}`
    );
    check(`${label}: polygon is a real ring`, r.catchmentPolygon.length >= 8);
    check(`${label}: reported area matches the drawn polygon`, r.catchmentAreaKm2 > 0);
  }
} else {
  console.log('  (skipped — pass without --offline to run)');
}

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(60)}\n`);
process.exit(failed === 0 ? 0 : 1);
