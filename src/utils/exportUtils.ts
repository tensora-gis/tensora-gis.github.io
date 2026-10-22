import type ExcelJS from 'exceljs';
import { CorridorAlignment, ChainageRecord, HydrologyReport } from '../types/hydrology';
import { formatChainageNumber, decimalToDMS } from './geoUtils';

/**
 * KML colour encoding is aabbggrr: alpha, then BLUE, then GREEN, then RED.
 * Byte order is the reverse of CSS rgba, which is the usual source of mistake.
 */
const KML_COLORS = {
  /** Opaque cyan:  a=ff b=ff g=ff r=00 */
  cyanOutline: 'ffffff00',
  /** 40% opaque cyan fill:  a=66 b=ff g=ff r=00 */
  cyanFill: '66ffff00',
  /** Opaque red:  a=ff b=00 g=00 r=ff */
  red: 'ff0000ff',
  /** Opaque sky blue #38bdf8:  a=ff b=f8 g=bd r=38 */
  skyBlue: 'fff8bd38',
  /** Opaque amber #f59e0b:  a=ff b=0b g=9e r=f5 */
  amber: 'ff0b9ef5',
} as const;

/** Escapes text for safe inclusion in an XML element body. */
function xmlEscape(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Formats a [lat, lng] list as a KML coordinate run, optionally closed. */
function toKmlCoords(coords: [number, number][], close = false): string {
  if (coords.length === 0) return '';
  const parts = coords.map(([lat, lng]) => `${lng.toFixed(7)},${lat.toFixed(7)},0`);
  if (close) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (first !== last) parts.push(first);
  }
  return parts.join(' ');
}

