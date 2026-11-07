/**
 * 2D Curvilinear Structured Quad Mesh Generator for River Reaches
 *
 * Generates an orthogonal-curvilinear finite-volume computational grid along
 * the river centerline with exact outward face normals, metric cell areas,
 * topological neighbor connectivity, and boundary condition flags.
 */

import {
  RiverCenterlinePoint,
  RiverGridCell,
  RiverGridMesh,
  RiverReachDefinition,
  CrossSectionStation,
} from '../types/riverReach';
import { sampleCrossSectionElevation } from './empiricalSection';

const METERS_PER_DEG_LAT = 111320.0;

/**
 * Convert lat/lng coordinates to local metric coordinates (meters)
 * centered at a reference origin (originLat, originLng).
 */
export function geoToLocalMeters(
  lat: number,
  lng: number,
  originLat: number,
  originLng: number
): [number, number] {
  const y = (lat - originLat) * METERS_PER_DEG_LAT;
  const rad = (originLat * Math.PI) / 180.0;
  const x = (lng - originLng) * METERS_PER_DEG_LAT * Math.cos(rad);
  return [x, y];
}

/**
 * Convert local metric coordinates (x, y in meters) back to lat/lng.
 */
export function localMetersToGeo(
  x: number,
  y: number,
  originLat: number,
  originLng: number
): [number, number] {
  const lat = originLat + y / METERS_PER_DEG_LAT;
  const rad = (originLat * Math.PI) / 180.0;
  const lng = originLng + x / (METERS_PER_DEG_LAT * Math.cos(rad));
  return [lat, lng];
}

/**
 * Resample a river centerline to uniform station spacing ds (meters)
 */
export function resampleCenterline(
  rawPoints: RiverCenterlinePoint[],
  targetSpacingM: number = 20.0
): RiverCenterlinePoint[] {
  if (rawPoints.length <= 1) return rawPoints;

  const originLat = rawPoints[0].lat;
  const originLng = rawPoints[0].lng;

  // Compute cumulative stations
  const metricPoints: { x: number; y: number; station: number; raw: RiverCenterlinePoint }[] = [];
  let currentStation = 0;

  for (let i = 0; i < rawPoints.length; i++) {
    const pt = rawPoints[i];
    const [x, y] = geoToLocalMeters(pt.lat, pt.lng, originLat, originLng);
    if (i > 0) {
      const prev = metricPoints[i - 1];
      const dist = Math.hypot(x - prev.x, y - prev.y);
      currentStation += dist;
    }
    metricPoints.push({ x, y, station: currentStation, raw: pt });
  }

  const totalLength = currentStation;
  const numSegments = Math.max(2, Math.round(totalLength / targetSpacingM));
  const actualSpacing = totalLength / numSegments;

  const resampled: RiverCenterlinePoint[] = [];

  for (let k = 0; k <= numSegments; k++) {
    const sTarget = k * actualSpacing;

    // Find bounding segment in metricPoints
    let segIdx = 0;
    while (segIdx < metricPoints.length - 2 && metricPoints[segIdx + 1].station < sTarget) {
      segIdx++;
    }

    const pA = metricPoints[segIdx];
    const pB = metricPoints[segIdx + 1] || pA;
    const segLen = Math.max(1.0e-5, pB.station - pA.station);
    const t = Math.max(0, Math.min(1, (sTarget - pA.station) / segLen));

    const interpX = pA.x + t * (pB.x - pA.x);
    const interpY = pA.y + t * (pB.y - pA.y);
    const [interpLat, interpLng] = localMetersToGeo(interpX, interpY, originLat, originLng);

    const interpBed =
      pA.raw.bedElevationM !== undefined && pB.raw.bedElevationM !== undefined
        ? pA.raw.bedElevationM + t * (pB.raw.bedElevationM - pA.raw.bedElevationM)
        : undefined;

    const interpWidth =
      pA.raw.widthM !== undefined && pB.raw.widthM !== undefined
        ? pA.raw.widthM + t * (pB.raw.widthM - pA.raw.widthM)
        : undefined;

    resampled.push({
      lat: interpLat,
      lng: interpLng,
      stationM: sTarget,
      bedElevationM: interpBed,
      widthM: interpWidth,
    });
  }

  return resampled;
}

