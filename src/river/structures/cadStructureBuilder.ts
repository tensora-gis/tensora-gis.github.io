/**
 * CAD Hydraulic Structure Builder from Interactive Map Points & Polylines
 *
 * Maps user-drawn spatial transects and freehand CAD polylines directly to
 * 2D curvilinear CFD mesh cells. Supports all civil river structures:
 * - Levees & Floodwalls
 * - Weirs
 * - Bridges
 * - Culverts
 * - Sluice & Radial Gates
 * - Road Embankments
 * - Spur Dikes / Groynes (bank-anchored flow deflectors)
 * - Standalone Bridge Piers (circular, round-nose, sharp-nose, square)
 * - Custom Flow Training Deflectors & Guide Banks
 */

import { RiverGridMesh, RiverCoordinate, RiverGridCell } from '../types/riverReach';
import {
  RiverHydraulicStructure,
  RiverStructureType,
  RiverLeveeStructure,
  RiverWeirStructure,
  RiverBridgeStructure,
  RiverCulvertStructure,
  RiverGateStructure,
  RiverEmbankmentStructure,
  RiverSpurdikeStructure,
  RiverBridgePierStructure,
  RiverCustomDeflectorStructure,
  RiverPolygonStructure,
  RiverCircleStructure,
  RiverLineStructure,
} from './structureTypes';

const METERS_PER_DEG_LAT = 111320.0;

/**
 * Standard Jordan Curve Ray-Casting Point-in-Polygon Test
 */
export function isPointInPolygon(point: RiverCoordinate, polygon: RiverCoordinate[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Metric distance from a point to a 2D line segment in meters
 */
export function pointToSegmentDistance(
  pt: RiverCoordinate,
  p1: RiverCoordinate,
  p2: RiverCoordinate
): { distanceM: number; t: number; proj: RiverCoordinate } {
  const midLat = 0.5 * (p1.lat + p2.lat);
  const cosLat = Math.cos((midLat * Math.PI) / 180.0);

  const x = (pt.lng - p1.lng) * METERS_PER_DEG_LAT * cosLat;
  const y = (pt.lat - p1.lat) * METERS_PER_DEG_LAT;
  const dx = (p2.lng - p1.lng) * METERS_PER_DEG_LAT * cosLat;
  const dy = (p2.lat - p1.lat) * METERS_PER_DEG_LAT;

  const segLenSq = dx * dx + dy * dy;
  let t = 0;
  if (segLenSq > 1e-9) {
    t = Math.max(0, Math.min(1, (x * dx + y * dy) / segLenSq));
  }

  const projX = t * dx;
  const projY = t * dy;
  const distanceM = Math.hypot(x - projX, y - projY);

  const projLat = p1.lat + projY / METERS_PER_DEG_LAT;
  const projLng = p1.lng + projX / (METERS_PER_DEG_LAT * cosLat);

  return { distanceM, t, proj: { lat: projLat, lng: projLng } };
}

/**
 * Metric distance from a point to an arbitrary polyline in meters
 */
export function pointToPolylineDistance(
  pt: RiverCoordinate,
  polyline: RiverCoordinate[]
): { distanceM: number; closestSegmentIdx: number } {
  if (polyline.length === 0) return { distanceM: Infinity, closestSegmentIdx: -1 };
  if (polyline.length === 1) {
    const cosLat = Math.cos((pt.lat * Math.PI) / 180.0);
    const dx = (pt.lng - polyline[0].lng) * METERS_PER_DEG_LAT * cosLat;
    const dy = (pt.lat - polyline[0].lat) * METERS_PER_DEG_LAT;
    return { distanceM: Math.hypot(dx, dy), closestSegmentIdx: 0 };
  }

  let minDistanceM = Infinity;
  let closestSegmentIdx = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const res = pointToSegmentDistance(pt, polyline[i], polyline[i + 1]);
    if (res.distanceM < minDistanceM) {
      minDistanceM = res.distanceM;
      closestSegmentIdx = i;
    }
  }

  return { distanceM: minDistanceM, closestSegmentIdx };
}

/**
 * Metric distance from a point to a circle
 */
export function pointToCircleDistance(
  pt: RiverCoordinate,
  center: RiverCoordinate,
  radiusM: number
): { distanceM: number; inside: boolean; distFromCenterM: number } {
  const cosLat = Math.cos((0.5 * (pt.lat + center.lat) * Math.PI) / 180.0);
  const dx = (pt.lng - center.lng) * METERS_PER_DEG_LAT * cosLat;
  const dy = (pt.lat - center.lat) * METERS_PER_DEG_LAT;
  const distFromCenterM = Math.hypot(dx, dy);
  return {
    distanceM: Math.abs(distFromCenterM - radiusM),
    inside: distFromCenterM <= radiusM,
    distFromCenterM,
  };
}

/**
 * Generate 4 corner vertices for a rotated CAD rectangle
 */
export function createRotatedRectanglePoints(
  center: RiverCoordinate,
  lengthM: number,
  widthM: number,
  rotationDeg: number = 0
): RiverCoordinate[] {
  const rad = (rotationDeg * Math.PI) / 180.0;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);

  const hl = lengthM / 2.0;
  const hw = widthM / 2.0;

  // Local rectangle corners relative to center
  const localCorners: [number, number][] = [
    [-hl, -hw],
    [hl, -hw],
    [hl, hw],
    [-hl, hw],
  ];

  const cosLat = Math.cos((center.lat * Math.PI) / 180.0);

  return localCorners.map(([lx, ly]) => {
    // Rotate by rotationDeg
    const rx = lx * cosR - ly * sinR;
    const ry = lx * sinR + ly * cosR;

    const lat = center.lat + ry / METERS_PER_DEG_LAT;
    const lng = center.lng + rx / (METERS_PER_DEG_LAT * cosLat);
    return { lat, lng };
  });
}

/**
 * Generate n-polygon points approximating a circle with radius in meters
 */
export function createCirclePoints(
  center: RiverCoordinate,
  radiusM: number,
  segments: number = 24
): RiverCoordinate[] {
  const points: RiverCoordinate[] = [];
  const cosLat = Math.cos((center.lat * Math.PI) / 180.0);

  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    const dx = radiusM * Math.cos(angle);
    const dy = radiusM * Math.sin(angle);

    const lat = center.lat + dy / METERS_PER_DEG_LAT;
    const lng = center.lng + dx / (METERS_PER_DEG_LAT * cosLat);
    points.push({ lat, lng });
  }

  return points;
}

/**
 * Expands an arbitrary polyline / transect into a watertight 2D closed polygon footprint
 * with physical width / wall thickness (meters).
 */
