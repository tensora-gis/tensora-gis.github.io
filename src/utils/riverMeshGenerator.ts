/**
 * 2D River Computational Mesh Generator & Bathymetry Carver
 *
 * Constructs structured and curvilinear 2D finite-volume meshes along river reaches,
 * connects cells with face normals, and carves surveyed or synthetic channel bathymetry
 * beneath the raw Copernicus DEM water surface.
 */

import {
  RiverMesh,
  RiverMeshCell,
  RiverCenterlinePoint,
  SurveyedSoundingPoint,
  RiverCoordinate,
} from '../types/riverAnalysis';
import { haversineDistanceM } from './geoUtils';

const METERS_PER_DEGREE_LAT = 111320;

/**
 * Projects (lat, lng) to local cartesian coordinates (x, y) in meters relative to an origin.
 */
export function latLngToLocalMeters(
  lat: number,
  lng: number,
  originLat: number,
  originLng: number
): { x: number; y: number } {
  const y = (lat - originLat) * METERS_PER_DEGREE_LAT;
  const x =
    (lng - originLng) *
    METERS_PER_DEGREE_LAT *
    Math.cos((originLat * Math.PI) / 180);
  return { x, y };
}

/**
 * Converts local cartesian coordinates (x, y) back to (lat, lng) relative to an origin.
 */
export function localMetersToLatLng(
  x: number,
  y: number,
  originLat: number,
  originLng: number
): { lat: number; lng: number } {
  const lat = originLat + y / METERS_PER_DEGREE_LAT;
  const lng =
    originLng +
    x / (METERS_PER_DEGREE_LAT * Math.cos((originLat * Math.PI) / 180));
  return { lat, lng };
}

/**
 * Generates a 2D river mesh along a centerline with specified width and resolution.
 *
 * @param name Reach name
 * @param centerline Array of centerline points with coordinates and widths
 * @param nx Number of longitudinal divisions (e.g. 50 cells along 500m reach)
 * @param ny Number of lateral transverse divisions (e.g. 10 cells across channel)
 * @param baseBedElevation Starting bed elevation in m MSL
 * @param bedSlope Longitudinal bed slope (e.g. 0.0015 m/m)
 * @param defaultManning Default Manning roughness n
 */
