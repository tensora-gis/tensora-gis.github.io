/**
 * Terrain Tile Service
 *
 * Samples elevation from Mapzen/AWS "terrarium" raster tiles.
 *
 * WHY THIS EXISTS: the point-sample DEM APIs all enforce a DAILY request cap.
 * A 2 km analysis needs a few thousand ground samples, and a few thousand
 * samples across a handful of providers is enough to exhaust every free tier -
 * after which the tool cannot analyse anything at all. Terrain tiles are a
 * raster: one 256x256 tile carries up to 65,536 elevation samples, so an entire
 * 2 km catchment resolves from a handful of requests, with no key and no daily
 * cap.
 *
 * At the zooms chosen here a pixel is roughly 10-35 m across, which matches or
 * beats the 30 m native resolution of SRTM and Copernicus GLO-30, so no
 * resolution is lost by reading terrain this way.
 *
 * Encoding (terrarium):
 *   elevation_metres = (R * 256 + G + B / 256) - 32768
 *
 * Runs unchanged in Node (@napi-rs/canvas) and the browser (DOM canvas).
 */

/** Tile payload source. Public bucket, no credentials. */
const TILE_URL = (z: number, x: number, y: number): string =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

interface TerrainTile {
  z: number;
  x: number;
  y: number;
  /** RGBA pixel data, 256x256. */
  data: Uint8ClampedArray;
}

const TILE_SIZE = 256;
const MAX_ZOOM = 15;

/** Decodes a terrarium pixel into metres above sea level. */
function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Ground resolution in metres per pixel at a given latitude and zoom. */
function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

/**
 * Picks the zoom whose pixel size best matches the DEM's native ground
 * resolution, clamped so high latitudes still get usable detail.
 */
function chooseZoom(lat: number, targetResolutionM = 30): number {
  const cosLat = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  const z = Math.ceil(Math.log2((156543.03392 * cosLat) / targetResolutionM));
  return Math.min(MAX_ZOOM, Math.max(9, z));
}

/** Global mercator pixel coordinates of a lat/lng at a zoom. */
function globalPixels(lat: number, lng: number, zoom: number): { gx: number; gy: number } {
  const n = 256 * Math.pow(2, zoom);
  const gx = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const gy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { gx, gy };
}

// ---------------------------------------------------------------------------
// Tile loading (environment agnostic)
// ---------------------------------------------------------------------------

declare const document: any;
declare const require: any;

function isBrowser(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

/** Decoded RGBA bytes for one tile, or null when it cannot be loaded. */
async function fetchTilePixels(
  z: number,
  x: number,
  y: number
): Promise<Uint8ClampedArray | null> {
  const url = TILE_URL(z, x, y);

  try {
    if (isBrowser()) {
      return await new Promise<Uint8ClampedArray | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => resolve(null), 12000);
        img.onload = () => {
          clearTimeout(timer);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = TILE_SIZE;
            canvas.height = TILE_SIZE;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            resolve(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data);
          } catch {
            // Tainted canvas: the bucket did not send CORS headers.
            resolve(null);
          }
        };
        img.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
        img.src = url;
      });
    }

    // Node: @napi-rs/canvas.
    //
    // The specifier is held in a variable and marked @vite-ignore so the
    // bundler does not try to include a native Node addon in the browser
    // build, which fails the whole bundle.
    const NODE_CANVAS_MODULE = '@napi-rs/canvas';
    const { loadImage, createCanvas } = await import(/* @vite-ignore */ NODE_CANVAS_MODULE);
    const img = await loadImage(url);
    const canvas = createCanvas(TILE_SIZE, TILE_SIZE);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
  } catch {
    return null;
  }
}

/**
 * Tile cache. A single corridor resolves from a few tiles, and repeated
 * delineations walk the same tiles, so this cache does nearly all the work
 * after the first request.
 */
const tileCache = new Map<string, TerrainTile | null>();
const TILE_CACHE_LIMIT = 600;

async function getTile(z: number, x: number, y: number): Promise<TerrainTile | null> {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key)!;

  const data = await fetchTilePixels(z, x, y);
  const tile: TerrainTile | null = data ? { z, x, y, data } : null;

  if (tileCache.size >= TILE_CACHE_LIMIT) {
    const oldest = tileCache.keys().next().value;
    if (oldest !== undefined) tileCache.delete(oldest);
  }
  tileCache.set(key, tile);
  return tile;
}

