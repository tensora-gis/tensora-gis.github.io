/**
 * Instant Simulation Result Cache
 *
 * Implements Section 6.1 (Phase 2) of the Global River Digital Twin Plan.
 * Provides sub-100ms instant retrieval of previously computed 2D CFD results
 * keyed by sha256/string hash of reach, structures, boundary conditions, and physics params.
 */

import { HydrodynamicsState, RiverCfdSummary } from '../types/riverReach';
import { TurbulenceState, TurbulenceParameters } from '../types/turbulence';
import { SedimentState, SedimentParameters } from '../types/sediment';
import { RiverHydraulicStructure } from '../structures/structureTypes';

export interface CachedSimulationEntry {
  hashKey: string;
  timestamp: number;
  reachId: string;
  summary: RiverCfdSummary;
  hydro: HydrodynamicsState;
  turb: TurbulenceState;
  sed: SedimentState;
}

// In-Memory LRU Cache with Max 20 items to prevent heap exhaustion
const MEMORY_CACHE = new Map<string, CachedSimulationEntry>();
const MAX_CACHE_SIZE = 20;

/**
 * Compute unique deterministic hash key for simulation setup
 */
export function computeSimulationHash(
  reachId: string,
  structures: RiverHydraulicStructure[],
  upstreamDischargeM3s: number,
  manningN: number,
  turbParams: TurbulenceParameters,
  sedParams: SedimentParameters
): string {
  const activeStructs = structures
    .filter((s) => s.enabled)
    .map((s) => `${s.id}:${s.type}:${s.cellIndices.join(',')}`)
    .sort()
    .join('|');

  return [
    reachId,
    `Q:${upstreamDischargeM3s.toFixed(1)}`,
    `n:${manningN.toFixed(4)}`,
    `structs:${activeStructs}`,
    `turb:${turbParams.model}:${turbParams.eddyViscosityMax}`,
    `sed:${sedParams.enabled ? sedParams.formula : 'off'}`,
  ].join('##');
}

/**
 * Retrieve cached simulation if available
 */
export function getCachedSimulation(hashKey: string): CachedSimulationEntry | null {
  const entry = MEMORY_CACHE.get(hashKey);
  if (!entry) return null;

  // Refresh LRU position
  MEMORY_CACHE.delete(hashKey);
  MEMORY_CACHE.set(hashKey, entry);
  return entry;
}

/**
 * Store simulation result in cache
 */
export function storeCachedSimulation(
  hashKey: string,
  reachId: string,
  summary: RiverCfdSummary,
  hydro: HydrodynamicsState,
  turb: TurbulenceState,
  sed: SedimentState
): void {
  if (MEMORY_CACHE.size >= MAX_CACHE_SIZE) {
    const oldestKey = MEMORY_CACHE.keys().next().value;
    if (oldestKey) MEMORY_CACHE.delete(oldestKey);
  }

  MEMORY_CACHE.set(hashKey, {
    hashKey,
    timestamp: Date.now(),
    reachId,
    summary,
    hydro: { ...hydro },
    turb: { ...turb },
    sed: { ...sed },
  });
}

/**
 * Clear the in-memory cache
 */
export function clearSimulationCache(): void {
  MEMORY_CACHE.clear();
}