export function expandPolylineToSolidPolygon(
  points: RiverCoordinate[],
  thicknessM: number
): RiverCoordinate[] {
  if (points.length === 0) return [];
  const halfW = Math.max(0.5, thicknessM * 0.5);

  if (points.length === 1) {
    return createRotatedRectanglePoints(points[0], thicknessM, thicknessM, 0);
  }

  const leftSide: RiverCoordinate[] = [];
  const rightSide: RiverCoordinate[] = [];

  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    const cosLat = Math.cos((cur.lat * Math.PI) / 180.0);

    let dx = 0;
    let dy = 0;

    if (i < points.length - 1) {
      const nxt = points[i + 1];
      dx += (nxt.lng - cur.lng) * METERS_PER_DEG_LAT * cosLat;
      dy += (nxt.lat - cur.lat) * METERS_PER_DEG_LAT;
    }
    if (i > 0) {
      const prv = points[i - 1];
      dx += (cur.lng - prv.lng) * METERS_PER_DEG_LAT * cosLat;
      dy += (cur.lat - prv.lat) * METERS_PER_DEG_LAT;
    }

    const segLen = Math.hypot(dx, dy) || 1e-4;
    const tx = dx / segLen;
    const ty = dy / segLen;

    const normX = -ty;
    const normY = tx;

    const leftLat = cur.lat + (halfW * normY) / METERS_PER_DEG_LAT;
    const leftLng = cur.lng + (halfW * normX) / (METERS_PER_DEG_LAT * cosLat);

    const rightLat = cur.lat - (halfW * normY) / METERS_PER_DEG_LAT;
    const rightLng = cur.lng - (halfW * normX) / (METERS_PER_DEG_LAT * cosLat);

    leftSide.push({ lat: leftLat, lng: leftLng });
    rightSide.push({ lat: rightLat, lng: rightLng });
  }

  return [...leftSide, ...rightSide.reverse()];
}

/**
 * Generate 2D solid boundary footprint for bridge pier with hydrodynamic nose geometry
 */
export function createSolidPierFootprint(
  center: RiverCoordinate,
  lengthM: number,
  widthM: number,
  shape: 'circular' | 'square' | 'round-nose' | 'sharp-nose' = 'round-nose',
  rotationDeg: number = 0
): RiverCoordinate[] {
  if (shape === 'circular') {
    return createCirclePoints(center, widthM / 2.0, 24);
  }
  if (shape === 'square') {
    return createRotatedRectanglePoints(center, lengthM, widthM, rotationDeg);
  }

  const rad = (rotationDeg * Math.PI) / 180.0;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const cosLat = Math.cos((center.lat * Math.PI) / 180.0);

  const localPts: [number, number][] = [];
  const hl = lengthM / 2.0;
  const hw = widthM / 2.0;

  if (shape === 'round-nose') {
    const straightL = Math.max(0.5, hl - hw);
    localPts.push([-straightL, hw]);
    localPts.push([straightL, hw]);
    const noseSegments = 8;
    for (let k = 0; k <= noseSegments; k++) {
      const ang = Math.PI / 2.0 - (Math.PI * k) / noseSegments;
      localPts.push([straightL + hw * Math.cos(ang), hw * Math.sin(ang)]);
    }
    localPts.push([-straightL, -hw]);
    for (let k = 0; k <= noseSegments; k++) {
      const ang = -Math.PI / 2.0 - (Math.PI * k) / noseSegments;
      localPts.push([-straightL + hw * Math.cos(ang), hw * Math.sin(ang)]);
    }
  } else if (shape === 'sharp-nose') {
    const wedgeLen = Math.min(hl * 0.45, hw * 1.5);
    const bodyL = Math.max(0.5, hl - wedgeLen);
    localPts.push([-bodyL, hw]);
    localPts.push([bodyL, hw]);
    localPts.push([bodyL + wedgeLen, 0]);
    localPts.push([bodyL, -hw]);
    localPts.push([-bodyL, -hw]);
    localPts.push([-bodyL - wedgeLen, 0]);
  }

  return localPts.map(([lx, ly]) => {
    const rx = lx * cosR - ly * sinR;
    const ry = lx * sinR + ly * cosR;
    const lat = center.lat + ry / METERS_PER_DEG_LAT;
    const lng = center.lng + rx / (METERS_PER_DEG_LAT * cosLat);
    return { lat, lng };
  });
}

/**
 * Generate 2D solid boundary footprint for a spur dike / groyne projecting from bank
 */
export function createSolidGroyneFootprint(
  bankPt: RiverCoordinate,
  headPt: RiverCoordinate,
  crestWidthM: number = 3.5
): RiverCoordinate[] {
  return expandPolylineToSolidPolygon([bankPt, headPt], Math.max(2.0, crestWidthM));
}

/**
 * Generate 2D solid boundary footprint for a broad-crested weir block across the channel
 */
export function createBroadCrestedWeirFootprint(
  p1: RiverCoordinate,
  p2: RiverCoordinate,
  crestWidthM: number = 6.0
): RiverCoordinate[] {
  return expandPolylineToSolidPolygon([p1, p2], Math.max(2.0, crestWidthM));
}

/**
 * Generate 2D solid boundary footprint for an engineered levee / floodwall
 */
export function createSolidLeveeFootprint(
  points: RiverCoordinate[],
  topWidthM: number = 4.5,
  sideSlopeHtoV: number = 2.5,
  heightM: number = 3.5
): RiverCoordinate[] {
  const baseWidthM = Math.max(topWidthM, topWidthM + 2.0 * sideSlopeHtoV * Math.max(0.5, heightM));
  return expandPolylineToSolidPolygon(points, baseWidthM);
}

/**
 * Live parameter update and spatial repositioning engine for any hydraulic structure
 */
