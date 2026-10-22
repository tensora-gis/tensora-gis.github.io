import {
  destinationPoint,
  haversineDistanceM,
  calculatePolygonAreaKm2,
  smoothPolylineChaikin,
  smoothClosedPolygonChaikin,
} from './geoUtils';

/**
 * CULVERT CATCHMENT DELINEATION
 *
 * The question this engine answers is not "what drains into this cell" but:
 *
 *   "Does stormwater actually ARRIVE at this chainage point, and if so from
 *    where, and how much drop is available?"
 *
 * That distinction drives the whole design. A road or railway formation is a
 * RAISED, GRADED BENCH. In the DEM, ground on both sides slopes away from it,
 * so the cell under the chainage has essentially no upstream drainage: raw D8
 * flow routing cannot see the water at all. Naively tracing upstream from that
 * cell returns a spurious pocket of a few cells, a couple of metres of drop,
 * and a stream that does not touch the crossing.
 *
 * So the crossing is modelled as the structure it is:
 *
 *   1. The formation is identified and REMOVED from runoff generation - it is
 *      paved ballast, it sheds no water.
 *   2. A culvert is a conduit. The formation is notched down to the local
 *      drainage invert at the crossing, which is what lets water cross the
 *      bench and arrive at the chainage point.
 *   3. Depressions are filled with priority-flood, seeded at the culvert, so
 *      every cell in the scope has a real downhill path that terminates at the
 *      crossing.
 *   4. D8 routing, an upstream trace to the drainage divide, and the
 *      contributing area then describe genuine overland flow into the culvert.
 *
 * No elevation is invented: the culvert invert is the minimum surveyed ground
 * level across the formation at that chainage, and the drop reported is the
 * measured difference between that invert and the highest ground in the
 * contributing area.
 */

/**
 * Analysis resolution is scaled to feature size, as is standard for catchment
 * work: a 2 km basin does not need 30 m detail, and sampling one costs 14,000
 * DEM cells against rate-limited public APIs - about four times the work for no
 * material gain in the boundary.
 */
function cellSpacingForRadius(radiusM: number): number {
  if (radiusM <= 1000) return 30;
  if (radiusM <= 3000) return 60;
  return 90;
}

/**
 * Radius, in metres, within which the head of the watercourse is sought.
 *
 * The catchment is defined by its highest point: stormwater is simulated from
 * the highest ground within 1 km of the crossing, down the steepest path, to
 * the culvert. The search radius bounds how far upstream the source is taken
 * from; it is not the extent of the catchment.
 */
const HEAD_SEARCH_RADIUS_M = 1000;

/** Half-width of the impervious formation that sheds no runoff. */
const FORMATION_HALF_WIDTH_M = 12;

/** Longitudinal fall along the formation, as a fraction. */
const FORMATION_GRADE = 0.003;

/** Half-length of the culvert opening: how far along the formation it can sit. */
const CULVERT_OPENING_HALF_LENGTH_M = 30;

/**
 * How far beyond the formation the culvert invert is sought.
 *
 * The invert of a culvert through an embankment sits at the drainage level on
 * the ground BEYOND the toe, not at the top of the formation. A formation
 * crown can sit 5 m above that, and notching it down to its own minimum would
 * still leave it above the surrounding ground, so no water could ever enter.
 */
const CULVERT_TOE_SEARCH_M = 90;

/** Design rule: minimum elevation drop a culvert must have to be reported as adequate. */
export const MIN_REQUIRED_DROP_M = 5;

/** Minimum DEM coverage required before terrain results can be trusted. */
const MIN_DEM_COVERAGE = 0.8;

interface DemCell {
  r: number;
  c: number;
  lat: number;
  lng: number;
  /** Natural, unmodified DEM sample. Null where the DEM has no data. */
  elevation: number | null;
}

export interface DemGrid {
  size: number;
  spacingM: number;
  radiusM: number;
  originR: number;
  originC: number;
  /** Direction, perpendicular to the corridor, pointing to the upstream side. */
  upstreamBearingDeg: number;
  cells: DemCell[][];
  /**
   * Cells inside the requested radius. The grid is square but a scope is a
   * radius, so the corners reach up to sqrt(2)*radius; without this mask the
   * catchment could grow into the corners and the reported scope would lie.
   */
  inDomain: boolean[][];
  /** Impervious formation cells: flow passes through, but they shed no runoff. */
  isFormation: boolean[][];
  /** Distance along the corridor to the nearest formation cell, in metres. */
  corridorStationM: Float64Array;
  /** Station of the crossing along the corridor. */
  crossingStationM: number;
  coverage: number;
}

export interface DelineationResult {
  /** [lat, lng] ordered from the drainage divide down to the chainage point. */
  streamPath: [number, number][];
  streamLengthKm: number;
  /** Culvert invert, the Level Stream Origin: m MSL. */
  originElevationM: number;
  /** Highest ground level inside the contributing catchment: m MSL. */
  highestContourM: number;
  /** highestContourM - originElevationM, in metres. Measured, never clamped. */
  reliefM: number;
  catchmentPolygon: [number, number][];
  catchmentAreaKm2: number;
  tributaryPaths: [number, number][][];
  contours: { elevationM: number; coordinates: [number, number][] }[];
  elevationProfile: { distanceM: number; elevationM: number; lat: number; lng: number }[];
  /** Natural-terrain cells draining to the crossing, formation excluded. */
  contributingCells: number;
  demCoverage: number;
  gridSize: number;
  /** Analysis cell size actually used for this scope, metres. */
  cellSizeM: number;
  /** Bearing from the crossing towards where the flow arrives from, degrees. */
  flowArrivalBearingDeg: number | null;
  /** True when a watercourse was found that actually reaches this chainage. */
  flowArrivesAtCrossing: boolean;
  /** Distance from the chainage to where the watercourse meets the formation. */
  channelApproachM: number;
  /** Head of the contributing channel: the furthest upstream point reached. */
  streamHeadElevationM: number | null;
  /** Distance from the crossing to the head of the watercourse. */
  headDistanceM: number;
  /** Coordinates of the highest point the culvert collects from. */
  headCoordinates: [number, number];
}

/** Thrown when the terrain cannot be analysed honestly. */
export class DemUnavailableError extends Error {
  readonly coverage: number;
  constructor(message: string, coverage: number) {
    super(message);
    this.name = 'DemUnavailableError';
    this.coverage = coverage;
  }
}

// ---------------------------------------------------------------------------
// Grid construction
// ---------------------------------------------------------------------------