export function generateCurvilinearRiverMesh(
  name: string,
  centerline: RiverCoordinate[],
  nx = 40,
  ny = 10,
  baseBedElevation = 100.0,
  bedSlope = 0.0012,
  defaultManning = 0.030,
  meanWidthM = 40.0
): RiverMesh {
  if (centerline.length < 2) {
    throw new Error('Centerline requires at least 2 points');
  }

  // Calculate cumulative reach distances
  const stations: RiverCenterlinePoint[] = [];
  let totalLength = 0;
  stations.push({
    lat: centerline[0].lat,
    lng: centerline[0].lng,
    stationM: 0,
    bankWidthM: meanWidthM,
    meanBedElevationM: baseBedElevation,
  });

  for (let i = 1; i < centerline.length; i++) {
    const dist = haversineDistanceM(
      centerline[i - 1].lat,
      centerline[i - 1].lng,
      centerline[i].lat,
      centerline[i].lng
    );
    totalLength += dist;
    stations.push({
      lat: centerline[i].lat,
      lng: centerline[i].lng,
      stationM: totalLength,
      bankWidthM: meanWidthM,
      meanBedElevationM: baseBedElevation - totalLength * bedSlope,
    });
  }

  const originLat = centerline[0].lat;
  const originLng = centerline[0].lng;

  // Interpolate centerline into nx+1 cross-section stations
  const crossSections: {
    center: { lat: number; lng: number; x: number; y: number };
    stationM: number;
    normal: { nx: number; ny: number };
    tangent: { tx: number; ty: number };
    widthM: number;
    baseElevation: number;
  }[] = [];

  for (let i = 0; i <= nx; i++) {
    const targetDist = (i / nx) * totalLength;
    const interpolated = interpolateCenterlineAtStation(stations, targetDist);
    const local = latLngToLocalMeters(interpolated.lat, interpolated.lng, originLat, originLng);

    // Compute tangent vector
    let tx = 1;
    let ty = 0;
    if (i < nx) {
      const nextDist = ((i + 1) / nx) * totalLength;
      const nextPt = interpolateCenterlineAtStation(stations, nextDist);
      const nextLocal = latLngToLocalMeters(nextPt.lat, nextPt.lng, originLat, originLng);
      const dx = nextLocal.x - local.x;
      const dy = nextLocal.y - local.y;
      const len = Math.max(0.001, Math.hypot(dx, dy));
      tx = dx / len;
      ty = dy / len;
    } else if (i > 0) {
      const prevSection = crossSections[i - 1];
      tx = prevSection.tangent.tx;
      ty = prevSection.tangent.ty;
    }

    // Normal vector perpendicular to flow (pointing to left bank)
    const normX = -ty;
    const normY = tx;

    crossSections.push({
      center: { ...interpolated, ...local },
      stationM: targetDist,
      normal: { nx: normX, ny: normY },
      tangent: { tx, ty },
      widthM: meanWidthM,
      baseElevation: baseBedElevation - targetDist * bedSlope,
    });
  }

  // Generate grid vertices: (nx + 1) rows x (ny + 1) columns
  const gridVertices: { lat: number; lng: number; x: number; y: number }[][] = [];

  for (let i = 0; i <= nx; i++) {
    const cs = crossSections[i];
    const rowVertices: { lat: number; lng: number; x: number; y: number }[] = [];
    const halfWidth = cs.widthM / 2;

    for (let j = 0; j <= ny; j++) {
      // Fraction across channel: -1 (right bank) to +1 (left bank)
      const lateralFrac = (j / ny) * 2 - 1;
      const lateralOffset = lateralFrac * halfWidth;

      const vx = cs.center.x + cs.normal.nx * lateralOffset;
      const vy = cs.center.y + cs.normal.ny * lateralOffset;
      const geo = localMetersToLatLng(vx, vy, originLat, originLng);

      rowVertices.push({
        lat: geo.lat,
        lng: geo.lng,
        x: vx,
        y: vy,
      });
    }
    gridVertices.push(rowVertices);
  }

  // Build finite-volume cells: nx x ny cells
  const cells: RiverMeshCell[] = [];
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  let cellId = 0;
  for (let i = 0; i < nx; i++) {
    const cs = crossSections[i];
    for (let j = 0; j < ny; j++) {
      // 4 corners of the quad cell:
      // p00: (i, j), p10: (i+1, j), p11: (i+1, j+1), p01: (i, j+1)
      const p00 = gridVertices[i][j];
      const p10 = gridVertices[i + 1][j];
      const p11 = gridVertices[i + 1][j + 1];
      const p01 = gridVertices[i][j + 1];

      const corners: [number, number][] = [
        [p00.lat, p00.lng],
        [p10.lat, p10.lng],
        [p11.lat, p11.lng],
        [p01.lat, p01.lng],
      ];

      for (const [cLat, cLng] of corners) {
        if (cLat < minLat) minLat = cLat;
        if (cLat > maxLat) maxLat = cLat;
        if (cLng < minLng) minLng = cLng;
        if (cLng > maxLng) maxLng = cLng;
      }

      // Centroid
      const centerX = (p00.x + p10.x + p11.x + p01.x) / 4;
      const centerY = (p00.y + p10.y + p11.y + p01.y) / 4;
      const centerGeo = localMetersToLatLng(centerX, centerY, originLat, originLng);

      // Area of quad via cross product of diagonals
      const dx1 = p11.x - p00.x;
      const dy1 = p11.y - p00.y;
      const dx2 = p01.x - p10.x;
      const dy2 = p01.y - p10.y;
      const area = Math.max(1, 0.5 * Math.abs(dx1 * dy2 - dy1 * dx2));

      // Parabolic bathymetry carving: deeper at center (j=ny/2), shallower at banks
      const lateralFrac = ((j + 0.5) / ny) * 2 - 1; // -1 to +1
      const channelDepth = 2.5 * (1.0 - Math.pow(lateralFrac, 2)); // 2.5m deepest in center
      const cellBedElev = Math.round((cs.baseElevation - channelDepth) * 100) / 100;

      // Faces & Exact Outward Unit Normals for Counter-Clockwise Quad:
      // Vertices: v0(p00), v1(p10), v2(p11), v3(p01)
      // Face 0: South (v0 -> v1)
      // Face 1: East/Downstream (v1 -> v2)
      // Face 2: North (v2 -> v3)
      // Face 3: West/Upstream (v3 -> v0)
      const quadVerts = [
        { x: p00.x, y: p00.y },
        { x: p10.x, y: p10.y },
        { x: p11.x, y: p11.y },
        { x: p01.x, y: p01.y },
      ];

      const faceLengths: number[] = [];
      const normals: [number, number][] = [];

      for (let f = 0; f < 4; f++) {
        const vA = quadVerts[f];
        const vB = quadVerts[(f + 1) % 4];
        const dx = vB.x - vA.x;
        const dy = vB.y - vA.y;
        const len = Math.max(0.1, Math.hypot(dx, dy));
        faceLengths.push(len);
        // Outward unit normal: (dy / len, -dx / len)
        normals.push([dy / len, -dx / len]);
      }

      // Neighbors:
      // South neighbor: (i, j-1) or -1 (Right Bank)
      const southNeighbor = j > 0 ? i * ny + (j - 1) : -1;
      // East (Downstream) neighbor: (i+1, j) or -2 (Downstream Boundary)
      const eastNeighbor = i < nx - 1 ? (i + 1) * ny + j : -2;
      // North neighbor: (i, j+1) or -3 (Left Bank)
      const northNeighbor = j < ny - 1 ? i * ny + (j + 1) : -3;
      // West (Upstream) neighbor: (i-1, j) or -4 (Upstream Inflow Boundary)
      const westNeighbor = i > 0 ? (i - 1) * ny + j : -4;

      let isBoundary: RiverMeshCell['isBoundary'] = undefined;
      if (i === 0) isBoundary = 'upstream';
      else if (i === nx - 1) isBoundary = 'downstream';
      else if (j === 0) isBoundary = 'right_bank';
      else if (j === ny - 1) isBoundary = 'left_bank';

      cells.push({
        id: cellId++,
        i,
        j,
        centerLat: centerGeo.lat,
        centerLng: centerGeo.lng,
        centerX,
        centerY,
        bedElevation: cellBedElev,
        manningN: defaultManning,
        areaM2: Math.round(area * 10) / 10,
        corners,
        neighbors: [southNeighbor, eastNeighbor, northNeighbor, westNeighbor],
        faceLengths,
        faceNormals: normals,
        isBoundary,
      });
    }
  }

  return {
    id: `mesh-${Date.now()}`,
    name,
    reachLengthM: Math.round(totalLength * 10) / 10,
    meanWidthM,
    nx,
    ny,
    cells,
    centerline: stations,
    bounds: [minLat, minLng, maxLat, maxLng],
    surveyedBathymetryApplied: false,
  };
}