export function updateStructureLiveParameters(
  structure: RiverHydraulicStructure,
  updates: Record<string, any>,
  mesh: RiverGridMesh
): RiverHydraulicStructure {
  const updated: any = { ...structure, ...updates };

  const geomKeys = [
    'topWidthM',
    'wallThicknessM',
    'crestWidthM',
    'baseWidthM',
    'lengthM',
    'widthM',
    'shape',
    'rotationDeg',
    'deflectionAngleDeg',
    'sideSlopeHtoV',
    'crestElevationM',
    'stationM',
    'offsetXM',
    'offsetYM',
  ];

  const hasGeomChange = geomKeys.some((k) => k in updates);

  if (hasGeomChange || updates.coordinates) {
    let baseCoords: RiverCoordinate[] = (updates.coordinates || structure.coordinates || []).slice();

    // Resolve unexpanded generating points to prevent exponential vertex doubling
    let genPoints: RiverCoordinate[] = (structure.generatorPoints || []).slice();
    if (genPoints.length === 0) {
      if (baseCoords.length === 4) {
        // Quadrilateral footprint [c0, c1, c2, c3]: recover centerline [mid(c0, c3), mid(c1, c2)]
        genPoints = [
          {
            lat: 0.5 * (baseCoords[0].lat + baseCoords[3].lat),
            lng: 0.5 * (baseCoords[0].lng + baseCoords[3].lng),
          },
          {
            lat: 0.5 * (baseCoords[1].lat + baseCoords[2].lat),
            lng: 0.5 * (baseCoords[1].lng + baseCoords[2].lng),
          },
        ];
      } else if (baseCoords.length > 0) {
        // Compute true polygon centroid for point-based structures (pier, circle, rectangle)
        const avgLat = baseCoords.reduce((sum, p) => sum + p.lat, 0) / baseCoords.length;
        const avgLng = baseCoords.reduce((sum, p) => sum + p.lng, 0) / baseCoords.length;
        genPoints = [{ lat: avgLat, lng: avgLng }];
      }
    }

    // Handle station shift if stationM was modified
    if ('stationM' in updates && updates.stationM !== structure.stationM && mesh.centerline.length > 1) {
      const targetStation = Math.max(0, Math.min(mesh.reachLengthM, updates.stationM));
      const sFrac = targetStation / Math.max(1, mesh.reachLengthM);
      const iStation = Math.min(mesh.centerline.length - 1, Math.floor(sFrac * (mesh.centerline.length - 1)));
      const newCenter = mesh.centerline[iStation];
      if (genPoints.length > 0) {
        const oldCenter = {
          lat: genPoints.reduce((sum, p) => sum + p.lat, 0) / genPoints.length,
          lng: genPoints.reduce((sum, p) => sum + p.lng, 0) / genPoints.length,
        };
        const dLat = newCenter.lat - oldCenter.lat;
        const dLng = newCenter.lng - oldCenter.lng;
        genPoints = genPoints.map((p) => ({ lat: p.lat + dLat, lng: p.lng + dLng }));
      }
    }

    // Handle offsetXM / offsetYM nudging
    if (updates.offsetXM || updates.offsetYM) {
      const originLat = genPoints[0]?.lat || mesh.centerline[0]?.lat || 0;
      const dLat = (updates.offsetYM || 0) / METERS_PER_DEG_LAT;
      const dLng =
        (updates.offsetXM || 0) /
        (METERS_PER_DEG_LAT * Math.max(0.1, Math.cos((originLat * Math.PI) / 180.0)));
      genPoints = genPoints.map((p) => ({ lat: p.lat + dLat, lng: p.lng + dLng }));
    }

    // Compute true center point for rotation and localized placement
    const center =
      genPoints.length > 0
        ? {
            lat: genPoints.reduce((sum, p) => sum + p.lat, 0) / genPoints.length,
            lng: genPoints.reduce((sum, p) => sum + p.lng, 0) / genPoints.length,
          }
        : mesh.centerline[0] || { lat: 0, lng: 0 };

    let finalCoords: RiverCoordinate[] = [];

    if (updated.type === 'levee' || updated.type === 'embankment') {
      const topW = updated.topWidthM ?? updated.wallThicknessM ?? 4.5;
      const slope = updated.sideSlopeHtoV ?? 2.5;
      const height = Math.max(1.0, (updated.crestElevationM ?? 103.5) - 100.0);
      finalCoords = createSolidLeveeFootprint(genPoints, topW, slope, height);
    } else if (updated.type === 'weir') {
      const crestW = updated.crestWidthM ?? updated.wallThicknessM ?? 6.0;
      finalCoords =
        genPoints.length >= 2
          ? createBroadCrestedWeirFootprint(genPoints[0], genPoints[1], crestW)
          : expandPolylineToSolidPolygon(genPoints, crestW);
    } else if (updated.type === 'bridge-pier') {
      finalCoords = createSolidPierFootprint(
        center,
        updated.lengthM ?? 6.0,
        updated.widthM ?? 2.2,
        updated.shape || 'round-nose',
        updated.rotationDeg ?? 0
      );
    } else if (updated.type === 'spurdike') {
      const crestW = updated.crestWidthM ?? updated.wallThicknessM ?? 3.5;
      finalCoords =
        genPoints.length >= 2
          ? createSolidGroyneFootprint(genPoints[0], genPoints[1], crestW)
          : expandPolylineToSolidPolygon(genPoints, crestW);
    } else if (updated.type === 'custom-deflector' || updated.type === 'line' || updated.type === 'polyline') {
      finalCoords = expandPolylineToSolidPolygon(genPoints, updated.wallThicknessM ?? 2.5);
    } else if (updated.type === 'rectangle') {
      finalCoords = createRotatedRectanglePoints(
        center,
        updated.lengthM ?? 20.0,
        updated.topWidthM ?? updated.wallThicknessM ?? 8.0,
        updated.rotationDeg ?? 0
      );
    } else if (updated.type === 'circle') {
      finalCoords = createCirclePoints(center, updated.radiusM ?? 6.0, 24);
    } else if (updated.type === 'polygon' || updated.type === 'obstacle') {
      finalCoords = genPoints.length >= 3 ? genPoints : baseCoords;
    } else {
      finalCoords = expandPolylineToSolidPolygon(genPoints, updated.wallThicknessM ?? 3.0);
    }

    const res = findCellsInsidePolygon(finalCoords, mesh);
    updated.coordinates = finalCoords;
    updated.generatorPoints = genPoints;
    updated.cellIndices = res.cellIndices.length > 0 ? res.cellIndices : updated.cellIndices;
    if ('stationM' in updates) {
      updated.stationM = updates.stationM;
    } else if (res.stationM > 0) {
      updated.stationM = res.stationM;
    }
  }

  return updated as RiverHydraulicStructure;
}

/**
 * Finds all CFD cells within or intersecting an arbitrary polygon
 */
export function findCellsInsidePolygon(
  polygon: RiverCoordinate[],
  mesh: RiverGridMesh
): { cellIndices: number[]; stationM: number; avgBedElevM: number } {
  if (polygon.length < 3) {
    return findCellsIntersectingPolyline(polygon, mesh);
  }

  const affected = new Set<number>();
  let bedElevSum = 0;
  let stationSum = 0;

  for (let c = 0; c < mesh.cells.length; c++) {
    const cell = mesh.cells[c];
    const cellCenter = { lat: cell.centerLat, lng: cell.centerLng };

    // 1. Is cell centroid inside polygon?
    let inside = isPointInPolygon(cellCenter, polygon);

    // 2. Are any cell corners inside polygon?
    if (!inside && cell.corners) {
      for (const [cornerLat, cornerLng] of cell.corners) {
        if (isPointInPolygon({ lat: cornerLat, lng: cornerLng }, polygon)) {
          inside = true;
          break;
        }
      }
    }

    // 3. Are any polygon vertices inside the cell?
    if (!inside && cell.corners && cell.corners.length >= 3) {
      const cellPolygon = cell.corners.map(([cLat, cLng]) => ({ lat: cLat, lng: cLng }));
      for (const p of polygon) {
        if (isPointInPolygon(p, cellPolygon)) {
          inside = true;
          break;
        }
      }
    }

    // 4. Does polygon boundary pass through the cell?
    if (!inside) {
      const charRadius = Math.max(3.0, Math.sqrt(cell.areaM2) * 0.70);
      const polyDist = pointToPolylineDistance(cellCenter, polygon);
      if (polyDist.distanceM <= charRadius) {
        inside = true;
      }
    }

    if (inside) {
      affected.add(c);
      bedElevSum += cell.bedElevation;
      stationSum += (cell.i / Math.max(1, mesh.nx)) * mesh.reachLengthM;
    }
  }

  // Fallback: If structure is smaller than coarse mesh cells,
  // find the closest cell to polygon centroid so it is never dropped from CFD
  if (affected.size === 0 && polygon.length > 0) {
    const avgLat = polygon.reduce((s, p) => s + p.lat, 0) / polygon.length;
    const avgLng = polygon.reduce((s, p) => s + p.lng, 0) / polygon.length;
    let closestIdx = 0;
    let minD = Infinity;
    for (let c = 0; c < mesh.cells.length; c++) {
      const cell = mesh.cells[c];
      const dy = (cell.centerLat - avgLat) * 111320.0;
      const dx = (cell.centerLng - avgLng) * 111320.0 * Math.cos((avgLat * Math.PI) / 180.0);
      const d = Math.hypot(dx, dy);
      if (d < minD) {
        minD = d;
        closestIdx = c;
      }
    }
    const maxAllowedD = Math.max(80.0, Math.sqrt(mesh.cells[closestIdx]?.areaM2 || 100.0) * 2.5);
    if (minD <= maxAllowedD) {
      affected.add(closestIdx);
      bedElevSum = mesh.cells[closestIdx].bedElevation;
      stationSum = (mesh.cells[closestIdx].i / Math.max(1, mesh.nx)) * mesh.reachLengthM;
    }
  }

  const cellIndices = Array.from(affected);
  const count = Math.max(1, cellIndices.length);

  return {
    cellIndices,
    stationM: count > 0 ? stationSum / count : 0,
    avgBedElevM: count > 0 ? bedElevSum / count : 100.0,
  };
}