export function buildDemGrid(
  targetLat: number,
  targetLng: number,
  corridorBearingDeg: number,
  radiusM: number,
  spacingM: number = cellSpacingForRadius(radiusM)
): DemGrid {
  const half = Math.max(1, Math.ceil(radiusM / spacingM));
  const size = half * 2 + 1;
  const centre = half;

  const upstreamBearingDeg = (corridorBearingDeg - 90 + 360) % 360;
  const lateralBearingDeg = (upstreamBearingDeg + 90) % 360;

  const cells: DemCell[][] = Array.from({ length: size }, () => new Array<DemCell>(size));
  const inDomain: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFormation: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const distUpstreamM = (r - centre) * spacingM;
      const distLateralM = (c - centre) * spacingM;
      const alongUpstream = destinationPoint(targetLat, targetLng, distUpstreamM, upstreamBearingDeg);
      const cell = destinationPoint(alongUpstream[0], alongUpstream[1], distLateralM, lateralBearingDeg);
      cells[r][c] = { r, c, lat: cell[0], lng: cell[1], elevation: null };
      inDomain[r][c] = haversineDistanceM(targetLat, targetLng, cell[0], cell[1]) <= radiusM;
    }
  }

  return {
    size,
    spacingM,
    radiusM,
    originR: centre,
    originC: centre,
    upstreamBearingDeg,
    cells,
    inDomain,
    isFormation,
    corridorStationM: new Float64Array(size * size).fill(NaN),
    crossingStationM: 0,
    coverage: 0,
  };
}

/** Sample points the bulk DEM call should request: the in-scope cells only. */
export function demGridSamplePoints(grid: DemGrid): {
  points: { lat: number; lng: number }[];
  cellIndices: number[];
} {
  const points: { lat: number; lng: number }[] = [];
  const cellIndices: number[] = [];
  for (let r = 0; r < grid.size; r++) {
    for (let c = 0; c < grid.size; c++) {
      if (!grid.inDomain[r][c]) continue;
      points.push({ lat: grid.cells[r][c].lat, lng: grid.cells[r][c].lng });
      cellIndices.push(r * grid.size + c);
    }
  }
  return { points, cellIndices };
}

export function applyBulkElevations(
  grid: DemGrid,
  samples: (number | null)[],
  cellIndices: number[]
): number {
  if (samples.length !== cellIndices.length) {
    throw new Error(
      `DEM sample count mismatch: ${cellIndices.length} cells requested, ${samples.length} returned`
    );
  }
  let filled = 0;
  for (let k = 0; k < cellIndices.length; k++) {
    const idx = cellIndices[k];
    const v = samples[k];
    const ok = typeof v === 'number' && isFinite(v);
    grid.cells[Math.floor(idx / grid.size)][idx % grid.size].elevation = ok ? v : null;
    if (ok) filled++;
  }
  grid.coverage = cellIndices.length > 0 ? filled / cellIndices.length : 0;
  return grid.coverage;
}

// ---------------------------------------------------------------------------
// Corridor formation
// ---------------------------------------------------------------------------

/**
 * Marks the impervious formation along the corridor and records each cell's
 * station along it.
 *
 * The formation is walked at fine steps and a band of cells either side of the
 * centreline is flagged. Band half-width is at least half a cell so that a
 * sub-cell-width formation is still represented by a full row of cells -
 * under-marking it would leave the crown in the flow network, which is exactly
 * what prevents runoff from reaching the crossing.
 */
function markCorridorFormation(
  grid: DemGrid,
  corridor: [number, number][],
  startChainage = 0
): void {
  const { size } = grid;
  if (corridor.length < 2) return;

  const bandHalfWidth = Math.max(FORMATION_HALF_WIDTH_M, grid.spacingM / 2);
  const alongStep = Math.max(5, grid.spacingM / 4);
  const acrossStep = Math.max(3, grid.spacingM / 5);
  const acrossCount = Math.max(1, Math.ceil(bandHalfWidth / acrossStep));

  // Cumulative distance along the corridor, used for the station of each cell.
  const cumulative: number[] = [0];
  for (let i = 1; i < corridor.length; i++) {
    cumulative.push(
      cumulative[i - 1] +
        haversineDistanceM(corridor[i - 1][0], corridor[i - 1][1], corridor[i][0], corridor[i][1])
    );
  }

  const flat = (r: number, c: number) => r * size + c;

  for (let i = 1; i < corridor.length; i++) {
    const a = corridor[i - 1];
    const b = corridor[i];
    const segLen = cumulative[i] - cumulative[i - 1];
    if (segLen <= 0) continue;

    // Skip segments well outside the scope.
    const midLat = (a[0] + b[0]) / 2;
    const midLng = (a[1] + b[1]) / 2;
    const gridCentre = grid.cells[grid.originR][grid.originC];
    if (
      haversineDistanceM(gridCentre.lat, gridCentre.lng, midLat, midLng) >
      grid.radiusM + grid.spacingM * 2
    ) {
      continue;
    }

    const segBearing = calculateBearingSafe(a[0], a[1], b[0], b[1]);
    const steps = Math.max(1, Math.ceil(segLen / alongStep));

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const stationM = cumulative[i - 1] + segLen * t;
      const centre = destinationPoint(a[0], a[1], segLen * t, segBearing);

      for (let k = -acrossCount; k <= acrossCount; k++) {
        const offsetM = k * acrossStep;
        // Only accept offsets inside the band. Relying on the nearest-cell
        // lookup alone silently drew a band three cells wide, which pushed the
        // toe of the formation out of reach at coarse analysis resolutions and
        // erased the natural ground on one side of the crossing.
        if (Math.abs(offsetM) > bandHalfWidth) continue;

        const p = destinationPoint(centre[0], centre[1], offsetM, (segBearing + 90) % 360);

        const idx = nearestCellIndex(grid, p[0], p[1]);
        if (idx < 0) continue;
        const r = Math.floor(idx / size);
        const c = idx % size;
        if (!grid.inDomain[r][c]) continue;

        grid.isFormation[r][c] = true;
        const prev = grid.corridorStationM[flat(r, c)];
        if (Number.isNaN(prev) || Math.abs(prev - stationM) < grid.spacingM / 2) {
          grid.corridorStationM[flat(r, c)] = stationM;
        }
      }
    }
  }

  // The crossing's own station, taken from its nearest marked cell.
  let crossingStation = startChainage;
  let best = Infinity;
  const origin = grid.cells[grid.originR][grid.originC];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const st = grid.corridorStationM[flat(r, c)];
      if (Number.isNaN(st)) continue;
      const d = haversineDistanceM(origin.lat, origin.lng, grid.cells[r][c].lat, grid.cells[r][c].lng);
      if (d < best) {
        best = d;
        crossingStation = st;
      }
    }
  }
  grid.crossingStationM = crossingStation;
}

