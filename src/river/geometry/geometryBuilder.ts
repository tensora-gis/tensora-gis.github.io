/**
 * River Geometry Builder & Terrain Bathymetry Weaver
 *
 * Constructs river reach models from user-drawn centerlines and cross-sections,
 * snaps centerlines to Copernicus DEM thalwegs, and blends channel bathymetry
 * with digital elevation models.
 */

import {
  RiverCenterlinePoint,
  RiverReachDefinition,
  RiverGridMesh,
  CrossSectionStation,
  CrossSectionTemplate,
} from '../types/riverReach';
import { generateRiverGridMesh, geoToLocalMeters, localMetersToGeo } from './meshGenerator';
import { createDefaultEmpiricalStation, generateCrossSectionPoints } from './empiricalSection';
import { fetchBulkElevations } from '../../utils/elevationService';

/**
 * Build a new RiverReachDefinition from user-drawn polyline coordinates
 */
export function buildReachFromPolyline(
  id: string,
  name: string,
  coords: { lat: number; lng: number }[],
  options: {
    meanWidthM?: number;
    defaultManningN?: number;
    dischargeEstimateM3s?: number;
    initialInvertElevM?: number;
    slope?: number;
  } = {}
): RiverReachDefinition {
  if (coords.length < 2) {
    throw new Error('Centerline must have at least 2 points');
  }

  const meanWidth = options.meanWidthM || 25.0;
  const manningN = options.defaultManningN || 0.035;
  const discharge = options.dischargeEstimateM3s || 20.0;
  const slope = options.slope || 0.001; // 0.1% bed slope default
  const baseInvert = options.initialInvertElevM || 100.0;

  // Calculate stations along centerline
  let currentStation = 0;
  const centerline: RiverCenterlinePoint[] = [];

  for (let i = 0; i < coords.length; i++) {
    const pt = coords[i];
    if (i > 0) {
      const prev = coords[i - 1];
      const [x1, y1] = geoToLocalMeters(prev.lat, prev.lng, coords[0].lat, coords[0].lng);
      const [x2, y2] = geoToLocalMeters(pt.lat, pt.lng, coords[0].lat, coords[0].lng);
      currentStation += Math.hypot(x2 - x1, y2 - y1);
    }

    const bedElevation = Math.max(0, baseInvert - currentStation * slope);

    centerline.push({
      lat: pt.lat,
      lng: pt.lng,
      stationM: currentStation,
      widthM: meanWidth,
      bedElevationM: bedElevation,
    });
  }

  const reachLengthM = currentStation;

  // Create upstream, mid, and downstream cross-sections
  const crossSections: CrossSectionStation[] = [
    createDefaultEmpiricalStation(0, baseInvert, discharge, manningN),
    createDefaultEmpiricalStation(
      reachLengthM * 0.5,
      baseInvert - reachLengthM * 0.5 * slope,
      discharge,
      manningN
    ),
    createDefaultEmpiricalStation(
      reachLengthM,
      baseInvert - reachLengthM * slope,
      discharge,
      manningN
    ),
  ];

  // Bounding box
  let minLat = 90,
    maxLat = -90,
    minLng = 180,
    maxLng = -180;
  for (const c of coords) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  }

  return {
    id,
    name,
    source: 'user-drawn',
    centerline,
    crossSections,
    bounds: [minLat, minLng, maxLat, maxLng],
    reachLengthM,
    meanWidthM: meanWidth,
    defaultManningN: manningN,
    upstreamDischargeEstimateM3s: discharge,
  };
}

/**
 * Snap user-drawn centerline points to the local valley floor (thalweg)
 * by probing transverse DEM elevations along perpendicular transects.
 */
