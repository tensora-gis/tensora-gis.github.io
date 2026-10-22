import { createCanvas, loadImage, Image } from '@napi-rs/canvas';
import { formatChainageNumber } from '../utils/geoUtils';

export interface SnapshotParams {
  targetChainageFormatted: string;
  targetChainage: number;
  latitudeDMS: string;
  longitudeDMS: string;
  latitudeDD: number;
  longitudeDD: number;
  catchmentAreaKm2: number;
  lengthOfStreamKm: number;
  levelStreamOriginM: number;
  highestContourM: number;
  elevationDropM: number;
  /** Analysis scope actually applied (500, 1000, or 2000). */
  scopeAppliedM?: 500 | 1000 | 2000;
  scopeExpandedDueToFlatRelief?: boolean;
  reliefWithinScopeM?: number;
  meetsReliefThreshold?: boolean;
  /** Named elevation providers that actually answered. */
  elevationSource?: string;
  elevationOriginKind?: 'survey' | 'dem';
  demCoverage?: number;
  catchmentPolygon: [number, number][]; // [lat, lng]
  streamCoordinates: [number, number][]; // [lat, lng]
  alignmentCoordinates?: [number, number][]; // [lat, lng]
  allTracks?: [number, number][][];
  tributaryPaths?: [number, number][][];
  contours?: { elevation: number; coordinates: [number, number][] }[];
  chainages?: { chainage: number; formatted: string; lat: number; lng: number }[];
  width?: number;
  height?: number;
  outputFormat?: 'png' | 'jpeg';
}

/**
 * Largest plausible distance, in metres, between the target coordinate and any
 * vertex of its own catchment/stream.
 *
 * The analysis scope is at most 2,000 m, and smoothing can move a vertex only
 * slightly, so 25 km is a very generous ceiling. Anything beyond it means the
 * payload mixes geometry from different sites - which cannot be rendered
 * meaningfully and would blow up the basemap tile range.
 */
const MAX_GEOMETRY_SPREAD_M = 25_000;

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const isFinitePair = (v: unknown): v is [number, number] =>
  Array.isArray(v) &&
  v.length >= 2 &&
  typeof v[0] === 'number' && isFinite(v[0]) &&
  typeof v[1] === 'number' && isFinite(v[1]);