function calculateBearingSafe(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Index of the in-domain grid cell nearest a coordinate, or -1.
 *
 * The grid is a rotated regular lattice, so the nearest cell is almost always
 * in the immediate neighbourhood. Getting the rotation right matters more than
 * the speed: an incorrect axis decomposition seeds the search in the wrong
 * place, and the fallback then marks cells on the wrong side of the corridor.
 */
function nearestCellIndex(grid: DemGrid, lat: number, lng: number): number {
  const { size, cells, inDomain, originR, originC, spacingM, upstreamBearingDeg } = grid;

  // Compass bearing theta has unit vector (dLng, dLat) = (sin t, cos t).
  const up = (upstreamBearingDeg * Math.PI) / 180;
  const lateral = up + Math.PI / 2;

  const midLat = (lat + cells[originR][originC].lat) / 2;
  const mPerDegLat = 111132;
  const mPerDegLng = Math.max(1, 111412 * Math.cos((midLat * Math.PI) / 180));

  const dLat = (lat - cells[originR][originC].lat) * mPerDegLat;
  const dLng = (lng - cells[originR][originC].lng) * mPerDegLng;

  // Rows step along the upstream bearing, columns along the lateral bearing.
  const alongColumns = dLng * Math.sin(lateral) + dLat * Math.cos(lateral);
  const acrossRows = dLng * Math.sin(up) + dLat * Math.cos(up);

  const c0 = Math.round(originC + alongColumns / spacingM);
  const r0 = Math.round(originR + acrossRows / spacingM);

  let best = -1;
  let bestD = Infinity;

  const consider = (r: number, c: number): void => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    if (!inDomain[r][c]) return;
    const d = (cells[r][c].lat - lat) ** 2 + (cells[r][c].lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = r * size + c;
    }
  };

  consider(r0, c0);

  // Two rings cover any rounding error; beyond that fall back to a full scan.
  for (let ring = 1; ring <= 2 && best < 0; ring++) {
    for (let r = r0 - ring; r <= r0 + ring; r++) {
      for (let c = c0 - ring; c <= c0 + ring; c++) {
        if (Math.abs(r - r0) !== ring && Math.abs(c - c0) !== ring) continue;
        consider(r, c);
      }
    }
  }

  if (best >= 0) return best;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) consider(r, c);
  }
  return best;
}

/**
 * True when the chosen toe is intercepted by a culvert AT this chainage.
 *
 * A culvert sits in the formation, so the test is whether the formation cell it
 * drains against lies within the culvert opening's length of the crossing
 * station. Comparing the toe's distance to the centre point instead would
 * measure the width of the formation, which says nothing about whether this
 * particular chainage intercepts the flow.
 */
function toeIsAtCrossing(grid: DemGrid, pourIndex: number): boolean {
  const { size } = grid;
  const flat = (r: number, c: number) => r * size + c;

  let formationCount = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid.isFormation[r][c]) formationCount++;
  if (formationCount === 0) return true;

  const pr = Math.floor(pourIndex / size);
  const pc = pourIndex % size;
  const reach = 2;

  for (let dr = -reach; dr <= reach; dr++) {
    for (let dc = -reach; dc <= reach; dc++) {
      const r = pr + dr;
      const c = pc + dc;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      if (!grid.isFormation[r][c]) continue;
      const st = grid.corridorStationM[flat(r, c)];
      if (Number.isNaN(st)) continue;
      if (Math.abs(st - grid.crossingStationM) <= CULVERT_OPENING_HALF_LENGTH_M + grid.spacingM) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Terrain conditioning
// ---------------------------------------------------------------------------

interface ConditionedTerrain {
  /** Working elevations after grading the formation and filling depressions. */
  elev: Float64Array;
  /** Culvert invert elevation: the local drainage level at the crossing. */
  culvertInvertM: number;
  /** Invert level was taken from the surrounding ground, not the DEM cell. */
  invertFromFormation: boolean;
}

/** Minimal binary heap keyed by elevation, for priority-flood. */
class ElevHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.vals.length;
  }

  push(key: number, val: number): void {
    this.keys.push(key);
    this.vals.push(val);
    let i = this.vals.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      [this.keys[p], this.keys[i]] = [this.keys[i], this.keys[p]];
      [this.vals[p], this.vals[i]] = [this.vals[i], this.vals[p]];
      i = p;
    }
  }

  pop(): number | undefined {
    if (this.vals.length === 0) return undefined;
    const topVal = this.vals[0];
    const lastKey = this.keys.pop()!;
    const lastVal = this.vals.pop()!;
    if (this.vals.length > 0) {
      this.keys[0] = lastKey;
      this.vals[0] = lastVal;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.vals.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.vals.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        [this.keys[m], this.keys[i]] = [this.keys[i], this.keys[m]];
        [this.vals[m], this.vals[i]] = [this.vals[i], this.vals[m]];
        i = m;
      }
    }
    return topVal;
  }
}

const DR8 = [-1, -1, -1, 0, 0, 1, 1, 1];
const DC8 = [-1, 0, 1, -1, 1, -1, 0, 1];

/**
 * Priority-flood depression filling.
 *
 * The formation is a wall, so it is excluded from the flood; seeding includes
 * the cells that touch it, because otherwise the whole area behind an embankment
 * is a closed depression and gets raised to a near-uniform spill level, which
 * destroys the real terrain gradient.
 */
function fillDepressions(grid: DemGrid, elev: Float64Array, seeds: number[]): void {
  const { size, inDomain, isFormation } = grid;
  const n = size * size;
  const closed = new Uint8Array(n);
  const heap = new ElevHeap();

  for (const idx of seeds) {
    if (idx < 0 || idx >= n) continue;
    const r = Math.floor(idx / size);
    const c = idx % size;
    if (!inDomain[r][c] || isFormation[r][c]) continue;
    if (elev[idx] === Infinity) continue;
    heap.push(elev[idx], idx);
    closed[idx] = 1;
  }

  while (heap.size > 0) {
    const idx = heap.pop()!;
    const r = Math.floor(idx / size);
    const c = idx % size;
    const here = elev[idx];
    for (let k = 0; k < 8; k++) {
      const nr = r + DR8[k];
      const nc = c + DC8[k];
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      if (!inDomain[nr][nc] || isFormation[nr][nc]) continue;
      const nIdx = nr * size + nc;
      if (closed[nIdx]) continue;
      closed[nIdx] = 1;
      if (elev[nIdx] < here) elev[nIdx] = here;
      heap.push(elev[nIdx], nIdx);
    }
  }
}

