/**
 * Local Domain Extractor for Global River Digital Twin
 *
 * Implements Section 6 (Phase 2) of the Global River Digital Twin Plan (Draft v4.0).
 * Carves out an optimized local computational domain (reach corridor + floodplain)
 * around the target river reach and hydraulic structure site.
 *
 * Handles Tributary Confluences:
 * - Detects contributing tributary branches within the domain buffer
 * - Aggregates multi-branch upstream discharge into finite-volume boundary conditions
 * - Maps confluence entry points to bank mesh cells for realistic lateral inflows
 */

import {
  RiverReachDefinition,
  RiverGridMesh,
  RiverCoordinate,
  TributaryConfluence,
  RiverCenterlinePoint,
} from '../types/riverReach';
import { generateRiverGridMesh } from './meshGenerator';
import { applyTerrainAndCarveBathymetry } from './geometryBuilder';

export interface DomainExtractionOptions {
  reachLengthM?: number;
  bufferRadiusM?: number;
  targetCellSizeM?: number;
  maxCells?: number;
  structureLocation?: RiverCoordinate;
  carveBathymetry?: boolean;
  includeTributaries?: boolean;
}

export interface ExtractedDomainResult {
  localReach: RiverReachDefinition;
  mesh: RiverGridMesh;
  cellCount: number;
  estimatedMemoryMb: number;
  recommendedBackend: 'webgpu' | 'webgl2' | 'cpu';
  totalDischargeM3s: number;
  activeTributaries: TributaryConfluence[];
  tributaryInflows: {
    confluenceId: string;
    cellIndices: number[];
    dischargeM3s: number;
  }[];
}

/**
 * Carves out a localized domain from the global reach definition.
 * Dynamically rightsizes cell count: <= 150k for WebGPU, <= 50k for CPU.
 */
export async function extractLocalDomain(
  sourceReach: RiverReachDefinition,
  options: DomainExtractionOptions = {}
): Promise<ExtractedDomainResult> {
  const targetLen = options.reachLengthM || sourceReach.reachLengthM || 3000.0;
  const targetCellSize = options.targetCellSizeM || Math.max(10.0, Math.min(30.0, sourceReach.meanWidthM / 8.0));
  const maxCells = options.maxCells || 150000;
  const includeTributaries = options.includeTributaries !== false;

  // 1. Structure Centering (if structure location provided)
  let subCenterline = [...sourceReach.centerline];
  let startStation = 0;
  let endStation = sourceReach.reachLengthM;

  if (options.structureLocation && sourceReach.centerline.length > 2) {
    const sLoc = options.structureLocation;
    let closestStation = 0;
    let minDist = Infinity;

    for (const pt of sourceReach.centerline) {
      const dLat = (pt.lat - sLoc.lat) * 111320;
      const dLng = (pt.lng - sLoc.lng) * 111320 * Math.cos((sLoc.lat * Math.PI) / 180.0);
      const dist = Math.hypot(dLat, dLng);
      if (dist < minDist) {
        minDist = dist;
        closestStation = pt.stationM;
      }
    }

    const halfLen = targetLen * 0.5;
    startStation = Math.max(0, closestStation - halfLen);
    endStation = Math.min(sourceReach.reachLengthM, startStation + targetLen);

    // Filter or interpolate centerline points
    const clipped = sourceReach.centerline.filter(
      (p) => p.stationM >= startStation && p.stationM <= endStation
    );
    if (clipped.length >= 2) {
      subCenterline = clipped.map((p) => ({
        ...p,
        stationM: p.stationM - startStation,
      }));
    }
  }

  // 2. Calculate optimal grid dimensions (streamwise nx, transverse ny)
  let ny = Math.max(6, Math.min(24, Math.round((sourceReach.meanWidthM * 2.2) / targetCellSize)));
  let nx = Math.max(20, Math.min(500, Math.round(targetLen / targetCellSize)));

  // If cell count exceeds limit, rescale
  if (nx * ny > maxCells) {
    const scale = Math.sqrt(maxCells / (nx * ny));
    nx = Math.max(15, Math.floor(nx * scale));
    ny = Math.max(4, Math.floor(ny * scale));
  }

  const cellCount = nx * ny;
  const estimatedMemoryMb = parseFloat(((cellCount * 256) / (1024 * 1024)).toFixed(2));

  // Determine recommended backend
  let recommendedBackend: 'webgpu' | 'webgl2' | 'cpu' = 'cpu';
  if (typeof navigator !== 'undefined' && (navigator as any).gpu && cellCount > 1000) {
    recommendedBackend = 'webgpu';
  } else if (cellCount > 8000) {
    recommendedBackend = 'webgl2';
  }

  // 3. Construct local reach representation
  const localReach: RiverReachDefinition = {
    ...sourceReach,
    centerline: subCenterline,
    reachLengthM: targetLen,
  };

  // 4. Build local finite-volume computational mesh
  let localMesh = generateRiverGridMesh(localReach, targetCellSize, ny);

  // 5. Optional DEM terrain & bathymetry carving
  if (options.carveBathymetry !== false) {
    try {
      localMesh = await applyTerrainAndCarveBathymetry(localMesh, {
        carveDepthM: Math.max(1.5, Math.min(6.0, sourceReach.meanWidthM * 0.03)),
      });
    } catch (err) {
      console.warn('Terrain bathymetry sampling failed, using hydraulic geometry:', err);
    }
  }

  // 6. Confluence and Tributary Network Integration
  const activeTributaries: TributaryConfluence[] = [];
  const tributaryInflows: {
    confluenceId: string;
    cellIndices: number[];
    dischargeM3s: number;
  }[] = [];

  let totalDischargeM3s = sourceReach.upstreamDischargeEstimateM3s || 100.0;

  if (includeTributaries && sourceReach.tributaries && sourceReach.tributaries.length > 0) {
    for (const trib of sourceReach.tributaries) {
      // Check if tributary confluence is within domain window
      if (trib.confluenceStationM >= startStation && trib.confluenceStationM <= endStation) {
        activeTributaries.push(trib);
        totalDischargeM3s += trib.dischargeM3s;

        // Map station to streamwise mesh index i
        const relStationM = trib.confluenceStationM - startStation;
        const streamwiseI = Math.max(
          1,
          Math.min(nx - 2, Math.floor((relStationM / targetLen) * nx))
        );

        // Map lateral bank: left bank (j = 0) or right bank (j = ny - 1)
        const transverseJ = trib.bank === 'left' ? 0 : ny - 1;

        // Identify lateral entry cell indices
        const entryCellIndices: number[] = [];
        for (let di = -1; di <= 1; di++) {
          const targetI = streamwiseI + di;
          if (targetI >= 0 && targetI < nx) {
            const cellId = targetI * ny + transverseJ;
            if (cellId >= 0 && cellId < localMesh.cells.length) {
              entryCellIndices.push(cellId);
            }
          }
        }

        tributaryInflows.push({
          confluenceId: trib.id,
          cellIndices: entryCellIndices,
          dischargeM3s: trib.dischargeM3s,
        });
      }
    }
  }

  return {
    localReach,
    mesh: localMesh,
    cellCount,
    estimatedMemoryMb,
    recommendedBackend,
    totalDischargeM3s,
    activeTributaries,
    tributaryInflows,
  };
}
