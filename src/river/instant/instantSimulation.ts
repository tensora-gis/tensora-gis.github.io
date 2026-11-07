/**
 * Instant 2D CFD Simulation Orchestration Layer
 *
 * Implements Section 6.1 (Phase 2) of the Global River Digital Twin Plan.
 * Provides:
 * 1. Fast sub-2s preview simulation during structure interaction (with 'None' or 'Mixing Length' turbulence)
 * 2. Full engineering simulation on structure placement/release (with k-ε or k-ω SST RANS & sediment transport)
 * 3. Sub-100ms result retrieval via ResultCache
 */

import {
  RiverReachDefinition,
  RiverGridMesh,
  RiverBoundaryConditions,
  HydrodynamicsState,
  RiverCfdSummary,
} from '../types/riverReach';
import { TurbulenceParameters, TurbulenceState } from '../types/turbulence';
import { SedimentParameters, SedimentState } from '../types/sediment';
import { RiverHydraulicStructure } from '../structures/structureTypes';
import { RiverCfdEngine } from '../solver/riverCfdEngine';
import {
  computeSimulationHash,
  getCachedSimulation,
  storeCachedSimulation,
} from './resultCache';

export interface InstantSimulationRequest {
  reach: RiverReachDefinition;
  mesh: RiverGridMesh;
  boundaries: RiverBoundaryConditions;
  structures: RiverHydraulicStructure[];
  turbParams: TurbulenceParameters;
  sedParams: SedimentParameters;
  mode: 'preview' | 'full';
  onProgress?: (percent: number, simulatedSec: number) => void;
}

export interface InstantSimulationResult {
  fromCache: boolean;
  summary: RiverCfdSummary;
  hydro: HydrodynamicsState;
  turb: TurbulenceState;
  sed: SedimentState;
}

/**
 * Execute an instant 2D CFD simulation on demand
 */
export async function runInstantSimulation(
  req: InstantSimulationRequest
): Promise<InstantSimulationResult> {
  const hashKey = computeSimulationHash(
    req.reach.id,
    req.structures,
    req.boundaries.upstreamDischargeM3s,
    req.boundaries.manningRoughnessDefault,
    req.turbParams,
    req.sedParams
  );

  // 1. Check cache for instant hit
  if (req.mode === 'full') {
    const cached = getCachedSimulation(hashKey);
    if (cached) {
      return {
        fromCache: true,
        summary: cached.summary,
        hydro: cached.hydro,
        turb: cached.turb,
        sed: cached.sed,
      };
    }
  }

  // 2. Setup physics parameters according to mode
  const effectiveTurbParams: TurbulenceParameters =
    req.mode === 'preview'
      ? { ...req.turbParams, model: 'none' } // Fast preview
      : req.turbParams;

  const durationSec = req.mode === 'preview' ? 10.0 : 30.0;

  // 3. Initialize engine & run
  const engine = new RiverCfdEngine({
    mesh: req.mesh,
    boundaries: req.boundaries,
    structures: req.structures,
    turbParams: effectiveTurbParams,
    sedParams: req.sedParams,
    preferredBackend: 'cpu',
  });

  await engine.initialize();

  const summary = await engine.runBatch(durationSec, (pct, t) => {
    if (req.onProgress) {
      req.onProgress(pct, t);
    }
  });

  const finalState = engine.getState();

  // Attach accuracy tier & licensing
  summary.accuracyTier = req.reach.accuracyTier || 'Estimated (Global)';
  summary.licenseMetadata = req.reach.licenseMetadata;

  // 4. Store in cache if full run
  if (req.mode === 'full') {
    storeCachedSimulation(
      hashKey,
      req.reach.id,
      summary,
      finalState.hydro,
      finalState.turb,
      finalState.sed
    );
  }

  engine.dispose();

  return {
    fromCache: false,
    summary,
    hydro: finalState.hydro,
    turb: finalState.turb,
    sed: finalState.sed,
  };
}