/**
 * Convenience helper to return an array of cell indices inside a closed polygon
 */
export function queryCellsInPolygon(coords: RiverCoordinate[], mesh: RiverGridMesh): number[] {
  return findCellsInsidePolygon(coords, mesh).cellIndices;
}

/**
 * Finds all CFD cells within a circle of radiusM centered at center
 */
export function findCellsInsideCircle(
  center: RiverCoordinate,
  radiusM: number,
  mesh: RiverGridMesh
): { cellIndices: number[]; stationM: number; avgBedElevM: number } {
  const affected = new Set<number>();
  let bedElevSum = 0;
  let stationSum = 0;

  for (let c = 0; c < mesh.cells.length; c++) {
    const cell = mesh.cells[c];
    const cellCenter = { lat: cell.centerLat, lng: cell.centerLng };
    const charRadius = Math.sqrt(cell.areaM2) * 0.45;
    const { distFromCenterM } = pointToCircleDistance(cellCenter, center, radiusM);

    if (distFromCenterM <= radiusM + charRadius) {
      affected.add(c);
      bedElevSum += cell.bedElevation;
      stationSum += (cell.i / Math.max(1, mesh.nx)) * mesh.reachLengthM;
    }
  }

  // Fallback: at least include nearest cell if within reasonable proximity
  if (affected.size === 0 && mesh.cells.length > 0) {
    let nearestIdx = 0;
    let minD = Infinity;
    for (let c = 0; c < mesh.cells.length; c++) {
      const cell = mesh.cells[c];
      const { distFromCenterM } = pointToCircleDistance(
        { lat: cell.centerLat, lng: cell.centerLng },
        center,
        radiusM
      );
      if (distFromCenterM < minD) {
        minD = distFromCenterM;
        nearestIdx = c;
      }
    }
    const maxAllowedD = radiusM + Math.max(80.0, Math.sqrt(mesh.cells[nearestIdx]?.areaM2 || 100.0) * 2.5);
    if (minD <= maxAllowedD) {
      affected.add(nearestIdx);
      bedElevSum = mesh.cells[nearestIdx].bedElevation;
      stationSum = (mesh.cells[nearestIdx].i / Math.max(1, mesh.nx)) * mesh.reachLengthM;
    }
  }

  const cellIndices = Array.from(affected);
  const count = Math.max(1, cellIndices.length);

  return {
    cellIndices,
    stationM: count > 0 ? stationSum / count : 0,
    avgBedElevM: count > 0 ? bedElevSum / count : 100.0,
  };
}

/**
 * Finds all CFD cells along a line or polyline within a specific buffer thickness
 */
export function findCellsAlongLine(
  points: RiverCoordinate[],
  thicknessM: number,
  mesh: RiverGridMesh
): { cellIndices: number[]; stationM: number; avgBedElevM: number } {
  const affected = new Set<number>();
  let bedElevSum = 0;
  let stationSum = 0;
  const thresholdDistM = Math.max(thicknessM * 0.5, 2.0);

  for (let c = 0; c < mesh.cells.length; c++) {
    const cell = mesh.cells[c];
    const cellCenter = { lat: cell.centerLat, lng: cell.centerLng };
    const charRadius = Math.sqrt(cell.areaM2) * 0.4;
    const { distanceM } = pointToPolylineDistance(cellCenter, points);

    if (distanceM <= thresholdDistM + charRadius) {
      affected.add(c);
      bedElevSum += cell.bedElevation;
      stationSum += (cell.i / Math.max(1, mesh.nx)) * mesh.reachLengthM;
    }
  }

  if (affected.size === 0) {
    return findCellsIntersectingPolyline(points, mesh);
  }

  const cellIndices = Array.from(affected);
  const count = Math.max(1, cellIndices.length);

  return {
    cellIndices,
    stationM: stationSum / count,
    avgBedElevM: bedElevSum / count,
  };
}

/**
 * Finds cells closest to or intersected by an arbitrary polyline / point set
 */
export function findCellsIntersectingPolyline(
  points: RiverCoordinate[],
  mesh: RiverGridMesh
): { cellIndices: number[]; stationM: number; avgBedElevM: number } {
  if (points.length === 0) {
    return { cellIndices: [], stationM: 0, avgBedElevM: 100.0 };
  }

  const affected = new Set<number>();
  let bedElevSum = 0;
  let stationSum = 0;

  // For each segment in the polyline (or single point)
  const segments = points.length === 1 ? [[points[0], points[0]]] : [];
  for (let p = 0; p < points.length - 1; p++) {
    segments.push([points[p], points[p + 1]]);
  }

  for (const [pA, pB] of segments) {
    // Sample 5 interpolation points along the segment
    const numSub = points.length === 1 ? 1 : 5;
    for (let s = 0; s <= numSub; s++) {
      const t = numSub === 1 ? 0 : s / numSub;
      const subLat = pA.lat + t * (pB.lat - pA.lat);
      const subLng = pA.lng + t * (pB.lng - pA.lng);

      // Find closest mesh cell to this sub-point
      let closestIdx = -1;
      let minDistM = Infinity;

      for (let c = 0; c < mesh.cells.length; c++) {
        const cell = mesh.cells[c];
        const dy = (cell.centerLat - subLat) * 111320.0;
        const dx = (cell.centerLng - subLng) * 111320.0 * Math.cos((subLat * Math.PI) / 180.0);
        const d = Math.hypot(dx, dy);
        if (d < minDistM) {
          minDistM = d;
          closestIdx = c;
        }
      }

      if (closestIdx >= 0 && minDistM < Math.max(40.0, mesh.meanWidthM * 0.4)) {
        affected.add(closestIdx);
      }
    }
  }

  const cellIndices = Array.from(affected);
  for (const idx of cellIndices) {
    const cell = mesh.cells[idx];
    bedElevSum += cell.bedElevation;
    stationSum += (cell.i / Math.max(1, mesh.nx)) * mesh.reachLengthM;
  }

  const count = Math.max(1, cellIndices.length);
  return {
    cellIndices,
    stationM: stationSum / count,
    avgBedElevM: bedElevSum / count,
  };
}

