/**
 * Elevation Service
 *
 * Samples real global terrain models (SRTM 30 m and Copernicus GLO-30) and
 * returns heights above Mean Sea Level.
 *
 * DESIGN RULE: this module NEVER invents an elevation. If a provider is
 * unreachable, rate-limited, or has no data for a location, the sample is
 * returned as `null` and the caller decides whether the analysis can still be
 * trusted. There is no default or assumed baseline.
 *
 * PROVIDER ORDER MATTERS. The public endpoints have very different limits:
 * Open-Meteo is fast but enforces a DAILY request cap and answers 429 once it
 * is spent; OpenTopoData serves 100 points per call with no daily cap on the
 * public endpoint. Treating the capped service as primary and the reliable one
 * as a paced fallback made large analyses collapse to a few percent coverage.
 * The reliable provider therefore leads, and the capped one is only consulted
 * when it is actually usable.
 */

/** A DEM sample. `null` means "not available" and must never be substituted. */
type ElevationSample = number | null;

export type ElevationProvider =
  | 'terrain-tiles'
  | 'opentopodata-srtm30m'
  | 'copernicus-srtm30m'
  | 'open-elevation'
  | 'cache'
  | 'none';

export const PROVIDER_LABELS: Record<ElevationProvider, string> = {
  'terrain-tiles': 'Mapzen/AWS terrain tiles (SRTM + GLO-30)',
  'opentopodata-srtm30m': 'SRTM 30 m (OpenTopoData)',
  'copernicus-srtm30m': 'Copernicus GLO-30 (Open-Meteo)',
  'open-elevation': 'SRTM 30 m (Open-Elevation)',
  cache: 'Cached DEM sample',
  none: 'No DEM data available',
};

import { fetchTerrainElevations } from './terrainTiles';

/**
 * Grid-cell quantisation. SRTM and GLO-30 are ~30 m products, so quantising to
 * 0.0003 deg makes every station on a corridor share the same handful of cells:
 * a bulk query costs a few dozen requests instead of one per grid vertex, and it
 * matches the resolution the data actually has rather than implying false
 * precision.
 */
const DEM_CELL_QUANTUM = 0.0003;

/** OpenTopoData raises its rate limit substantially when a key is supplied. */
const OPENTOPODATA_KEY =
  (typeof process !== 'undefined' ? process.env.OPENTOPODATA_API_KEY : undefined) ?? '';

/** Reject obviously bogus samples (void fill / nodata sentinels). */
function isPlausibleElevation(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    isFinite(value) &&
    value > -500 &&
    value < 9000
  );
}

function demCellKey(lat: number, lng: number): string {
  return `${Math.round(lat / DEM_CELL_QUANTUM)},${Math.round(lng / DEM_CELL_QUANTUM)}`;
}

/**
 * Providers that have answered with a hard rate-limit response are quarantined
 * temporarily (45 seconds cooldown). This allows transient bursts to recover
 * without locking out the user for the entire session.
 */
const quarantined = new Map<string, number>();

function isQuarantined(id: string): boolean {
  const ts = quarantined.get(id);
  if (!ts) return false;
  if (Date.now() - ts > 45_000) {
    quarantined.delete(id);
    return false;
  }
  return true;
}

function quarantine(id: string): void {
  quarantined.set(id, Date.now());
}

// ---------------------------------------------------------------------------
// Persistent DEM cell cache
//
// Shared module-wide and mirrored into localStorage in the browser, so
// re-running a corridor does not re-download the same cells. Only genuine
// values are cached: a failure is never persisted, so a transient outage cannot
// poison later runs.
// ---------------------------------------------------------------------------
const demCache = new Map<string, number>();
const LS_DEM_KEY = 'tensora_real_dem_cache_v3';
const MAX_PERSISTED_CELLS = 30000;

let demCacheLoaded = false;

function loadDemCacheFromStorage(): void {
  if (demCacheLoaded) return;
  demCacheLoaded = true;
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(LS_DEM_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (isPlausibleElevation(v)) demCache.set(k, v);
    }
  } catch {
    // Storage unavailable (Node / private mode) - memory cache only.
  }
}

