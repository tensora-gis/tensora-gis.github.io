import {
  destinationPoint,
  haversineDistanceM,
  calculatePolygonAreaKm2,
  smoothPolylineChaikin,
  smoothClosedPolygonChaikin,
} from './geoUtils';

function cellSpacingForRadius(radiusM: number): number {
  if (radiusM <= 1000) return 30;
  if (radiusM <= 3000) return 60;
  return 90;
}

const FORMATION_HALF_WIDTH_M = 12;
const FORMATION_GRADE = 0.003;
const CULVERT_OPENING_HALF_LENGTH_M = 30;
const CULVERT_TOE_SEARCH_M = 90;

/** Force the visual catchment polygon to be a strip of this half-width around the stream. */
const STREAM_BUFFER_HALF_WIDTH_M = 30;

export const MIN_REQUIRED_DROP_M = 5;
const MIN_DEM_COVERAGE = 0.8;
const MIN_BASIN_CELLS = 20;

interface DemCell {
  r: number;
  c: number;
  lat: number;
  lng: number;
  elevation: number | null;
}

export interface DemGrid {
  size: number;
  spacingM: number;
  radiusM: number;
  originR: number;
  originC: number;
  upstreamBearingDeg: number;
  cells: DemCell[][];
  inDomain: boolean[][];
  isFormation: boolean[][];
  corridorStationM: Float64Array;
  crossingStationM: number;
  coverage: number;
}

export interface DelineationResult {
  streamPath: [number, number][];
  streamLengthKm: number;
  originElevationM: number;
  highestContourM: number;
  reliefM: number;
  catchmentPolygon: [number, number][];
  catchmentAreaKm2: number;
  tributaryPaths: [number, number][][];
  contours: { elevationM: number; coordinates: [number, number][] }[];
  elevationProfile: { distanceM: number; elevationM: number; lat: number; lng: number }[];
  contributingCells: number;
  demCoverage: number;
  gridSize: number;
  cellSizeM: number;
  flowArrivalBearingDeg: number | null;
  flowArrivesAtCrossing: boolean;
  channelApproachM: number;
  streamHeadElevationM: number | null;
  headDistanceM: number;
  headCoordinates: [number, number];
}

export class DemUnavailableError extends Error {
  readonly coverage: number;
  constructor(message: string, coverage: number) {
    super(message);
    this.name = 'DemUnavailableError';
    this.coverage = coverage;
  }
}

// ---------------------------------------------------------------------------
// Grid construction & utility
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
// Corridor formation & Routing
// ---------------------------------------------------------------------------