/**
 * Gives flat areas a vanishing gradient so flow can cross them.
 *
 * A DEM over floodplain terrain is quantised to whole metres, producing large
 * areas at an identical level. Strict steepest-descent routing treats a flat as
 * a dead end, so a catchment whose only path to the culvert crosses one becomes
 * invisible - which is exactly what happened at a site with 6 m of relief only
 * 300 m away.
 *
 * The gradient is measured in cells from each cell to the NEAREST OUTLET (the
 * culvert toe and the grid edge); each cell is raised by that distance in
 * micrometres. Measuring from the outlets is what makes water flow TOWARDS the
 * culvert. Deriving it from the flow graph instead achieves nothing, because a
 * flat cell has no edges in that graph to begin with.
 *
 * Reported figures are read from the untouched natural DEM, so this cannot
 * affect them.
 */
function resolveFlatAreas(grid: DemGrid, elev: Float64Array, outlets: number[]): void {
  const { size } = grid;
  const n = size * size;
  const hops = new Int32Array(n).fill(-1);
  const queue: number[] = [];

  for (const idx of outlets) {
    if (idx < 0 || idx >= n || !isFinite(elev[idx])) continue;
    if (hops[idx] !== -1) continue;
    hops[idx] = 0;
    queue.push(idx);
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const r = Math.floor(idx / size);
    const c = idx % size;
    for (let k = 0; k < 8; k++) {
      const nr = r + DR8[k];
      const nc = c + DC8[k];
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      if (!grid.inDomain[nr][nc] || grid.isFormation[nr][nc]) continue;
      const ni = nr * size + nc;
      if (hops[ni] !== -1 || !isFinite(elev[ni])) continue;
      hops[ni] = hops[idx] + 1;
      queue.push(ni);
    }
  }

  const EPSILON_M = 1e-4;
  for (let i = 0; i < n; i++) {
    if (hops[i] > 0) elev[i] += hops[i] * EPSILON_M;
  }
}

/**
 * Builds the working surface.
 *
 * The formation is graded to fall towards the crossing, exactly as a real road
 * formation is: without that it acts as an impermeable barrier and no catchment
 * is ever found. Grading only ever CUTS the formation - the natural ground
 * outside is untouched - so no elevation is invented.
 */
function conditionTerrain(
  grid: DemGrid,
  naturalElev: Float64Array,
  crossingIndex: number
): ConditionedTerrain {
  const { size, inDomain, isFormation, corridorStationM, crossingStationM } = grid;
  const elev = Float64Array.from(naturalElev);
  const flat = (r: number, c: number) => r * size + c;
  const crossing = grid.cells[Math.floor(crossingIndex / size)][crossingIndex % size];

  // Culvert invert: the lowest natural ground just beyond the toe of the
  // formation. The crown of an embankment is NOT the invert - using it left the
  // "invert" metres above the surrounding ground, so nothing could flow in.
  let toeLow = Infinity;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!inDomain[r][c] || isFormation[r][c]) continue;
      const d = haversineDistanceM(crossing.lat, crossing.lng, grid.cells[r][c].lat, grid.cells[r][c].lng);
      if (d > CULVERT_TOE_SEARCH_M) continue;
      const e = naturalElev[flat(r, c)];
      if (isFinite(e) && e < toeLow) toeLow = e;
    }
  }
  const invertFromFormation = isFinite(toeLow);
  const culvertInvertM = invertFromFormation ? toeLow : naturalElev[crossingIndex];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFormation[r][c]) continue;
      const station = corridorStationM[flat(r, c)];
      const alongM = Number.isNaN(station) ? 0 : Math.abs(station - crossingStationM);
      const target = culvertInvertM + alongM * FORMATION_GRADE;
      if (elev[flat(r, c)] > target) elev[flat(r, c)] = target;
    }
  }
  if (isFinite(elev[crossingIndex]) && elev[crossingIndex] > culvertInvertM - 1e-3) {
    elev[crossingIndex] = culvertInvertM - 1e-3;
  }

  // Flood from the grid edge and from every cell touching the formation.
  const seeds: number[] = [];
  for (let i = 0; i < size; i++) {
    seeds.push(i, (size - 1) * size + i, i * size, i * size + size - 1);
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!inDomain[r][c] || !isFormation[r][c]) continue;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          if (inDomain[nr][nc] && !isFormation[nr][nc]) seeds.push(flat(nr, nc));
        }
      }
    }
  }
  const floodSeeds = seeds.filter((i) => i >= 0 && i < size * size && isFinite(elev[i]));
  fillDepressions(grid, elev, floodSeeds);
  resolveFlatAreas(grid, elev, floodSeeds);

  return { elev, culvertInvertM, invertFromFormation };
}

// ---------------------------------------------------------------------------
// D8 flow routing
// ---------------------------------------------------------------------------

interface FlowNetwork {
  /** D8 downstream neighbour index per cell, -1 where none. */
  drain: Int8Array;
  /** Reverse-D8: cells that drain into a given cell. */
  upstream: Map<number, number[]>;
}

function buildFlowNetwork(grid: DemGrid, elev: Float64Array): FlowNetwork {
  const n = grid.size * grid.size;
  const flat = (r: number, c: number) => r * grid.size + c;
  const drain = new Int8Array(n).fill(-1);
  const { inDomain } = grid;

  for (let r = 0; r < grid.size; r++) {
    for (let c = 0; c < grid.size; c++) {
      if (!inDomain[r][c] || grid.isFormation[r][c]) continue;
      const e = elev[flat(r, c)];
      if (!isFinite(e)) continue;
      let bestSlope = 0;
      let bestK = -1;
      for (let k = 0; k < 8; k++) {
        const nr = r + DR8[k];
        const nc = c + DC8[k];
        if (nr < 0 || nr >= grid.size || nc < 0 || nc >= grid.size) continue;
        // The formation is a wall: flow may not drain through it, which is what
        // makes ground pond against it the way it really does.
        if (!inDomain[nr][nc] || grid.isFormation[nr][nc]) continue;
        const ne = elev[flat(nr, nc)];
        if (!isFinite(ne)) continue;
        const slope = (e - ne) / (Math.hypot(DR8[k], DC8[k]) * grid.spacingM);
        if (slope > bestSlope) {
          bestSlope = slope;
          bestK = k;
        }
      }
      drain[flat(r, c)] = bestK;
    }
  }

  const upstream = new Map<number, number[]>();
  for (let r = 0; r < grid.size; r++) {
    for (let c = 0; c < grid.size; c++) {
      const k = drain[flat(r, c)];
      if (k === -1) continue;
      const target = flat(r + DR8[k], c + DC8[k]);
      const list = upstream.get(target);
      if (list) list.push(flat(r, c));
      else upstream.set(target, [flat(r, c)]);
    }
  }

  return { drain, upstream };
}