/** Safe, meaningful filename fragment from a chainage label. */
function chainageTag(value: string | number): string {
  const cleaned = String(value).replace(/[^0-9.+a-zA-Z_-]/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'MAP_POINT';
}

/**
 * Generates an OGC-compliant KML styled for Google Earth.
 *
 * Includes:
 *   1. Yellow "Untitled Placemark" at the target chainage, with exact DMS
 *      coordinates and the full hydrology table in its balloon.
 *   2. Red stream LineString.
 *   3. Sky-blue tributary LineStrings.
 *   4. Cyan catchment Polygon.
 *   5. The corridor alignment, when one is supplied.
 */
export function generateGoogleEarthKML(
  report: HydrologyReport,
  alignment?: CorridorAlignment
): string {
  const chainageLabel = xmlEscape(report.targetChainageFormatted);

  const balloonRows: [string, string][] = [
    ['LATITUDE', `${xmlEscape(report.latitudeDMS)}  (${report.latitudeDD})`],
    ['LONGITUDE', `${xmlEscape(report.longitudeDMS)}  (${report.longitudeDD})`],
    ['CATCHMENT AREA (A)', `${report.catchmentAreaKm2} km²`],
    ['LENGTH OF STREAM (L)', `${report.lengthOfStreamKm} km`],
    ['LEVEL STREAM ORIGIN', `${report.levelStreamOriginM} m MSL`],
    ['HIGHEST CONTOUR', `${report.highestContourM} m MSL`],
    ['ELEVATION DIFFERENCE (Δh)', `${report.elevationDropM} m`],
    [
      'ANALYSIS SCOPE',
      `${report.scopeAppliedM} m${report.scopeExpandedDueToFlatRelief ? ' (expanded: relief below 5 m)' : ''}`,
    ],
    ['RELIEF IN SCOPE', `${report.reliefWithinScopeM} m`],
    ['ELEVATION SOURCE', xmlEscape(report.elevationSource)],
  ];

  const balloonTable = balloonRows
    .map(
      ([k, v]) => `            <tr><td><b>${k}</b></td><td>${v}</td></tr>`
    )
    .join('\n');

  const tributaryPlacemarks = (report.tributaryPaths ?? [])
    .filter((p) => p.length >= 2)
    .map(
      (path, idx) => `
      <Placemark>
        <name>Overland Runoff Tributary ${idx + 1}</name>
        <styleUrl>#tribStyle</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>${toKmlCoords(path)}</coordinates>
        </LineString>
      </Placemark>`
    )
    .join('');

  const contourPlacemarks = (report.contours ?? [])
    .filter((c) => c.coordinates.length >= 2)
    .map(
      (c) => `
      <Placemark>
        <name>Contour ${c.elevation} m MSL</name>
        <styleUrl>#contourStyle</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>${toKmlCoords(c.coordinates)}</coordinates>
        </LineString>
      </Placemark>`
    )
    .join('');

  const alignmentPlacemark =
    alignment && alignment.coordinates.length >= 2
      ? `
      <Placemark>
        <name>${xmlEscape(alignment.name || 'Corridor Alignment')}</name>
        <styleUrl>#corridorStyle</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>${toKmlCoords(alignment.coordinates)}</coordinates>
        </LineString>
      </Placemark>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Hydrology Catchment - Chainage ${chainageLabel}</name>
    <description>Stormwater catchment and stream delineation at chainage ${chainageLabel} (${xmlEscape(report.latitudeDMS)}, ${xmlEscape(report.longitudeDMS)}). Elevation source: ${xmlEscape(report.elevationSource)}.</description>

    <Style id="yellowPushpin">
      <IconStyle>
        <scale>1.2</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href>
        </Icon>
        <hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/>
      </IconStyle>
      <LabelStyle>
        <color>ffffffff</color>
        <scale>1.0</scale>
      </LabelStyle>
      <BalloonStyle>
        <text><![CDATA[
          <h2>$[name]</h2>
          <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse; font-family:sans-serif; font-size:12px;">
${balloonTable}
          </table>
        ]]></text>
      </BalloonStyle>
    </Style>

    <Style id="cyanCatchmentStyle">
      <LineStyle>
        <color>${KML_COLORS.cyanOutline}</color>
        <width>2.5</width>
      </LineStyle>
      <PolyStyle>
        <color>${KML_COLORS.cyanFill}</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>

    <Style id="redStreamStyle">
      <LineStyle>
        <color>${KML_COLORS.red}</color>
        <width>3.5</width>
      </LineStyle>
    </Style>

    <Style id="tribStyle">
      <LineStyle>
        <color>${KML_COLORS.skyBlue}</color>
        <width>1.8</width>
      </LineStyle>
    </Style>

    <Style id="contourStyle">
      <LineStyle>
        <color>${KML_COLORS.amber}</color>
        <width>1.4</width>
      </LineStyle>
    </Style>

    <Style id="corridorStyle">
      <LineStyle>
        <color>${KML_COLORS.red}</color>
        <width>2.0</width>
      </LineStyle>
    </Style>

    <Folder>
      <name>Delineation Output</name>
      <open>1</open>

      <Placemark>
        <name>Untitled Placemark - Chainage ${chainageLabel}</name>
        <description>Chainage: ${chainageLabel}
Latitude: ${xmlEscape(report.latitudeDMS)} (${report.latitudeDD})
Longitude: ${xmlEscape(report.longitudeDMS)} (${report.longitudeDD})
Catchment area: ${report.catchmentAreaKm2} km²
Stream length: ${report.lengthOfStreamKm} km</description>
        <styleUrl>#yellowPushpin</styleUrl>
        <Point>
          <coordinates>${report.longitudeDD.toFixed(7)},${report.latitudeDD.toFixed(7)},0</coordinates>
        </Point>
      </Placemark>

      <Placemark>
        <name>Primary Stream Flow Path (L = ${report.lengthOfStreamKm} km)</name>
        <styleUrl>#redStreamStyle</styleUrl>
        <LineString>
          <extrude>1</extrude>
          <tessellate>1</tessellate>
          <coordinates>${toKmlCoords(report.streamCoordinates)}</coordinates>
        </LineString>
      </Placemark>
${tributaryPlacemarks}
      <Placemark>
        <name>Catchment Area (A = ${report.catchmentAreaKm2} km²)</name>
        <styleUrl>#cyanCatchmentStyle</styleUrl>
        <Polygon>
          <extrude>1</extrude>
          <tessellate>1</tessellate>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>${toKmlCoords(report.catchmentPolygon, true)}</coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>
${contourPlacemarks}
${alignmentPlacemark}
    </Folder>
  </Document>
</kml>`;
}

/** Downloads a string as a file in the browser. */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Exports the single-chainage Google Earth KML. */
export function exportKML(report: HydrologyReport, alignment?: CorridorAlignment): void {
  const kmlString = generateGoogleEarthKML(report, alignment);
  downloadFile(
    kmlString,
    `Chainage_${chainageTag(report.targetChainageFormatted)}_Catchment.kml`,
    'application/vnd.google-earth.kml+xml'
  );
}

/**
 * Safely loads an image with timeout and CORS settings.
 */
function loadImageSafe(url: string, timeoutMs = 2500): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;

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
 * Projects WGS84 (lat, lng) to Web Mercator pixel coordinates at a zoom level.
 */
function projectMercator(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n * 256;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * 256;
  return { x, y };
}

/** Draws a rounded rectangle, falling back on engines without roundRect(). */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Client-side satellite snapshot. Used only as a fallback when the server-side
 * renderer is unavailable.
 */
async function generateCanvasSnapshot(
  report: HydrologyReport,
  alignmentInput?: CorridorAlignment | null
): Promise<string> {
  const width = 1000;
  const height = 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // No alignment means none is drawn. Substituting another project's railway
  // here would put unrelated geometry into a client deliverable.
  const alignment = alignmentInput ?? null;

  const framePoints: [number, number][] = [
    [report.latitudeDD, report.longitudeDD],
    ...report.streamCoordinates,
    ...report.catchmentPolygon,
    ...(report.tributaryPaths || []).flat(),
  ];

  const usableW = width - 40;
  const usableH = height - 28;

  const MAX_UPSCALE = 1.6;
  const ROTATION_GAIN = 1.12;
  let zoom = 18;
  let angle = 0;
  let scale = 1;
  let centerX = 0;
  let centerY = 0;

  for (let z = 18; z >= 10; z--) {
    const pts = framePoints.map(([lat, lng]) => projectMercator(lat, lng, z));
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
    centerX = (minX + maxX) / 2;
    centerY = (minY + maxY) / 2;

    const measure = (rot: number): number => {
      const ca = Math.cos(rot);
      const sa = Math.sin(rot);
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
      return Math.min(usableW / w, usableH / h);
    };

    scale = measure(0);
    angle = 0;
    for (let deg = 5; deg < 90; deg += 5) {
      const candidate = measure((deg * Math.PI) / 180);
      if (candidate > scale * ROTATION_GAIN) {
        scale = candidate;
        angle = (deg * Math.PI) / 180;
      }
    }

    zoom = z;
    if (scale <= MAX_UPSCALE) break;
  }

  scale = Math.max(Math.min(scale, MAX_UPSCALE) * 0.98, 1e-6);

  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const bandCenterX = width / 2;
  const bandCenterY = height / 2;

  const mercToScreen = (mx: number, my: number): [number, number] => {
    const dx = (mx - centerX) * scale;
    const dy = (my - centerY) * scale;
    return [bandCenterX + dx * cosA - dy * sinA, bandCenterY + dx * sinA + dy * cosA];
  };

  const project = (lat: number, lng: number) => projectMercator(lat, lng, zoom);
  const toX = (lng: number, lat: number) => mercToScreen(project(lat, lng).x, project(lat, lng).y)[0];
  const toY = (lat: number) => mercToScreen(project(lat, 0).x, project(lat, 0).y)[1];

  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0c121e');
  bgGrad.addColorStop(0.5, '#131b26');
  bgGrad.addColorStop(1, '#0e1622');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Satellite basemap.
  try {
    const screenToMerc = (sx: number, sy: number): { x: number; y: number } => {
      const ux = sx - bandCenterX;
      const uy = sy - bandCenterY;
      return {
        x: centerX + (ux * cosA + uy * sinA) / scale,
        y: centerY + (-ux * sinA + uy * cosA) / scale,
      };
    };

    // A rotated frame's true mercator bounds are NOT the bounding box of its
    // four corners - the extrema sit at edge midpoints. Sample the perimeter
    // so no tile along a rotated edge is missed.
    const probes: { x: number; y: number }[] = [];
    const STEPS = 12;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      probes.push(screenToMerc(t * width, 0));
      probes.push(screenToMerc(t * width, height));
      probes.push(screenToMerc(0, t * height));
      probes.push(screenToMerc(width, t * height));
    }

    const maxIndex = Math.pow(2, zoom) - 1;
    const minTileX = Math.max(0, Math.floor(Math.min(...probes.map((p) => p.x)) / 256));
    const maxTileX = Math.min(maxIndex, Math.floor(Math.max(...probes.map((p) => p.x)) / 256));
    const minTileY = Math.max(0, Math.floor(Math.min(...probes.map((p) => p.y)) / 256));
    const maxTileY = Math.min(maxIndex, Math.floor(Math.max(...probes.map((p) => p.y)) / 256));

    const tilePromises: Promise<{ img: HTMLImageElement | null; tx: number; ty: number }>[] = [];
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
        tilePromises.push(loadImageSafe(url, 2500).then((img) => ({ img, tx, ty })));
      }
    }

    const loadedTiles = await Promise.all(tilePromises);
    const tileSize = 256 * scale;
    loadedTiles.forEach(({ img, tx, ty }) => {
      if (!img) return;
      const [dx, dy] = mercToScreen(tx * 256 + 128, ty * 256 + 128);
      ctx.save();
      ctx.translate(dx, dy);
      if (angle !== 0) ctx.rotate(angle);
      ctx.drawImage(img, -tileSize / 2, -tileSize / 2, tileSize + 0.6, tileSize + 0.6);
      ctx.restore();
    });
  } catch (err) {
    console.warn('Canvas satellite tile loading fallback:', err);
  }

  const tracePath = (coords: [number, number][]) => {
    ctx.beginPath();
    coords.forEach(([lat, lng], idx) => {
      const x = toX(lng, lat);
      const y = toY(lat);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  };

  // Catchment polygon.
  if (report.catchmentPolygon.length > 2) {
    tracePath(report.catchmentPolygon);
    ctx.closePath();
    ctx.fillStyle = 'rgba(34, 211, 238, 0.28)';
    ctx.fill();
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 3.0;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Contours.
  if (report.contours && report.contours.length > 0) {
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 5]);
    ctx.globalAlpha = 0.85;
    for (const cnt of report.contours) {
      if (cnt.coordinates.length < 2) continue;
      tracePath(cnt.coordinates);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  }

  // Tributaries.
  if (report.tributaryPaths && report.tributaryPaths.length > 0) {
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 5]);
    ctx.globalAlpha = 0.9;
    for (const path of report.tributaryPaths) {
      if (path.length < 2) continue;
      tracePath(path);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  }

  // Primary stream.
  if (report.streamCoordinates.length > 1) {
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 4.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    tracePath(report.streamCoordinates);
    ctx.stroke();
  }

  // Stream headwater marker.
  if (report.streamCoordinates.length > 0) {
    const originPt = report.streamCoordinates[0];
    const ox = toX(originPt[1], originPt[0]);
    const oy = toY(originPt[0]);
    ctx.fillStyle = '#DC2626';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(ox, oy, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Corridor alignment, drawn only when one was actually supplied.
  if (alignment && alignment.coordinates.length > 1) {
    tracePath(alignment.coordinates);

    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 7.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 5.0;
    ctx.setLineDash([3, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    for (const ch of alignment.chainages ?? []) {
      const cx = toX(ch.lng, ch.lat);
      const cy = toY(ch.lat);
      if (cx < -30 || cx > width + 80 || cy < -30 || cy > height + 30) continue;

      const isTarget = Math.abs(ch.chainage - report.targetChainage) < 0.1;
      ctx.fillStyle = isTarget ? '#DC2626' : '#000000';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = isTarget ? 1.5 : 1;
      ctx.beginPath();
      ctx.arc(cx, cy, isTarget ? 4.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 3, cy);
      ctx.lineTo(cx + 9, cy);
      ctx.stroke();

      // Use the label the source file supplied; only synthesise one when the
      // station has no label of its own.
      const txt = ch.formatted || formatChainageNumber(ch.chainage);
      ctx.font = isTarget ? 'bold 12px Arial, sans-serif' : 'bold 11px Arial, sans-serif';
      const tx = cx + 11;
      const ty = cy + 4;

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(txt, tx, ty);

      ctx.fillStyle = '#000000';
      ctx.fillText(txt, tx, ty);
    }
  }

  // Yellow placemark pin.
  const px = toX(report.longitudeDD, report.latitudeDD);
  const py = toY(report.latitudeDD);

  ctx.save();
  ctx.fillStyle = '#FACC15';
  ctx.strokeStyle = '#854D0E';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(px, py - 20, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px, py - 12);
  ctx.lineTo(px, py);
  ctx.stroke();

  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3.5;
  ctx.strokeText('Untitled Placemark', px + 14, py - 16);
  ctx.fillText('Untitled Placemark', px + 14, py - 16);
  ctx.restore();

  // Scale / metric badge. States only what was measured.
  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.2;
  roundedRect(ctx, 16, height - 48, 620, 34, 6);
  ctx.fill();
  ctx.stroke();

  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('Stream length', 28, height - 26);
  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(
    `${report.lengthOfStreamKm} km (${Math.round(report.lengthOfStreamKm * 1000)} m)`,
    118,
    height - 26
  );
  ctx.fillStyle = '#34D399';
  ctx.fillText(`| Δh = ${report.elevationDropM} m`, 300, height - 26);
  ctx.fillStyle = '#94A3B8';
  ctx.font = '12px sans-serif';
  ctx.fillText(`| Scope ${report.scopeAppliedM} m`, 400, height - 26);

  return canvas.toDataURL('image/png');
}

/**
 * Captures the delineation snapshot, preferring the server-side renderer and
 * falling back to the browser canvas renderer.
 */
async function captureCatchmentSnapshot(
  report: HydrologyReport,
  alignment?: CorridorAlignment | null
): Promise<string> {
  try {
    const payload = buildSnapshotPayload(report, alignment);
    payload.width = 1200;
    payload.height = 850;

    const resp = await fetch('/api/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.imageDataUrl && data.imageDataUrl.startsWith('data:image/png')) {
        return data.imageDataUrl;
      }
    }
  } catch (backendErr) {
    console.warn('Backend snapshot API unavailable, using local renderer:', backendErr);
  }

  return generateCanvasSnapshot(report, alignment);
}

/** Shared snapshot request shape used by the snapshot and Excel endpoints. */
export function buildSnapshotPayload(
  report: HydrologyReport,
  alignment?: CorridorAlignment | null
): Record<string, unknown> {
  return {
    targetChainageFormatted: report.targetChainageFormatted,
    targetChainage: report.targetChainage,
    latitudeDMS: report.latitudeDMS,
    longitudeDMS: report.longitudeDMS,
    latitudeDD: report.latitudeDD,
    longitudeDD: report.longitudeDD,
    catchmentAreaKm2: report.catchmentAreaKm2,
    lengthOfStreamKm: report.lengthOfStreamKm,
    levelStreamOriginM: report.levelStreamOriginM,
    highestContourM: report.highestContourM,
    elevationDropM: report.elevationDropM,
    scopeAppliedM: report.scopeAppliedM,
    scopeExpandedDueToFlatRelief: report.scopeExpandedDueToFlatRelief,
    reliefWithinScopeM: report.reliefWithinScopeM,
    meetsReliefThreshold: report.meetsReliefThreshold,
    elevationSource: report.elevationSource,
    elevationOriginKind: report.elevationOriginKind,
    demCoverage: report.demCoverage,
    contributingCells: report.contributingCells,
    catchmentPolygon: report.catchmentPolygon,
    streamCoordinates: report.streamCoordinates,
    alignmentCoordinates: alignment?.coordinates,
    allTracks: alignment?.allTracks,
    tributaryPaths: report.tributaryPaths,
    contours: report.contours,
    chainages: alignment?.chainages?.map((c) => ({
      chainage: c.chainage,
      formatted: c.formatted,
      lat: c.lat,
      lng: c.lng,
    })),
  };
}

// ---------------------------------------------------------------------------
// Excel workbook
// ---------------------------------------------------------------------------

const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0F172A' } };
const LABEL_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF1F5F9' } };
const THIN_BORDER = {
  top: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
  left: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
  bottom: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
  right: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
};

function styleHeaderRow(row: ExcelJS.Row): void {
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = THIN_BORDER;
  });
}

/**
 * Sheet 1 - the six headline hydrology values from the specification, plus the
 * measured provenance that makes them interpretable.
 */
function addHydrologySummarySheet(
  workbook: ExcelJS.Workbook,
  report: HydrologyReport
): ExcelJS.Worksheet {
  const sheetName = `CH_${chainageTag(report.targetChainageFormatted)}`.slice(0, 31);
  const ws = workbook.addWorksheet(sheetName || 'Catchment_Delineation', {
    views: [{ showGridLines: true }],
  });
  ws.columns = [{ width: 30 }, { width: 40 }];

  const headlineRows: [string, string][] = [
    ['LATITUDE :', report.latitudeDMS],
    ['LONGITUDE :', report.longitudeDMS],
    ['CATCHMENT AREA (A):', `${report.catchmentAreaKm2} km²`],
    ['LENGTH OF STREAM (L):', `${report.lengthOfStreamKm} km`],
    ['LEVEL STREAM ORIGIN:', `${report.levelStreamOriginM} m MSL`],
    ['HIGHEST CONTOUR:', `${report.highestContourM} m MSL`],
  ];

  for (const [label, value] of headlineRows) {
    const row = ws.addRow([label, value]);
    row.height = 24;
    const cellA = row.getCell(1);
    const cellB = row.getCell(2);
    cellA.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cellA.fill = LABEL_FILL;
    cellB.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0284C7' } };
    cellA.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellB.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellA.border = THIN_BORDER;
    cellB.border = THIN_BORDER;
  }

  ws.addRow([]);
  const provenanceHeader = ws.addRow(['MEASUREMENT BASIS', '']);
  provenanceHeader.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
  provenanceHeader.getCell(1).fill = LABEL_FILL;

  const provenance: [string, string][] = [
    ['Elevation drop (Δh):', `${report.elevationDropM} m`],
    ['Relief within analysis scope:', `${report.reliefWithinScopeM} m`],
    ['Analysis scope applied:', `${report.scopeAppliedM} m${report.scopeExpandedDueToFlatRelief ? ' (auto-expanded from 500 m: relief below 5 m)' : ''}`],
    ['Meets 5 m relief threshold:', report.meetsReliefThreshold ? 'Yes' : 'No'],
    ['Elevation source:', report.elevationSource],
    ['Level Stream Origin datum:', report.elevationOriginKind === 'survey' ? 'Uploaded survey sheet' : 'Sampled from DEM'],
    ['DEM coverage of analysis grid:', `${(report.demCoverage * 100).toFixed(1)}%`],
    ['Contributing DEM cells:', `${report.contributingCells} at ${report.analysisCellSizeM} m spacing`],
    ['Flow arrives at chainage:', report.flowArrivesAtCrossing ? 'Yes' : 'No'],
    ['Flow arrival bearing:', report.flowArrivalBearingDeg !== null ? `${report.flowArrivalBearingDeg}\u00b0` : 'Not determined'],
    ['Stream head elevation:', report.streamHeadElevationM !== null ? `${report.streamHeadElevationM} m MSL` : 'Not determined'],
    ['Head of watercourse:', `${Math.round(report.headDistanceM)} m from the chainage`],
    ['Head coordinates:', report.headCoordinates.map((v) => v.toFixed(6)).join(', ')],
    ['Watercourse gradient:', report.streamSlopePercent !== null && report.streamSlopePercent !== undefined ? `${report.streamSlopePercent} %` : 'Not computable'],
    ['Time of concentration (Kirpich):', report.timeOfConcentrationHours !== null && report.timeOfConcentrationHours !== undefined ? `${report.timeOfConcentrationHours} h` : 'Not computable'],
    ['Processed:', report.processedTimestamp],
    ['Notes:', report.notes ?? ''],
  ];

  for (const [label, value] of provenance) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF334155' } };
    row.getCell(2).font = { name: 'Arial', size: 9, color: { argb: 'FF334155' } };
    row.getCell(2).alignment = { vertical: 'top', wrapText: true };
  }

  return ws;
}

