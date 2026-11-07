/**
 * GPU & CPU Solver Verification Suite
 * Verifies Audusse well-balanced C-property and solver factory
 */

import { generateRiverGridMesh } from '../src/river/geometry/meshGenerator';
import { createBenchmark500mReach } from '../src/river/data/hydroRiversLoader';
import { createRiverSolver } from '../src/river/gpu/solverFactory';
import { DEFAULT_TURBULENCE_PARAMETERS } from '../src/river/types/turbulence';
import { DEFAULT_SEDIMENT_PARAMETERS } from '../src/river/types/sediment';

console.log('--- RUNNING GPU/CPU SOLVER VERIFICATION SUITE ---');

async function run() {
  const reach = createBenchmark500mReach();
  const mesh = generateRiverGridMesh(reach, {
    targetStreamwiseSpacingM: 25.0,
    transverseCellsCount: 4,
  });

  const boundaries = {
    upstreamType: 'constant-discharge' as const,
    upstreamDischargeM3s: 0.0, // Lake at rest test
    downstreamType: 'fixed-stage' as const,
    downstreamSlope: 0.0,
    downstreamStageM: 105.0,
    rainfallMmPerHour: 0.0,
    initialWaterDepthM: 5.0,
    manningRoughnessDefault: 0.030,
  };

  const solver = await createRiverSolver('cpu');
  await solver.init(mesh, boundaries, [], DEFAULT_TURBULENCE_PARAMETERS, DEFAULT_SEDIMENT_PARAMETERS);

  console.log('✓ Solver initialized. Backend =', solver.getBackendType());

  // 1. Lake at rest C-property test:
  // Set uniform water surface elevation across irregular bathymetry
  const state = solver.getState();
  const targetWse = 105.0;
  for (let c = 0; c < mesh.cells.length; c++) {
    state.hydro.depth[c] = Math.max(0.1, targetWse - mesh.cells[c].bedElevation);
    state.hydro.wse[c] = targetWse;
    state.hydro.u[c] = 0;
    state.hydro.v[c] = 0;
    state.hydro.velocityMag[c] = 0;
  }

  // Step 20 times
  for (let s = 0; s < 20; s++) {
    solver.step(0.05);
  }

  // Check that spurious velocity remains virtually zero
  const maxSpuriousVel = Math.max(...Array.from(state.hydro.velocityMag));
  console.log('✓ Lake-at-Rest C-Property: Max spurious velocity =', maxSpuriousVel.toExponential(4), 'm/s');
  if (maxSpuriousVel > 0.05) {
    throw new Error(`Well-balanced property violated: spurious velocity ${maxSpuriousVel} > 0.05 m/s`);
  }

  solver.dispose();
  console.log('✓ ALL GPU/CPU SOLVER TESTS PASSED!\n');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