/**
 * Find cells in the 2D grid that intersect or are spanned across the full channel transect
 */
export function findCellsIntersectingTransect(
  pt1: RiverCoordinate,
  pt2: RiverCoordinate,
  mesh: RiverGridMesh
): { cellIndices: number[]; stationM: number; avgBedElevM: number } {
  const midLat = 0.5 * (pt1.lat + pt2.lat);
  const midLng = 0.5 * (pt1.lng + pt2.lng);

  // 1. Find the closest cell to the midpoint to determine streamwise station i
  let closestCellIdx = 0;
  let minDist = Infinity;

  for (let c = 0; c < mesh.cells.length; c++) {
    const cell = mesh.cells[c];
    const dy = (cell.centerLat - midLat) * 111320.0;
    const dx = (cell.centerLng - midLng) * 111320.0 * Math.cos((midLat * Math.PI) / 180.0);
    const d = Math.hypot(dx, dy);
    if (d < minDist) {
      minDist = d;
      closestCellIdx = c;
    }
  }

  const centerCell = mesh.cells[closestCellIdx];
  const iStation = centerCell ? centerCell.i : Math.floor(mesh.nx / 2);
  const approxStationM = (iStation / Math.max(1, mesh.nx)) * mesh.reachLengthM;

  // 2. Collect all cells across the channel at this streamwise section
  const affectedIndices: number[] = [];
  let bedElevSum = 0;

  for (let j = 0; j < mesh.ny; j++) {
    const idx = iStation * mesh.ny + j;
    if (idx < mesh.cells.length) {
      affectedIndices.push(idx);
      bedElevSum += mesh.cells[idx].bedElevation;
    }
  }

  const avgBedElevM = affectedIndices.length > 0 ? bedElevSum / affectedIndices.length : 100.0;

  return {
    cellIndices: affectedIndices,
    stationM: approxStationM,
    avgBedElevM,
  };
}

/**
 * Universal CAD Structure Creator supporting arbitrary polylines & all 9 structure types
 */
