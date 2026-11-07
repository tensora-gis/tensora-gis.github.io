/**
 * Sediment Transport & Exner Morphodynamics Verification Suite
 */

import { generateRiverGridMesh } from '../src/river/geometry/meshGenerator';
import { createBenchmark500mReach } from '../src/river/data/hydroRiversLoader';
import { createInitialHydroState } from '../src/river/gpu/cpuSolver';
import { initializeTurbulenceState } from '../src/river/turbulence/turbulenceModels';
import {
  createInitialSedimentState,
  stepSedimentTransport,
} from '../src/river/sediment/sedimentTransport';
import {
  computeSettlingVelocity,
  computeCriticalShields,
  computeShieldsParameter,
  computeBedShearStress,
  computeUnitSedimentTransportCapacity,
} from '../src/river/sediment/transportFormulas';
import { DEFAULT_TURBULENCE_PARAMETERS } from '../src/river/types/turbulence';
import { DEFAULT_SEDIMENT_PARAMETERS } from '../src/river/types/sediment';

console.log('--- RUNNING SEDIMENT TRANSPORT SELF-TEST ---');

// 1. Test Settling Velocity
const d50 = 0.0005; // 0.5 mm medium sand
const ws = computeSettlingVelocity(d50);
console.log('✓ Ferguson & Church settling velocity for 0.5mm sand =', (ws * 100).toFixed(2), 'cm/s');
if (ws < 0.02 || ws > 0.15) {
  throw new Error('Settling velocity for 0.5mm sand out of physical range');
}

// 2. Test Shields parameter & critical shear
const tauB = computeBedShearStress(1.5, 1.2, 0.0, 0.030);
const theta = computeShieldsParameter(tauB, d50);
const thetaCr = computeCriticalShields(12.6);
console.log(`✓ Bed shear tau_b = ${tauB.toFixed(2)} Pa, Shields theta = ${theta.toFixed(4)}, theta_cr = ${thetaCr.toFixed(4)}`);
if (theta <= 0) {
  throw new Error('Shields parameter must be positive');
}

// 3. Test 4 Transport Formulas
const formulas = ['engelund-hansen', 'meyer-peter-muller', 'van-rijn', 'toffaleti'] as const;
for (const f of formulas) {
  const qs = computeUnitSedimentTransportCapacity(f, 1.5, 1.2, 0.0, tauB, d50);
  console.log(`✓ Formula: ${f} -> capacity qs = ${qs.toExponential(4)} m^2/s`);
  if (qs < 0) {
    throw new Error(`Formula ${f} returned negative transport rate`);
  }
}

// 4. Test Coupled Sediment Transport & Exner Bed Evolution
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
for (let c = 0; c < mesh.cells.length; c++) {
  hydro.u[c] = 1.1;
  hydro.v[c] = 0.0;
  hydro.velocityMag[c] = 1.1;
}

const turb = initializeTurbulenceState(mesh.cells.length);
turb.nuT.fill(0.02); // Eddy viscosity for turbulent diffusion
const sed = createInitialSedimentState(mesh);

// Step 5 times with morphodynamic update
for (let step = 0; step < 5; step++) {
  stepSedimentTransport(
    0.1,
    mesh,
    hydro,
    turb,
    sed,
    DEFAULT_SEDIMENT_PARAMETERS,
    DEFAULT_TURBULENCE_PARAMETERS,
    true
  );
}

const maxConc = Math.max(...Array.from(sed.concentrationKgM3));
console.log('✓ Suspended concentration max =', maxConc.toFixed(4), 'kg/m^3');
console.log('✓ Scour volume =', sed.cumulativeScourVolumeM3.toFixed(3), 'm^3, Deposition volume =', sed.cumulativeDepositionVolumeM3.toFixed(3), 'm^3');

if (maxConc < 0) {
  throw new Error('Suspended sediment concentration must be non-negative');
}

console.log('✓ ALL SEDIMENT TESTS PASSED!\n');
