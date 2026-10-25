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
  snapshotBase64?: string;
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
 * Exact 70% Catchment Delineation Framing
 *
 * Solves the Mercator scale such that the bounding box of the catchment
 * delineation points covers approximately 70% of the image frame,
 * in a strict North-up aerial view.
 */
function solveFrame(
  points: [number, number][],
  usableW: number,
  usableH: number
): Frame {
  const pts0 = points.map(([lat, lng]) => projectMercator(lat, lng, 0));
  let minX0 = Infinity, maxX0 = -Infinity, minY0 = Infinity, maxY0 = -Infinity;
  for (const p of pts0) {
    if (p.x < minX0) minX0 = p.x;
    if (p.x > maxX0) maxX0 = p.x;
    if (p.y < minY0) minY0 = p.y;
    if (p.y > maxY0) maxY0 = p.y;
  }

  const spanX0 = Math.max(0.00008, maxX0 - minX0);
  const spanY0 = Math.max(0.00008, maxY0 - minY0);
  const centerX0 = (minX0 + maxX0) / 2;
  const centerY0 = (minY0 + maxY0) / 2;

  // Exact 70% framing of the catchment delineation
  const TARGET_COVERAGE = 0.70;
  const targetW = usableW * TARGET_COVERAGE;
  const targetH = usableH * TARGET_COVERAGE;

  const totalScale = Math.min(targetW / spanX0, targetH / spanY0);
  const zContinuous = Math.log2(Math.max(1, totalScale));
  const zoom = Math.max(12, Math.min(18, Math.floor(zContinuous)));
  const scale = totalScale / Math.pow(2, zoom);

  const centerX = centerX0 * Math.pow(2, zoom);
  const centerY = centerY0 * Math.pow(2, zoom);

  return {
    zoom,
    angle: 0, // Strictly North-up as required
    scale,
    centerX,
    centerY,
  };
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
  const height = params.height || 820;

  const framePoints: [number, number][] = [
    [params.latitudeDD, params.longitudeDD],
    ...(params.catchmentPolygon || []),
    ...(params.streamCoordinates || []),
  ];
  if (framePoints.length === 0) {
    framePoints.push([params.latitudeDD, params.longitudeDD]);
  }

  const frame = solveFrame(framePoints, width, height);
  const bestZoom = frame.zoom;
  const frameScale = frame.scale;
  const centerX = frame.centerX;
  const centerY = frame.centerY;

  const toScreen = (lat: number, lng: number): [number, number] => {
    const p = projectMercator(lat, lng, bestZoom);
    const px = width / 2 + (p.x - centerX) * frameScale;
    const py = height / 2 + (p.y - centerY) * frameScale;
    return [px, py];
  };

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, width, height);

  // Tile coverage calculations
  const halfW = width / 2 / frameScale;
  const halfH = height / 2 / frameScale;
  const minMercX = centerX - halfW;
  const maxMercX = centerX + halfW;
  const minMercY = centerY - halfH;
  const maxMercY = centerY + halfH;

  const maxTileIndex = Math.pow(2, bestZoom) - 1;
  const rawMinCol = Math.max(0, Math.floor(minMercX / 256.0));
  const rawMaxCol = Math.min(maxTileIndex, Math.floor(maxMercX / 256.0));
  const rawMinRow = Math.max(0, Math.floor(minMercY / 256.0));
  const rawMaxRow = Math.min(maxTileIndex, Math.floor(maxMercY / 256.0));

  const cols = clampTileRange(rawMinCol, rawMaxCol, MAX_TILES_PER_SNAPSHOT);
  const rows = clampTileRange(rawMinRow, rawMaxRow, MAX_TILES_PER_SNAPSHOT);
  const minTileCol = Math.max(0, Math.min(maxTileIndex, cols.min));
  const maxTileCol = Math.max(0, Math.min(maxTileIndex, cols.max));
  const minTileRow = Math.max(0, Math.min(maxTileIndex, rows.min));
  const maxTileRow = Math.max(0, Math.min(maxTileIndex, rows.max));

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
  for (const { col, row, img } of loadedTiles) {
    const tx = width / 2 + (col * 256.0 - centerX) * frameScale;
    const ty = height / 2 + (row * 256.0 - centerY) * frameScale;
    const tSize = 256.0 * frameScale;
    if (img && img.width > 0) {
      ctx.drawImage(img, tx, ty, tSize + 0.5, tSize + 0.5);
    } else {
      // Elegant dark terrain fallback if tile is unreachable
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(tx, ty, tSize + 0.5, tSize + 0.5);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeRect(tx, ty, tSize + 0.5, tSize + 0.5);
    }
  }

  // Draw Contours
  if (params.contours && params.contours.length > 0) {
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    for (const cnt of params.contours) {
      if (cnt.coordinates.length < 2) continue;
      ctx.beginPath();
      let first = true;
      for (const [lat, lng] of cnt.coordinates) {
        const [x, y] = toScreen(lat, lng);
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Draw Tributaries
  if (params.tributaryPaths && params.tributaryPaths.length > 0) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    for (const trib of params.tributaryPaths) {
      if (trib.length < 2) continue;
      ctx.beginPath();
      let first = true;
      for (const [lat, lng] of trib) {
        const [x, y] = toScreen(lat, lng);
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Draw Corridor Alignment
  const tracks: [number, number][][] = [];
  if (params.allTracks && params.allTracks.length > 0) {
    tracks.push(...params.allTracks);
  } else if (params.alignmentCoordinates && params.alignmentCoordinates.length >= 2) {
    tracks.push(params.alignmentCoordinates);
  }

  for (const track of tracks) {
    if (track.length < 2) continue;
    ctx.beginPath();
    let first = true;
    for (const [lat, lng] of track) {
      const [x, y] = toScreen(lat, lng);
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 3.5;
    ctx.stroke();
  }

  // Draw Station Chainage Labels
  if (params.chainages && params.chainages.length > 0) {
    const margin = 80;
    const visibleStations = params.chainages.filter((c) => {
      const [x, y] = toScreen(c.lat, c.lng);
      return x >= -margin && x <= width + margin && y >= -margin && y <= height + margin;
    });

    const stride = Math.max(1, Math.ceil(visibleStations.length / 25));
    let lastLabelX = -9999;
    let lastLabelY = -9999;

    visibleStations.forEach((c, idx) => {
      const [cx, cy] = toScreen(c.lat, c.lng);
      const isTarget = Math.abs(c.chainage - params.targetChainage) < 0.1;
      const isMajor = Math.round(c.chainage) % 100 === 0;

      if (!isTarget && idx % stride !== 0 && !isMajor) return;
      if (!isTarget && Math.abs(cy - lastLabelY) < 18 && Math.abs(cx - lastLabelX) < 45) return;
      lastLabelX = cx;
      lastLabelY = cy;

      // Station tick
      ctx.beginPath();
      ctx.arc(cx, cy, isTarget ? 4.5 : 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = isTarget ? '#f59e0b' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const labelText =
        c.formatted ||
        (Number.isInteger(c.chainage) ? `${c.chainage.toFixed(3)}` : formatChainageNumber(c.chainage));

      ctx.font = isTarget ? 'bold 13px Arial, sans-serif' : 'bold 11px Arial, sans-serif';
      const tx = cx + 8;
      const ty = cy + 4;

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(labelText, tx, ty);

      ctx.fillStyle = isTarget ? '#fef08a' : '#ffffff';
      ctx.fillText(labelText, tx, ty);
    });
  }

  // Draw Catchment Polygon
  if (params.catchmentPolygon && params.catchmentPolygon.length > 2) {
    ctx.beginPath();
    let first = true;
    for (const [lat, lng] of params.catchmentPolygon) {
      const [x, y] = toScreen(lat, lng);
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(34, 211, 238, 0.18)';
    ctx.fill();

    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Draw Stream Flow Path
  if (params.streamCoordinates && params.streamCoordinates.length > 1) {
    ctx.beginPath();
    let first = true;
    for (const [lat, lng] of params.streamCoordinates) {
      const [x, y] = toScreen(lat, lng);
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3.2;
    ctx.stroke();

    // Stream Headwater Origin
    const headPt = params.streamCoordinates[0];
    const [hx, hy] = toScreen(headPt[0], headPt[1]);
    ctx.beginPath();
    ctx.arc(hx, hy, 5.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.0;
    ctx.stroke();
  }

  // Mark Crossing Invert Pin
  const [targetX, targetY] = toScreen(params.latitudeDD, params.longitudeDD);
  ctx.beginPath();
  ctx.arc(targetX, targetY, 6.5, 0, 2 * Math.PI);
  ctx.fillStyle = '#22d3ee';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // North Arrow (top-right)
  const naX = width - 36;
  const naY = 36;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.beginPath();
  ctx.arc(naX, naY, 16, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(naX, naY - 11);
  ctx.lineTo(naX + 4, naY);
  ctx.lineTo(naX, naY - 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(naX, naY + 11);
  ctx.lineTo(naX - 4, naY);
  ctx.lineTo(naX, naY + 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', naX, naY - 13);
  ctx.textAlign = 'left';

  // Bottom Legend Bar
  const legH = 28;
  const legY = height - legH;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(0, legY, width, legH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.moveTo(0, legY);
  ctx.lineTo(width, legY);
  ctx.stroke();

  ctx.font = 'bold 11px Arial, sans-serif';
  let lx = 16;

  ctx.fillStyle = '#dc2626';
  ctx.fillRect(lx, legY + 13, 16, 3);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('Alignment', lx + 22, legY + 18);
  lx += 100;

  ctx.fillStyle = 'rgba(34, 211, 238, 0.4)';
  ctx.fillRect(lx, legY + 9, 14, 11);
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(lx, legY + 9, 14, 11);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('Catchment', lx + 20, legY + 18);
  lx += 105;

  ctx.fillStyle = '#ef4444';
  ctx.fillRect(lx, legY + 13, 16, 3);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('Stream Flow', lx + 22, legY + 18);
  lx += 110;

  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.arc(lx + 5, legY + 14, 5, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('Culvert Invert', lx + 15, legY + 18);

  ctx.font = '10px Arial, sans-serif';
  ctx.fillStyle = '#94a3b8';
  const attr = 'Tensora GIS · 70% Catchment Frame · Esri World Imagery';
  const attrW = ctx.measureText(attr).width;
  ctx.fillText(attr, width - attrW - 16, legY + 18);

  const asJpeg = params.outputFormat === 'jpeg';
  const buffer = asJpeg ? canvas.toBuffer('image/jpeg', 0.92) : canvas.toBuffer('image/png');
  const dataUrl = `data:image/${asJpeg ? 'jpeg' : 'png'};base64,${buffer.toString('base64')}`;

  return { buffer, dataUrl, width, height };
}