/**
 * Every cell that drains, transitively, into the channel. Formation cells are
 * excluded from the count: the formation is impervious and sheds no runoff.
 */
function contributingArea(
  network: FlowNetwork,
  grid: DemGrid,
  stem: number[]
): { inBasin: boolean[][]; naturalCells: number[] } {
  const { size } = grid;
  const inBasin: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const naturalCells: number[] = [];
  const queue: number[] = [];

  for (const idx of stem) {
    const r = Math.floor(idx / size);
    const c = idx % size;
    if (!inBasin[r][c]) {
      inBasin[r][c] = true;
      queue.push(idx);
    }
  }

  while (queue.length > 0) {
    const idx = queue.shift()!;
    const r = Math.floor(idx / size);
    const c = idx % size;
    if (!grid.isFormation[r][c]) naturalCells.push(idx);
    for (const u of network.upstream.get(idx) ?? []) {
      const ur = Math.floor(u / size);
      const uc = u % size;
      if (inBasin[ur][uc]) continue;
      inBasin[ur][uc] = true;
      queue.push(u);
    }
  }

  return { inBasin, naturalCells };
}

/**
 * Walks the D8 downstream path from one cell to another.
 *
 * This is the actual route stormwater takes, in the direction it flows. The
 * drawn stream follows this path rather than a straight line or a smoothed
 * approximation, so what is displayed is the simulation.
 */
function traceDownstreamPath(
  network: FlowNetwork,
  grid: DemGrid,
  start: number,
  until: number
): number[] {
  const path: number[] = [start];
  if (start === until) return path;

  const seen = new Set<number>([start]);
  let current = start;
  const maxSteps = grid.size * grid.size;

  for (let step = 0; step < maxSteps; step++) {
    const k = network.drain[current];
    if (k === -1) break;
    const r = Math.floor(current / grid.size) + DR8[k];
    const c = (current % grid.size) + DC8[k];
    if (r < 0 || r >= grid.size || c < 0 || c >= grid.size) break;
    const next = r * grid.size + c;
    if (seen.has(next)) break;
    seen.add(next);
    path.push(next);
    current = next;
    if (current === until) break;
  }

  return path;
}

/**
 * Picks the ground against the formation that the culvert actually drains.
 *
 * The formation is an embankment: ground on either side falls towards it and
 * ponds at the toe, and a culvert takes that flow through. So the pour point is
 * the TOE cell near the crossing - natural ground immediately beside the
 * formation - not the cell under the chainage, which sits on the crown and has
 * no upstream drainage at all.
 *
 * A culvert discharges from one side only, so candidates are ranked by the DROP
 * they can offer: the side with real relief behind it wins, and the catchment
 * is that one drainage. Ranking by basin size instead could pick a broad flat
 * side over a narrow valley with genuine fall.
 */
function findPourPoint(
  grid: DemGrid,
  network: FlowNetwork,
  elev: Float64Array,
  crossingIndex: number
): { index: number; basinCells: number; approachM: number; reliefM: number } | null {
  const { size } = grid;
  const flat = (r: number, c: number) => r * size + c;
  const crossing = grid.cells[Math.floor(crossingIndex / size)][crossingIndex % size];
  const touchCells = Math.max(1, Math.ceil((FORMATION_HALF_WIDTH_M + grid.spacingM) / grid.spacingM));

  // With no corridor there is no formation to model, so the point itself is the
  // pour point. This keeps free-point and map-click analysis working.
  let formationCount = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid.isFormation[r][c]) formationCount++;
  if (formationCount === 0) {
    return { index: crossingIndex, basinCells: 0, approachM: 0, reliefM: 0 };
  }

  const candidates: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!grid.inDomain[r][c] || grid.isFormation[r][c]) continue;
      if (!isFinite(elev[flat(r, c)])) continue;

      const d = haversineDistanceM(crossing.lat, crossing.lng, grid.cells[r][c].lat, grid.cells[r][c].lng);
      if (d > CULVERT_TOE_SEARCH_M) continue;

      let touchesFormation = false;
      for (let dr = -touchCells; dr <= touchCells && !touchesFormation; dr++) {
        for (let dc = -touchCells; dc <= touchCells; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          if (grid.isFormation[nr][nc]) {
            touchesFormation = true;
            break;
          }
        }
      }
      if (touchesFormation) candidates.push(flat(r, c));
    }
  }

  if (candidates.length === 0) return null;

  let best: { index: number; basinCells: number; approachM: number; reliefM: number } | null = null;

  for (const idx of candidates) {
    const cr = Math.floor(idx / size);
    const cc = idx % size;
    const cellElev = grid.cells[cr][cc].elevation;
    if (cellElev === null || !isFinite(cellElev)) continue;

    // Everything draining to this toe is the catchment on this side.
    const { naturalCells } = contributingArea(network, grid, [idx]);
    if (naturalCells.length < 5) continue;

    // The head of the watercourse is the highest ground within the search
    // radius that actually drains here.
    const head = selectHeadwater(grid, naturalCells, idx, HEAD_SEARCH_RADIUS_M);
    if (head.index < 0) continue;

    const reliefM = (head.elevation - cellElev);
    const approachM = haversineDistanceM(
      crossing.lat,
      crossing.lng,
      grid.cells[cr][cc].lat,
      grid.cells[cr][cc].lng
    );

    const better =
      !best ||
      reliefM > best.reliefM ||
      (reliefM === best.reliefM && naturalCells.length > best.basinCells);
    if (better) {
      best = { index: idx, basinCells: naturalCells.length, approachM, reliefM };
    }
  }

  return best;
}

/**
 * The head of the watercourse: the highest ground, within the search radius,
 * that drains to the crossing. Restricted to one drainage, so the catchment is
 * fed from a single direction.
 */
function selectHeadwater(
  grid: DemGrid,
  basinCells: number[],
  toeIndex: number,
  searchRadiusM: number
): { index: number; elevation: number } {
  const size = grid.size;
  const tr = Math.floor(toeIndex / size);
  const tc = toeIndex % size;
  const toe = grid.cells[tr][tc];

  let bestIndex = -1;
  let bestElev = -Infinity;

  for (const idx of basinCells) {
    const r = Math.floor(idx / size);
    const c = idx % size;
    const e = grid.cells[r][c].elevation;
    if (e === null || !isFinite(e)) continue;

    const d = haversineDistanceM(toe.lat, toe.lng, grid.cells[r][c].lat, grid.cells[r][c].lng);
    if (d > searchRadiusM) continue;
    if (e > bestElev) {
      bestElev = e;
      bestIndex = idx;
    }
  }

  return { index: bestIndex, elevation: bestElev };
}