/** Sheet 2 - every chainage on the corridor with lat/long in DMS and decimal. */
function addChainageRegisterSheet(
  workbook: ExcelJS.Workbook,
  chainages: ChainageRecord[]
): void {
  const ws = workbook.addWorksheet('Chainage_Register', { views: [{ showGridLines: true }] });
  ws.columns = [
    { width: 16, header: 'Chainage' },
    { width: 24, header: 'Latitude (DMS)' },
    { width: 24, header: 'Longitude (DMS)' },
    { width: 16, header: 'Latitude (DD)' },
    { width: 16, header: 'Longitude (DD)' },
    { width: 16, header: 'Elevation (m MSL)' },
    { width: 18, header: 'Elevation Source' },
    { width: 16, header: 'Distance from start (m)' },
  ];
  styleHeaderRow(ws.getRow(1));

  for (const c of chainages) {
    const elevationCell =
      c.elevation === undefined || c.elevation === null
        ? 'Not available'
        : c.elevation;
    ws.addRow([
      c.formatted || formatChainageNumber(c.chainage),
      c.dmsLat,
      c.dmsLng,
      c.decLat ?? c.lat,
      c.decLng ?? c.lng,
      elevationCell,
      c.elevationSource === 'survey'
        ? 'Survey sheet'
        : c.elevationSource === 'dem'
          ? 'DEM (30 m)'
          : 'Not available',
      Math.round(c.distanceFromStartM),
    ]);
  }
}