function flushDemCacheToStorage(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (demCache.size > MAX_PERSISTED_CELLS) return;
    const obj: Record<string, number> = {};
    demCache.forEach((v, k) => {
      obj[k] = v;
    });
    localStorage.setItem(LS_DEM_KEY, JSON.stringify(obj));
  } catch {
    // Quota exceeded / privacy mode - memory cache still works.
  }
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ res: Response | null; timedOut: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return { res: await fetch(url, { ...init, signal: controller.signal }), timedOut: false };
  } catch {
    return { res: null, timedOut: controller.signal.aborted };
  } finally {
    clearTimeout(timer);
  }
}

const emptyValues = (n: number): ElevationSample[] => new Array(n).fill(null);

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/**
 * OpenTopoData, SRTM 30 m. Up to 100 points per call, no daily cap on the
 * public endpoint, and it distinguishes "no data here" (a null elevation) from
 * "request failed", which makes it the dependable primary.
 */
async function queryOpenTopoData(
  coords: { lat: number; lng: number }[]
): Promise<{ values: ElevationSample[]; ok: boolean; rateLimited: boolean }> {
  if (isQuarantined('opentopodata')) return { values: emptyValues(coords.length), ok: false, rateLimited: true };

  const locs = coords.map((c) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`).join('|');
  const url =
    `https://api.opentopodata.org/v1/srtm30m?locations=${locs}` +
    (OPENTOPODATA_KEY ? `&key=${OPENTOPODATA_KEY}` : '');

  const { res } = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 30000);
  if (!res) return { values: emptyValues(coords.length), ok: false, rateLimited: false };
  if (res.status === 429 || res.status === 403) {
    quarantine('opentopodata');
    return { values: emptyValues(coords.length), ok: false, rateLimited: true };
  }
  if (!res.ok) return { values: emptyValues(coords.length), ok: false, rateLimited: false };

  let data: any;
  try {
    data = await res.json();
  } catch {
    return { values: emptyValues(coords.length), ok: false, rateLimited: false };
  }
  if (data?.status !== 'OK' || !Array.isArray(data.results) || data.results.length !== coords.length) {
    return { values: emptyValues(coords.length), ok: false, rateLimited: false };
  }

  return {
    values: data.results.map((r: any) => (isPlausibleElevation(r?.elevation) ? r.elevation : null)),
    ok: true,
    rateLimited: false,
  };
}

/**
 * Open-Meteo, Copernicus GLO-30. Very fast, but enforces a DAILY cap and then
 * answers 429 for the rest of the day. Quarantined on the first 429.
 */
async function queryOpenMeteo(
  coords: { lat: number; lng: number }[]
): Promise<{ values: ElevationSample[]; ok: boolean; rateLimited: boolean }> {
  if (isQuarantined('openmeteo')) return { values: emptyValues(coords.length), ok: false, rateLimited: true };

  const latStr = coords.map((c) => c.lat.toFixed(6)).join(',');
  const lngStr = coords.map((c) => c.lng.toFixed(6)).join(',');
  const { res } = await fetchWithTimeout(
    `https://api.open-meteo.com/v1/elevation?latitude=${latStr}&longitude=${lngStr}`,
    { headers: { Accept: 'application/json' } },
    30000
  );
  if (!res) return { values: emptyValues(coords.length), ok: false, rateLimited: false };
  if (res.status === 429) {
    quarantine('openmeteo');
    return { values: emptyValues(coords.length), ok: false, rateLimited: true };
  }
  if (!res.ok) return { values: emptyValues(coords.length), ok: false, rateLimited: false };

  let data: any;
  try {
    data = await res.json();
  } catch {
    return { values: emptyValues(coords.length), ok: false, rateLimited: false };
  }
  if (!Array.isArray(data?.elevation) || data.elevation.length !== coords.length) {
    return { values: emptyValues(coords.length), ok: false, rateLimited: false };
  }

  return {
    values: data.elevation.map((v: unknown) => (isPlausibleElevation(v) ? v : null)),
    ok: true,
    rateLimited: false,
  };
}