/**
 * Generate 2D RiverGridMesh from reach definition
 */
export function generateRiverGridMesh(
  reach: RiverReachDefinition,
  options: {
    targetStreamwiseSpacingM?: number;
    transverseCellsCount?: number;
    domainWidthMultiplier?: number;
  } = {}
): RiverGridMesh {
  const targetSpacingM = options.targetStreamwiseSpacingM || 20.0;
  const ny = Math.max(3, options.transverseCellsCount || 8);
  const widthMult = options.domainWidthMultiplier || 1.3;

  // 1. Resample centerline
  const centerline = resampleCenterline(reach.centerline, targetSpacingM);
  const nx = centerline.length - 1; // Streamwise quad cells

  const originLat = centerline[0].lat;
  const originLng = centerline[0].lng;

  // 2. Generate mesh nodes (nx + 1 stations by ny + 1 lateral points)
  interface MeshNode {
    lat: number;
    lng: number;
    x: number;
    y: number;
    bedElevation: number;
  }

  const nodes: MeshNode[][] = [];

  for (let i = 0; i <= nx; i++) {
    const pt = centerline[i];
    const [cx, cy] = geoToLocalMeters(pt.lat, pt.lng, originLat, originLng);

    // Tangent vector
    let tx = 1.0;
    let ty = 0.0;

    if (i < nx) {
      const nextPt = centerline[i + 1];
      const [nxX, nxY] = geoToLocalMeters(nextPt.lat, nextPt.lng, originLat, originLng);
      tx = nxX - cx;
      ty = nxY - cy;
    } else if (i > 0) {
      const prevPt = centerline[i - 1];
      const [pxX, pxY] = geoToLocalMeters(prevPt.lat, prevPt.lng, originLat, originLng);
      tx = cx - pxX;
      ty = cy - pxY;
    }

    const tLen = Math.max(1.0e-5, Math.hypot(tx, ty));
    tx /= tLen;
    ty /= tLen;

    // Outward unit normal vector to the right
    const normX = -ty;
    const normY = tx;

    // Cross-section width at this station
    const stationWidth = (pt.widthM || reach.meanWidthM || 30.0) * widthMult;
    const halfWidth = stationWidth / 2.0;

    // Match or interpolate cross-section station
    const csStation = findClosestCrossSection(reach.crossSections, pt.stationM);
    const stationInvert = pt.bedElevationM ?? csStation?.invertElevM ?? 100.0;

    const rowNodes: MeshNode[] = [];
    for (let j = 0; j <= ny; j++) {
      // Lateral fraction from -1 (left bank) to +1 (right bank)
      const eta = -1.0 + (2.0 * j) / ny;
      const lateralDistM = eta * halfWidth;

      const nodeX = cx + lateralDistM * normX;
      const nodeY = cy + lateralDistM * normY;
      const [nodeLat, nodeLng] = localMetersToGeo(nodeX, nodeY, originLat, originLng);

      // Bed elevation calculation across section
      let nodeBed = stationInvert;
      if (csStation && csStation.points.length > 0) {
        nodeBed = sampleCrossSectionElevation(csStation.points, lateralDistM, stationInvert);
      } else {
        // Default parabolic cross-section
        const depth = Math.max(1.0, stationWidth * 0.06);
        nodeBed = stationInvert + depth * (eta * eta);
      }

      rowNodes.push({
        lat: nodeLat,
        lng: nodeLng,
        x: nodeX,
        y: nodeY,
        bedElevation: nodeBed,
      });
    }
    nodes.push(rowNodes);
  }

  // 3. Assemble finite-volume quad cells
  const cells: RiverGridCell[] = [];
  let cellIdCounter = 0;

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      // 4 corners of the quad: (i, j), (i+1, j), (i+1, j+1), (i, j+1)
      const n00 = nodes[i][j];
      const n10 = nodes[i + 1][j];
      const n11 = nodes[i + 1][j + 1];
      const n01 = nodes[i][j + 1];

      const corners: [number, number][] = [
        [n00.lat, n00.lng],
        [n10.lat, n10.lng],
        [n11.lat, n11.lng],
        [n01.lat, n01.lng],
      ];

      // Centroid
      const centerX = 0.25 * (n00.x + n10.x + n11.x + n01.x);
      const centerY = 0.25 * (n00.y + n10.y + n11.y + n01.y);
      const [centerLat, centerLng] = localMetersToGeo(centerX, centerY, originLat, originLng);

      // Average bed elevation & Manning roughness
      const avgBed = 0.25 * (n00.bedElevation + n10.bedElevation + n11.bedElevation + n01.bedElevation);
      const manningN = reach.defaultManningN || 0.035;

      // Area of quad via shoelace formula
      const areaM2 = Math.abs(
        0.5 *
          ((n00.x * n10.y - n10.x * n00.y) +
            (n10.x * n11.y - n11.x * n10.y) +
            (n11.x * n01.y - n01.x * n11.y) +
            (n01.x * n00.y - n00.x * n01.y))
      );

      // 4 Faces:
      // Face 0: n00 -> n10 (Left bank / bottom side)
      // Face 1: n10 -> n11 (Downstream side)
      // Face 2: n11 -> n01 (Right bank / top side)
      // Face 3: n01 -> n00 (Upstream side)
      const faceSegments: [MeshNode, MeshNode][] = [
        [n00, n10],
        [n10, n11],
        [n11, n01],
        [n01, n00],
      ];

      const faceLengths: number[] = [];
      const faceNormals: [number, number][] = [];

      for (const [pA, pB] of faceSegments) {
        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const len = Math.max(1.0e-5, Math.hypot(dx, dy));
        faceLengths.push(len);
        // Outward normal: (dy, -dx) / len
        faceNormals.push([dy / len, -dx / len]);
      }

      // Neighbor cell IDs:
      // Index mapping: cellId = i * ny + j
      // Face 0 (j-1): internal neighbor or -3 (left boundary)
      const nbr0 = j > 0 ? i * ny + (j - 1) : -3;
      // Face 1 (i+1): internal neighbor or -2 (downstream boundary)
      const nbr1 = i < nx - 1 ? (i + 1) * ny + j : -2;
      // Face 2 (j+1): internal neighbor or -4 (right boundary)
      const nbr2 = j < ny - 1 ? i * ny + (j + 1) : -4;
      // Face 3 (i-1): internal neighbor or -1 (upstream boundary)
      const nbr3 = i > 0 ? (i - 1) * ny + j : -1;

      let isBoundary: RiverGridCell['isBoundary'] = undefined;
      if (i === 0) isBoundary = 'upstream';
      else if (i === nx - 1) isBoundary = 'downstream';
      else if (j === 0) isBoundary = 'left_bank';
      else if (j === ny - 1) isBoundary = 'right_bank';

      cells.push({
        id: cellIdCounter++,
        i,
        j,
        centerLat,
        centerLng,
        centerX,
        centerY,
        bedElevation: avgBed,
        manningN,
        areaM2: Math.max(areaM2, 1.0),
        corners,
        neighbors: [nbr0, nbr1, nbr2, nbr3],
        faceLengths,
        faceNormals,
        isBoundary,
      });
    }
  }

  // Compute bounding box [minLat, minLng, maxLat, maxLng]
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const cell of cells) {
    for (const [cLat, cLng] of cell.corners) {
      if (cLat < minLat) minLat = cLat;
      if (cLat > maxLat) maxLat = cLat;
      if (cLng < minLng) minLng = cLng;
      if (cLng > maxLng) maxLng = cLng;
    }
  }

  return {
    id: reach.id,
    name: reach.name,
    description: reach.description,
    source: reach.source,
    reachLengthM: reach.reachLengthM,
    meanWidthM: reach.meanWidthM,
    nx,
    ny,
    cells,
    centerline,
    bounds: [minLat, minLng, maxLat, maxLng],
    surveyedBathymetryApplied: false,
  };
}

function findClosestCrossSection(
  sections: CrossSectionStation[],
  stationM: number
): CrossSectionStation | null {
  if (!sections || sections.length === 0) return null;
  let closest = sections[0];
  let minDiff = Math.abs(sections[0].stationM - stationM);

  for (let k = 1; k < sections.length; k++) {
    const diff = Math.abs(sections[k].stationM - stationM);
    if (diff < minDiff) {
      minDiff = diff;
      closest = sections[k];
    }
  }

  return closest;
}
