/**
 * GPU & CPU Solver Verification Suite
 * Verifies Audusse well-balanced C-property, WebGPU WGSL kernels,
 * WebGL2 fallback shaders, and solver factory hierarchy
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { generateRiverGridMesh } from '../src/river/geometry/meshGenerator';
import { createBenchmark500mReach } from '../src/river/data/hydroRiversLoader';
import { createRiverSolver } from '../src/river/gpu/solverFactory';
import { WebGpuRiverSolver, SHALLOW_WATER_WGSL_SHADERS } from '../src/river/gpu/webgpuSolver';
import { WebGl2RiverSolver, FS_SHALLOW_WATER_SOURCE, VS_QUAD_SOURCE } from '../src/river/gpu/webgl2Solver';
import { DEFAULT_TURBULENCE_PARAMETERS } from '../src/river/types/turbulence';
import { DEFAULT_SEDIMENT_PARAMETERS } from '../src/river/types/sediment';
import {
  minmod,
  vanLeer,
  reconstructMusclFaceStates,
  computeCellLtsTiers,
  applyNonHydrostaticPressureCorrection,
} from '../src/river/gpu/cpuSolver';
import { applyAngleOfReposeAvalanching, createInitialSedimentState } from '../src/river/sediment/sedimentTransport';

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

  // 7. 2nd-Order MUSCL-Hancock space-time reconstruction & slope limiter
  console.log('✓ Testing 2nd-Order MUSCL-Hancock Reconstruction...');
  assert(minmod(2.0, 1.0) === 1.0, 'minmod(2, 1) must equal 1');
  assert(minmod(-2.0, -1.0) === -1.0, 'minmod(-2, -1) must equal -1');
  assert(minmod(-1.0, 1.0) === 0.0, 'minmod(-1, 1) with opposite signs must be 0');
  assert(vanLeer(2.0, 1.0) === (4.0 / 3.0), 'vanLeer limiter test');

  const musclStates = reconstructMusclFaceStates(mesh, flowingState.hydro, 0.05);
  assert(musclStates.faceHL.length === mesh.cells.length * 4, 'MUSCL faceHL must match 4 faces per cell');
  assert(musclStates.faceUL.length === mesh.cells.length * 4, 'MUSCL faceUL must match 4 faces per cell');
  console.log('  - MUSCL face states evaluated across %d cell interfaces', musclStates.faceHL.length);

  // 8. GPU Local Time-Stepping (LTS) Sub-Cycling Tier Binning (Eq. 4.3)
  console.log('✓ Testing GPU Local Time-Stepping (LTS) 2^k Tier Binning...');
  const lts = computeCellLtsTiers(mesh, flowingState.hydro, 0.5, 0.02, 3);
  assert(lts.cellTiers.length === mesh.cells.length, 'All cells assigned LTS tiers');
  const sumTiers = lts.tierCounts.reduce((a, b) => a + b, 0);
  assert(sumTiers === mesh.cells.length, 'Sum of tier counts must equal total cells');
  assert(lts.minDtSec > 0 && lts.maxDtSec >= lts.minDtSec, 'Valid timestep bounds');
  console.log('  - LTS tier distribution [1x: %d, 2x: %d, 4x: %d, 8x: %d], dt range: [%fs, %fs]',
    lts.tierCounts[0], lts.tierCounts[1], lts.tierCounts[2], lts.tierCounts[3],
    lts.minDtSec, lts.maxDtSec
  );

  // 9. Weakly Dispersive Non-Hydrostatic Dynamic Pressure Poisson Solve (Eq. 4.4)
  console.log('✓ Testing Weakly Dispersive Non-Hydrostatic Dynamic Pressure Solve...');
  const nhRes = applyNonHydrostaticPressureCorrection(mesh, flowingState.hydro, 0.05);
  assert(typeof nhRes.maxDynamicPressurePa === 'number' && nhRes.maxDynamicPressurePa >= 0, 'Dynamic pressure must be non-negative');
  assert(typeof nhRes.meanCorrectionMs === 'number' && nhRes.meanCorrectionMs >= 0, 'Mean correction must be non-negative');
  console.log('  - Max dynamic non-hydrostatic pressure: %f Pa, mean velocity correction: %f m/s',
    nhRes.maxDynamicPressurePa.toFixed(2), nhRes.meanCorrectionMs.toFixed(4)
  );

  // 10. Critical Angle-of-Repose Bank Slumping & Avalanching (Eq. 4.5)
  console.log('✓ Testing Bank Slumping & Angle-of-Repose Avalanching Sediment Conservation...');
  const sedTestMesh = generateRiverGridMesh(reach, {
    targetStreamwiseSpacingM: 25.0,
    transverseCellsCount: 4,
  });
  const sedState = createInitialSedimentState(sedTestMesh);

  // Create an artificial vertical cut-bank cliff exceeding angle of repose (> 32 deg)
  const cellA = sedTestMesh.cells[5];
  const nbrIdx = cellA.neighbors[1];
  assert(nbrIdx >= 0, 'Internal cell neighbor exists');
  const cellB = sedTestMesh.cells[nbrIdx];

  cellA.bedElevation = 100.0;
  cellB.bedElevation = 90.0; // 10m drop across 25m spacing -> slope 0.40 (exceeds tan(18 deg))

  const initialBedVolume = sedTestMesh.cells.reduce((acc, c) => acc + c.bedElevation * c.areaM2, 0);
  const slumpResult = applyAngleOfReposeAvalanching(sedTestMesh, sedState, flowingState.hydro, 20.0);

  assert(slumpResult.avalanchedCellsCount >= 2, 'Avalanching triggered on steep cut-bank');
  assert(slumpResult.volumeRedistributedM3 > 0, 'Sediment volume redistributed from cliff');

  const finalBedVolume = sedTestMesh.cells.reduce((acc, c) => acc + c.bedElevation * c.areaM2, 0);
  const volDiff = Math.abs(finalBedVolume - initialBedVolume);
  assert(volDiff < 1e-4, `Strict sediment mass conservation violated: volDiff=${volDiff} m3`);
  console.log('  - Angle-of-repose avalanching preserved sediment volume within %e m³', volDiff);

  // 11. Standalone WGSL Compute Shaders Audit
  console.log('✓ Auditing Standalone WGSL Shaders on Disk...');
  const shadersDir = path.resolve(process.cwd(), 'src/river/gpu');
  const expectedShaders = [
    'muscl_reconstruct.wgsl',
    'lts_subcycle.wgsl',
    'poisson_cg.wgsl',
    'overland_diffusive.wgsl',
  ];
  for (const sName of expectedShaders) {
    const sPath = path.join(shadersDir, sName);
    assert(fs.existsSync(sPath), `WGSL shader ${sName} must exist on disk`);
    const content = fs.readFileSync(sPath, 'utf8');
    assert(content.includes('@compute'), `${sName} must declare @compute entry point`);
    assert(content.includes('@workgroup_size'), `${sName} must declare valid workgroup_size`);
    console.log('  - %s validated (%d bytes)', sName, content.length);
  }

  solver.dispose();
  console.log('✓ ALL GPU/CPU SOLVER TESTS PASSED!\n');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