export function createStructureFromMapPolyline(
  points: RiverCoordinate[],
  type: RiverStructureType,
  mesh: RiverGridMesh,
  options: any = {}
): RiverHydraulicStructure {
  const isFullCrossChannel =
    points.length === 2 &&
    (type === 'weir' ||
      type === 'bridge' ||
      type === 'culvert' ||
      type === 'levee' ||
      type === 'embankment' ||
      type === 'gate');

  let cellIndices: number[] = [];
  let stationM: number = 0;
  let avgBedElevM: number = 100.0;
  let finalCoords: RiverCoordinate[] = [...points];

  if (type === 'polygon' || type === 'obstacle') {
    const res = findCellsInsidePolygon(points, mesh);
    cellIndices = res.cellIndices;
    stationM = res.stationM;
    avgBedElevM = res.avgBedElevM;
  } else if (type === 'circle') {
    const center = points[0] || { lat: mesh.centerline[0].lat, lng: mesh.centerline[0].lng };
    let radiusM = options.radiusM ?? 8.0;
    if (points.length >= 2) {
      const { distFromCenterM } = pointToCircleDistance(points[1], center, 0);
      radiusM = Math.max(1.0, distFromCenterM);
    }
    const res = findCellsInsideCircle(center, radiusM, mesh);
    cellIndices = res.cellIndices;
    stationM = res.stationM;
    avgBedElevM = res.avgBedElevM;
    finalCoords = createCirclePoints(center, radiusM, 24);
  } else if (type === 'rectangle') {
    if (points.length >= 4) {
      const res = findCellsInsidePolygon(points, mesh);
      cellIndices = res.cellIndices;
      stationM = res.stationM;
      avgBedElevM = res.avgBedElevM;
      finalCoords = points;
    } else if (points.length === 3) {
      const p1 = points[0];
      const p2 = points[1];
      const p3 = points[2];
      const cosLat = Math.cos((0.5 * (p1.lat + p2.lat) * Math.PI) / 180.0);
      const dx = (p2.lng - p1.lng) * METERS_PER_DEG_LAT * cosLat;
      const dy = (p2.lat - p1.lat) * METERS_PER_DEG_LAT;
      const baseLen = Math.max(1e-4, Math.hypot(dx, dy));
      const ux = dx / baseLen;
      const uy = dy / baseLen;
      const nx = -uy;
      const ny = ux;
      const v3x = (p3.lng - p2.lng) * METERS_PER_DEG_LAT * cosLat;
      const v3y = (p3.lat - p2.lat) * METERS_PER_DEG_LAT;
      const widthM = v3x * nx + v3y * ny;

      const offLat = (widthM * ny) / METERS_PER_DEG_LAT;
      const offLng = (widthM * nx) / (METERS_PER_DEG_LAT * cosLat);

      finalCoords = [
        p1,
        p2,
        { lat: p2.lat + offLat, lng: p2.lng + offLng },
        { lat: p1.lat + offLat, lng: p1.lng + offLng },
      ];
      const res = findCellsInsidePolygon(finalCoords, mesh);
      cellIndices = res.cellIndices;
      stationM = res.stationM;
      avgBedElevM = res.avgBedElevM;
    } else {
      const p1 = points[0] || { lat: mesh.centerline[0].lat, lng: mesh.centerline[0].lng };
      const p2 = points[1] || p1;
      const cosLat = Math.cos((p1.lat * Math.PI) / 180.0);
      const dx = (p2.lng - p1.lng) * METERS_PER_DEG_LAT * cosLat;
      const dy = (p2.lat - p1.lat) * METERS_PER_DEG_LAT;
      const dist = Math.hypot(dx, dy);
      const center =
        points.length >= 2
          ? { lat: 0.5 * (p1.lat + p2.lat), lng: 0.5 * (p1.lng + p2.lng) }
          : p1;
      const lengthM = options.lengthM ?? (dist > 1.0 ? dist : 20.0);
      const widthM = options.widthM ?? Math.max(5.0, lengthM * 0.4);
      const rotationDeg =
        options.rotationDeg ??
        (dist > 1.0 ? (Math.atan2(dy, dx) * 180.0) / Math.PI : 0.0);
      finalCoords = createRotatedRectanglePoints(center, lengthM, widthM, rotationDeg);
      const res = findCellsInsidePolygon(finalCoords, mesh);
      cellIndices = res.cellIndices;
      stationM = res.stationM;
      avgBedElevM = res.avgBedElevM;
    }
  } else if (type === 'line' || type === 'polyline') {
    const wallThick = options.wallThicknessM ?? 2.5;
    finalCoords = expandPolylineToSolidPolygon(points, wallThick);
    const res = findCellsInsidePolygon(finalCoords, mesh);
    cellIndices = res.cellIndices;
    stationM = res.stationM;
    avgBedElevM = res.avgBedElevM;
  } else if (isFullCrossChannel) {
    const res = findCellsIntersectingTransect(points[0], points[1], mesh);
    cellIndices = res.cellIndices;
    stationM = res.stationM;
    avgBedElevM = res.avgBedElevM;
  } else {
    const res = findCellsIntersectingPolyline(points, mesh);
    cellIndices = res.cellIndices;
    stationM = res.stationM;
    avgBedElevM = res.avgBedElevM;
  }

  const fallbackIndices = cellIndices.length > 0 ? cellIndices : [Math.floor(mesh.cells.length / 2)];
  const id = `${type}-${Date.now()}`;

  switch (type) {
    case 'line':
    case 'polyline': {
      const lineStruct: RiverLineStructure = {
        id,
        name: `Solid Civil Floodwall (Station ${stationM.toFixed(0)}m)`,
        type,
        enabled: true,
        coordinates: finalCoords,
        generatorPoints: [...points],
        cellIndices: fallbackIndices,
        stationM,
        crestElevationM: options.crestElevationM ?? parseFloat((avgBedElevM + 3.0).toFixed(2)),
        wallThicknessM: options.wallThicknessM ?? 2.5,
        permeability: options.permeability ?? 0.0,
        dragCoefficientCd: options.dragCoefficientCd ?? 1.2,
        deflectionAngleDeg: options.deflectionAngleDeg ?? 0.0,
        solidMasking: options.solidMasking ?? options.isSolid ?? true,
        cadProperties: { layerName: 'CIVIL_DEFENSE', color: options.color || '#38bdf8' },
      };
      return lineStruct;
    }

    case 'rectangle':
    case 'polygon': {
      const polyStruct: RiverPolygonStructure = {
        id,
        name: `Solid ${type === 'rectangle' ? 'Rectangular Block' : 'Civil Polygon'} (Station ${stationM.toFixed(0)}m)`,
        type,
        enabled: true,
        coordinates: finalCoords,
        generatorPoints: [...points],
        cellIndices: fallbackIndices,
        stationM,
        crestElevationM: options.crestElevationM ?? parseFloat((avgBedElevM + 3.5).toFixed(2)),
        topWidthM: options.topWidthM ?? options.widthM ?? 10.0,
        wallThicknessM: options.wallThicknessM ?? 2.0,
        isClosedSolid: options.isClosedSolid ?? options.isSolid ?? true,
        solidMasking: options.solidMasking ?? options.isSolid ?? true,
        rotationDeg: options.rotationDeg ?? 0.0,
        dragCoefficientCd: options.dragCoefficientCd ?? 1.4,
        permeability: options.permeability ?? 0.0,
        cadProperties: { layerName: 'SOLID_STRUCTURES', color: options.color || '#f59e0b' },
      };
      return polyStruct;
    }

    case 'obstacle': {
      const obstacle: RiverPolygonStructure = {
        id,
        name: `Solid Civil Obstacle (Station ${stationM.toFixed(0)}m)`,
        type: 'obstacle',
        enabled: true,
        coordinates: finalCoords,
        generatorPoints: [...points],
        cellIndices: fallbackIndices,
        stationM,
        crestElevationM: options.crestElevationM ?? parseFloat((avgBedElevM + 5.0).toFixed(2)),
        isClosedSolid: true,
        solidMasking: options.solidMasking ?? options.isSolid ?? true,
        dragCoefficientCd: options.dragCoefficientCd ?? 2.0,
        permeability: options.permeability ?? 0.0,
        cadProperties: { layerName: 'CAD_OBSTACLES', color: options.color || '#ef4444' },
      };
      return obstacle;
    }

    case 'circle': {
      const center = points[0] || { lat: mesh.centerline[0].lat, lng: mesh.centerline[0].lng };
      let radiusM = options.radiusM ?? 8.0;
      if (points.length >= 2) {
        const { distFromCenterM } = pointToCircleDistance(points[1], center, 0);
        radiusM = Math.max(1.0, distFromCenterM);
      }
      const circle: RiverCircleStructure = {
        id,
        name: `CAD Circle Island / Pier (Station ${stationM.toFixed(0)}m, R=${radiusM.toFixed(1)}m)`,
        type: 'circle',
        enabled: true,
        coordinates: finalCoords,
        generatorPoints: [center],
        cellIndices: fallbackIndices,
        stationM,
        center,
        radiusM,
        topElevationM: options.topElevationM ?? parseFloat((avgBedElevM + 4.0).toFixed(2)),
        crestElevationM: options.crestElevationM ?? parseFloat((avgBedElevM + 4.0).toFixed(2)),
        dragCoefficientCd: options.dragCoefficientCd ?? 1.1,
        solidMasking: options.solidMasking ?? true,
        permeability: options.permeability ?? 0.0,
        cadProperties: { layerName: 'CAD_CIRCLES', color: options.color || '#ec4899' },
      };
      return circle;
    }

    case 'spurdike': {
      const p1 = points[0] || mesh.centerline[0];
      const p2 = points[1] || p1;
      const crestWidthM = options.crestWidthM ?? options.wallThicknessM ?? 3.5;
      const groyneFootprint = createSolidGroyneFootprint(p1, p2, crestWidthM);
      const solidRes = findCellsInsidePolygon(groyneFootprint, mesh);
      const cellInds = solidRes.cellIndices.length > 0 ? solidRes.cellIndices : fallbackIndices;
      const spurdike: RiverSpurdikeStructure = {
        id,
        name: `Solid Spur Dike / Groyne (${options.bank || 'Left'} Bank, Station ${stationM.toFixed(0)}m)`,
        type: 'spurdike',
        enabled: true,
        coordinates: groyneFootprint,
        generatorPoints: [p1, p2],
        cellIndices: cellInds,
        stationM: solidRes.stationM || stationM,
        crestElevationM: options.crestElevationM ?? parseFloat((avgBedElevM + 2.8).toFixed(2)),
        lengthM: options.lengthM ?? 30.0,
        crestWidthM,
        wallThicknessM: crestWidthM,
        permeability: options.permeability ?? 0.0,
        deflectionAngleDeg: options.deflectionAngleDeg ?? 90.0,
        bank: options.bank ?? 'left',
        headSlopeHtoV: options.sideSlopeHtoV ?? 2.0,
        headScourDepthM: 1.85,
        solidMasking: options.solidMasking ?? (options.permeability === undefined || options.permeability < 0.2),
        cadProperties: { layerName: 'RIVER_TRAINING', color: '#10b981' },
      };
      return spurdike;
    }

    case 'bridge-pier': {
      const pierCenter = points[0] || mesh.centerline[0];
      const shape = options.shape || 'round-nose';
      const widthM = options.widthM ?? 2.2;
      const lengthM = options.lengthM ?? 6.0;
      const rotationDeg = options.rotationDeg ?? 0;
      const pierFootprint = createSolidPierFootprint(pierCenter, lengthM, widthM, shape, rotationDeg);
      const solidRes = findCellsInsidePolygon(pierFootprint, mesh);
      const cellInds = solidRes.cellIndices.length > 0 ? solidRes.cellIndices : fallbackIndices;
      const pier: RiverBridgePierStructure = {
        id,
        name: `Solid Bridge Pier (${shape}, Station ${stationM.toFixed(0)}m)`,
        type: 'bridge-pier',
        enabled: true,
        coordinates: pierFootprint,
        generatorPoints: [pierCenter],
        cellIndices: cellInds,
        stationM: solidRes.stationM || stationM,
        shape,
        widthM,
        lengthM,
        topElevationM: options.topElevationM ?? options.crestElevationM ?? parseFloat((avgBedElevM + 7.5).toFixed(2)),
        crestElevationM: options.crestElevationM ?? parseFloat((avgBedElevM + 7.5).toFixed(2)),
        dragCoefficientCd: options.dragCoefficientCd ?? (shape === 'sharp-nose' ? 0.75 : shape === 'square' ? 2.0 : shape === 'circular' ? 1.2 : 0.95),
        scourDepthM: 2.1,
        solidMasking: options.solidMasking ?? true,
        rotationDeg,
        permeability: options.permeability ?? 0.0,
        cadProperties: { layerName: 'BRIDGE_SUBSTRUCTURE', color: '#8b5cf6' },
      };
      return pier;
    }

    case 'custom-deflector': {
      const wallThicknessM = options.wallThicknessM ?? 2.0;
      const deflectorFootprint = expandPolylineToSolidPolygon(points, wallThicknessM);
      const solidRes = findCellsInsidePolygon(deflectorFootprint, mesh);
      const cellInds = solidRes.cellIndices.length > 0 ? solidRes.cellIndices : fallbackIndices;
      const deflector: RiverCustomDeflectorStructure = {
        id,
        name: `Solid Guide Bank Deflector (Station ${stationM.toFixed(0)}m)`,
        type: 'custom-deflector',
        enabled: true,
        coordinates: deflectorFootprint,
        generatorPoints: [...points],
        cellIndices: cellInds,
        stationM: solidRes.stationM || stationM,
        heightM: options.heightM ?? 3.5,
        wallThicknessM,
        crestElevationM: options.crestElevationM ?? parseFloat((avgBedElevM + 3.5).toFixed(2)),
        deflectionEfficiency: options.deflectionEfficiency ?? 0.85,
        dragCoeff: options.dragCoeff ?? 1.2,
        solidMasking: options.solidMasking ?? true,
        permeability: options.permeability ?? 0.0,
        cadProperties: { layerName: 'GUIDE_BANKS', color: '#06b6d4' },
      };
      return deflector;
    }

    case 'levee': {
      const topWidthM = options.topWidthM ?? options.wallThicknessM ?? 4.5;
      const sideSlopeHtoV = options.sideSlopeHtoV ?? 2.5;
      const crestElevationM = options.crestElevationM ?? parseFloat((avgBedElevM + 3.8).toFixed(2));
      const leveeFootprint = createSolidLeveeFootprint(points, topWidthM, sideSlopeHtoV, Math.max(1.0, crestElevationM - avgBedElevM));
      const solidRes = findCellsInsidePolygon(leveeFootprint, mesh);
      const cellInds = fallbackIndices.length === mesh.ny ? fallbackIndices : (solidRes.cellIndices.length > 0 ? solidRes.cellIndices : fallbackIndices);
      const levee: RiverLeveeStructure = {
        id,
        name: `Solid Levee / Floodwall (Station ${stationM.toFixed(0)}m)`,
        type: 'levee',
        enabled: true,
        coordinates: leveeFootprint,
        generatorPoints: [...points],
        cellIndices: cellInds,
        stationM: solidRes.stationM || stationM,
        crestElevationM,
        topWidthM,
        wallThicknessM: topWidthM,
        sideSlopeHtoV,
        solidMasking: options.solidMasking ?? true,
        permeability: options.permeability ?? 0.0,
        cadProperties: { layerName: 'CIVIL_DEFENSE', color: '#f59e0b' },
      };
      return levee;
    }

    case 'weir': {
      const p1 = points[0] || mesh.centerline[0];
      const p2 = points[1] || p1;
      const crestWidthM = options.crestWidthM ?? options.wallThicknessM ?? 6.0;
      const crestElevationM = options.crestElevationM ?? parseFloat((avgBedElevM + 2.2).toFixed(2));
      const weirFootprint = createBroadCrestedWeirFootprint(p1, p2, crestWidthM);
      const solidRes = findCellsInsidePolygon(weirFootprint, mesh);
      const cellInds = fallbackIndices.length === mesh.ny ? fallbackIndices : (solidRes.cellIndices.length > 0 ? solidRes.cellIndices : fallbackIndices);
      const weir: RiverWeirStructure = {
        id,
        name: `Solid Broad-Crested Weir (Station ${stationM.toFixed(0)}m)`,
        type: 'weir',
        enabled: true,
        coordinates: weirFootprint,
        generatorPoints: [p1, p2],
        cellIndices: cellInds,
        stationM: solidRes.stationM || stationM,
        weirType: options.weirType || 'broad-crested',
        crestElevationM,
        crestLengthM: mesh.meanWidthM,
        crestWidthM,
        wallThicknessM: crestWidthM,
        dischargeCoefficient: options.dischargeCoefficient ?? 1.70,
        solidMasking: options.solidMasking ?? true,
        permeability: options.permeability ?? 0.0,
        cadProperties: { layerName: 'FLOW_REGULATION', color: '#06b6d4' },
      };
      return weir;
    }

    case 'bridge': {
      const deckWidthM = options.deckWidthM ?? options.wallThicknessM ?? 12.0;
      const bridgeFootprint = expandPolylineToSolidPolygon(points, deckWidthM);
      const solidRes = findCellsInsidePolygon(bridgeFootprint, mesh);
      const cellInds = solidRes.cellIndices.length > 0 ? solidRes.cellIndices : fallbackIndices;
      const bridge: RiverBridgeStructure = {
        id,
        name: `CAD Multi-Span Bridge (Station ${stationM.toFixed(0)}m)`,
        type: 'bridge',
        enabled: true,
        coordinates: bridgeFootprint,
        generatorPoints: [...points],
        cellIndices: cellInds,
        stationM: solidRes.stationM || stationM,
        deckElevationM: options.deckElevationM ?? parseFloat((avgBedElevM + 6.5).toFixed(2)),
        lowChordElevationM: options.lowChordElevationM ?? parseFloat((avgBedElevM + 4.8).toFixed(2)),
        pierCount: options.pierCount ?? 3,
        pierWidthM: options.pierWidthM ?? 1.6,
        pierDragCoeff: options.pierDragCoeff ?? 1.25,
        solidMasking: options.solidMasking ?? false,
        cadProperties: { layerName: 'TRANSPORT_INFRA', color: '#a855f7' },
      };
      return bridge;
    }

    case 'culvert': {
      const culvertW = (options.diameterOrSpanM ?? 2.5) * (options.barrelCount ?? 2) + 2.0;
      const culvertFootprint = expandPolylineToSolidPolygon(points, culvertW);
      const solidRes = findCellsInsidePolygon(culvertFootprint, mesh);
      const cellInds = solidRes.cellIndices.length > 0 ? solidRes.cellIndices : fallbackIndices;
      const culvert: RiverCulvertStructure = {
        id,
        name: `CAD Box Culvert (Station ${stationM.toFixed(0)}m)`,
        type: 'culvert',
        enabled: true,
        coordinates: culvertFootprint,
        generatorPoints: [...points],
        cellIndices: cellInds,
        stationM: solidRes.stationM || stationM,
        barrelCount: options.barrelCount ?? 2,
        diameterOrSpanM: options.diameterOrSpanM ?? 2.5,
        riseM: options.riseM ?? 2.5,
        lengthM: options.lengthM ?? 25.0,
        inletInvertM: avgBedElevM,
        outletInvertM: avgBedElevM - 0.2,
        manningN: 0.013,
        inletLossCoeff: 0.5,
        solidMasking: options.solidMasking ?? false,
        cadProperties: { layerName: 'DRAINAGE_INFRA', color: '#10b981' },
      };
      return culvert;
    }

    case 'gate': {
      const wallThicknessM = options.wallThicknessM ?? 3.0;
      const gateFootprint = expandPolylineToSolidPolygon(points, wallThicknessM);
      const solidRes = findCellsInsidePolygon(gateFootprint, mesh);
      const cellInds = solidRes.cellIndices.length > 0 ? solidRes.cellIndices : fallbackIndices;
      const gate: RiverGateStructure = {
        id,
        name: `Solid Control Gate (Station ${stationM.toFixed(0)}m)`,
        type: 'gate',
        enabled: true,
        coordinates: gateFootprint,
        generatorPoints: [...points],
        cellIndices: cellInds,
        stationM: solidRes.stationM || stationM,
        gateType: options.gateType || 'sluice',
        gateWidthM: options.gateWidthM ?? Math.min(25.0, mesh.meanWidthM * 0.4),
        openingM: options.openingM ?? 1.5,
        crestElevationM: options.crestElevationM ?? parseFloat((avgBedElevM + 1.0).toFixed(2)),
        dischargeCoefficient: options.dischargeCoefficient ?? 0.60,
        wallThicknessM,
        solidMasking: options.solidMasking ?? true,
        permeability: options.permeability ?? 0.0,
        cadProperties: { layerName: 'ACTIVE_CONTROL', color: '#3b82f6' },
      };
      return gate;
    }

    case 'embankment':
    default: {
      const topWidthM = options.topWidthM ?? options.wallThicknessM ?? 12.0;
      const embFootprint = createSolidLeveeFootprint(points, topWidthM, 2.0, 3.2);
      const solidRes = findCellsInsidePolygon(embFootprint, mesh);
      const cellInds = solidRes.cellIndices.length > 0 ? solidRes.cellIndices : fallbackIndices;
      const emb: RiverEmbankmentStructure = {
        id,
        name: `Solid Road Embankment (Station ${stationM.toFixed(0)}m)`,
        type: 'embankment',
        enabled: true,
        coordinates: embFootprint,
        generatorPoints: [...points],
        cellIndices: cellInds,
        stationM: solidRes.stationM || stationM,
        crestElevationM: options.crestElevationM ?? parseFloat((avgBedElevM + 3.2).toFixed(2)),
        topWidthM,
        wallThicknessM: topWidthM,
        sideSlopeHtoV: 2.0,
        overtopDischargeCoeff: 1.45,
        solidMasking: options.solidMasking ?? true,
        permeability: options.permeability ?? 0.0,
        cadProperties: { layerName: 'ROAD_NETWORK', color: '#ef4444' },
      };
      return emb;
    }
  }
}

