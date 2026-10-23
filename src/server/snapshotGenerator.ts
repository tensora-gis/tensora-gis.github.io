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

const MAX_TILES_PER_SNAPSHOT = 256;

function clampTileRange(
  minIndex: number,
  maxIndex: number,
  maxCount: number
): { min: number; max: number } {
  const span = maxIndex - minIndex;
  if (span <= maxCount) return { min: minIndex, max: maxIndex };
  const centre = Math.round((minIndex + maxIndex) / 2);
  const half = Math.floor(maxCount / 2);
  return { min: centre - half, max: centre + half };
}

const TILE_ATTEMPT_TIMEOUT_MS = 6000;
const TILE_PHASE_BUDGET_MS = 45000;

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
 * FIXED: The original loop walked from maxZoom down to minZoom and broke when 
 * scale <= MAX_UPSCALE. For small catchments, zooming out only *increases* the 
 * scale, causing it to fall all the way to minZoom (z=6) and render a country view.
 * 
 * Now, we always start at maxZoom (sharpest imagery). We only walk down if the 
 * catchment is so large that the scale becomes tiny (downscaling), meaning we 
 * would have to fetch thousands of tiles.
 */
function solveFrame(
  points: [number, number][],
  usableW: number,
  usableH: number,
  maxZoom = 18,
  minZoom = 6
): Frame {
  const ROTATION_GAIN_REQUIRED = 1.12;
  const MAX_UPSCALE = 3.0; // Increased from 1.6 so small catchments can fill the frame
  const MIN_DOWNSCALE = 0.3; 
  const FIT_FILL = 0.98;

  const computeAt = (zoom: number): Frame => {
    const pts = points.map(([lat, lng]) => projectMercator(lat, lng, zoom));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const measure = (angle: number): { w: number; h: number; scale: number } => {
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
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
    for (let deg = 5; deg < 90; deg += 5) {
      const candidate = measure((deg * Math.PI) / 180);
      if (candidate.scale > scale * ROTATION_GAIN_REQUIRED) {
        scale = candidate.scale;
        angle = (deg * Math.PI) / 180;
      }
    }

    return { zoom, angle, scale, centerX, centerY };
  };

  let chosen = computeAt(maxZoom);

  if (chosen.scale < MIN_DOWNSCALE) {
    for (let z = maxZoom - 1; z >= minZoom; z--) {
      const candidate = computeAt(z);
      chosen = candidate;
      if (candidate.scale >= MIN_DOWNSCALE) break;
    }
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

  const framePoints: [number, number][] = [
    [params.latitudeDD, params.longitudeDD],
    ...(params.catchmentPolygon || []),
    ...(params.streamCoordinates || []),
    ...(params.tributaryPaths || []).flat(),
  ];

  const padTop = 56;
  const padBottom = 62;
  const padSide = 20;
  const usableW = Math.max(80, width - padSide * 2);
  const usableH = Math.max(80, height - padTop - padBottom);
  const bandCenterX = width / 2;
  const bandCenterY = padTop + usableH / 2;

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

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, width, height);

  const applyGeoTransform = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(bandCenterX, bandCenterY);
    ctx.rotate(frameAngle);
    ctx.scale(frameScale, frameScale);
    ctx.translate(-centerX, -centerY);
  };
  const geo = (px: number) => px / frameScale;
  const toScreenSpace = () => ctx.setTransform(1, 0, 0, 1, 0, 0);

  const screenToMerc = (sx: number, sy: number): { x: number; y: number } => {
    const ux = sx - bandCenterX;
    const uy = sy - bandCenterY;
    return {
      x: centerX + (ux * cosA + uy * sinA) / frameScale,
      y: centerY + (-ux * sinA + uy * cosA) / frameScale,
    };
  };

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

  const cols = clampTileRange(rawMinCol, rawMaxCol, MAX_TILES_PER_SNAPSHOT);
  const rows = clampTileRange(rawMinRow, rawMaxRow, MAX_TILES_PER_SNAPSHOT);
  const minTileCol = Math.max(0, Math.min(maxTileIndex, cols.min));
  const maxTileCol = Math.max(0, Math.min(maxTileIndex, cols.max));
  const minTileRow = Math.max(0, Math.min(maxTileIndex, rows.min));
  const maxTileRow = Math.max(0, Math.min(maxTileIndex, rows.max));

  if (cols.min !== rawMinCol || cols.max !== rawMaxCol || rows.min !== rawMinRow || rows.max !== rawMaxRow) {
    console.warn(
      `Snapshot frame extent was clamped to ${MAX_TILES_PER_SNAPSHOT} tiles.`
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

    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = geo(7.0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = geo(5.0);
    ctx.setLineDash([geo(4), geo(6)]);
    ctx.lineCap = 'butt';
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = geo(2.5);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  toScreenSpace();

  if (params.chainages && params.chainages.length > 0) {
    let lastLabelX = -1e9;
    let lastLabelY = -1e9;
    for (const ch of params.chainages) {
      const [cx, cy] = toScreen(ch.lat, ch.lng);
      if (cx >= -30 && cx <= width + 80 && cy >= -30 && cy <= height + 30) {
        const isTarget = Math.abs(ch.chainage - params.targetChainage) < 0.1;
        const isMajorKm = Math.round(ch.chainage) % 1000 === 0;

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

        const leaderLen = 6;
        ctx.beginPath();
        ctx.moveTo(cx + 3, cy);
        ctx.lineTo(cx + 3 + leaderLen, cy);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();

        const badgeText = ch.formatted || formatChainageNumber(ch.chainage);
        ctx.font = isMajorKm ? 'bold 12px Arial, sans-serif' : 'bold 11px Arial, sans-serif';
        const tx = cx + 3 + leaderLen + 2;
        const ty = cy + 4;

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(badgeText, tx, ty);

        ctx.fillStyle = '#000000';
        ctx.fillText(badgeText, tx, ty);
      }
    }
  }

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

    ctx.fillStyle = 'rgba(34, 211, 238, 0.28)';
    ctx.fill();

    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = geo(3.0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    toScreenSpace();
  }

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

  const [pinX, pinY] = toScreen(params.latitudeDD, params.longitudeDD);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(pinX + 10, pinY + 2, 9, 4, 0.3, 0, 2 * Math.PI);
  ctx.fill();

  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(pinX, pinY);
  ctx.lineTo(pinX - 7, pinY - 24);
  ctx.stroke();

  const pinHeadX = pinX - 9;
  const pinHeadY = pinY - 32;
  ctx.beginPath();
  ctx.arc(pinHeadX, pinHeadY, 11, 0, 2 * Math.PI);
  ctx.fillStyle = '#FACC15';
  ctx.fill();
  ctx.strokeStyle = '#CA8A04';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(pinHeadX - 3, pinHeadY - 3, 3.5, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fill();

  const dialogW = 320;
  const dialogH = 158;

  let detMinX = Infinity, detMaxX = -Infinity, detMinY = Infinity, detMaxY = -Infinity;
  for (const [lat, lng] of framePoints) {
    const [sx, sy] = toScreen(lat, lng);
    if (sx < detMinX) detMinX = sx;
    if (sx > detMaxX) detMaxX = sx;
    if (sy < detMinY) detMinY = sy;
    if (sy > detMaxY) detMaxY = sy;
  }

  const dialogCorners: { x: number; y: number }[] = [
    { x: 20, y: 70 },
    { x: 20, y: height - dialogH - 66 },
    { x: width - dialogW - 20, y: height - dialogH - 66 },
  ];
  let bestDialog = dialogCorners[0];
  let bestDialogScore = -Infinity;
  for (const corner of dialogCorners) {
    const overlapW =
      Math.max(0, Math.min(corner.x + dialogW, detMaxX) - Math.max(corner.x, detMinX));
    const overlapH =
      Math.max(0, Math.min(corner.y + dialogH, detMaxY) - Math.max(corner.y, detMinY));
    const score = -overlapW * overlapH + 0.001 * Math.hypot(corner.x - detMinX, corner.y - detMinY);
    if (score > bestDialogScore) {
      bestDialogScore = score;
      bestDialog = corner;
    }
  }
  const dialogX = bestDialog.x;
  const dialogY = bestDialog.y;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(dialogX + 4, dialogY + 4, dialogW, dialogH);

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(dialogX, dialogY, dialogW, dialogH);
  ctx.fill();
  ctx.stroke();

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

  ctx.fillStyle = '#64748B';
  ctx.font = '10px sans-serif';
  ctx.fillText('Latitude:', dialogX + 10, dialogY + 44);
  ctx.fillText('Longitude:', dialogX + 10, dialogY + 68);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(params.latitudeDMS, dialogX + 75, dialogY + 44);
  ctx.fillText(params.longitudeDMS, dialogX + 75, dialogY + 68);

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

  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(0, 0, width, 48);
  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('Hydrological Catchment Delineation', 20, 24);

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

  const naX = width - 45;
  const naY = 75;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.arc(naX, naY, 18, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const northX = sinA;
  const northY = -cosA;

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

  const hudY = height - 52;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fillRect(0, hudY, width, 52);
  ctx.strokeStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(0, hudY);
  ctx.lineTo(width, hudY);
  ctx.stroke();

  ctx.font = '11px sans-serif';
  let legX = 20;

  ctx.fillStyle = '#DC2626';
  ctx.fillRect(legX, hudY + 22, 18, 3);
  ctx.strokeStyle = '#FFFFFF';
  ctx.strokeRect(legX, hudY + 21, 18, 5);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('Railway Track', legX + 24, hudY + 26);
  legX += 130;

  ctx.fillStyle = '#DC2626';
  ctx.fillRect(legX, hudY + 22, 18, 4);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('Stream Path', legX + 24, hudY + 26);
  legX += 120;

  ctx.fillStyle = 'rgba(34, 211, 238, 0.4)';
  ctx.fillRect(legX, hudY + 17, 16, 14);
  ctx.strokeStyle = '#06B6D4';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(legX, hudY + 17, 16, 14);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('Catchment Watershed', legX + 22, hudY + 26);
  legX += 160;

  ctx.fillStyle = '#FACC15';
  ctx.beginPath();
  ctx.arc(legX + 6, hudY + 24, 6, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('Culvert Chainage', legX + 16, hudY + 26);

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

  const asJpeg = params.outputFormat === 'jpeg';
  const buffer = asJpeg ? canvas.toBuffer('image/jpeg', 0.92) : canvas.toBuffer('image/png');
  const dataUrl = `data:image/${asJpeg ? 'jpeg' : 'png'};base64,${buffer.toString('base64')}`;

  return { buffer, dataUrl, width, height };
}