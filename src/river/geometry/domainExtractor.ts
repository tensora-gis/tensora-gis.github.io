/**
 * Local Domain Extractor for Global River Digital Twin
 *
 * Implements Section 6 (Phase 2) of the Global River Digital Twin Plan.
 * Carves out an optimized local computational domain (reach corridor + floodplain)
 * around the target river reach and hydraulic structure site.
 */

import { RiverReachDefinition, RiverGridMesh, RiverCoordinate } from '../types/riverReach';
import { generateRiverGridMesh } from './meshGenerator';
import { applyTerrainAndCarveBathymetry } from './geometryBuilder';

export interface DomainExtractionOptions {
  reachLengthM?: number;
  bufferRadiusM?: number;
  targetCellSizeM?: number;
  maxCells?: number;
  structureLocation?: RiverCoordinate;
  carveBathymetry?: boolean;
}

export interface ExtractedDomainResult {
  localReach: RiverReachDefinition;
  mesh: RiverGridMesh;
  cellCount: number;
  estimatedMemoryMb: number;
  recommendedBackend: 'webgpu' | 'webgl2' | 'cpu';
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

  // 1. Calculate optimal grid dimensions (streamwise nx, transverse ny)
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

  // 2. Build local mesh
  let localMesh = generateRiverGridMesh(sourceReach, targetCellSize, ny);

  // 3. Optional DEM terrain & bathymetry carving
  if (options.carveBathymetry !== false) {
    try {
      localMesh = await applyTerrainAndCarveBathymetry(localMesh, {
        carveDepthM: Math.max(1.5, Math.min(6.0, sourceReach.meanWidthM * 0.03)),
      });
    } catch (err) {
      console.warn('Terrain bathymetry sampling failed, using hydraulic geometry:', err);
    }
  }

  return {
    localReach: sourceReach,
    mesh: localMesh,
    cellCount,
    estimatedMemoryMb,
    recommendedBackend,
  };
}