/** Reads one pixel from a tile, or null when out of range. */
function pixelAt(tile: TerrainTile, px: number, py: number): number | null {
  if (px < 0 || py < 0 || px >= TILE_SIZE || py >= TILE_SIZE) return null;
  const i = (py * TILE_SIZE + px) * 4;
  const { data } = tile;
  return decodeTerrarium(data[i], data[i + 1], data[i + 2]);
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

/**
 * Bilinearly samples elevation at a lat/lng.
 *
 * Returns `null` when the surrounding tiles could not be loaded. Never
 * substitutes a neighbouring or default value.
 */
async function sampleTerrainElevation(
  lat: number,
  lng: number,
  zoom: number
): Promise<number | null> {
  const { gx, gy } = globalPixels(lat, lng, zoom);
  const maxIndex = Math.pow(2, zoom) - 1;

  // Work in GLOBAL pixel coordinates throughout. Mixing local pixel offsets
  // with global tile indices made every sample read tile 0/0 and return
  // nonsense like -2336 m over terrain that is 45 m above sea level.
  const fx = Math.floor(gx);
  const fy = Math.floor(gy);
  const rx = gx - fx;
  const ry = gy - fy;

  const tileIndex = (n: number) => Math.max(0, Math.min(maxIndex, Math.floor(n / TILE_SIZE)));
  const localIndex = (n: number) => n - tileIndex(n) * TILE_SIZE;

  // The 2x2 neighbourhood can straddle a tile edge, so load every tile it
  // touches up front.
  const offsets: [number, number, number][] = [
    [fx, fy, 0],
    [fx + 1, fy, 1],
    [fx, fy + 1, 2],
    [fx + 1, fy + 1, 3],
  ];

  const keys = offsets.map(([nx, ny]) => `${zoom}/${tileIndex(nx)}/${tileIndex(ny)}`);
  const tiles = new Map<string, TerrainTile | null>();
  await Promise.all(
    [...new Set(keys)].map(async (key) => {
      const [z, x, y] = key.split('/').map(Number);
      tiles.set(key, await getTile(z, x, y));
    })
  );

  const corner: (number | null)[] = [null, null, null, null];
  offsets.forEach(([nx, ny, slot], k) => {
    const tile = tiles.get(keys[k]) ?? null;
    corner[slot] = tile ? pixelAt(tile, localIndex(nx), localIndex(ny)) : null;
  });

  const [p00, p10, p01, p11] = corner;
  if (p00 === null) return p10 ?? p01 ?? p11 ?? null;
  if (p10 === null && p01 === null && p11 === null) return p00;

  const a = p10 ?? p00;
  const b = p01 ?? p00;
  const c = p11 ?? p00;

  // Standard bilinear interpolation of the 2x2 neighbourhood.
  return (
    p00 * (1 - rx) * (1 - ry) +
    a * rx * (1 - ry) +
    b * (1 - rx) * ry +
    c * rx * ry
  );
}

export interface TerrainSampleResult {
  elevations: (number | null)[];
  coverage: number;
  zoom: number;
  metresPerPixel: number;
}

/**
 * Samples a whole grid from terrain tiles.
 *
 * Requests are de-duplicated onto tiles first: a 2 km catchment needs a handful
 * of tiles, not a few thousand requests.
 */
export async function fetchTerrainElevations(
  points: { lat: number; lng: number }[],
  options: { targetResolutionM?: number; zoom?: number } = {}
): Promise<TerrainSampleResult> {
  const n = points.length;
  if (n === 0) return { elevations: [], coverage: 0, zoom: 0, metresPerPixel: 0 };

  const midLat = points[Math.floor(n / 2)].lat;
  const zoom = options.zoom ?? chooseZoom(midLat, options.targetResolutionM ?? 30);

  // Warm the cache with every tile the sample set touches.
  const needed = new Set<string>();
  for (const p of points) {
    const { gx, gy } = globalPixels(p.lat, p.lng, zoom);
    const maxIndex = Math.pow(2, zoom) - 1;
    const tx = Math.max(0, Math.min(maxIndex, Math.floor(gx / TILE_SIZE)));
    const ty = Math.max(0, Math.min(maxIndex, Math.floor(gy / TILE_SIZE)));
    needed.add(`${zoom}/${tx}/${ty}`);
    // Include the ring so bilinear sampling at edges has neighbours.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx > maxIndex || ny > maxIndex) continue;
        needed.add(`${zoom}/${nx}/${ny}`);
      }
    }
  }

  await Promise.all(
    [...needed].map(async (key) => {
      const [z, x, y] = key.split('/').map(Number);
      await getTile(z, x, y);
    })
  );

  const elevations: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = await sampleTerrainElevation(points[i].lat, points[i].lng, zoom);
    elevations[i] = v === null ? null : Math.round(v * 10) / 10;
  }

  const resolved = elevations.reduce<number>((acc, v) => (v !== null ? acc + 1 : acc), 0);

  return {
    elevations,
    coverage: n === 0 ? 0 : resolved / n,
    zoom,
    metresPerPixel: metresPerPixel(midLat, zoom),
  };
}