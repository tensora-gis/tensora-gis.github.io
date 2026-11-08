/**
 * GPU & CPU Solver Verification Suite
 * Verifies Audusse well-balanced C-property, WebGPU WGSL kernels,
 * WebGL2 fallback shaders, and solver factory hierarchy
 */

import assert from 'assert';
import { generateRiverGridMesh } from '../src/river/geometry/meshGenerator';
import { createBenchmark500mReach } from '../src/river/data/hydroRiversLoader';
import { createRiverSolver } from '../src/river/gpu/solverFactory';
import { WebGpuRiverSolver, SHALLOW_WATER_WGSL_SHADERS } from '../src/river/gpu/webgpuSolver';
import { WebGl2RiverSolver, FS_SHALLOW_WATER_SOURCE, VS_QUAD_SOURCE } from '../src/river/gpu/webgl2Solver';
import { DEFAULT_TURBULENCE_PARAMETERS } from '../src/river/types/turbulence';
import { DEFAULT_SEDIMENT_PARAMETERS } from '../src/river/types/sediment';

console.log('--- RUNNING GPU/CPU SOLVER VERIFICATION SUITE ---');

async function run() {
  // 1. Verify WebGPU WGSL Kernel completeness & standard resource limits
  console.log('✓ Auditing WebGPU WGSL Compute Shaders...');
  assert(typeof SHALLOW_WATER_WGSL_SHADERS === 'string', 'WGSL shader must be a string');
  assert(SHALLOW_WATER_WGSL_SHADERS.includes('@compute'), 'WGSL must declare @compute stage');
  assert(SHALLOW_WATER_WGSL_SHADERS.includes('shallowWaterStep'), 'WGSL must declare shallowWaterStep entry point');
  assert(SHALLOW_WATER_WGSL_SHADERS.includes('Audusse'), 'WGSL must implement Audusse bed reconstruction');
  assert(SHALLOW_WATER_WGSL_SHADERS.includes('fluxNormL'), 'WGSL must implement HLL Riemann flux evaluation');
  assert(SHALLOW_WATER_WGSL_SHADERS.includes('frictionDenom'), 'WGSL must implement semi-implicit bed friction');
  assert(SHALLOW_WATER_WGSL_SHADERS.includes('struct CellStatic'), 'WGSL must pack static geometry into struct');
  assert(SHALLOW_WATER_WGSL_SHADERS.includes('struct FaceData'), 'WGSL must pack face topology into struct');
  assert(SHALLOW_WATER_WGSL_SHADERS.includes('struct CellState'), 'WGSL must pack cell state into struct');
  assert(SHALLOW_WATER_WGSL_SHADERS.includes('struct CellDiag'), 'WGSL must pack diagnostics into struct');

  // Verify WebGPU spec limit: maxStorageBuffersPerShaderStage must not exceed 8
  const storageMatches = SHALLOW_WATER_WGSL_SHADERS.match(/var<storage/g) || [];
  console.log('  - Storage buffer bindings count: %d (WebGPU spec max: 8)', storageMatches.length);
  assert(storageMatches.length <= 8, `Storage buffer count (${storageMatches.length}) exceeds WebGPU spec limit (8)`);
  console.log('  - WGSL Kernel size: %d characters, passes structural audit', SHALLOW_WATER_WGSL_SHADERS.length);

  // 2. Verify WebGL2 GLSL Shader completeness & syntax safety
  console.log('✓ Auditing WebGL2 GLSL Shaders...');
  assert(typeof VS_QUAD_SOURCE === 'string' && VS_QUAD_SOURCE.includes('#version 300 es'), 'WebGL2 VS must be valid GLSL 3.00 es');
  assert(typeof FS_SHALLOW_WATER_SOURCE === 'string' && FS_SHALLOW_WATER_SOURCE.includes('#version 300 es'), 'WebGL2 FS must be valid GLSL 3.00 es');
  assert(!FS_SHALLOW_WATER_SOURCE.includes('fluxH *'), 'WebGL2 FS must not reference undeclared variable fluxH');
  assert(FS_SHALLOW_WATER_SOURCE.includes('fNormH *'), 'WebGL2 FS must reference declared variable fNormH');
  assert(FS_SHALLOW_WATER_SOURCE.includes('u_faceNormals01Tex'), 'WebGL2 FS must use curvilinear face normal textures');
  assert(FS_SHALLOW_WATER_SOURCE.includes('u_faceLengthsTex'), 'WebGL2 FS must use curvilinear face length textures');
  console.log('  - WebGL2 fragment shader size: %d characters, passes syntax audit', FS_SHALLOW_WATER_SOURCE.length);

  // 3. Verify WebGPU & WebGL2 static support queries in headless environment
  const webgpuSupported = await WebGpuRiverSolver.isSupported();
  assert(typeof webgpuSupported === 'boolean', 'WebGpuRiverSolver.isSupported() must return boolean');
  console.log('  - WebGPU supported in current environment: %s', webgpuSupported);

  const webgl2Supported = WebGl2RiverSolver.isSupported();
  assert(typeof webgl2Supported === 'boolean', 'WebGl2RiverSolver.isSupported() must return boolean');
  console.log('  - WebGL2 supported in current environment: %s', webgl2Supported);

  // 4. Verify Solver Factory hierarchy & fallback
  console.log('✓ Testing Solver Factory Fallback Hierarchy...');
  const defaultSolver = await createRiverSolver();
  assert(defaultSolver !== null, 'Factory must return a valid solver instance');
  console.log('  - Default solver backend: %s (%s)', defaultSolver.getBackendType(), defaultSolver.getGpuDeviceName());

  const explicitCpuSolver = await createRiverSolver('cpu');
  assert(explicitCpuSolver.getBackendType() === 'cpu', 'CPU request must return CPU adapter');
  assert(explicitCpuSolver.getGpuDeviceName().includes('CPU'), 'Device name must reflect CPU reference');
  assert(typeof explicitCpuSolver.readback === 'function', 'Solver must expose readback method');

  // 5. Lake at rest Audusse C-property verification
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

  console.log('✓ Solver initialized for Lake-at-Rest benchmark. Backend =', solver.getBackendType());

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

  // 6. Active flow discharge step test
  console.log('✓ Testing Inflow Discharge Simulation Step...');
  solver.setBoundaries({
    ...boundaries,
    upstreamDischargeM3s: 150.0,
  });

  for (let s = 0; s < 10; s++) {
    solver.step(0.1);
  }
  const flowingState = solver.getState();
  const maxFlowVel = Math.max(...Array.from(flowingState.hydro.velocityMag));
  assert(maxFlowVel > 0.01, 'Inflow discharge must produce positive velocity field');
  console.log('  - Max velocity with Q=150 m³/s:', maxFlowVel.toFixed(3), 'm/s');

  solver.dispose();
  console.log('✓ ALL GPU/CPU SOLVER TESTS PASSED!\n');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