/** Sheet 3 - the catchment boundary vertices, for CAD/GIS hand-off. */
function addPolygonVertexSheet(
  workbook: ExcelJS.Workbook,
  report: HydrologyReport
): void {
  const ws = workbook.addWorksheet('Catchment_Boundary', { views: [{ showGridLines: true }] });
  ws.columns = [
    { width: 10, header: 'Vertex' },
    { width: 16, header: 'Latitude (DD)' },
    { width: 16, header: 'Longitude (DD)' },
    { width: 24, header: 'Latitude (DMS)' },
    { width: 24, header: 'Longitude (DMS)' },
  ];
  styleHeaderRow(ws.getRow(1));

  report.catchmentPolygon.forEach(([lat, lng], idx) => {
    ws.addRow([
      idx + 1,
      Math.round(lat * 1e7) / 1e7,
      Math.round(lng * 1e7) / 1e7,
      decimalToDMS(lat, true),
      decimalToDMS(lng, false),
    ]);
  });
}

/**
 * Builds the full three-sheet workbook required by the specification:
 * hydrology summary, complete chainage register, and boundary vertices.
 */
async function buildHydrologyWorkbook(
  report: HydrologyReport,
  alignment?: CorridorAlignment | null,
  snapshotDataUrl?: string | null
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tensora GIS - Hydrology Catchment Engine';
  workbook.created = new Date();

  const ws = addHydrologySummarySheet(workbook, report);

  if (alignment && alignment.chainages.length > 0) {
    addChainageRegisterSheet(workbook, alignment.chainages);
  }
  addPolygonVertexSheet(workbook, report);

  if (snapshotDataUrl && snapshotDataUrl.startsWith('data:image/')) {
    const imageId = workbook.addImage({ base64: snapshotDataUrl, extension: 'png' });
    ws.addImage(imageId, { tl: { col: 0, row: ws.rowCount + 1 }, ext: { width: 720, height: 510 } });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Triggers a browser download for a generated blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports the formatted Excel workbook, preferring the server endpoint and
 * falling back to an identical client-side build.
 */
export async function exportExcelReport(
  report: HydrologyReport,
  alignment?: CorridorAlignment | null
): Promise<void> {
  const filename = `Hydrology_Report_CH_${chainageTag(report.targetChainageFormatted)}.xlsx`;

  try {
    const resp = await fetch('/api/export-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSnapshotPayload(report, alignment)),
    });

    if (resp.ok) {
      downloadBlob(await resp.blob(), filename);
      return;
    }
    console.warn(`Excel endpoint returned ${resp.status}; building workbook locally.`);
  } catch (serverErr) {
    console.warn('Excel endpoint unavailable; building workbook locally:', serverErr);
  }

  const snapshotDataUrl = await captureCatchmentSnapshot(report, alignment);
  downloadBlob(await buildHydrologyWorkbook(report, alignment, snapshotDataUrl), filename);
}