/** Open-Elevation public lookup. Heavily rate-limited; last resort. */
async function queryOpenElevation(
  coords: { lat: number; lng: number }[]
): Promise<{ values: ElevationSample[]; ok: boolean; rateLimited: boolean }> {
  if (isQuarantined('openelevation')) {
    return { values: emptyValues(coords.length), ok: false, rateLimited: true };
  }
  const { res } = await fetchWithTimeout(
    'https://api.open-elevation.com/api/v1/lookup',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: coords.map((c) => ({ latitude: c.lat, longitude: c.lng })),
      }),
    },
    30000
  );
  if (!res) return { values: emptyValues(coords.length), ok: false, rateLimited: false };
  if (res.status === 429) {
    quarantine('openelevation');
    return { values: emptyValues(coords.length), ok: false, rateLimited: true };
  }
  if (!res.ok) return { values: emptyValues(coords.length), ok: false, rateLimited: false };

  let data: any;
  try {
    data = await res.json();
  } catch {
    return { values: emptyValues(coords.length), ok: false, rateLimited: false };
  }
  if (!data || data.error || !Array.isArray(data.results)) {
    return { values: emptyValues(coords.length), ok: false, rateLimited: false };
  }

  const byLocation = new Map<string, number>();
  for (const r of data.results) {
    if (isPlausibleElevation(r?.elevation)) {
      byLocation.set(`${Number(r.latitude).toFixed(6)},${Number(r.longitude).toFixed(6)}`, r.elevation);
    }
  }

  return {
    values: coords.map((c) => byLocation.get(`${c.lat.toFixed(6)},${c.lng.toFixed(6)}`) ?? null),
    ok: true,
    rateLimited: false,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BulkElevationResult {
  /** One entry per requested point; `null` where no data could be obtained. */
  elevations: ElevationSample[];
  /** Fraction of points that resolved to a real sample, 0..1. */
  coverage: number;
  /** Providers that contributed data. */
  providers: ElevationProvider[];
}

interface CellRequest {
  lat: number;
  lng: number;
  indices: number[];
}

/**
 * Resolves elevations for a set of points, deduplicating them onto DEM cells
 * and walking the provider chain until the set is satisfied or the time budget
 * runs out. Never substitutes a made-up value.
 */
export async function fetchBulkElevations(
  points: { lat: number; lng: number }[]
): Promise<BulkElevationResult> {
  loadDemCacheFromStorage();

  const n = points.length;
  if (n === 0) return { elevations: [], coverage: 0, providers: ['none'] };

  const out: ElevationSample[] = new Array(n).fill(null);
  const providersUsed = new Set<ElevationProvider>();

  // 1. Collapse the request onto unique DEM cells.
  const byKey = new Map<string, CellRequest>();
  for (let i = 0; i < n; i++) {
    const key = demCellKey(points[i].lat, points[i].lng);
    const bucket = byKey.get(key);
    if (bucket) bucket.indices.push(i);
    else byKey.set(key, { lat: points[i].lat, lng: points[i].lng, indices: [i] });
  }

  // 2. Satisfy from cache.
  const cells: CellRequest[] = [];
  for (const [key, cell] of byKey) {
    const cached = demCache.get(key);
    if (cached !== undefined) {
      providersUsed.add('cache');
      for (const i of cell.indices) out[i] = cached;
      continue;
    }
    cells.push(cell);
  }

  const resolve = (
    group: CellRequest[],
    values: ElevationSample[],
    provider: ElevationProvider
  ): number => {
    let filled = 0;
    group.forEach((cell, k) => {
      const v = values[k];
      if (!isPlausibleElevation(v)) return;
      const rounded = Math.round(v * 10) / 10;
      out[cell.indices[0]] = rounded;
      demCache.set(demCellKey(cell.lat, cell.lng), rounded);
      providersUsed.add(provider);
      filled++;
    });
    return filled;
  };

  if (cells.length > 0) {
    const deadline = Date.now() + Math.min(240_000, Math.max(75_000, (cells.length / 25) * 1000));
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const remaining = () => cells.filter((c) => out[c.indices[0]] === null);

    const chunks = (arr: CellRequest[], size: number): CellRequest[][] => {
      const groups: CellRequest[][] = [];
      for (let i = 0; i < arr.length; i += size) groups.push(arr.slice(i, i + size));
      return groups;
    };

    /**
     * Runs `task` over `groups` with bounded concurrency.
     */
    const runPooled = async (
      groups: CellRequest[][],
      concurrency: number,
      task: (group: CellRequest[]) => Promise<{ ok: boolean; rateLimited: boolean }>
    ): Promise<void> => {
      let cursor = 0;
      let rateLimited = false;
      const workers = Array.from({ length: Math.min(concurrency, groups.length) }, async () => {
        for (;;) {
          if (rateLimited || Date.now() > deadline) return;
          const i = cursor++;
          if (i >= groups.length) return;
          const result = await task(groups[i]);
          if (result.rateLimited) {
            rateLimited = true;
            return;
          }
        }
      });
      await Promise.all(workers);
    };

    // 1. PRIMARY: Open-Meteo (Copernicus GLO-30 / SRTM 30m).
    // Direct, fast, CORS-enabled true global Earth elevation dataset.
    if (remaining().length > 0 && !isQuarantined('openmeteo')) {
      for (let round = 0; round < 2; round++) {
        const groups = chunks(remaining(), 80);
        if (groups.length === 0) break;
        let filledAny = false;
        await runPooled(groups, 3, async (group) => {
          const { values, ok, rateLimited } = await queryOpenMeteo(
            group.map((c) => ({ lat: c.lat, lng: c.lng }))
          );
          if (ok) filledAny = resolve(group, values, 'copernicus-srtm30m') > 0 || filledAny;
          return { ok, rateLimited };
        });
        if (remaining().length === 0 || !filledAny) break;
      }
    }

    // 2. FALLBACK: Terrain tiles.
    {
      const pending = remaining();
      if (pending.length > 0) {
        try {
          const terrain = await fetchTerrainElevations(
            pending.map((c) => ({ lat: c.lat, lng: c.lng }))
          );
          resolve(pending, terrain.elevations, 'terrain-tiles');
        } catch {
          // Fall through to the point sources.
        }
      }
    }

    // 3. FALLBACK: OpenTopoData, 100 points per call.
    if (remaining().length > 0 && !isQuarantined('opentopodata')) {
      const groups = chunks(remaining(), 100);
      await runPooled(groups, OPENTOPODATA_KEY ? 6 : 2, async (group) => {
        const { values, ok, rateLimited } = await queryOpenTopoData(
          group.map((c) => ({ lat: c.lat, lng: c.lng }))
        );
        if (ok) resolve(group, values, 'opentopodata-srtm30m');
        return { ok, rateLimited };
      });
      if (groups.length > 1) await pause(150);
    }

    // Last resort: Open-Elevation.
    if (remaining().length > 0 && !isQuarantined('openelevation')) {
      const groups = chunks(remaining(), 300);
      await runPooled(groups, 2, async (group) => {
        const { values, ok, rateLimited } = await queryOpenElevation(
          group.map((c) => ({ lat: c.lat, lng: c.lng }))
        );
        if (ok) resolve(group, values, 'open-elevation');
        return { ok, rateLimited };
      });
    }

    flushDemCacheToStorage();
  }

  // Mirror each cell's value onto every point sharing that cell.
  for (let i = 0; i < n; i++) {
    if (out[i] === null) {
      const cached = demCache.get(demCellKey(points[i].lat, points[i].lng));
      if (cached !== undefined) out[i] = cached;
    }
  }

  const resolved = out.reduce<number>((acc, v) => (v !== null ? acc + 1 : acc), 0);

  return {
    elevations: out,
    coverage: n === 0 ? 0 : resolved / n,
    providers: providersUsed.size > 0 ? [...providersUsed] : ['none'],
  };
}

