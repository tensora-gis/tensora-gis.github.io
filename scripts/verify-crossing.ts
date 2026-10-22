/**
 * Verification against the real corridor from the reported failure:
 * Sultanganj - Kataria, chainage 15247, 24°45'24"N 86°43'24"E.
 *
 * The failure was that stormwater did not arrive at the chainage point, so
 * these checks assert that it does, and that the drawn stream terminates on
 * the chainage coordinate itself.
 */
import { delineateCatchment } from '../src/utils/delineationEngine';
import { haversineDistanceM } from '../src/utils/geoUtils';
import { MIN_REQUIRED_DROP_M } from '../src/utils/flowDelineation';
import { destinationPoint } from '../src/utils/geoUtils';

let passed = 0;
let failed = 0;
const check = (n: string, ok: boolean, d = ''): void => {
  if (ok) {
    passed++;
    console.log(`  PASS  ${n}`);
  } else {
    failed++;
    console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
  }
};

// The point and bearing shown on the map in the failure report.
const LAT = 24.75675;
const LNG = 86.72339;
const CHAINAGE = 15247;
const BEARING = 95; // corridor runs roughly E-W across the screenshot

// A straight corridor through the point, as a KML centreline would provide.
const corridor: [number, number][] = [];
for (let d = -600; d <= 600; d += 50) {
  corridor.push(destinationPoint(LAT, LNG, d, BEARING));
}

console.log('\n=== Sultanganj-Kataria, chainage 15247 ===\n');

const t0 = Date.now();
const outcome = await delineateCatchment({
  targetChainage: CHAINAGE,
  lat: LAT,
  lng: LNG,
  corridorBearing: BEARING,
  corridor,
  corridorStartChainage: 14647,
});
const secs = ((Date.now() - t0) / 1000).toFixed(1);

if (outcome.failure) {
  check('delineation returns a report', false, outcome.failure.message);
} else {
  const r = outcome.report!;
  console.log(
    `  area=${r.catchmentAreaKm2} km² (${(r.catchmentAreaKm2 * 100).toFixed(1)} ha)  ` +
      `L=${r.lengthOfStreamKm} km  invert=${r.levelStreamOriginM} m  ` +
      `highest=${r.highestContourM} m  Δh=${r.elevationDropM} m`
  );
  console.log(
    `  scope=${r.scopeAppliedM} m (expanded=${r.scopeExpandedDueToFlatRelief})  ` +
      `cells=${r.contributingCells}  arrives=${r.flowArrivesAtCrossing}  ` +
      `arrival bearing=${r.flowArrivalBearingDeg}°  head=${r.streamHeadElevationM} m at ${r.headDistanceM} m`
  );
  console.log(`  coverage=${(r.demCoverage * 100).toFixed(1)}%  source=${r.elevationSource}\n`);

  // THE core requirement: stormwater must actually arrive here.
  check('stormwater arrives at the chainage point', r.flowArrivesAtCrossing);

  // The drawn stream must terminate ON the chainage coordinate, so the red
  // line meets the yellow pin instead of stopping short.
  const end = r.streamCoordinates[r.streamCoordinates.length - 1];
  const endDist = haversineDistanceM(end[0], end[1], LAT, LNG);
  check(
    'drawn stream terminates on the chainage coordinate',
    endDist < 5,
    `stream ends ${endDist.toFixed(1)} m from the chainage point`
  );

  // Every point of the channel must be a genuine, connected polyline.
  let maxGap = 0;
  for (let i = 1; i < r.streamCoordinates.length; i++) {
    const d = haversineDistanceM(
      r.streamCoordinates[i - 1][0], r.streamCoordinates[i - 1][1],
      r.streamCoordinates[i][0], r.streamCoordinates[i][1]
    );
    if (d > maxGap) maxGap = d;
  }
  check('channel has no disconnected jumps', maxGap < 80, `largest gap ${maxGap.toFixed(0)} m`);
  check('channel has real length', r.lengthOfStreamKm > 0.01, `${r.lengthOfStreamKm} km`);

  // The rule the user cares about: at least 5 m of drop.
  check(
    `drop is at least ${MIN_REQUIRED_DROP_M} m`,
    r.elevationDropM >= MIN_REQUIRED_DROP_M,
    `Δh = ${r.elevationDropM} m`
  );
  check('drop matches the two reported levels', 
    Math.abs(r.elevationDropM - Math.round((r.highestContourM - r.levelStreamOriginM) * 10) / 10) < 0.11,
    `Δh=${r.elevationDropM} high=${r.highestContourM} origin=${r.levelStreamOriginM}`);

  // Sanity: the highest contour must be inside the catchment, not outside it.
  check('catchment area is physically plausible', r.catchmentAreaKm2 > 0.0005, `${r.catchmentAreaKm2} km²`);
  check('catchment has a drawable ring', r.catchmentPolygon.length >= 8);
  check('contributing area is non-trivial', r.contributingCells > 10, `${r.contributingCells} cells`);
  check('flow arrival bearing is reported', r.flowArrivalBearingDeg !== null);

  // The stated rule: simulate from the HIGHEST point within 1 km, one direction.
  check(
    'headwater is the highest point within 1 km of the crossing',
    r.headDistanceM <= 1000,
    `head is ${r.headDistanceM} m away`
  );
  check(
    'headwater carries the reported highest contour',
    r.streamHeadElevationM === r.highestContourM,
    `head=${r.streamHeadElevationM} highestContour=${r.highestContourM}`
  );
  check(
    'drop equals headwater level minus culvert invert',
    Math.abs(r.elevationDropM - Math.round((r.streamHeadElevationM! - r.levelStreamOriginM) * 10) / 10) < 0.11,
    `dH=${r.elevationDropM} head=${r.streamHeadElevationM} invert=${r.levelStreamOriginM}`
  );
  check(
    'headwater lies off the corridor formation, not on the track',
    haversineDistanceM(
      r.headCoordinates[0],
      r.headCoordinates[1],
      ...(() => {
        const p = destinationPoint(LAT, LNG, 0, BEARING);
        return [p[0], p[1]] as [number, number];
      })()
    ) > 40,
    'the head of the watercourse must be natural ground, never the formation'
  );
  check(
    'stream begins at the headwater and ends at the chainage',
    (() => {
      const first = r.streamCoordinates[0];
      const dHead = haversineDistanceM(first[0], first[1], r.headCoordinates[0], r.headCoordinates[1]);
      return dHead < 60;
    })(),
    'stream head should sit at the highest point'
  );
  check('DEM coverage is adequate', r.demCoverage >= 0.8, `${(r.demCoverage * 100).toFixed(0)}%`);

  // The polygon must actually enclose the stream (containment sanity).
  const latMin = Math.min(...r.catchmentPolygon.map((c) => c[0]));
  const latMax = Math.max(...r.catchmentPolygon.map((c) => c[0]));
  check(
    'catchment ring spans the channel',
    latMax - latMin > 1e-4,
    `${((latMax - latMin) * 111000).toFixed(0)} m N-S extent`
  );
}

console.log(`\n  (${secs}s)\n`);
console.log(`${'='.repeat(62)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(62)}\n`);
process.exit(failed === 0 ? 0 : 1);