function calculateBearingSafe(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function nearestCellIndex(grid: DemGrid, lat: number, lng: number): number {
  const { size, cells, inDomain, originR, originC, spacingM, upstreamBearingDeg } = grid;
  const up = (upstreamBearingDeg * Math.PI) / 180;
  const lateral = up + Math.PI / 2;

  const midLat = (lat + cells[originR][originC].lat) / 2;
  const mPerDegLat = 111132;
  const mPerDegLng = Math.max(1, 111412 * Math.cos((midLat * Math.PI) / 180));

  const dLat = (lat - cells[originR][originC].lat) * mPerDegLat;
  const dLng = (lng - cells[originR][originC].lng) * mPerDegLng;

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

function markCorridorFormation(grid: DemGrid, corridor: [number, number][], startChainage = 0): void {
  const { size } = grid;
  if (corridor.length < 2) return;

  const bandHalfWidth = Math.max(FORMATION_HALF_WIDTH_M, grid.spacingM / 2);
  const alongStep = Math.max(5, grid.spacingM / 4);
  const acrossStep = Math.max(3, grid.spacingM / 5);
  const acrossCount = Math.max(1, Math.ceil(bandHalfWidth / acrossStep));

  const cumulative: number[] = [0];
  for (let i = 1; i < corridor.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineDistanceM(corridor[i - 1][0], corridor[i - 1][1], corridor[i][0], corridor[i][1]));
  }

  const flat = (r: number, c: number) => r * size + c;

  for (let i = 1; i < corridor.length; i++) {
    const a = corridor[i - 1];
    const b = corridor[i];
    const segLen = cumulative[i] - cumulative[i - 1];
    if (segLen <= 0) continue;

    const midLat = (a[0] + b[0]) / 2;
    const midLng = (a[1] + b[1]) / 2;
    const gridCentre = grid.cells[grid.originR][grid.originC];
    if (haversineDistanceM(gridCentre.lat, gridCentre.lng, midLat, midLng) > grid.radiusM + grid.spacingM * 2) continue;

    const segBearing = calculateBearingSafe(a[0], a[1], b[0], b[1]);
    const steps = Math.max(1, Math.ceil(segLen / alongStep));

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const stationM = cumulative[i - 1] + segLen * t;
      const centre = destinationPoint(a[0], a[1], segLen * t, segBearing);

      for (let k = -acrossCount; k <= acrossCount; k++) {
        const offsetM = k * acrossStep;
        if (Math.abs(offsetM) > bandHalfWidth) continue;

        const p = destinationPoint(centre[0], centre[1], offsetM, (segBearing + 90) % 360);
        const idx = nearestCellIndex(grid, p[0], p[1]);
        if (idx < 0) continue;
        const r = Math.floor(idx / size);
        const c = idx % size;
        if (!grid.inDomain[r][c]) continue;

        grid.isFormation[r][c] = true;
        const prev = grid.corridorStationM[flat(r, c)];
        if (Number.isNaN(prev)) grid.corridorStationM[flat(r, c)] = stationM;
      }
    }
  }

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

function hasFormation(grid: DemGrid): boolean {
  const { size } = grid;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid.isFormation[r][c]) return true;
  return false;
}

function toeIsAtCrossing(grid: DemGrid, pourIndex: number): boolean {
  const { size } = grid;
  const flat = (r: number, c: number) => r * size + c;
  if (!hasFormation(grid)) return true;

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
      if (Math.abs(st - grid.crossingStationM) <= CULVERT_OPENING_HALF_LENGTH_M + grid.spacingM) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Terrain conditioning & D8 Flow Routing
// ---------------------------------------------------------------------------

class ElevHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number { return this.vals.length; }
  push(key: number, val: number): void {
    this.keys.push(key); this.vals.push(val);
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
      this.keys[0] = lastKey; this.vals[0] = lastVal;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1; const r = l + 1; let m = i;
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
      const nr = r + DR8[k]; const nc = c + DC8[k];
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
    const r = Math.floor(idx / size); const c = idx % size;
    for (let k = 0; k < 8; k++) {
      const nr = r + DR8[k]; const nc = c + DC8[k];
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      if (!grid.inDomain[nr][nc] || grid.isFormation[nr][nc]) continue;
      const ni = nr * size + nc;
      if (hops[ni] !== -1 || !isFinite(elev[ni])) continue;
      hops[ni] = hops[idx] + 1;
      queue.push(ni);
    }
  }

  const EPSILON_M = 1e-4;
  for (let i = 0; i < n; i++) if (hops[i] > 0) elev[i] += hops[i] * EPSILON_M;
}

function conditionTerrain(grid: DemGrid, naturalElev: Float64Array, crossingIndex: number) {
  const { size, inDomain, isFormation } = grid;
  const elev = Float64Array.from(naturalElev);
  const flat = (r: number, c: number) => r * size + c;
  const crossing = grid.cells[Math.floor(crossingIndex / size)][crossingIndex % size];

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

  if (isFormation[Math.floor(crossingIndex / size)][crossingIndex % size]) {
    if (isFinite(elev[crossingIndex]) && elev[crossingIndex] > culvertInvertM - 1e-3) {
      elev[crossingIndex] = culvertInvertM - 1e-3;
    }
  }

  const seeds: number[] = [];
  for (let i = 0; i < size; i++) seeds.push(i, (size - 1) * size + i, i * size, i * size + size - 1);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!inDomain[r][c] || !isFormation[r][c]) continue;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr; const nc = c + dc;
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

