/**
 * Geospatial utility functions for civil & hydrological analysis
 */

const EARTH_RADIUS_METERS = 6371000;

/**
 * Converts decimal degrees to standard Degrees Minutes Seconds (DMS) string
 * Example: 27.244844 -> 27°14'41.44"N
 */
export function decimalToDMS(deg: number, isLatitude: boolean): string {
  const absolute = Math.abs(deg);
  const direction = isLatitude ? (deg >= 0 ? 'N' : 'S') : deg >= 0 ? 'E' : 'W';

  // Round at the seconds boundary first, then carry any 59.995" overflow into
  // minutes/degrees. Rounding each field independently produced impossible
  // readings such as 27°14'60.00"N.
  let totalSeconds = Math.round(absolute * 3600 * 100) / 100;
  let degrees = Math.floor(totalSeconds / 3600);
  totalSeconds -= degrees * 3600;
  let minutes = Math.floor(totalSeconds / 60);
  totalSeconds -= minutes * 60;
  let seconds = totalSeconds;

  if (Math.round(seconds * 100) === 6000) {
    seconds = 0;
    minutes += 1;
  }
  if (minutes === 60) {
    minutes = 0;
    degrees += 1;
  }

  const secStr = seconds.toFixed(2).padStart(5, '0');
  const minStr = String(minutes).padStart(2, '0');

  return `${degrees}°${minStr}'${secStr}"${direction}`;
}

/**
 * Parses DMS string or decimal string into a decimal number.
 * Accepts "27.244844", "27°14'41.44\"N", "27 14 41.44 N", "27d14m41.44sN".
 * Returns null when the input cannot be interpreted as a coordinate.
 */
export function parseCoordinateInput(input: string): number | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // Plain decimal degrees. Reject anything that is not strictly a number so
  // that "27,244844" or "1e" cannot silently become a partial value.
  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    const num = parseFloat(trimmed);
    return isFinite(num) ? num : null;
  }

  const dmsRegex =
    /([+-]?\d+(?:\.\d+)?)\s*[°d\s]\s*(\d+(?:\.\d+)?)\s*['m\s]\s*(\d+(?:\.\d+)?)\s*["s]?\s*([NSEWnsew])?/;
  const match = trimmed.match(dmsRegex);
  if (match) {
    const deg = Math.abs(parseFloat(match[1]));
    const min = parseFloat(match[2]);
    const sec = parseFloat(match[3]);
    const dir = match[4] ? match[4].toUpperCase() : '';
    if (!isFinite(deg) || !isFinite(min) || !isFinite(sec)) return null;
    // Minutes/seconds must be strictly sub-field values; "27°94'0\"N" is not a
    // real reading and is far more likely to be a parse accident.
    if (min >= 60 || sec >= 60) return null;

    let dec = deg + min / 60 + sec / 3600;
    if (dir === 'S' || dir === 'W' || (!dir && parseFloat(match[1]) < 0)) {
      dec = -dec;
    }
    return dec;
  }

  return null;
}

/** True when the value is a usable WGS84 coordinate (lat or lng). */
export function isValidLat(lat: unknown): lat is number {
  return typeof lat === 'number' && isFinite(lat) && lat >= -90 && lat <= 90;
}

/** True when the value is a usable WGS84 coordinate (lat or lng). */
export function isValidLng(lng: unknown): lng is number {
  return typeof lng === 'number' && isFinite(lng) && lng >= -180 && lng <= 180;
}

/**
 * Haversine distance between two coordinates in meters
 */
export function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Calculates initial bearing between two coordinates in degrees (0 - 360)
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

/**
 * Moves a coordinate by distance (meters) and bearing (degrees)
 */
export function destinationPoint(
  lat: number,
  lon: number,
  distanceM: number,
  bearingDeg: number
): [number, number] {
  const delta = distanceM / EARTH_RADIUS_METERS;
  const theta = (bearingDeg * Math.PI) / 180;
  const phi1 = (lat * Math.PI) / 180;
  const lambda1 = (lon * Math.PI) / 180;

  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) +
    Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(sinPhi2);
  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);
  const x = Math.cos(delta) - Math.sin(phi1) * sinPhi2;
  const lambda2 = lambda1 + Math.atan2(y, x);

  return [(phi2 * 180) / Math.PI, (lambda2 * 180) / Math.PI];
}

/**
 * Computes total cumulative length of a polyline in meters
 */
export function polylineLengthM(coords: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineDistanceM(
      coords[i][0],
      coords[i][1],
      coords[i + 1][0],
      coords[i + 1][1]
    );
  }
  return total;
}

/**
 * Linear referencing: interpolates exact [lat, lng] along a polyline at target distance (meters)
 */
