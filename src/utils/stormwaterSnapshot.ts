/**
 * High-Resolution Stormwater Catchment Snapshot Generator (Client-Side)
 *
 * Generates an aerial satellite map snapshot of the delineated catchment
 * with the catchment delineation covering exactly ~70% of the snapshot frame,
 * identical to engineering GIS / Google Earth aerial views.
 *
 * Renders:
 * 1. Aerial Satellite Basemap (Esri World Imagery)
 * 2. Corridor Alignment (crisp line with tick marks & chainage labels e.g. 37100.000)
 * 3. Catchment Delineation Polygon (cyan outline with subtle fill)
 * 4. Stream Flow Path (bold red channel from origin to crossing)
 * 5. High-resolution output for embedded Excel export (.xlsx)
 */

import { CorridorAlignment, HydrologyReport } from '../types/hydrology';
import { formatChainageNumber } from './geoUtils';

export interface GeneratedSnapshot {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
}

/** Converts latitude/longitude to Web Mercator pixel coordinates at zoom level z. */
function projectMercator(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = ((lng + 180.0) / 360.0) * n * 256.0;
  const latRad = (lat * Math.PI) / 180.0;
  const clampedLatRad = Math.max(-1.4844, Math.min(1.4844, latRad)); // clamp ~85°
  const y = ((1.0 - Math.log(Math.tan(Math.PI / 4 + clampedLatRad / 2)) / Math.PI) / 2.0) * n * 256.0;
  return { x, y };
}

/** Loads an image with timeout and anonymous CORS */
function loadTileImage(url: string, timeoutMs = 4000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    let settled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(img);
      }
    };

    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    };

    img.src = url;
  });
}

/**
 * Generates an aerial satellite snapshot of the stormwater delineation
 * scaled so the catchment covers approximately 70% of the image.
 */