interface FlowNetwork {
  drain: Int8Array;
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
      let bestSlope = 0; let bestK = -1;
      for (let k = 0; k < 8; k++) {
        const nr = r + DR8[k]; const nc = c + DC8[k];
        if (nr < 0 || nr >= grid.size || nc < 0 || nc >= grid.size) continue;
        if (!inDomain[nr][nc] || grid.isFormation[nr][nc]) continue;
        const ne = elev[flat(nr, nc)];
        if (!isFinite(ne)) continue;
        const slope = (e - ne) / (Math.hypot(DR8[k], DC8[k]) * grid.spacingM);
        if (slope > bestSlope) { bestSlope = slope; bestK = k; }
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

function contributingArea(network: FlowNetwork, grid: DemGrid, stem: number[]) {
  const { size } = grid;
  const inBasin: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const naturalCells: number[] = [];
  const queue: number[] = [];

  for (const idx of stem) {
    const r = Math.floor(idx / size); const c = idx % size;
    if (!inBasin[r][c]) { inBasin[r][c] = true; queue.push(idx); }
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const r = Math.floor(idx / size); const c = idx % size;
    if (!grid.isFormation[r][c]) naturalCells.push(idx);
    for (const u of network.upstream.get(idx) ?? []) {
      const ur = Math.floor(u / size); const uc = u % size;
      if (inBasin[ur][uc]) continue;
      inBasin[ur][uc] = true; queue.push(u);
    }
  }
  return { inBasin, naturalCells };
}

// ---------------------------------------------------------------------------
// New Valley Tracing logic (Dijkstra)
// ---------------------------------------------------------------------------

function findPourPoint(grid: DemGrid, crossingIndex: number): number {
  const { size } = grid;
  const cr = Math.floor(crossingIndex / size);
  const cc = crossingIndex % size;
  if (!hasFormation(grid)) return crossingIndex;

  let bestIndex = -1;
  let bestDist = Infinity;
  const searchRadius = Math.ceil(CULVERT_TOE_SEARCH_M / grid.spacingM);
  
  for (let r = Math.max(0, cr - searchRadius); r < Math.min(size, cr + searchRadius); r++) {
    for (let c = Math.max(0, cc - searchRadius); c < Math.min(size, cc + searchRadius); c++) {
      if (!grid.inDomain[r][c] || grid.isFormation[r][c]) continue;
      
      let touches = false;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
           const nr = r+dr; const nc = c+dc;
           if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid.isFormation[nr][nc]) {
             touches = true; break;
           }
        }
        if (touches) break;
      }
      if (!touches) continue;

      const d = haversineDistanceM(grid.cells[cr][cc].lat, grid.cells[cr][cc].lng, grid.cells[r][c].lat, grid.cells[r][c].lng);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = r * size + c;
      }
    }
  }
  return bestIndex !== -1 ? bestIndex : crossingIndex;
}

/**
 * Uses Dijkstra to route from the highest peak to the pour point through the valleys.
 * Heavy penalties are applied for moving uphill, forcing the path to follow natural depressions.
 */
function traceValleyPath(
  grid: DemGrid,
  elev: Float64Array,
  startIndex: number, // highest peak
  endIndex: number    // pour point
): number[] {
  const { size, spacingM } = grid;
  const n = size * size;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = new ElevHeap();

  dist[startIndex] = 0;
  heap.push(0, startIndex);

  while (heap.size > 0) {
    const u = heap.pop()!;
    if (u === endIndex) break;
    
    const ur = Math.floor(u / size);
    const uc = u % size;
    const uElev = elev[u];

    for (let k = 0; k < 8; k++) {
      const vr = ur + DR8[k];
      const vc = uc + DC8[k];
      if (vr < 0 || vr >= size || vc < 0 || vc >= size) continue;
      if (!grid.inDomain[vr][vc]) continue;
      
      const v = vr * size + vc;
      const vElev = elev[v];
      if (!isFinite(vElev)) continue;

      const distM = Math.hypot(DR8[k], DC8[k]) * spacingM;
      let cost = distM;
      
      // Penalize uphill heavily so water finds the lowest valleys
      if (vElev > uElev) {
        cost += (vElev - uElev) * 50;
      }
      
      // Avoid routing through the formation until the very end
      if (grid.isFormation[vr][vc] && v !== endIndex) {
        cost += 1000;
      }

      const newDist = dist[u] + cost;
      if (newDist < dist[v]) {
        dist[v] = newDist;
        prev[v] = u;
        heap.push(newDist, v);
      }
    }
  }

  const path: number[] = [];
  let curr = endIndex;
  while (curr !== -1) {
    path.push(curr);
    if (curr === startIndex) break;
    curr = prev[curr];
  }
  path.reverse();
  return path;
}