// ---------------------------------------------------------------------------
// Catchment boundary
// ---------------------------------------------------------------------------

function traceCatchmentBoundary(grid: DemGrid, inBasin: boolean[][]): [number, number][] | null {
  const { size } = grid;

  const cornerLat: number[][] = [];
  const cornerLng: number[][] = [];
  for (let r = 0; r <= size; r++) {
    cornerLat[r] = [];
    cornerLng[r] = [];
    for (let c = 0; c <= size; c++) {
      let latSum = 0;
      let lngSum = 0;
      let cnt = 0;
      for (let dr = -1; dr <= 0; dr++) {
        for (let dc = -1; dc <= 0; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
          if (!grid.inDomain[rr][cc]) continue;
          latSum += grid.cells[rr][cc].lat;
          lngSum += grid.cells[rr][cc].lng;
          cnt++;
        }
      }
      cornerLat[r][c] = cnt > 0 ? latSum / cnt : NaN;
      cornerLng[r][c] = cnt > 0 ? lngSum / cnt : NaN;
    }
  }

  const isBasin = (r: number, c: number) =>
    r >= 0 && r < size && c >= 0 && c < size && inBasin[r][c];

  const key = (r: number, c: number) => `${r},${c}`;
  const outgoing = new Map<string, string[]>();
  const addEdge = (fr: number, fc: number, tr: number, tc: number) => {
    const k = key(fr, fc);
    const list = outgoing.get(k);
    const to = key(tr, tc);
    if (list) list.push(to);
    else outgoing.set(k, [to]);
  };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isBasin(r, c)) continue;
      if (!isBasin(r - 1, c)) addEdge(r, c, r, c + 1);
      if (!isBasin(r, c + 1)) addEdge(r, c + 1, r + 1, c + 1);
      if (!isBasin(r + 1, c)) addEdge(r + 1, c + 1, r + 1, c);
      if (!isBasin(r, c - 1)) addEdge(r + 1, c, r, c);
    }
  }

  const toPoint = (k: string): [number, number] | null => {
    const [r, c] = k.split(',').map(Number);
    const lat = cornerLat[r]?.[c];
    const lng = cornerLng[r]?.[c];
    if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return null;
    return [lat, lng];
  };

  const visitedEdges = new Set<string>();
  const loops: [number, number][][] = [];

  for (const [startKey, firstTargets] of outgoing) {
    for (const firstTarget of firstTargets) {
      if (visitedEdges.has(`${startKey}>${firstTarget}`)) continue;
      visitedEdges.add(`${startKey}>${firstTarget}`);

      const pts: [number, number][] = [];
      const first = toPoint(startKey);
      if (!first) continue;
      pts.push(first);

      let cursor = firstTarget;
      let guard = 0;
      while (cursor !== startKey && guard++ < 100000) {
        const p = toPoint(cursor);
        if (!p) break;
        pts.push(p);
        const nexts = outgoing.get(cursor);
        if (!nexts || nexts.length === 0) break;
        const next = nexts.find((t) => !visitedEdges.has(`${cursor}>${t}`));
        if (next === undefined) break;
        visitedEdges.add(`${cursor}>${next}`);
        cursor = next;
      }
      if (pts.length >= 4) loops.push(pts);
    }
  }

  if (loops.length === 0) return null;

  let best: [number, number][] = loops[0];
  let bestArea = -Infinity;
  for (const loop of loops) {
    const area = Math.abs(calculatePolygonAreaKm2(loop));
    if (area > bestArea) {
      bestArea = area;
      best = loop;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Contours (marching squares over the natural DEM)
// ---------------------------------------------------------------------------

function buildContours(
  grid: DemGrid,
  naturalElev: Float64Array,
  levels: number[]
): { elevationM: number; coordinates: [number, number][] }[] {
  const { size, inDomain } = grid;
  const contours: { elevationM: number; coordinates: [number, number][] }[] = [];
  const flat = (r: number, c: number) => r * size + c;
  const get = (r: number, c: number) => (inDomain[r]?.[c] ? naturalElev[flat(r, c)] : NaN);
  const segKey = (p: [number, number]) => `${p[0].toFixed(9)},${p[1].toFixed(9)}`;

  for (const level of levels) {
    const segs: [[number, number], [number, number]][] = [];

    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const e00 = get(r, c);
        const e01 = get(r, c + 1);
        const e11 = get(r + 1, c + 1);
        const e10 = get(r + 1, c);
        if (!isFinite(e00) || !isFinite(e01) || !isFinite(e11) || !isFinite(e10)) continue;

        let code = 0;
        if (e00 >= level) code |= 1;
        if (e01 >= level) code |= 2;
        if (e11 >= level) code |= 4;
        if (e10 >= level) code |= 8;
        if (code === 0 || code === 15) continue;

        const p00: [number, number] = [grid.cells[r][c].lat, grid.cells[r][c].lng];
        const p01: [number, number] = [grid.cells[r][c + 1].lat, grid.cells[r][c + 1].lng];
        const p11: [number, number] = [grid.cells[r + 1][c + 1].lat, grid.cells[r + 1][c + 1].lng];
        const p10: [number, number] = [grid.cells[r + 1][c].lat, grid.cells[r + 1][c].lng];

        const interp = (
          ea: number, eb: number, la: [number, number], lb: [number, number]
        ): [number, number] => {
          const t = Math.abs(ea - eb) > 1e-9 ? (level - ea) / (eb - ea) : 0.5;
          return [la[0] + t * (lb[0] - la[0]), la[1] + t * (lb[1] - la[1])];
        };

        const top = () => interp(e00, e01, p00, p01);
        const right = () => interp(e01, e11, p01, p11);
        const bottom = () => interp(e10, e11, p10, p11);
        const left = () => interp(e00, e10, p00, p10);

        switch (code) {
          case 1: case 14: segs.push([left(), top()]); break;
          case 2: case 13: segs.push([top(), right()]); break;
          case 3: case 12: segs.push([left(), right()]); break;
          case 4: case 11: segs.push([right(), bottom()]); break;
          case 6: case 9: segs.push([top(), bottom()]); break;
          case 7: case 8: segs.push([left(), bottom()]); break;
          case 5:
            segs.push([left(), top()]);
            segs.push([right(), bottom()]);
            break;
          case 10:
            segs.push([top(), right()]);
            segs.push([left(), bottom()]);
            break;
        }
      }
    }

    if (segs.length === 0) continue;

    const adjacency = new Map<string, number[]>();
    segs.forEach((s, i) => {
      for (const p of s) {
        const k = segKey(p);
        const list = adjacency.get(k);
        if (list) list.push(i);
        else adjacency.set(k, [i]);
      }
    });

    const used = new Array<boolean>(segs.length).fill(false);
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const chain: [number, number][] = [segs[i][0], segs[i][1]];
      for (let dir = 0; dir < 2; dir++) {
        for (;;) {
          const end = dir === 0 ? chain[chain.length - 1] : chain[0];
          const nextIdx = (adjacency.get(segKey(end)) ?? []).find((j) => !used[j]);
          if (nextIdx === undefined) break;
          used[nextIdx] = true;
          const [a, b] = segs[nextIdx];
          const other = segKey(a) === segKey(end) ? b : a;
          if (dir === 0) chain.push(other);
          else chain.unshift(other);
        }
      }
      if (chain.length >= 3) {
        contours.push({ elevationM: level, coordinates: smoothPolylineChaikin(chain, 2) });
      }
    }
  }

  return contours;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface DelineationOptions {
  /** The chainage point the stormwater must arrive at. */
  targetLat: number;
  targetLng: number;
  corridorBearingDeg: number;
  radiusM: number;
  /** One DEM sample per entry of `cellIndices`. */
  elevations: (number | null)[];
  /** Flat cell index for each entry of `elevations`. */
  cellIndices: number[];
  /** Corridor alignment, used to model the formation. */
  corridor?: [number, number][];
  /** Chainage at the start of the corridor polyline, for station arithmetic. */
  corridorStartChainage?: number;
}