export async function generateClientHydrologySnapshot(
  report: HydrologyReport,
  alignment?: CorridorAlignment | null,
  width = 1200,
  height = 820
): Promise<GeneratedSnapshot> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  // Base background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  // 1. Gather all points that define the delineation geometry
  const delineationPoints: [number, number][] = [
    [report.latitudeDD, report.longitudeDD],
    ...(report.catchmentPolygon && report.catchmentPolygon.length > 0 ? report.catchmentPolygon : []),
    ...(report.streamCoordinates && report.streamCoordinates.length > 0 ? report.streamCoordinates : []),
  ];

  // Fallback if geometry is sparse
  if (delineationPoints.length === 0) {
    delineationPoints.push([report.latitudeDD, report.longitudeDD]);
  }

  // 2. Project delineation points at zoom 0 to find geographic span
  const pts0 = delineationPoints.map(([lat, lng]) => projectMercator(lat, lng, 0));
  let minX0 = Infinity;
  let maxX0 = -Infinity;
  let minY0 = Infinity;
  let maxY0 = -Infinity;

  for (const p of pts0) {
    if (p.x < minX0) minX0 = p.x;
    if (p.x > maxX0) maxX0 = p.x;
    if (p.y < minY0) minY0 = p.y;
    if (p.y > maxY0) maxY0 = p.y;
  }

  // Minimum bounding dimension to avoid division by zero
  const spanX0 = Math.max(0.00008, maxX0 - minX0);
  const spanY0 = Math.max(0.00008, maxY0 - minY0);
  const centerX0 = (minX0 + maxX0) / 2;
  const centerY0 = (minY0 + maxY0) / 2;

  // 3. Exact 70% framing: Catchment bounding box should occupy 70% of the canvas
  const TARGET_COVERAGE = 0.70;
  const usableW = width * TARGET_COVERAGE;
  const usableH = height * TARGET_COVERAGE;

  const totalScale = Math.min(usableW / spanX0, usableH / spanY0);
  const zContinuous = Math.log2(Math.max(1, totalScale));

  // Determine integer tile zoom level (clamped to high quality Esri imagery zoom range)
  const bestZoom = Math.max(12, Math.min(18, Math.floor(zContinuous)));
  const intraScale = totalScale / Math.pow(2, bestZoom);

  // Center point in pixel coordinates at bestZoom
  const centerX = centerX0 * Math.pow(2, bestZoom);
  const centerY = centerY0 * Math.pow(2, bestZoom);

  // Geographic projection from lat/lng to canvas pixel
  const toCanvas = (lat: number, lng: number): [number, number] => {
    const p = projectMercator(lat, lng, bestZoom);
    const px = width / 2 + (p.x - centerX) * intraScale;
    const py = height / 2 + (p.y - centerY) * intraScale;
    return [px, py];
  };

  // 4. Calculate Tile Bounds required to fill the canvas
  const halfCanvasWInTiles = (width / 2 / intraScale);
  const halfCanvasHInTiles = (height / 2 / intraScale);

  const minMercX = centerX - halfCanvasWInTiles;
  const maxMercX = centerX + halfCanvasWInTiles;
  const minMercY = centerY - halfCanvasHInTiles;
  const maxMercY = centerY + halfCanvasHInTiles;

  const maxTileIndex = Math.pow(2, bestZoom) - 1;
  const minCol = Math.max(0, Math.floor(minMercX / 256.0));
  const maxCol = Math.min(maxTileIndex, Math.floor(maxMercX / 256.0));
  const minRow = Math.max(0, Math.floor(minMercY / 256.0));
  const maxRow = Math.min(maxTileIndex, Math.floor(maxMercY / 256.0));

  // 5. Fetch Satellite Tiles (Esri World Imagery)
  const tilePromises: Promise<{ col: number; row: number; img: HTMLImageElement | null }>[] = [];
  for (let c = minCol; c <= maxCol; c++) {
    for (let r = minRow; r <= maxRow; r++) {
      const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${bestZoom}/${r}/${c}`;
      tilePromises.push(
        loadTileImage(url, 3500).then((img) => ({ col: c, row: r, img }))
      );
    }
  }

  const loadedTiles = await Promise.all(tilePromises);

  // Draw satellite tiles onto canvas
  for (const { col, row, img } of loadedTiles) {
    const tx = width / 2 + (col * 256.0 - centerX) * intraScale;
    const ty = height / 2 + (row * 256.0 - centerY) * intraScale;
    const tSize = 256.0 * intraScale;

    if (img && img.naturalWidth > 0) {
      ctx.drawImage(img, tx, ty, tSize + 0.5, tSize + 0.5);
    } else {
      // Elegant dark agricultural terrain fill fallback if offline
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(tx, ty, tSize + 0.5, tSize + 0.5);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeRect(tx, ty, tSize + 0.5, tSize + 0.5);
    }
  }

  // 6. Draw Contours / Flow Network if present
  if (report.contours && report.contours.length > 0) {
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    for (const cnt of report.contours) {
      if (cnt.coordinates.length < 2) continue;
      ctx.beginPath();
      let first = true;
      for (const [lat, lng] of cnt.coordinates) {
        const [x, y] = toCanvas(lat, lng);
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

  // 7. Draw Tributaries / Overland Runoff if present
  if (report.tributaryPaths && report.tributaryPaths.length > 0) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    for (const trib of report.tributaryPaths) {
      if (trib.length < 2) continue;
      ctx.beginPath();
      let first = true;
      for (const [lat, lng] of trib) {
        const [x, y] = toCanvas(lat, lng);
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

  // 8. Draw Corridor Alignment & Chainage Labels
  // (Identical to the user's reference picture: bold red alignment with station labels)
  const tracks: [number, number][][] = [];
  if (alignment?.allTracks && alignment.allTracks.length > 0) {
    tracks.push(...alignment.allTracks);
  } else if (alignment?.coordinates && alignment.coordinates.length >= 2) {
    tracks.push(alignment.coordinates);
  }

  // Draw alignment track lines
  for (const track of tracks) {
    if (track.length < 2) continue;

    // Dark under-stroke for high contrast against satellite ground
    ctx.beginPath();
    let first = true;
    for (const [lat, lng] of track) {
      const [x, y] = toCanvas(lat, lng);
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

    // Bold red corridor centerline (matches reference image)
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 3.5;
    ctx.stroke();
  }

  // Draw station chainage labels along the alignment
  if (alignment?.chainages && alignment.chainages.length > 0) {
    // Filter stations visible in or near the canvas
    const margin = 80;
    const visibleStations = alignment.chainages.filter((c) => {
      const [x, y] = toCanvas(c.lat, c.lng);
      return x >= -margin && x <= width + margin && y >= -margin && y <= height + margin;
    });

    // Choose stride so chainage labels are cleanly readable and don't collide
    const stride = Math.max(1, Math.ceil(visibleStations.length / 25));

    let lastLabelY = -9999;
    let lastLabelX = -9999;

    visibleStations.forEach((c, idx) => {
      const [cx, cy] = toCanvas(c.lat, c.lng);
      const isTarget = Math.abs(c.chainage - report.targetChainage) < 0.1;
      const isMajor = Math.round(c.chainage) % 100 === 0;

      if (!isTarget && idx % stride !== 0 && !isMajor) return;

      // Prevent crowded text overlaps
      if (!isTarget && Math.abs(cy - lastLabelY) < 18 && Math.abs(cx - lastLabelX) < 45) {
        return;
      }
      lastLabelX = cx;
      lastLabelY = cy;

      // Small tick dot on the red alignment
      ctx.beginPath();
      ctx.arc(cx, cy, isTarget ? 4.5 : 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = isTarget ? '#f59e0b' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Station text label (e.g. 37100.000 or 37200.000)
      const labelText =
        c.formatted ||
        (Number.isInteger(c.chainage)
          ? `${c.chainage.toFixed(3)}`
          : formatChainageNumber(c.chainage));

      ctx.font = isTarget
        ? 'bold 13px Arial, sans-serif'
        : 'bold 11px Arial, sans-serif';

      const tx = cx + 8;
      const ty = cy + 4;

      // Black text halo for maximum legibility against satellite imagery
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(labelText, tx, ty);

      // White text fill (matches reference picture)
      ctx.fillStyle = isTarget ? '#fef08a' : '#ffffff';
      ctx.fillText(labelText, tx, ty);
    });
  }

  // 9. Draw Catchment Delineation Polygon
  // (Bright cyan contour boundary with subtle semi-transparent cyan fill)
  if (report.catchmentPolygon && report.catchmentPolygon.length > 2) {
    ctx.beginPath();
    let first = true;
    for (const [lat, lng] of report.catchmentPolygon) {
      const [x, y] = toCanvas(lat, lng);
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();

    // Semi-transparent cyan fill: keeps satellite fields clearly visible
    ctx.fillStyle = 'rgba(34, 211, 238, 0.18)';
    ctx.fill();

    // Crisp cyan boundary line
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // 10. Draw Natural Stream / Watercourse Path
  // (Bold red stream channel flowing to the crossing)
  if (report.streamCoordinates && report.streamCoordinates.length > 1) {
    // Dark under-stroke for contrast
    ctx.beginPath();
    let first = true;
    for (const [lat, lng] of report.streamCoordinates) {
      const [x, y] = toCanvas(lat, lng);
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

    // Bold red stream path
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3.2;
    ctx.stroke();

    // Stream Headwater Origin Point
    const headPt = report.streamCoordinates[0];
    const [hx, hy] = toCanvas(headPt[0], headPt[1]);
    ctx.beginPath();
    ctx.arc(hx, hy, 5.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.0;
    ctx.stroke();
  }

  // 11. Mark Target Crossing / Culvert Invert on Alignment
  const [targetX, targetY] = toCanvas(report.latitudeDD, report.longitudeDD);
  ctx.beginPath();
  ctx.arc(targetX, targetY, 6.5, 0, 2 * Math.PI);
  ctx.fillStyle = '#22d3ee';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Convert canvas to image
  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b || new Blob()), 'image/png');
  });

  return {
    dataUrl,
    blob,
    width,
    height,
  };
}