// ---------------------------------------------------------------------------
// Custom Stream Buffer Mask & Boundary Tracing
// ---------------------------------------------------------------------------

function buildStreamBufferMask(
  grid: DemGrid,
  flowPath: number[],
  crossingIndex: number,
  bufferRadiusM: number
): boolean[][] {
  const { size, inDomain, spacingM } = grid;
  const mask: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const maxCells = Math.max(1, Math.ceil(bufferRadiusM / spacingM));
  
  const path = [...flowPath, crossingIndex];

  for (const idx of path) {
    const r = Math.floor(idx / size);
    const c = idx % size;

    for (let dr = -maxCells; dr <= maxCells; dr++) {
      for (let dc = -maxCells; dc <= maxCells; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (!inDomain[nr][nc]) continue;
        
        if (Math.hypot(dr, dc) <= maxCells) {
          mask[nr][nc] = true;
        }
      }
    }
  }
  return mask;
}

function traceCatchmentBoundary(grid: DemGrid, inMask: boolean[][]): [number, number][] | null {
  const { size } = grid;
  const level = 0.5;

  const cellValue = (r: number, c: number): number => {
    if (r < 0 || r >= size || c < 0 || c >= size) return 0;
    if (!grid.inDomain[r][c]) return 0;
    return inMask[r][c] ? 1 : 0;
  };

  const segs: [[number, number], [number, number]][] = [];

  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const e00 = cellValue(r, c); const e01 = cellValue(r, c + 1);
      const e11 = cellValue(r + 1, c + 1); const e10 = cellValue(r + 1, c);

      let code = 0;
      if (e00 >= level) code |= 1; if (e01 >= level) code |= 2;
      if (e11 >= level) code |= 4; if (e10 >= level) code |= 8;
      if (code === 0 || code === 15) continue;

      const p00: [number, number] = [grid.cells[r][c].lat, grid.cells[r][c].lng];
      const p01: [number, number] = [grid.cells[r][c + 1].lat, grid.cells[r][c + 1].lng];
      const p11: [number, number] = [grid.cells[r + 1][c + 1].lat, grid.cells[r + 1][c + 1].lng];
      const p10: [number, number] = [grid.cells[r + 1][c].lat, grid.cells[r + 1][c].lng];

      const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const top = () => mid(p00, p01); const right = () => mid(p01, p11);
      const bottom = () => mid(p10, p11); const left = () => mid(p00, p10);

      switch (code) {
        case 1: case 14: segs.push([left(), top()]); break;
        case 2: case 13: segs.push([top(), right()]); break;
        case 3: case 12: segs.push([left(), right()]); break;
        case 4: case 11: segs.push([right(), bottom()]); break;
        case 6: case 9: segs.push([top(), bottom()]); break;
        case 7: case 8: segs.push([left(), bottom()]); break;
        case 5: segs.push([left(), top()]); segs.push([right(), bottom()]); break;
        case 10: segs.push([top(), right()]); segs.push([left(), bottom()]); break;
      }
    }
  }

  if (segs.length === 0) return null;

  const segKey = (p: [number, number]) => `${p[0].toFixed(9)},${p[1].toFixed(9)}`;
  const adjacency = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of s) {
      const k = segKey(p); const list = adjacency.get(k);
      if (list) list.push(i); else adjacency.set(k, [i]);
    }
  });

  const used = new Array<boolean>(segs.length).fill(false);
  const loops: [number, number][][] = [];

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
        if (dir === 0) chain.push(other); else chain.unshift(other);
      }
    }

    if (chain.length >= 4) {
      const first = chain[0]; const last = chain[chain.length - 1];
      if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6) {
        chain.pop(); loops.push(chain);
      }
    }
  }

  if (loops.length === 0) return null;

  let best: [number, number][] = loops[0]; let bestArea = -Infinity;
  for (const loop of loops) {
    const area = Math.abs(calculatePolygonAreaKm2(loop));
    if (area > bestArea) { bestArea = area; best = loop; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Contours (marching squares)
// ---------------------------------------------------------------------------

function buildContours(grid: DemGrid, naturalElev: Float64Array, levels: number[]) {
  const { size, inDomain } = grid;
  const contours: { elevationM: number; coordinates: [number, number][] }[] = [];
  const flat = (r: number, c: number) => r * size + c;
  const get = (r: number, c: number) => (inDomain[r]?.[c] ? naturalElev[flat(r, c)] : NaN);
  const segKey = (p: [number, number]) => `${p[0].toFixed(9)},${p[1].toFixed(9)}`;

  for (const level of levels) {
    const segs: [[number, number], [number, number]][] = [];

    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const e00 = get(r, c); const e01 = get(r, c + 1);
        const e11 = get(r + 1, c + 1); const e10 = get(r + 1, c);
        if (!isFinite(e00) || !isFinite(e01) || !isFinite(e11) || !isFinite(e10)) continue;

        let code = 0;
        if (e00 >= level) code |= 1; if (e01 >= level) code |= 2;
        if (e11 >= level) code |= 4; if (e10 >= level) code |= 8;
        if (code === 0 || code === 15) continue;

        const p00: [number, number] = [grid.cells[r][c].lat, grid.cells[r][c].lng];
        const p01: [number, number] = [grid.cells[r][c + 1].lat, grid.cells[r][c + 1].lng];
        const p11: [number, number] = [grid.cells[r + 1][c + 1].lat, grid.cells[r + 1][c + 1].lng];
        const p10: [number, number] = [grid.cells[r + 1][c].lat, grid.cells[r + 1][c].lng];

        const interp = (ea: number, eb: number, la: [number, number], lb: [number, number]): [number, number] => {
          const t = Math.abs(ea - eb) > 1e-9 ? (level - ea) / (eb - ea) : 0.5;
          return [la[0] + t * (lb[0] - la[0]), la[1] + t * (lb[1] - la[1])];
        };

        const top = () => interp(e00, e01, p00, p01); const right = () => interp(e01, e11, p01, p11);
        const bottom = () => interp(e10, e11, p10, p11); const left = () => interp(e00, e10, p00, p10);

        switch (code) {
          case 1: case 14: segs.push([left(), top()]); break;
          case 2: case 13: segs.push([top(), right()]); break;
          case 3: case 12: segs.push([left(), right()]); break;
          case 4: case 11: segs.push([right(), bottom()]); break;
          case 6: case 9: segs.push([top(), bottom()]); break;
          case 7: case 8: segs.push([left(), bottom()]); break;
          case 5: segs.push([left(), top()]); segs.push([right(), bottom()]); break;
          case 10: segs.push([top(), right()]); segs.push([left(), bottom()]); break;
        }
      }
    }

    if (segs.length === 0) continue;

    const adjacency = new Map<string, number[]>();
    segs.forEach((s, i) => {
      for (const p of s) {
        const k = segKey(p); const list = adjacency.get(k);
        if (list) list.push(i); else adjacency.set(k, [i]);
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
          if (dir === 0) chain.push(other); else chain.unshift(other);
        }
      }
      if (chain.length >= 3) contours.push({ elevationM: level, coordinates: smoothPolylineChaikin(chain, 2) });
    }
  }
  return contours;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

export interface DelineationOptions {
  targetLat: number;
  targetLng: number;
  corridorBearingDeg: number;
  radiusM: number;
  elevations: (number | null)[];
  cellIndices: number[];
  corridor?: [number, number][];
  corridorStartChainage?: number;
}

export function delineateUpstreamCatchment(options: DelineationOptions): DelineationResult {
  const {
    targetLat, targetLng, corridorBearingDeg, radiusM,
    elevations, cellIndices, corridor, corridorStartChainage = 0,
  } = options;

  const grid = buildDemGrid(targetLat, targetLng, corridorBearingDeg, radiusM);
  const size = grid.size; // FIX: Added missing variable definition here
  const coverage = applyBulkElevations(grid, elevations, cellIndices);

  const flat = (r: number, c: number) => r * size + c;
  const crossingIndex = flat(grid.originR, grid.originC);

  const n = size * size;
  const naturalElev = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    naturalElev[i] = grid.cells[Math.floor(i / size)][i % size].elevation ?? Infinity;
  }

  if (!isFinite(naturalElev[crossingIndex])) {
    throw new DemUnavailableError(`No elevation data at the chainage point (${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}).`, coverage);
  }

  if (coverage < MIN_DEM_COVERAGE) {
    throw new DemUnavailableError(`Elevation coverage is only ${(coverage * 100).toFixed(1)}% within the ${radiusM} m scope.`, coverage);
  }

  if (corridor && corridor.length >= 2) {
    markCorridorFormation(grid, corridor, corridorStartChainage);
  }

  const terrain = conditionTerrain(grid, naturalElev, crossingIndex);
  const network = buildFlowNetwork(grid, terrain.elev);

  const pourIndex = findPourPoint(grid, crossingIndex);
  
  // Find the absolute highest peak in the entire search radius
  let headIndex = -1;
  let headElevationM = -Infinity;
  for (let i = 0; i < n; i++) {
    if (!grid.inDomain[Math.floor(i / size)][i % size]) continue;
    if (grid.isFormation[Math.floor(i / size)][i % size]) continue;
    const e = naturalElev[i];
    if (isFinite(e) && e > headElevationM) {
      headElevationM = e;
      headIndex = i;
    }
  }
  
  let minElev = Infinity;
  for (let i = 0; i < n; i++) {
    if (!grid.inDomain[Math.floor(i / size)][i % size]) continue;
    const e = naturalElev[i];
    if (isFinite(e) && e < minElev) minElev = e;
  }

  if (headIndex === -1 || headElevationM - minElev < 0.05) {
    throw new DemUnavailableError('No valid terrain or completely flat surface found in the radius.', coverage);
  }

  // Trace path from peak to pour point using Dijkstra, prioritizing valleys
  const flowPath = traceValleyPath(grid, terrain.elev, headIndex, pourIndex);
  if (flowPath.length < 2) {
    throw new DemUnavailableError('Could not trace a valley path to the crossing.', coverage);
  }

  const streamBufferMask = buildStreamBufferMask(grid, flowPath, crossingIndex, STREAM_BUFFER_HALF_WIDTH_M);
  const boundary = traceCatchmentBoundary(grid, streamBufferMask);
  
  if (!boundary) {
    throw new DemUnavailableError('The catchment strip boundary could not be traced.', coverage);
  }

  const rawStreamPath: [number, number][] = flowPath.map((idx) => {
    const r = Math.floor(idx / grid.size); const c = idx % grid.size;
    return [grid.cells[r][c].lat, grid.cells[r][c].lng] as [number, number];
  });
  
  const toePoint: [number, number] = [grid.cells[Math.floor(pourIndex / size)][pourIndex % size].lat, grid.cells[Math.floor(pourIndex / size)][pourIndex % size].lng];
  if (rawStreamPath.length >= 2) {
    const last = rawStreamPath[rawStreamPath.length - 1];
    if (last[0] === toePoint[0] && last[1] === toePoint[1]) rawStreamPath.pop();
  }
  const naturalChannelEnd = rawStreamPath.length;

  let streamLengthM = 0;
  for (let i = 0; i < naturalChannelEnd - 1; i++) {
    streamLengthM += haversineDistanceM(rawStreamPath[i][0], rawStreamPath[i][1], rawStreamPath[i + 1][0], rawStreamPath[i + 1][1]);
  }

  rawStreamPath.push([targetLat, targetLng]);
  const displayedStreamPath = smoothPolylineChaikin(rawStreamPath, 2);

  const catchmentPolygon = smoothClosedPolygonChaikin([...boundary, boundary[0]], 2);

  const { inBasin, naturalCells } = contributingArea(network, grid, flowPath);

  const basinElevations: number[] = [];
  for (const idx of naturalCells) {
    const e = naturalElev[idx];
    if (isFinite(e)) basinElevations.push(e);
  }

  const toeElevation = naturalElev[pourIndex];
  const invertElevation = isFinite(toeElevation) ? toeElevation : terrain.culvertInvertM;
  const originElevationM = Math.round(invertElevation * 10) / 10;
  const highestContourMr = Math.round(headElevationM * 10) / 10;

  const reliefM = headElevationM - invertElevation;

  const consumed = new Set<number>(flowPath);
  const branches: number[][] = [];
  for (const stemCell of flowPath) {
    for (const u of network.upstream.get(stemCell) ?? []) {
      if (consumed.has(u)) continue;
      const ur = Math.floor(u / grid.size); const uc = u % grid.size;
      if (!inBasin[ur][uc]) continue;
      const chain: number[] = [];
      let w: number | undefined = u; let guard = 0;
      while (w !== undefined && guard++ < 500) {
        chain.push(w); consumed.add(w);
        let next = -1; let nextElev = -Infinity;
        for (const child of network.upstream.get(w) ?? []) {
          if (consumed.has(child)) continue;
          const chr = Math.floor(child / grid.size); const chc = child % grid.size;
          if (!inBasin[chr][chc]) continue;
          const e = naturalElev[child];
          if (isFinite(e) && e > nextElev) { nextElev = e; next = child; }
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
      const r = Math.floor(idx / grid.size); const c = idx % grid.size;
      return [grid.cells[r][c].lat, grid.cells[r][c].lng] as [number, number];
    });
    return smoothPolylineChaikin(pts, 2);
  });

  const elevationProfile: { distanceM: number; elevationM: number; lat: number; lng: number }[] = [];
  let runM = 0;
  const profilePath = rawStreamPath.slice(0, naturalChannelEnd);
  for (let i = 0; i < profilePath.length; i++) {
    if (i > 0) {
      runM += haversineDistanceM(profilePath[i - 1][0], profilePath[i - 1][1], profilePath[i][0], profilePath[i][1]);
    }
    const idx = flowPath[i];
    const e = naturalElev[idx];
    if (isFinite(e)) {
      elevationProfile.push({
        distanceM: Math.round(runM),
        elevationM: Math.round(e * 10) / 10,
        lat: profilePath[i][0],
        lng: profilePath[i][1],
      });
    }
  }

  const elevLow = Math.floor(Math.min(...basinElevations));
  const elevHigh = Math.ceil(Math.max(...basinElevations));
  const interval = Math.max(1, Math.round(Math.max(1, elevHigh - elevLow) / 10));
  const levels: number[] = [];
  for (let lv = elevLow + interval; lv <= elevHigh; lv += interval) levels.push(lv);

  const headCell = grid.cells[Math.floor(headIndex / size)][headIndex % size];
  const flowArrivalBearingDeg = Math.round(calculateBearingSafe(targetLat, targetLng, headCell.lat, headCell.lng) * 10) / 10;
  const headDistanceM = Math.round(haversineDistanceM(targetLat, targetLng, headCell.lat, headCell.lng));

  return {
    streamPath: displayedStreamPath,
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
    channelApproachM: Math.round(haversineDistanceM(targetLat, targetLng, toePoint[0], toePoint[1]) * 10) / 10,
    streamHeadElevationM: Math.round(headElevationM * 10) / 10,
    headDistanceM,
    headCoordinates: [headCell.lat, headCell.lng],
  };
}