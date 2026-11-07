/**
 * Turbulence Modeling Verification Suite
 * Verifies Depth-Averaged RANS: Mixing Length, k-epsilon, k-omega SST
 */

import { generateRiverGridMesh } from '../src/river/geometry/meshGenerator';
import { createBenchmark500mReach } from '../src/river/data/hydroRiversLoader';
import { createInitialHydroState } from '../src/river/gpu/cpuSolver';
import {
  initializeTurbulenceState,
  stepTurbulence,
} from '../src/river/turbulence/turbulenceModels';
import { DEFAULT_TURBULENCE_PARAMETERS } from '../src/river/types/turbulence';

console.log('--- RUNNING TURBULENCE MODEL SELF-TEST ---');

const reach = createBenchmark500mReach();
const mesh = generateRiverGridMesh(reach, {
  targetStreamwiseSpacingM: 25.0,
  transverseCellsCount: 6,
});

const boundaries = {
  upstreamType: 'constant-discharge' as const,
  upstreamDischargeM3s: 35.0,
  downstreamType: 'normal-depth' as const,
  downstreamSlope: 0.001,
  downstreamStageM: 100.0,
  rainfallMmPerHour: 0.0,
  initialWaterDepthM: 1.5,
  manningRoughnessDefault: 0.030,
};

const hydro = createInitialHydroState(mesh, boundaries);
// Give non-zero flow velocity
for (let c = 0; c < mesh.cells.length; c++) {
  hydro.u[c] = 1.2;
  hydro.v[c] = 0.0;
  hydro.velocityMag[c] = 1.2;
}

const turb = initializeTurbulenceState(mesh.cells.length);

// 1. Test None
const noneParams = { ...DEFAULT_TURBULENCE_PARAMETERS, model: 'none' as const };
stepTurbulence(mesh, hydro, turb, noneParams, 0.1);
console.log('✓ Model: None -> nuT max =', Math.max(...Array.from(turb.nuT)));
if (Math.max(...Array.from(turb.nuT)) !== 0) {
  throw new Error('Model None must produce zero eddy viscosity');
}

// 2. Test Mixing Length
const mixParams = { ...DEFAULT_TURBULENCE_PARAMETERS, model: 'mixing-length' as const };
stepTurbulence(mesh, hydro, turb, mixParams, 0.1);
const maxNuTMix = Math.max(...Array.from(turb.nuT));
console.log('✓ Model: Mixing Length -> nuT max =', maxNuTMix.toFixed(5), 'm^2/s');
if (maxNuTMix <= 0) {
  throw new Error('Mixing Length must produce positive eddy viscosity in flowing water');
}

// 3. Test k-epsilon
const kEpsParams = { ...DEFAULT_TURBULENCE_PARAMETERS, model: 'k-epsilon' as const };
for (let step = 0; step < 10; step++) {
  stepTurbulence(mesh, hydro, turb, kEpsParams, 0.1);
}
const maxNuTkEps = Math.max(...Array.from(turb.nuT));
const maxK = Math.max(...Array.from(turb.k));
console.log('✓ Model: k-epsilon (10 steps) -> nuT max =', maxNuTkEps.toFixed(5), 'm^2/s, k max =', maxK.toFixed(5));
if (maxNuTkEps <= 0 || maxK <= 0) {
  throw new Error('k-epsilon must maintain positive TKE and eddy viscosity');
}

// 4. Test k-omega SST
const kOmegaParams = { ...DEFAULT_TURBULENCE_PARAMETERS, model: 'k-omega-sst' as const };
stepTurbulence(mesh, hydro, turb, kOmegaParams, 0.1);
const maxNuTSst = Math.max(...Array.from(turb.nuT));
console.log('✓ Model: k-omega SST -> nuT max =', maxNuTSst.toFixed(5), 'm^2/s');
if (maxNuTSst <= 0) {
  throw new Error('k-omega SST must produce positive eddy viscosity');
}

// 5. Test dry-bed suppression
hydro.depth[0] = 0.002; // < 5mm dry bed
stepTurbulence(mesh, hydro, turb, kEpsParams, 0.1);
if (turb.nuT[0] !== 0) {
  throw new Error('Turbulence must be suppressed on dry bed');
}
console.log('✓ Dry-bed suppression verified: nuT = 0 on shallow sheet');

console.log('✓ ALL TURBULENCE TESTS PASSED!\n');