/** Rejects payloads that would render as a silently blank or unbounded image. */
export function validateSnapshotParams(params: unknown): params is SnapshotParams {
  if (!params || typeof params !== 'object') return false;
  const p = params as Record<string, unknown>;
  const lat = p.latitudeDD;
  const lng = p.longitudeDD;
  if (
    typeof lat !== 'number' || !isFinite(lat) || lat < -90 || lat > 90 ||
    typeof lng !== 'number' || !isFinite(lng) || lng < -180 || lng > 180
  ) {
    return false;
  }
  if (!Array.isArray(p.catchmentPolygon) || !Array.isArray(p.streamCoordinates)) return false;

  // Every vertex must be finite and belong to the same site as the target.
  const checkGroup = (group: unknown): boolean => {
    if (!Array.isArray(group)) return false;
    for (const item of group) {
      if (!isFinitePair(item)) return false;
      if (haversineM(lat, lng, item[0], item[1]) > MAX_GEOMETRY_SPREAD_M) return false;
    }
    return true;
  };

  if (!checkGroup(p.catchmentPolygon) || !checkGroup(p.streamCoordinates)) return false;

  const tributaries = p.tributaryPaths;
  if (tributaries !== undefined) {
    if (!Array.isArray(tributaries)) return false;
    for (const path of tributaries) if (!checkGroup(path)) return false;
  }

  const contours = p.contours;
  if (contours !== undefined) {
    if (!Array.isArray(contours)) return false;
    for (const c of contours) {
      if (!c || typeof c !== 'object' || !checkGroup((c as Record<string, unknown>).coordinates)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Upper bound on tiles fetched for one snapshot.
 *
 * The tile range is derived from the frame extent, and a frame extent is
 * unbounded input: a payload whose delineation points sit far apart makes the
 * required range span tens of millions of tiles. Without a cap the fetch loop
 * runs for billions of iterations and exhausts the heap.
 */
const MAX_TILES_PER_SNAPSHOT = 256;

function clampTileRange(
  minIndex: number,
  maxIndex: number,
  maxCount: number
): { min: number; max: number } {
  const span = maxIndex - minIndex;
  if (span <= maxCount) return { min: minIndex, max: maxIndex };

  // Keep a square window centred on the target so the part of the frame that
  // actually matters still gets imagery, and the rest falls back to the plain
  // backdrop instead of hanging the render.
  const centre = Math.round((minIndex + maxIndex) / 2);
  const half = Math.floor(maxCount / 2);
  return { min: centre - half, max: centre + half };
}
const TILE_ATTEMPT_TIMEOUT_MS = 6000;
const TILE_PHASE_BUDGET_MS = 45000;

/**
 * @napi-rs/canvas loadImage has no timeout of its own, so a tile that never
 * responds (an unavailable region, a stalled CDN) blocks the whole render
 * indefinitely. Bound each attempt and give the tile phase an overall budget.
 */

function loadImageWithTimeout(url: string, timeoutMs = TILE_ATTEMPT_TIMEOUT_MS): Promise<Image | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    loadImage(url)
      .then((img) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(img);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/** Simple FIFO cache. Evicts the oldest entry instead of nuking everything. */
class TileCache {
  private map = new Map<string, Image>();
  private readonly limit = 2000;

  get(key: string): Image | undefined {
    return this.map.get(key);
  }

  set(key: string, img: Image): void {
    if (this.map.size >= this.limit) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, img);
  }

  get size(): number {
    return this.map.size;
  }
}

// In-memory tile cache to speed up repeated rendering
const tileCache = new TileCache();

function projectMercator(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = ((lng + 180.0) / 360.0) * n * 256.0;
  const latRad = (lat * Math.PI) / 180.0;
  const y = ((1.0 - Math.log(Math.tan(latRad) + 1.0 / Math.cos(latRad)) / Math.PI) / 2.0) * n * 256.0;
  return { x, y };
}

interface Frame {
  zoom: number;
  angle: number;
  scale: number;
  centerX: number;
  centerY: number;
}

/**
 * Solves for the tightest camera frame that keeps the ENTIRE delineation inside
 * the usable drawing band.
 *
 * Two things matter here:
 *  1. The fit is "contain", never "cover" - the watershed boundary is never
 *     cropped, it always fills the whole usable band on its constraining axis.
 *  2. The frame is allowed to rotate so an elongated (lens shaped) catchment
 *     still fills the frame instead of wasting most of the picture on empty
 *     terrain. Rotation is only accepted when it buys a real gain in fill
 *     ratio, so near-square watersheds stay north-up.
 *
 * The zoom level is the sharpest one available from the basemap that still fits
 * without heavy magnification of the 256px tiles, so the imagery stays crisp at
 * maximum magnification. maxZoom is capped at 18 because Esri World Imagery
 * returns empty placeholder tiles above that level over most of India.
 */
function solveFrame(
  points: [number, number][],
  usableW: number,
  usableH: number,
  maxZoom = 18,
  minZoom = 6
): Frame {
  const ROTATION_GAIN_REQUIRED = 1.12; // only rotate if it fills >=12% more
  const MAX_UPSCALE = 1.6; // beyond this the basemap would go visibly soft
  const FIT_FILL = 0.98; // keeps the outermost stroke fully inside the frame

  let chosen: Frame = {
    zoom: minZoom,
    angle: 0,
    scale: 1,
    centerX: 0,
    centerY: 0,
  };

  for (let z = maxZoom; z >= minZoom; z--) {
    const pts = points.map(([lat, lng]) => projectMercator(lat, lng, z));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Rotated bounding extents for a candidate frame rotation
    const measure = (angle: number): { w: number; h: number; scale: number } => {
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      let uMin = Infinity;
      let uMax = -Infinity;
      let vMin = Infinity;
      let vMax = -Infinity;
      for (const p of pts) {
        const dx = p.x - centerX;
        const dy = p.y - centerY;
        const u = dx * ca - dy * sa;
        const v = dx * sa + dy * ca;
        if (u < uMin) uMin = u;
        if (u > uMax) uMax = u;
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
      const w = Math.max(uMax - uMin, 1e-6);
      const h = Math.max(vMax - vMin, 1e-6);
      return { w, h, scale: Math.min(usableW / w, usableH / h) };
    };

    const northUp = measure(0);
    let angle = 0;
    let scale = northUp.scale;
    // A rectangle's footprint is symmetric every 90deg, so 0..90 is exhaustive.
    for (let deg = 5; deg < 90; deg += 5) {
      const candidate = measure((deg * Math.PI) / 180);
      if (candidate.scale > scale * ROTATION_GAIN_REQUIRED) {
        scale = candidate.scale;
        angle = (deg * Math.PI) / 180;
      }
    }

    chosen = { zoom: z, angle, scale, centerX, centerY };

    // Sharpest available zoom whose fit does not over-magnify the basemap.
    if (scale <= MAX_UPSCALE) break;
  }

  chosen.scale = Math.max(Math.min(chosen.scale, MAX_UPSCALE) * FIT_FILL, 1e-6);
  return chosen;
}

async function fetchTileWithRetry(
  zoom: number,
  row: number,
  col: number,
  deadline: number
): Promise<Image | null> {
  const cacheKey = `${zoom}/${row}/${col}`;
  const cached = tileCache.get(cacheKey);
  if (cached) return cached;

  // Esri's own basemap first, then its alternate host, then OSM as a last
  // resort. OSM is a standard map, not imagery, so it is only used when the
  // satellite providers return nothing at all.
  const urls = [
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${row}/${col}`,
    `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/${zoom}/${row}/${col}`,
    `https://tile.openstreetmap.org/${zoom}/${col}/${row}.png`,
  ];

  for (const url of urls) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const img = await loadImageWithTimeout(url, Math.min(TILE_ATTEMPT_TIMEOUT_MS, remaining));
    if (img && img.width > 0) {
      tileCache.set(cacheKey, img);
      return img;
    }
  }

  return null;
}

export async function generateHydrologySnapshot(params: SnapshotParams): Promise<{
  buffer: Buffer;
  dataUrl: string;
  width: number;
  height: number;
}> {
  const width = params.width || 1200;
  const height = params.height || 850;

  // 1. Camera bounding box is driven by the DELINEATION ONLY (culvert,
  //    catchment polygon, stream, tributaries). The railway alignment is drawn
  //    as context but never drives the framing: otherwise on wide corridors the
  //    track extent dominates and the catchment shrinks into a corner.
  //    Contours are excluded too - they are long, sparse context lines that
  //    reach far beyond the watershed and would force a huge zoom-out.
  const framePoints: [number, number][] = [
    [params.latitudeDD, params.longitudeDD],
    ...(params.catchmentPolygon || []),
    ...(params.streamCoordinates || []),
    ...(params.tributaryPaths || []).flat(),
  ];

  // Usable drawing band: below the title bar, above the HUD bar.
  const padTop = 56;
  const padBottom = 62;
  const padSide = 20;
  const usableW = Math.max(80, width - padSide * 2);
  const usableH = Math.max(80, height - padTop - padBottom);
  const bandCenterX = width / 2;
  const bandCenterY = padTop + usableH / 2;

  // 2. Tight "contain" fit: the complete watershed is always fully visible and
  //    fills the frame (100% of its constraining axis, 98% with stroke margin).
  const frame = solveFrame(framePoints, usableW, usableH);
  const bestZoom = frame.zoom;
  const frameAngle = frame.angle;
  const frameScale = frame.scale;
  const centerX = frame.centerX;
  const centerY = frame.centerY;
  const cosA = Math.cos(frameAngle);
  const sinA = Math.sin(frameAngle);

  const toScreen = (lat: number, lng: number): [number, number] => {
    const p = projectMercator(lat, lng, bestZoom);
    const dx = (p.x - centerX) * frameScale;
    const dy = (p.y - centerY) * frameScale;
    return [bandCenterX + dx * cosA - dy * sinA, bandCenterY + dx * sinA + dy * cosA];
  };

  // 3. Setup Skia Canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Fill dark satellite base background
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, width, height);

  // Geographic transform: mercator pixels -> screen (rotation + fit scale).
  const applyGeoTransform = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(bandCenterX, bandCenterY);
    ctx.rotate(frameAngle);
    ctx.scale(frameScale, frameScale);
    ctx.translate(-centerX, -centerY);
  };
  // Stroke widths are authored in screen pixels; convert for the geo transform.
  const geo = (px: number) => px / frameScale;
  const toScreenSpace = () => ctx.setTransform(1, 0, 0, 1, 0, 0);

  // 4. Download and render satellite tiles
  // Map the canvas corners back into mercator space so a rotated frame still
  // fetches every tile that can land on screen.
  const screenToMerc = (sx: number, sy: number): { x: number; y: number } => {
    const ux = sx - bandCenterX;
    const uy = sy - bandCenterY;
    return {
      x: centerX + (ux * cosA + uy * sinA) / frameScale,
      y: centerY + (-ux * sinA + uy * cosA) / frameScale,
    };
  };

  // A rotated frame's mercator bounds are NOT the bounding box of its four
  // corners - the true extrema lie at the rotated edges' midpoints. Sampling
  // the perimeter keeps every visible tile in the request, and the column
  // range is clamped like the row range to avoid pointless 404s at the
  // antimeridian.
  const PERIMETER_STEPS = 12;
  const probes: { x: number; y: number }[] = [];
  for (let i = 0; i <= PERIMETER_STEPS; i++) {
    const t = i / PERIMETER_STEPS;
    probes.push(screenToMerc(t * width, 0));
    probes.push(screenToMerc(t * width, height));
    probes.push(screenToMerc(0, t * height));
    probes.push(screenToMerc(width, t * height));
  }

  const maxTileIndex = Math.pow(2, bestZoom) - 1;
  const rawMinCol = Math.max(0, Math.floor(Math.min(...probes.map((c) => c.x)) / 256.0));
  const rawMaxCol = Math.min(maxTileIndex, Math.floor(Math.max(...probes.map((c) => c.x)) / 256.0));
  const rawMinRow = Math.max(0, Math.floor(Math.min(...probes.map((c) => c.y)) / 256.0));
  const rawMaxRow = Math.min(maxTileIndex, Math.floor(Math.max(...probes.map((c) => c.y)) / 256.0));

  // Hard cap: a pathological extent must degrade to a partial basemap, never
  // to an unbounded fetch loop that exhausts memory.
  const cols = clampTileRange(rawMinCol, rawMaxCol, MAX_TILES_PER_SNAPSHOT);
  const rows = clampTileRange(rawMinRow, rawMaxRow, MAX_TILES_PER_SNAPSHOT);
  const minTileCol = Math.max(0, Math.min(maxTileIndex, cols.min));
  const maxTileCol = Math.max(0, Math.min(maxTileIndex, cols.max));
  const minTileRow = Math.max(0, Math.min(maxTileIndex, rows.min));
  const maxTileRow = Math.max(0, Math.min(maxTileIndex, rows.max));

  if (cols.min !== rawMinCol || cols.max !== rawMaxCol || rows.min !== rawMinRow || rows.max !== rawMaxRow) {
    console.warn(
      `Snapshot frame extent was clamped to ${MAX_TILES_PER_SNAPSHOT} tiles ` +
        `(requested ${rawMinCol}..${rawMaxCol} x ${rawMinRow}..${rawMaxRow}); ` +
        `the delineation geometry spans an implausibly large area.`
    );
  }

  const tileDeadline = Date.now() + TILE_PHASE_BUDGET_MS;
  const tilePromises: Promise<{ col: number; row: number; img: Image | null }>[] = [];
  for (let c = minTileCol; c <= maxTileCol; c++) {
    for (let r = minTileRow; r <= maxTileRow; r++) {
      tilePromises.push(
        fetchTileWithRetry(bestZoom, r, c, tileDeadline).then((img) => ({ col: c, row: r, img }))
      );
    }
  }
  const loadedTiles = await Promise.all(tilePromises);
  applyGeoTransform();
  for (const { col, row, img } of loadedTiles) {
    if (img) {
      ctx.drawImage(img, col * 256.0, row * 256.0, 256, 256);
    }
  }
  toScreenSpace();

  // 5. Render Railway Alignment Tracks
  // Render all tracks if provided, otherwise alignmentCoordinates
  const trackLines: [number, number][][] = [];
  if (params.allTracks && params.allTracks.length > 0) {
    trackLines.push(...params.allTracks);
  } else if (params.alignmentCoordinates && params.alignmentCoordinates.length >= 2) {
    trackLines.push(params.alignmentCoordinates);
  }

  applyGeoTransform();
  for (const track of trackLines) {
    if (track.length < 2) continue;

    ctx.beginPath();
    let first = true;
    for (const [lat, lng] of track) {
      const p = projectMercator(lat, lng, bestZoom);
      if (first) {
        ctx.moveTo(p.x, p.y);
        first = false;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }

    // A. Ballast casing (dark charcoal outline)
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = geo(7.0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // B. Railroad cross-ties (sleepers) pattern (white dashed)
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = geo(5.0);
    ctx.setLineDash([geo(4), geo(6)]);
    ctx.lineCap = 'butt';
    ctx.stroke();
    ctx.setLineDash([]);

    // C. Center railway track line (Google Earth standard red line)
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = geo(2.5);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  toScreenSpace();

  // 6. Draw Chainage Stations & Numbers beside every 100m distance along the railway line (Google Earth quality in black)
  // Text labels are suppressed when they would visually crowd the previous
  // label (screen-space de-collision); station pips are still drawn for all.
  if (params.chainages && params.chainages.length > 0) {
    let lastLabelX = -1e9;
    let lastLabelY = -1e9;
    for (const ch of params.chainages) {
      const [cx, cy] = toScreen(ch.lat, ch.lng);
      if (cx >= -30 && cx <= width + 80 && cy >= -30 && cy <= height + 30) {
        const isTarget = Math.abs(ch.chainage - params.targetChainage) < 0.1;
        const isMajorKm = Math.round(ch.chainage) % 1000 === 0;

        // Station pip on track
        ctx.beginPath();
        ctx.arc(cx, cy, isTarget ? 4.5 : 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = isTarget ? '#DC2626' : '#000000';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = isTarget ? 1.5 : 1;
        ctx.stroke();

        const labelTx = cx + 11;
        const labelTy = cy + 4;
        const tooCrowded =
          Math.abs(labelTx - lastLabelX) < 34 && Math.abs(labelTy - lastLabelY) < 13;
        if (tooCrowded && !isTarget) continue;
        lastLabelX = labelTx;
        lastLabelY = labelTy;

        // Leader tick to side of track
        const leaderLen = 6;
        ctx.beginPath();
        ctx.moveTo(cx + 3, cy);
        ctx.lineTo(cx + 3 + leaderLen, cy);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Chainage number beside track: Google Earth quality in black with white halo
        // Prefer the label the source file supplied so the snapshot agrees
        // with the on-screen map and the Excel register.
        const badgeText = ch.formatted || formatChainageNumber(ch.chainage);
        ctx.font = isMajorKm ? 'bold 12px Arial, sans-serif' : 'bold 11px Arial, sans-serif';
        const tx = cx + 3 + leaderLen + 2;
        const ty = cy + 4;

        // Crisp white halo outline (Google Earth style)
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(badgeText, tx, ty);

        // Crisp black text
        ctx.fillStyle = '#000000';
        ctx.fillText(badgeText, tx, ty);
      }
    }
  }

  // 7. Draw Stormwater Runoff Flow Rills & MSL Contours (if present)
  if (params.contours && params.contours.length > 0) {
    applyGeoTransform();
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = geo(1.2);
    ctx.setLineDash([geo(3), geo(4)]);
    for (const cnt of params.contours) {
      ctx.beginPath();
      let f = true;
      for (const [lat, lng] of cnt.coordinates) {
        const p = projectMercator(lat, lng, bestZoom);
        if (f) {
          ctx.moveTo(p.x, p.y);
          f = false;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  if (params.tributaryPaths && params.tributaryPaths.length > 0) {
    applyGeoTransform();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = geo(1.6);
    ctx.setLineDash([geo(4), geo(4)]);
    for (const trib of params.tributaryPaths) {
      ctx.beginPath();
      let f = true;
      for (const [lat, lng] of trib) {
        const p = projectMercator(lat, lng, bestZoom);
        if (f) {
          ctx.moveTo(p.x, p.y);
          f = false;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // 8. Draw Catchment Watershed Boundary Polygon in Cyan
  if (params.catchmentPolygon && params.catchmentPolygon.length > 2) {
    applyGeoTransform();
    ctx.beginPath();
    let f = true;
    for (const [lat, lng] of params.catchmentPolygon) {
      const p = projectMercator(lat, lng, bestZoom);
      if (f) {
        ctx.moveTo(p.x, p.y);
        f = false;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.closePath();

    // Translucent cyan fill (Google Earth polygon style)
    ctx.fillStyle = 'rgba(34, 211, 238, 0.28)';
    ctx.fill();

    // Solid cyan outline
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = geo(3.0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    toScreenSpace();
  }

  // 9. Draw Primary Stream Flow Path in Vibrant Red
  if (params.streamCoordinates && params.streamCoordinates.length > 1) {
    applyGeoTransform();
    ctx.beginPath();
    let f = true;
    for (const [lat, lng] of params.streamCoordinates) {
      const p = projectMercator(lat, lng, bestZoom);
      if (f) {
        ctx.moveTo(p.x, p.y);
        f = false;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = geo(4.0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    toScreenSpace();

    // Draw Stream Headwater / Origin marker (where Δh reaches ≥ 5m)
    const headwater = params.streamCoordinates[0];
    const [hx, hy] = toScreen(headwater[0], headwater[1]);
    ctx.beginPath();
    ctx.arc(hx, hy, 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#DC2626';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // 10. Draw Google Earth Yellow Pushpin at the Culvert Location
  const [pinX, pinY] = toScreen(params.latitudeDD, params.longitudeDD);

  // Pin shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(pinX + 10, pinY + 2, 9, 4, 0.3, 0, 2 * Math.PI);
  ctx.fill();

  // Pin needle (angled down to the culvert point)
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(pinX, pinY);
  ctx.lineTo(pinX - 7, pinY - 24);
  ctx.stroke();

  // Yellow sphere pinhead
  const pinHeadX = pinX - 9;
  const pinHeadY = pinY - 32;
  ctx.beginPath();
  ctx.arc(pinHeadX, pinHeadY, 11, 0, 2 * Math.PI);
  ctx.fillStyle = '#FACC15';
  ctx.fill();
  ctx.strokeStyle = '#CA8A04';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Specular reflection highlight on yellow pinhead
  ctx.beginPath();
  ctx.arc(pinHeadX - 3, pinHeadY - 3, 3.5, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fill();

  // 11. Google Earth Untitled Placemark Dialog Card (matching Screenshot 1)
  // Placed in the corner that overlaps the delineation the LEAST, so the card
  // never sits on top of the catchment polygon, stream path or tributaries.
  // The top-right corner is excluded because the north arrow lives there.
  const dialogW = 320;
  const dialogH = 158;

  // Screen-space bounding box of the whole delineation
  let detMinX = Infinity;
  let detMaxX = -Infinity;
  let detMinY = Infinity;
  let detMaxY = -Infinity;
  for (const [lat, lng] of framePoints) {
    const [sx, sy] = toScreen(lat, lng);
    if (sx < detMinX) detMinX = sx;
    if (sx > detMaxX) detMaxX = sx;
    if (sy < detMinY) detMinY = sy;
    if (sy > detMaxY) detMaxY = sy;
  }

  const dialogCorners: { x: number; y: number }[] = [
    { x: 20, y: 70 }, // top-left (never under the title bar)
    { x: 20, y: height - dialogH - 66 }, // bottom-left (above the HUD bar)
    { x: width - dialogW - 20, y: height - dialogH - 66 }, // bottom-right (above the HUD bar)
  ];
  let bestDialog = dialogCorners[0];
  let bestDialogScore = -Infinity;
  for (const corner of dialogCorners) {
    const overlapW =
      Math.max(0, Math.min(corner.x + dialogW, detMaxX) - Math.max(corner.x, detMinX));
    const overlapH =
      Math.max(0, Math.min(corner.y + dialogH, detMaxY) - Math.max(corner.y, detMinY));
    // Lower overlap wins; distance is the tie-breaker when nothing is covered.
    const score = -overlapW * overlapH + 0.001 * Math.hypot(corner.x - detMinX, corner.y - detMinY);
    if (score > bestDialogScore) {
      bestDialogScore = score;
      bestDialog = corner;
    }
  }
  const dialogX = bestDialog.x;
  const dialogY = bestDialog.y;

  // Dialog drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(dialogX + 4, dialogY + 4, dialogW, dialogH);

  // Dialog body
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(dialogX, dialogY, dialogW, dialogH);
  ctx.fill();
  ctx.stroke();

  // Dialog header
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(dialogX, dialogY, dialogW, 28);
  ctx.strokeStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.moveTo(dialogX, dialogY + 28);
  ctx.lineTo(dialogX + dialogW, dialogY + 28);
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('Untitled Placemark', dialogX + 10, dialogY + 19);

  ctx.fillStyle = '#64748B';
  ctx.font = '11px monospace';
  ctx.fillText(`CH: ${params.targetChainageFormatted}`, dialogX + dialogW - 105, dialogY + 19);

  // Coordinates fields
  ctx.fillStyle = '#64748B';
  ctx.font = '10px sans-serif';
  ctx.fillText('Latitude:', dialogX + 10, dialogY + 44);
  ctx.fillText('Longitude:', dialogX + 10, dialogY + 68);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(params.latitudeDMS, dialogX + 75, dialogY + 44);
  ctx.fillText(params.longitudeDMS, dialogX + 75, dialogY + 68);

  // Hydrology summary box inside dialog
  ctx.fillStyle = '#F8FAFC';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(dialogX + 8, dialogY + 76, dialogW - 16, 72);
  ctx.fill();
  ctx.stroke();

  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('Catchment Area (A):', dialogX + 14, dialogY + 92);
  ctx.fillText('Length of Stream (L):', dialogX + 14, dialogY + 107);
  ctx.fillText('Level Stream Origin:', dialogX + 14, dialogY + 122);
  ctx.fillText('Highest Contour:', dialogX + 14, dialogY + 137);

  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = '#0284C7';
  ctx.fillText(`${params.catchmentAreaKm2} km²`, dialogX + 165, dialogY + 92);

  ctx.fillStyle = '#DC2626';
  ctx.fillText(`${params.lengthOfStreamKm} km`, dialogX + 165, dialogY + 107);

  ctx.fillStyle = '#334155';
  ctx.fillText(`${params.levelStreamOriginM} m MSL`, dialogX + 165, dialogY + 122);

  ctx.fillStyle = '#059669';
  ctx.fillText(`${params.highestContourM} m MSL (Δh: +${Math.round((params.highestContourM - params.levelStreamOriginM) * 10) / 10}m)`, dialogX + 165, dialogY + 137);

  // 12. Top Title Bar Overlay
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(0, 0, width, 48);
  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('Hydrological Catchment Delineation', 20, 24);

  // State the scope that was actually applied, and the relief that drove it.
  const scopeM = params.scopeAppliedM ?? 500;
  const scopeNote = params.scopeExpandedDueToFlatRelief
    ? `${scopeM} m (auto-expanded from 500 m: relief < 5 m)`
    : `${scopeM} m`;
  ctx.fillStyle = '#E2E8F0';
  ctx.font = '12px monospace';
  ctx.fillText(
    `Chainage: ${params.targetChainageFormatted}  |  Analysis scope: ${scopeNote}  |  ` +
      `Relief in scope: ${params.reliefWithinScopeM ?? '—'} m`,
    20,
    42
  );

  // 13. North Arrow & Map Scale
  // The needle follows the frame rotation so it stays truthful even when the
  // camera is rotated to fit an elongated catchment.
  const naX = width - 45;
  const naY = 75;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.arc(naX, naY, 18, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // North direction in screen space (mercator y grows southward)
  const northX = sinA;
  const northY = -cosA;

  // North arrow needle
  ctx.fillStyle = '#EF4444';
  ctx.beginPath();
  ctx.moveTo(naX + northX * 12, naY + northY * 12);
  ctx.lineTo(naX - northY * 5, naY + northX * 5);
  ctx.lineTo(naX - northX * 2, naY - northY * 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.moveTo(naX - northX * 12, naY - northY * 12);
  ctx.lineTo(naX + northY * 5, naY - northX * 5);
  ctx.lineTo(naX + northX * 2, naY + northY * 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('N', naX - 3, naY - 13);

  // 14. Bottom Status & Legend HUD Bar
  const hudY = height - 52;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fillRect(0, hudY, width, 52);
  ctx.strokeStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(0, hudY);
  ctx.lineTo(width, hudY);
  ctx.stroke();

  // Legend items in bottom bar
  ctx.font = '11px sans-serif';
  let legX = 20;

  // Railway line
  ctx.fillStyle = '#DC2626';
  ctx.fillRect(legX, hudY + 22, 18, 3);
  ctx.strokeStyle = '#FFFFFF';
  ctx.strokeRect(legX, hudY + 21, 18, 5);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('Railway Track', legX + 24, hudY + 26);
  legX += 130;

  // Stream flow
  ctx.fillStyle = '#DC2626';
  ctx.fillRect(legX, hudY + 22, 18, 4);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('Stream Path', legX + 24, hudY + 26);
  legX += 120;

  // Catchment
  ctx.fillStyle = 'rgba(34, 211, 238, 0.4)';
  ctx.fillRect(legX, hudY + 17, 16, 14);
  ctx.strokeStyle = '#06B6D4';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(legX, hudY + 17, 16, 14);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('Catchment Watershed', legX + 22, hudY + 26);
  legX += 160;

  // Culvert Pin
  ctx.fillStyle = '#FACC15';
  ctx.beginPath();
  ctx.arc(legX + 6, hudY + 24, 6, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('Culvert Chainage', legX + 16, hudY + 26);

  // Right-aligned Google Earth copyright & coordinate attribution
  ctx.fillStyle = '#94A3B8';
  ctx.font = '10px monospace';
  const src = params.elevationSource && params.elevationSource !== 'None'
    ? params.elevationSource
    : 'elevation source not recorded';
  const originKind = params.elevationOriginKind === 'survey'
    ? 'survey sheet benchmark'
    : 'sampled DEM';
  const attrText =
    `Basemap: Esri World Imagery · Elevations: ${src} · Origin datum: ${originKind}`;
  ctx.fillText(attrText, width - ctx.measureText(attrText).width - 20, hudY + 26);

  // 15. Output image buffer and data URL. Large reports embed dozens of
  // snapshots, so they request JPEG (satellite imagery compresses ~15x
  // smaller than PNG at equivalent visual quality).
  const asJpeg = params.outputFormat === 'jpeg';
  const buffer = asJpeg ? canvas.toBuffer('image/jpeg', 0.92) : canvas.toBuffer('image/png');
  const dataUrl = `data:image/${asJpeg ? 'jpeg' : 'png'};base64,${buffer.toString('base64')}`;

  return { buffer, dataUrl, width, height };
}