export async function snapCenterlinePointsToValley(
  centerline: RiverCenterlinePoint[],
  searchHalfWidthM: number = 60.0,
  probeSamples: number = 7
): Promise<RiverCenterlinePoint[]> {
  if (centerline.length <= 1) return centerline;

  const originLat = centerline[0].lat;
  const originLng = centerline[0].lng;

  // Gather probe points for all vertices
  const allProbePoints: { lat: number; lng: number }[] = [];
  const vertexProbeRanges: { startIdx: number; count: number; normalX: number; normalY: number; cx: number; cy: number }[] = [];

  for (let i = 0; i < centerline.length; i++) {
    const pt = centerline[i];
    const [cx, cy] = geoToLocalMeters(pt.lat, pt.lng, originLat, originLng);

    // Tangent vector
    let tx = 1.0,
      ty = 0.0;
    if (i < centerline.length - 1) {
      const [nxX, nxY] = geoToLocalMeters(centerline[i + 1].lat, centerline[i + 1].lng, originLat, originLng);
      tx = nxX - cx;
      ty = nxY - cy;
    } else if (i > 0) {
      const [pxX, pxY] = geoToLocalMeters(centerline[i - 1].lat, centerline[i - 1].lng, originLat, originLng);
      tx = cx - pxX;
      ty = cy - pxY;
    }

    const tLen = Math.max(1.0e-5, Math.hypot(tx, ty));
    const normalX = -ty / tLen;
    const normalY = tx / tLen;

    const startIdx = allProbePoints.length;
    for (let k = 0; k < probeSamples; k++) {
      const offsetFrac = -1.0 + (2.0 * k) / (probeSamples - 1);
      const probeM = offsetFrac * searchHalfWidthM;
      const px = cx + probeM * normalX;
      const py = cy + probeM * normalY;
      const [pLat, pLng] = localMetersToGeo(px, py, originLat, originLng);
      allProbePoints.push({ lat: pLat, lng: pLng });
    }

    vertexProbeRanges.push({
      startIdx,
      count: probeSamples,
      normalX,
      normalY,
      cx,
      cy,
    });
  }

  // Fetch DEM elevations
  const demResult = await fetchBulkElevations(allProbePoints);
  const elevations = demResult.elevations;

  // Find minimum elevation along each transect
  const snappedCenterline: RiverCenterlinePoint[] = [];

  for (let i = 0; i < centerline.length; i++) {
    const orig = centerline[i];
    const range = vertexProbeRanges[i];

    let minElev = Infinity;
    let bestProbeIdx = -1;

    for (let k = 0; k < range.count; k++) {
      const elev = elevations[range.startIdx + k];
      if (elev !== null && elev < minElev) {
        minElev = elev;
        bestProbeIdx = k;
      }
    }

    if (bestProbeIdx >= 0 && minElev < Infinity) {
      const bestProbePt = allProbePoints[range.startIdx + bestProbeIdx];
      snappedCenterline.push({
        lat: bestProbePt.lat,
        lng: bestProbePt.lng,
        stationM: orig.stationM,
        widthM: orig.widthM,
        bedElevationM: minElev,
      });
    } else {
      snappedCenterline.push(orig);
    }
  }

  return snappedCenterline;
}

/**
 * Apply DEM elevations and bathymetric carving onto a RiverGridMesh
 */
export async function applyTerrainAndCarveBathymetry(
  mesh: RiverGridMesh,
  options: {
    carveDepthM?: number;
    channelManningN?: number;
    floodplainManningN?: number;
  } = {}
): Promise<RiverGridMesh> {
  const carveDepth = options.carveDepthM || 2.0;
  const channelN = options.channelManningN || 0.035;
  const floodplainN = options.floodplainManningN || 0.065;

  // Sample DEM at cell centers
  const points = mesh.cells.map((c) => ({ lat: c.centerLat, lng: c.centerLng }));
  const demResult = await fetchBulkElevations(points);
  const demElevs = demResult.elevations;

  const ny = mesh.ny;

  mesh.cells.forEach((cell, idx) => {
    const demElev = demElevs[idx];
    if (demElev !== null && isFinite(demElev)) {
      // In the middle 60% of lateral cells, carve channel bathymetry
      const lateralRatio = Math.abs((cell.j - (ny - 1) / 2) / ((ny - 1) / 2));
      if (lateralRatio < 0.6) {
        // Main channel
        const carveFrac = 1.0 - lateralRatio / 0.6;
        cell.bedElevation = demElev - carveDepth * carveFrac;
        cell.manningN = channelN;
      } else {
        // Floodplain / bank
        cell.bedElevation = demElev;
        cell.manningN = floodplainN;
      }
    }
  });

  mesh.surveyedBathymetryApplied = true;
  return mesh;
}