export function interpolateAlongPolyline(
  coords: [number, number][],
  targetDistanceM: number
): { point: [number, number]; bearing: number } {
  if (coords.length === 0) return { point: [0, 0], bearing: 0 };
  if (coords.length === 1 || targetDistanceM <= 0) {
    const bearing = coords.length > 1 ? calculateBearing(coords[0][0], coords[0][1], coords[1][0], coords[1][1]) : 0;
    return { point: coords[0], bearing };
  }

  let accumulated = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const segDist = haversineDistanceM(p1[0], p1[1], p2[0], p2[1]);

    if (accumulated + segDist >= targetDistanceM || i === coords.length - 2) {
      const remaining = Math.max(0, targetDistanceM - accumulated);
      const ratio = segDist > 0 ? Math.min(1, remaining / segDist) : 0;
      const lat = p1[0] + (p2[0] - p1[0]) * ratio;
      const lng = p1[1] + (p2[1] - p1[1]) * ratio;
      const bearing = calculateBearing(p1[0], p1[1], p2[0], p2[1]);
      return { point: [lat, lng], bearing };
    }
    accumulated += segDist;
  }

  const last = coords[coords.length - 1];
  const secondLast = coords[coords.length - 2];
  return {
    point: last,
    bearing: calculateBearing(secondLast[0], secondLast[1], last[0], last[1]),
  };
}

/**
 * EXACT PERPENDICULAR PROJECTION ONTO POLYLINE
 * In order to find the respective point on the line, we look EXACTLY perpendicular to the line!
 * This converts label/annotation coordinates placed beside the line into the true point on the line.
 */
export function findPerpendicularPointOnPolyline(
  queryLat: number,
  queryLng: number,
  coords: [number, number][],
  startChainage = 0
): {
  perpendicularPoint: [number, number];
  chainage: number;
  offsetDistanceM: number;
  segmentBearing: number;
} {
  if (coords.length === 0) {
    return {
      perpendicularPoint: [queryLat, queryLng],
      chainage: startChainage,
      offsetDistanceM: 0,
      segmentBearing: 0,
    };
  }

  if (coords.length === 1) {
    return {
      perpendicularPoint: coords[0],
      chainage: startChainage,
      offsetDistanceM: haversineDistanceM(queryLat, queryLng, coords[0][0], coords[0][1]),
      segmentBearing: 0,
    };
  }

  let minOffsetDist = Infinity;
  let bestPerpPoint: [number, number] = coords[0];
  let bestDistAlong = 0;
  let bestBearing = 0;
  let accumulatedDistM = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];

    // Local meter projection (ENU approximation - used only for the lateral
    // perpendicular search so it stays invariant across zoom levels)
    const midLat = (p1[0] + p2[0]) / 2;
    const radLat = (midLat * Math.PI) / 180;
    const metersPerDegLat = 111132;
    const metersPerDegLng = 111412 * Math.cos(radLat);

    const dx = (p2[1] - p1[1]) * metersPerDegLng;
    const dy = (p2[0] - p1[0]) * metersPerDegLat;
    const segLenSq = dx * dx + dy * dy;

    if (segLenSq > 1e-6) {
      const qx = (queryLng - p1[1]) * metersPerDegLng;
      const qy = (queryLat - p1[0]) * metersPerDegLat;

      // Vector dot product for perpendicular projection scalar t
      const tRaw = (qx * dx + qy * dy) / segLenSq;
      const t = Math.max(0, Math.min(1, tRaw));

      const footX = t * dx;
      const footY = t * dy;
      const footLat = p1[0] + footY / metersPerDegLat;
      const footLng = p1[1] + footX / metersPerDegLng;

      const perpDist = Math.sqrt((qx - footX) * (qx - footX) + (qy - footY) * (qy - footY));

      // Along-line distance MUST accumulate with the same geodetic metric
      // (haversine) used by interpolateAlongPolyline, otherwise large
      // corridors accumulate a systematic scale drift (hundreds of metres
      // per few hundred km) and chainages collapse onto the wrong points.
      const segHaversineM = haversineDistanceM(p1[0], p1[1], p2[0], p2[1]);

      if (perpDist < minOffsetDist) {
        minOffsetDist = perpDist;
        bestPerpPoint = [footLat, footLng];
        bestDistAlong = accumulatedDistM + t * segHaversineM;
        bestBearing = calculateBearing(p1[0], p1[1], p2[0], p2[1]);
      }
      accumulatedDistM += segHaversineM;
    }
  }

  return {
    perpendicularPoint: bestPerpPoint,
    chainage: startChainage + bestDistAlong,
    offsetDistanceM: minOffsetDist,
    segmentBearing: bestBearing,
  };
}

/**
 * Backward compatibility alias
 */
export function findNearestPointOnPolyline(
  lat: number,
  lng: number,
  coords: [number, number][],
  startChainage = 0
): { nearestPoint: [number, number]; chainage: number; distanceM: number } {
  const res = findPerpendicularPointOnPolyline(lat, lng, coords, startChainage);
  return {
    nearestPoint: res.perpendicularPoint,
    chainage: res.chainage,
    distanceM: res.offsetDistanceM,
  };
}

/**
 * Computes polygon area in square kilometers.
 * Uses an equirectangular projection anchored at the polygon centroid, with
 * per-axis scale factors evaluated at the centroid latitude. For catchment
 * extents (<= a few km) the projection error is well below 0.01%.
 */