/**
 * Dedicated helper to create an AutoCAD polygon structure
 */
export function createCadPolygonStructure(
  points: RiverCoordinate[],
  mesh: RiverGridMesh,
  options: Partial<RiverPolygonStructure> = {}
): RiverPolygonStructure {
  return createStructureFromMapPolyline(points, 'polygon', mesh, options) as RiverPolygonStructure;
}

/**
 * Dedicated helper to create an AutoCAD rotated rectangle structure
 */
export function createCadRectangleStructure(
  center: RiverCoordinate,
  lengthM: number,
  widthM: number,
  rotationDeg: number,
  mesh: RiverGridMesh,
  options: Partial<RiverPolygonStructure> = {}
): RiverPolygonStructure {
  const rectPoints = createRotatedRectanglePoints(center, lengthM, widthM, rotationDeg);
  return createStructureFromMapPolyline(rectPoints, 'rectangle', mesh, {
    ...options,
    lengthM,
    widthM,
    rotationDeg,
  }) as RiverPolygonStructure;
}

/**
 * Dedicated helper to create an AutoCAD circle structure
 */
export function createCadCircleStructure(
  center: RiverCoordinate,
  radiusM: number,
  mesh: RiverGridMesh,
  options: Partial<RiverCircleStructure> = {}
): RiverCircleStructure {
  return createStructureFromMapPolyline([center], 'circle', mesh, {
    ...options,
    radiusM,
  }) as RiverCircleStructure;
}