/**
 * Delineates the catchment that drains to the specified chainage point.
 * @throws {DemUnavailableError} when the terrain cannot be analysed honestly.
 */
export function delineateUpstreamCatchment(options: DelineationOptions): DelineationResult {
  const {
    targetLat,
    targetLng,
    corridorBearingDeg,
    radiusM,
    elevations,
    cellIndices,
    corridor,
    corridorStartChainage = 0,
  } = options;

  const grid = buildDemGrid(targetLat, targetLng, corridorBearingDeg, radiusM);
  const coverage = applyBulkElevations(grid, elevations, cellIndices);

  const flat = (r: number, c: number) => r * grid.size + c;
  const crossingIndex = flat(grid.originR, grid.originC);

  // Natural surface, used for every reported measurement.
  const n = grid.size * grid.size;
  const naturalElev = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    naturalElev[i] = grid.cells[Math.floor(i / grid.size)][i % grid.size].elevation ?? Infinity;
  }

  if (!isFinite(naturalElev[crossingIndex])) {
    throw new DemUnavailableError(
      `No elevation data at the chainage point (${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}). ` +
        `The global DEM does not cover this location.`,
      coverage
    );
  }

  if (coverage < MIN_DEM_COVERAGE) {
    throw new DemUnavailableError(
      `Elevation coverage is only ${(coverage * 100).toFixed(1)}% within the ${radiusM} m analysis scope ` +
        `(minimum required ${(MIN_DEM_COVERAGE * 100).toFixed(0)}%). Results would be unreliable.`,
      coverage
    );
  }

  // Model the formation so flow can cross the bench and arrive at the point.
  if (corridor && corridor.length >= 2) {
    markCorridorFormation(grid, corridor, corridorStartChainage);
  }

  const terrain = conditionTerrain(grid, naturalElev, crossingIndex);
  const network = buildFlowNetwork(grid, terrain.elev);

  // Find the real watercourse whose flow path reaches this chainage. Tracing
  // upstream from the crossing cell itself does not work: the cell sits on an
  // embankment that the DEM shows as a raised bench, so ground on both sides
  // falls AWAY from it and it has no upstream drainage at all.
  //
  // Instead, identify channelised ground by flow accumulation and choose the
  // channel whose downstream path passes closest to the crossing. The point
  // where it passes is the toe a culvert would actually intercept.
  const pour = findPourPoint(grid, network, terrain.elev, crossingIndex);

  if (!pour) {
    throw new DemUnavailableError(
      `No ground drains to the formation beside chainage ` +
        `${targetLat.toFixed(6)}, ${targetLng.toFixed(6)} within ${radiusM} m. ` +
        `The corridor sits on high ground here, so there is no upstream catchment to report.`,
      coverage
    );
  }

  const pourIndex = pour.index;
  const pourR = Math.floor(pourIndex / grid.size);
  const pourC = pourIndex % grid.size;

  // The catchment is everything draining to this one toe: a culvert takes flow
  // from a single direction, so this is one drainage, not the whole grid.
  const { inBasin, naturalCells } = contributingArea(network, grid, [pourIndex]);

  if (naturalCells.length < 5) {
    throw new DemUnavailableError(
      `Only ${naturalCells.length} ground cells drain to this chainage within ${radiusM} m, ` +
        `which is too small to be a real catchment.`,
      coverage
    );
  }

  // Head of the watercourse: the highest ground within the search radius that
  // actually drains here. Everything above this point is outside the design
  // reach of the culvert.
  const head = selectHeadwater(grid, naturalCells, pourIndex, HEAD_SEARCH_RADIUS_M);
  if (head.index < 0) {
    throw new DemUnavailableError(
      `No ground within ${HEAD_SEARCH_RADIUS_M} m of this crossing drains to it, ` +
        `so the source of the flow cannot be identified.`,
      coverage
    );
  }

  const headR = Math.floor(head.index / grid.size);
  const headC = head.index % grid.size;
  const headElevationM = head.elevation;

  // The drawn channel is the path stormwater actually takes: downhill from the
  // highest point to the toe, then on to the chainage point itself.
  const flowPath = traceDownstreamPath(network, grid, head.index, pourIndex);
  if (flowPath.length < 2) {
    throw new DemUnavailableError(
      `The highest point within ${HEAD_SEARCH_RADIUS_M} m does not drain down to this ` +
        `crossing, so no continuous flow path exists.`,
      coverage
    );
  }

  const boundary = traceCatchmentBoundary(grid, inBasin);
  if (!boundary) {
    throw new DemUnavailableError('The catchment boundary could not be traced.', coverage);
  }

  // --- Channel geometry: highest point -> toe -> chainage point -----------
  // flowPath runs in the direction water travels. It is lightly smoothed only to
  // stop the 8-connected D8 steps looking like a staircase; the route itself is
  // unchanged.
  const rawStreamPath: [number, number][] = flowPath.map((idx) => {
    const r = Math.floor(idx / grid.size);
    const c = idx % grid.size;
    return [grid.cells[r][c].lat, grid.cells[r][c].lng] as [number, number];
  });
  rawStreamPath.push([grid.cells[pourR][pourC].lat, grid.cells[pourR][pourC].lng]);
  // Carry the last few metres onto the chainage point itself, so the drawn
  // stream terminates exactly on the placemark.
  rawStreamPath.push([targetLat, targetLng]);

  const streamPath = smoothPolylineChaikin(rawStreamPath, 2);

  let streamLengthM = 0;
  for (let i = 0; i < streamPath.length - 1; i++) {
    streamLengthM += haversineDistanceM(
      streamPath[i][0], streamPath[i][1], streamPath[i + 1][0], streamPath[i + 1][1]
    );
  }

  // --- Catchment polygon --------------------------------------------------
  const catchmentPolygon = smoothClosedPolygonChaikin([...boundary, boundary[0]], 2);

  // --- Measured metrics ---------------------------------------------------
  // Highest Contour is the level of the head of the watercourse - the highest
  // point the culvert actually has to collect from - not simply the highest
  // cell anywhere in the basin.
  let highestContourM = headElevationM;
  const basinElevations: number[] = [];
  for (const idx of naturalCells) {
    const e = naturalElev[idx];
    if (isFinite(e)) basinElevations.push(e);
  }
  if (!isFinite(highestContourM) || basinElevations.length === 0) {
    throw new DemUnavailableError('Catchment elevations could not be resolved.', coverage);
  }

  // The invert is the ground level at the toe where the water actually arrives.
  const toeElevation = naturalElev[pourIndex];
  const invertElevation = isFinite(toeElevation) ? toeElevation : terrain.culvertInvertM;
  const originElevationM = Math.round(invertElevation * 10) / 10;
  const highestContourMr = Math.round(highestContourM * 10) / 10;
  const reliefM = Math.round((highestContourMr - originElevationM) * 10) / 10;

  // --- Tributaries: sub-channels hanging off the main stem ----------------
  const consumed = new Set<number>(flowPath);
  const branches: number[][] = [];
  for (const stemCell of flowPath) {
    for (const u of network.upstream.get(stemCell) ?? []) {
      if (consumed.has(u)) continue;
      const ur = Math.floor(u / grid.size);
      const uc = u % grid.size;
      if (!inBasin[ur][uc]) continue;

      const chain: number[] = [];
      let w: number | undefined = u;
      let guard = 0;
      while (w !== undefined && guard++ < 500) {
        chain.push(w);
        consumed.add(w);
        let next = -1;
        let nextElev = -Infinity;
        for (const child of network.upstream.get(w) ?? []) {
          if (consumed.has(child)) continue;
          const chr = Math.floor(child / grid.size);
          const chc = child % grid.size;
          if (!inBasin[chr][chc]) continue;
          const e = naturalElev[child];
          if (isFinite(e) && e > nextElev) {
            nextElev = e;
            next = child;
          }
        }
        w = next === -1 ? undefined : next;
      }
      if (chain.length >= 2) branches.push(chain);
    }
  }
  branches.sort((a, b) => b.length - a.length);

  const tributaryPaths: [number, number][][] = branches.slice(0, 6).map((chain) => {
    const ordered = [...chain].reverse();
    const pts: [number, number][] = ordered.map((idx) => {
      const r = Math.floor(idx / grid.size);
      const c = idx % grid.size;
      return [grid.cells[r][c].lat, grid.cells[r][c].lng] as [number, number];
    });
    return smoothPolylineChaikin(pts, 2);
  });

  // --- Elevation profile along the channel, from the natural DEM -----------
  const elevationProfile: { distanceM: number; elevationM: number; lat: number; lng: number }[] = [];
  let runM = 0;
  for (let i = 0; i < streamPath.length; i++) {
    if (i > 0) {
      runM += haversineDistanceM(
        streamPath[i - 1][0], streamPath[i - 1][1], streamPath[i][0], streamPath[i][1]
      );
    }
    let best: number | null = null;
    let bestD = Infinity;
    for (const idx of flowPath) {
      const r = Math.floor(idx / grid.size);
      const c = idx % grid.size;
      const d =
        (grid.cells[r][c].lat - streamPath[i][0]) ** 2 +
        (grid.cells[r][c].lng - streamPath[i][1]) ** 2;
      if (d < bestD) {
        bestD = d;
        const e = naturalElev[idx];
        best = isFinite(e) ? e : null;
      }
    }
    if (best === null) continue;
    elevationProfile.push({
      distanceM: Math.round(runM),
      elevationM: Math.round(best * 10) / 10,
      lat: streamPath[i][0],
      lng: streamPath[i][1],
    });
  }

  // --- Contours -----------------------------------------------------------
  const elevLow = Math.floor(Math.min(...basinElevations));
  const elevHigh = Math.ceil(Math.max(...basinElevations));
  const interval = Math.max(1, Math.round(Math.max(1, elevHigh - elevLow) / 10));
  const levels: number[] = [];
  for (let lv = elevLow + interval; lv <= elevHigh; lv += interval) levels.push(lv);

  // --- Where does the flow arrive from? ----------------------------------
  const headCell = grid.cells[headR][headC];
  const flowArrivalBearingDeg =
    Math.round(calculateBearingSafe(targetLat, targetLng, headCell.lat, headCell.lng) * 10) / 10;
  const headDistanceM = Math.round(
    haversineDistanceM(targetLat, targetLng, headCell.lat, headCell.lng)
  );

  return {
    streamPath,
    streamLengthKm: Math.round((streamLengthM / 1000) * 1000) / 1000,
    originElevationM,
    highestContourM: highestContourMr,
    reliefM,
    catchmentPolygon,
    catchmentAreaKm2: Math.round(calculatePolygonAreaKm2(catchmentPolygon) * 10000) / 10000,
    tributaryPaths,
    contours: buildContours(grid, naturalElev, levels),
    elevationProfile,
    contributingCells: naturalCells.length,
    demCoverage: coverage,
    gridSize: grid.size,
    cellSizeM: grid.spacingM,
    flowArrivalBearingDeg,
    flowArrivesAtCrossing: toeIsAtCrossing(grid, pourIndex) && flowPath.length >= 2,
    channelApproachM: Math.round(pour.approachM * 10) / 10,
    streamHeadElevationM: Math.round(headElevationM * 10) / 10,
    headDistanceM,
    headCoordinates: [headCell.lat, headCell.lng],
  };
}