export function calculatePolygonAreaKm2(coords: [number, number][]): number {
  const ring = coords.filter(([lat, lng]) => isFinite(lat) && isFinite(lng));
  if (ring.length < 3) return 0;

  const centerLat = ring.reduce((acc, c) => acc + c[0], 0) / ring.length;
  const centerLng = ring.reduce((acc, c) => acc + c[1], 0) / ring.length;

  const radLat = (centerLat * Math.PI) / 180;
  const metersPerDegreeLat = 111132.954 - 559.822 * Math.cos(2 * radLat) + 1.175 * Math.cos(4 * radLat);
  const metersPerDegreeLng = Math.abs(Math.cos(radLat)) < 1e-6
    ? 0
    : 111412.84 * Math.cos(radLat) - 93.5 * Math.cos(3 * radLat);

  if (metersPerDegreeLng === 0) return 0;

  const xy = ring.map(([lat, lng]) => [
    (lng - centerLng) * metersPerDegreeLng,
    (lat - centerLat) * metersPerDegreeLat,
  ]);

  let shoelace = 0;
  for (let i = 0; i < xy.length; i++) {
    const j = (i + 1) % xy.length;
    shoelace += xy[i][0] * xy[j][1] - xy[j][0] * xy[i][1];
  }

  const areaM2 = Math.abs(shoelace) / 2;
  return areaM2 / 1_000_000;
}

/**
 * Formats chainage number into standard railway chainage notation (e.g. 69+100 or 69340.000)
 */
export function formatChainageNumber(ch: number, usePlusFormat = false): string {
  if (usePlusFormat) {
    return formatRailwayStationLabel(ch);
  }
  return Number.isInteger(ch) ? ch.toFixed(0) : ch.toFixed(3);
}

/**
 * Universal Railway Station Label: e.g. 69+100, 69+200, 70+000
 * Rounding must carry: 69+999.6 becomes 70+000, never 69+1000.
 */
export function formatRailwayStationLabel(ch: number): string {
  const isNegative = ch < 0;
  const absCh = Math.abs(ch);
  const totalMetres = Math.round(absCh);
  const km = Math.floor(totalMetres / 1000);
  const m = totalMetres % 1000;
  const sign = isNegative ? '-' : '';
  return `${sign}${km}+${String(m).padStart(3, '0')}`;
}

/**
 * Chaikin's algorithm for hydraulic and geodetic polyline smoothing.
 * Eliminates angular DEM grid steps and sharp corners, producing natural,
 * realistic fluvial watercourse curves while strictly preserving the
 * exact origin and culvert end-point coordinates.
 */
export function smoothPolylineChaikin(
  coords: [number, number][],
  iterations = 3
): [number, number][] {
  if (coords.length < 3 || iterations <= 0) {
    return coords.map((pt) => [pt[0], pt[1]]);
  }

  let pts: [number, number][] = coords.map((pt) => [pt[0], pt[1]]);

  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) break;
    const newPts: [number, number][] = [pts[0]];

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];

      const qLat = 0.75 * p0[0] + 0.25 * p1[0];
      const qLng = 0.75 * p0[1] + 0.25 * p1[1];

      const rLat = 0.25 * p0[0] + 0.75 * p1[0];
      const rLng = 0.25 * p0[1] + 0.75 * p1[1];

      newPts.push([qLat, qLng]);
      newPts.push([rLat, rLng]);
    }

    newPts.push(pts[pts.length - 1]);
    pts = newPts;
  }

  return pts;
}

/**
 * Chaikin's algorithm for closed polygon boundary smoothing (watershed divide).
 * Eliminates polygonal facets and sharp jagged angles along ridge divides,
 * producing realistic, organic catchment boundaries while strictly preserving
 * the culvert inlet anchor point on the road alignment.
 */
export function smoothClosedPolygonChaikin(
  polygon: [number, number][],
  iterations = 3
): [number, number][] {
  if (polygon.length < 4 || iterations <= 0) {
    return polygon.map((pt) => [pt[0], pt[1]]);
  }

  // Treat as open loop anchored at start/end if first and last point match (culvert)
  const isClosed =
    Math.abs(polygon[0][0] - polygon[polygon.length - 1][0]) < 1e-7 &&
    Math.abs(polygon[0][1] - polygon[polygon.length - 1][1]) < 1e-7;

  if (isClosed) {
    // Preserves the culvert anchor point at start and end while smoothing all ridges
    return smoothPolylineChaikin(polygon, iterations);
  }

  // General closed loop smoothing
  let pts: [number, number][] = polygon.map((pt) => [pt[0], pt[1]]);

  for (let it = 0; it < iterations; it++) {
    const n = pts.length;
    if (n < 3) break;
    const newPts: [number, number][] = [];

    for (let i = 0; i < n; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % n];

      newPts.push([
        0.75 * p0[0] + 0.25 * p1[0],
        0.75 * p0[1] + 0.25 * p1[1],
      ]);
      newPts.push([
        0.25 * p0[0] + 0.75 * p1[0],
        0.25 * p0[1] + 0.75 * p1[1],
      ]);
    }
    pts = newPts;
  }

  // Re-close loop
  pts.push([pts[0][0], pts[0][1]]);
  return pts;
}