/**
 * Dedicated helper to create an AutoCAD line/polyline structure
 */
export function createCadLineStructure(
  points: RiverCoordinate[],
  mesh: RiverGridMesh,
  options: Partial<RiverLineStructure> = {}
): RiverLineStructure {
  const type = points.length > 2 ? 'polyline' : 'line';
  return createStructureFromMapPolyline(points, type, mesh, options) as RiverLineStructure;
}

/**
 * Dedicated helper to create an AutoCAD solid obstacle structure
 */
export function createCadObstacleStructure(
  points: RiverCoordinate[],
  mesh: RiverGridMesh,
  options: Partial<RiverPolygonStructure> = {}
): RiverPolygonStructure {
  return createStructureFromMapPolyline(points, 'obstacle', mesh, options) as RiverPolygonStructure;
}

/**
 * Backward compatibility helper for 2-point map placement
 */
export function createStructureFromMapPoints(
  pt1: RiverCoordinate,
  pt2: RiverCoordinate,
  type: RiverStructureType,
  mesh: RiverGridMesh
): RiverHydraulicStructure {
  return createStructureFromMapPolyline([pt1, pt2], type, mesh);
}

/**
 * Re-indexes a single hydraulic structure's cellIndices on a modified/translated/rotated mesh
 */
export function reindexStructureOnMesh(
  structure: RiverHydraulicStructure,
  mesh: RiverGridMesh
): RiverHydraulicStructure {
  if (structure.type === 'circle') {
    const circle = structure as any;
    const center = circle.center || structure.coordinates?.[0];
    if (center) {
      const res = findCellsInsideCircle(center, circle.radiusM || 6.0, mesh);
      return {
        ...structure,
        cellIndices: res.cellIndices,
        stationM: res.stationM > 0 ? res.stationM : structure.stationM,
      };
    }
  }

  if (structure.coordinates && structure.coordinates.length > 0) {
    const res = findCellsInsidePolygon(structure.coordinates, mesh);
    return {
      ...structure,
      cellIndices: res.cellIndices,
      stationM: res.stationM > 0 ? res.stationM : structure.stationM,
    };
  }

  return structure;
}

/**
 * Re-indexes all hydraulic structures across a moved, translated, or rotated computational mesh
 */
export function reindexStructuresOnMesh(
  structures: RiverHydraulicStructure[],
  mesh: RiverGridMesh
): RiverHydraulicStructure[] {
  return structures.map((s) => reindexStructureOnMesh(s, mesh));
}