/**
 * Carves surveyed soundings into the 2D river mesh bed elevations.
 */
export function applySurveyedBathymetry(
  mesh: RiverMesh,
  soundings: SurveyedSoundingPoint[]
): RiverMesh {
  if (soundings.length === 0) return mesh;

  const updatedCells = mesh.cells.map((cell) => {
    // Find nearest sounding point
    let minD = 999999;
    let nearestElev = cell.bedElevation;

    for (const s of soundings) {
      const d = haversineDistanceM(cell.centerLat, cell.centerLng, s.lat, s.lng);
      if (d < minD) {
        minD = d;
        nearestElev = s.elevationM;
      }
    }

    // Blend sounding if within reach cell radius (< 25m)
    if (minD < 25) {
      const weight = Math.max(0, 1.0 - minD / 25);
      const blended = (1 - weight) * cell.bedElevation + weight * nearestElev;
      return {
        ...cell,
        bedElevation: Math.round(blended * 100) / 100,
      };
    }

    return cell;
  });

  return {
    ...mesh,
    cells: updatedCells,
    surveyedBathymetryApplied: true,
  };
}

/**
 * Linearly interpolates a centerline coordinate at a specific station.
 */
function interpolateCenterlineAtStation(
  stations: RiverCenterlinePoint[],
  stationM: number
): { lat: number; lng: number } {
  if (stations.length === 0) return { lat: 0, lng: 0 };
  if (stationM <= stations[0].stationM) return { lat: stations[0].lat, lng: stations[0].lng };
  if (stationM >= stations[stations.length - 1].stationM) {
    const last = stations[stations.length - 1];
    return { lat: last.lat, lng: last.lng };
  }

  for (let i = 0; i < stations.length - 1; i++) {
    const s0 = stations[i];
    const s1 = stations[i + 1];
    if (stationM >= s0.stationM && stationM <= s1.stationM) {
      const frac = (stationM - s0.stationM) / Math.max(0.001, s1.stationM - s0.stationM);
      return {
        lat: s0.lat + frac * (s1.lat - s0.lat),
        lng: s0.lng + frac * (s1.lng - s0.lng),
      };
    }
  }

  return { lat: stations[0].lat, lng: stations[0].lng };
}
