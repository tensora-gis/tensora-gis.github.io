/**
 * Comprehensive Automated Self-Test for 2D River Analysis & CFD Modelling
 *
 * Verifies:
 * 1. 500m Benchmark Reach Generation & Mesh Connectivity Topology
 * 2. 2D Shallow-Water Solver C-Property (Lake-at-Rest Well-Balanced Stability)
 * 3. 2D Finite-Volume Godunov/HLL Shallow-Water Dynamic Inflow Simulation
 * 4. All 6 Hydraulic Structures (Levees, Weirs, Bridges, Culverts, Gates, Embankments)
 * 5. Boundary Conditions (Inflow Hydrograph, Normal Depth Rating, Stage, Rainfall)
 * 6. Global HydroRIVERS Catalog & NASA SWOT Observation Validation
 * 7. Multi-Format GIS Export (GeoJSON Grid, ESRI ASCII Grid, CSV)
 *
 * Run with: npx tsx scripts/river-cfd-selftest.ts
 */

import {
  createBenchmark500mRiverReach,
  ARBITRARY_RIVER_DEMOS,
} from '../src/data/sampleRiverReaches';
import {
  initializeFlowState,
  step2DShallowWater,
  computeStableTimeStep,
  run2DSimulation,
} from '../src/utils/riverShallowWaterSolver';
import {
  evaluateStructureInteraction,
} from '../src/utils/riverStructures';
import {
  GLOBAL_HYDRORIVERS_CATALOG,
  SAMPLE_SWOT_OBSERVATIONS,
} from '../src/utils/riverHydroDataService';
import {
  exportRiverToGeoJSON,
  exportRiverToAsciiRaster,
  exportRiverHydraulicsCSV,
} from '../src/utils/riverExportUtils';
import {
  RiverMeshCell,
  RiverLeveeStructure,
  RiverWeirStructure,
  RiverBridgeStructure,
  RiverCulvertStructure,
  RiverGateStructure,
  RiverEmbankmentStructure,
  RiverBoundaryConditions,
} from '../src/types/riverAnalysis';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${name}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n======================================================');
console.log('🌊 2D RIVER ANALYSIS & CFD MODELLING SUITE SELF-TEST');
console.log('======================================================\n');

// ---------------------------------------------------------------------------
console.log('[1] 500m Benchmark Reach Generation & Mesh Connectivity');
// ---------------------------------------------------------------------------

const benchmark = createBenchmark500mRiverReach();
check('Benchmark reach generated', Boolean(benchmark && benchmark.mesh));
check('Benchmark has name & description', benchmark.name.includes('500m') && benchmark.description.length > 0);
check('Benchmark mesh has cells', benchmark.mesh.cells.length > 0, `Cells: ${benchmark.mesh.cells.length}`);
check('Benchmark mesh grid dimensions valid', benchmark.mesh.nx > 0 && benchmark.mesh.ny > 0);
check('Benchmark total cells equal nx * ny', benchmark.mesh.cells.length === benchmark.mesh.nx * benchmark.mesh.ny);

// Verify cell connectivity
let allCellsValid = true;
let allNeighborsValid = true;
const cellIds = new Set(benchmark.mesh.cells.map(c => c.id));

for (const cell of benchmark.mesh.cells) {
  if (cell.areaM2 <= 0 || isNaN(cell.bedElevation) || cell.manningN <= 0) {
    allCellsValid = false;
    break;
  }
  for (const nId of cell.neighbors) {
    if (nId >= 0 && !cellIds.has(nId)) {
      allNeighborsValid = false;
      break;
    }
  }
}
check('All mesh cells have positive area, finite bed elevation and Manning n', allCellsValid);
check('All cell neighbor connectivity references are valid', allNeighborsValid);

// Check pre-loaded structures & monitoring gauges
check('Benchmark has hydraulic structures', benchmark.structures.length >= 3, `Count: ${benchmark.structures.length}`);
check('Benchmark has monitoring gauges', benchmark.gauges.length >= 2, `Count: ${benchmark.gauges.length}`);
check('Benchmark has NASA SWOT validation observation', Boolean(benchmark.swotObservation));

// ---------------------------------------------------------------------------
console.log('\n[2] Well-Balanced "Lake-at-Rest" C-Property Stability');
// ---------------------------------------------------------------------------

// Create an undisturbed lake-at-rest state: flat free surface eta = 105.0m over variable bathymetry
const lakeMesh = createBenchmark500mRiverReach().mesh;
const lakeStage = 105.0;
const lakeBounds: RiverBoundaryConditions = {
  upstreamType: 'constant-discharge',
  upstreamDischargeM3s: 0,
  downstreamType: 'fixed-stage',
  downstreamSlope: 0.001,
  downstreamStageM: lakeStage,
  initialWaterDepthM: 2.0,
  rainfallIntensityMmPerHr: 0,
  manningRoughnessDefault: 0.035,
};

const lakeState = initializeFlowState(lakeMesh, lakeBounds);

// Explicitly set flat surface elevation across all cells
for (let i = 0; i < lakeMesh.cells.length; i++) {
  const cell = lakeMesh.cells[i];
  lakeState.depth[i] = Math.max(0, lakeStage - cell.bedElevation);
  lakeState.wse[i] = cell.bedElevation + lakeState.depth[i];
  lakeState.u[i] = 0;
  lakeState.v[i] = 0;
  lakeState.velocityMag[i] = 0;
}

// Step forward 5 iterations
for (let step = 0; step < 5; step++) {
  step2DShallowWater(lakeMesh, lakeState, [], lakeBounds, 0.1, step * 0.1);
}

// In a well-balanced Audusse scheme, velocity should remain negligible (near zero machine precision)
let maxVelocityLake = 0;
for (let i = 0; i < lakeMesh.cells.length; i++) {
  const vel = lakeState.velocityMag[i];
  if (vel > maxVelocityLake) maxVelocityLake = vel;
}

check('C-property: Velocity remains ~0 in lake-at-rest over variable bathymetry', maxVelocityLake < 1e-4, `Max vel: ${maxVelocityLake.toExponential(4)} m/s`);

// ---------------------------------------------------------------------------
console.log('\n[3] 2D Shallow-Water Simulation Execution & Dynamic Stability');
// ---------------------------------------------------------------------------

const simMesh = createBenchmark500mRiverReach().mesh;
const simBounds: RiverBoundaryConditions = {
  upstreamType: 'constant-discharge',
  upstreamDischargeM3s: 45.0,
  downstreamType: 'normal-depth',
  downstreamSlope: 0.001,
  downstreamStageM: 100.0,
  initialWaterDepthM: 1.5,
  rainfallIntensityMmPerHr: 15.0,
  manningRoughnessDefault: 0.035,
};

const runResult = run2DSimulation(
  simMesh,
  benchmark.structures,
  simBounds,
  5.0, // 5 seconds of simulation
  20,  // target fps
  benchmark.gauges,
  benchmark.swotObservation
);

check('run2DSimulation completes successfully', Boolean(runResult && runResult.finalState));
check('Simulation advanced in time', runResult.finalState.timeSec >= 4.9, `Time: ${runResult.finalState.timeSec.toFixed(2)}s`);
check('Water depths are strictly non-negative', Array.from(runResult.finalState.depth).every(h => !isNaN(h) && h >= 0));
check('Velocities are finite numbers', Array.from(runResult.finalState.u).every(u => !isNaN(u)) && Array.from(runResult.finalState.v).every(v => !isNaN(v)));
check('Summary max depth is positive and realistic', runResult.summary.maxWaterDepthM > 0.5 && runResult.summary.maxWaterDepthM < 20);
check('Summary max velocity is realistic', runResult.summary.maxVelocityMs > 0.05 && runResult.summary.maxVelocityMs < 15);
check('Mass conservation error is bounded (< 10%)', Math.abs(runResult.summary.massConservationErrorPercent) < 10.0, `Error: ${runResult.summary.massConservationErrorPercent.toFixed(2)}%`);
check('CFL stable time step calculation returns positive dt', computeStableTimeStep(simMesh, runResult.finalState) > 0);

// ---------------------------------------------------------------------------
console.log('\n[4] All 6 Hydraulic Structures Physics Evaluation');
// ---------------------------------------------------------------------------

const mockCellA: RiverMeshCell = {
  id: 0,
  i: 0,
  j: 0,
  centerLat: 48.0,
  centerLng: 15.0,
  centerX: 0,
  centerY: 0,
  corners: [[48.0, 15.0], [48.001, 15.0], [48.001, 15.001], [48.0, 15.001]],
  bedElevation: 100.0,
  manningN: 0.035,
  areaM2: 25.0,
  neighbors: [1, -1, -1, -1],
  faceLengths: [5.0, 5.0, 5.0, 5.0],
  faceNormals: [[1, 0], [0, 1], [-1, 0], [0, -1]],
};

const mockCellB: RiverMeshCell = {
  ...mockCellA,
  id: 1,
  i: 1,
  j: 0,
  bedElevation: 99.8,
  neighbors: [-1, -1, 0, -1],
};

// 1. Levee / Floodwall
const levee: RiverLeveeStructure = {
  id: 'lev-1',
  name: 'Left Floodwall',
  type: 'levee',
  enabled: true,
  coordinates: [{ lat: 48.0, lng: 15.0 }],
  cellIndices: [0, 1],
  crestElevationM: 104.0,
  topWidthM: 3.0,
  sideSlopeHtoV: 2.0,
};

const leveeDry = evaluateStructureInteraction(levee, mockCellA, mockCellB, 2.0, 1.0, 5.0); // WSE = 102.0 vs 100.8 (below 104)
check('Levee blocks flow when water stage < crest', leveeDry.blocked === true && leveeDry.overrideDischargeM3s === 0);

const leveeOvertopped = evaluateStructureInteraction(levee, mockCellA, mockCellB, 5.0, 1.0, 5.0); // WSE = 105.0 (overtops 104 by 1m)
check('Levee computes weir overflow discharge when overtopped', !leveeOvertopped.blocked && (leveeOvertopped.overrideDischargeM3s ?? 0) > 0);

// 2. Weir
const weir: RiverWeirStructure = {
  id: 'weir-1',
  name: 'Check Weir',
  type: 'weir',
  enabled: true,
  coordinates: [{ lat: 48.0, lng: 15.0 }],
  cellIndices: [0, 1],
  crestElevationM: 102.5,
  crestLengthM: 10.0,
  weirType: 'broad-crested',
  dischargeCoefficient: 1.7,
};

const weirBelow = evaluateStructureInteraction(weir, mockCellA, mockCellB, 2.0, 1.0, 5.0); // WSE = 102.0 < 102.5
check('Weir blocks flow when headwater below crest', weirBelow.blocked === true);

const weirFlow = evaluateStructureInteraction(weir, mockCellA, mockCellB, 3.5, 1.0, 5.0); // WSE = 103.5 > 102.5 (H = 1.0m)
check('Weir computes positive discharge when headwater exceeds crest', (weirFlow.overrideDischargeM3s ?? 0) > 10.0);

// 3. Bridge
const bridge: RiverBridgeStructure = {
  id: 'brg-1',
  name: 'Highway Bridge',
  type: 'bridge',
  enabled: true,
  coordinates: [{ lat: 48.0, lng: 15.0 }],
  cellIndices: [0, 1],
  deckElevationM: 106.0,
  lowChordElevationM: 104.5,
  pierCount: 2,
  pierWidthM: 1.2,
  pierDragCoeff: 1.25,
};

const bridgeFree = evaluateStructureInteraction(bridge, mockCellA, mockCellB, 3.0, 2.5, 10.0); // WSE = 103.0 < 104.5
check('Bridge calculates pier drag headloss for free surface flow', (bridgeFree.addedHeadlossM ?? 0) > 0);

const bridgePressure = evaluateStructureInteraction(bridge, mockCellA, mockCellB, 5.0, 4.0, 10.0); // WSE = 105.0 > 104.5 (pressure flow)
check('Bridge calculates low-chord orifice pressure flow when submerged', (bridgePressure.overrideDischargeM3s ?? 0) > 0);

// 4. Culvert
const culvert: RiverCulvertStructure = {
  id: 'culv-1',
  name: 'Box Culvert',
  type: 'culvert',
  enabled: true,
  coordinates: [{ lat: 48.0, lng: 15.0 }],
  cellIndices: [0, 1],
  barrelCount: 2,
  diameterOrSpanM: 1.8,
  riseM: 1.8,
  lengthM: 25.0,
  inletInvertM: 100.2,
  outletInvertM: 99.8,
  manningN: 0.013,
  inletLossCoeff: 0.5,
};

const culvertFlow = evaluateStructureInteraction(culvert, mockCellA, mockCellB, 2.0, 1.0, 5.0);
check('Culvert computes FHWA HDS-5 governing discharge', (culvertFlow.overrideDischargeM3s ?? 0) > 0);

// 5. Gate
const gate: RiverGateStructure = {
  id: 'gate-1',
  name: 'Sluice Gate',
  type: 'gate',
  enabled: true,
  coordinates: [{ lat: 48.0, lng: 15.0 }],
  cellIndices: [0, 1],
  crestElevationM: 100.0,
  gateWidthM: 6.0,
  openingM: 0.8,
  gateType: 'sluice',
  dischargeCoefficient: 0.62,
};

const gateFlow = evaluateStructureInteraction(gate, mockCellA, mockCellB, 3.0, 0.5, 6.0); // Free orifice
check('Gate computes underflow orifice discharge', (gateFlow.overrideDischargeM3s ?? 0) > 0);

// 6. Embankment
const embankment: RiverEmbankmentStructure = {
  id: 'emb-1',
  name: 'Road Embankment',
  type: 'embankment',
  enabled: true,
  coordinates: [{ lat: 48.0, lng: 15.0 }],
  cellIndices: [0, 1],
  crestElevationM: 103.0,
  topWidthM: 8.0,
  sideSlopeHtoV: 2.0,
  overtopDischargeCoeff: 1.45,
};

const embOvertopped = evaluateStructureInteraction(embankment, mockCellA, mockCellB, 4.0, 1.0, 10.0);
check('Embankment computes broad-crested roadway overtopping', (embOvertopped.overrideDischargeM3s ?? 0) > 0);

// ---------------------------------------------------------------------------
console.log('\n[5] Global HydroRIVERS Catalog & NASA SWOT Observations');
// ---------------------------------------------------------------------------

check('HydroRIVERS catalog contains worldwide reaches', GLOBAL_HYDRORIVERS_CATALOG.length >= 6);
const danube = GLOBAL_HYDRORIVERS_CATALOG.find(r => r.riverName.includes('Danube'));
const mississippi = GLOBAL_HYDRORIVERS_CATALOG.find(r => r.riverName.includes('Mississippi'));
const rhine = GLOBAL_HYDRORIVERS_CATALOG.find(r => r.riverName.includes('Rhine'));
check('Danube, Mississippi, and Rhine reaches exist with valid metrics', Boolean(danube && mississippi && rhine));
check('HydroRIVERS reach has valid discharge and gradient', (danube?.meanDischargeM3s ?? 0) > 0 && (danube?.gradientPercent ?? 0) > 0);

const swotList = Object.values(SAMPLE_SWOT_OBSERVATIONS);
check('NASA SWOT sample observations are available', swotList.length >= 3);
const sampleSwot = swotList[0];
check('SWOT observation has valid observed WSE, width, slope, and uncertainty',
  sampleSwot.observedWseM > 0 && sampleSwot.observedWidthM > 0 && sampleSwot.observedSlope > 0 && sampleSwot.uncertaintyWseM > 0
);

// ---------------------------------------------------------------------------
console.log('\n[6] Multi-Format GIS & Hydraulic Data Export Verification');
// ---------------------------------------------------------------------------

// 1. GeoJSON Mesh Grid
const meshGeoJSONString = exportRiverToGeoJSON(simMesh, runResult.finalState, benchmark.structures, benchmark.gauges);
const meshGeoJSON = JSON.parse(meshGeoJSONString);
check('GeoJSON Mesh has FeatureCollection type', meshGeoJSON.type === 'FeatureCollection');
check('GeoJSON Mesh contains features', meshGeoJSON.features.length > 0);
check('GeoJSON feature contains hydraulic properties (depthM, velocityMs, wseM)',
  'depthM' in meshGeoJSON.features[0].properties &&
  'velocityMs' in meshGeoJSON.features[0].properties &&
  'wseM' in meshGeoJSON.features[0].properties
);

// 2. ESRI ASCII Grid
const asciiGrid = exportRiverToAsciiRaster(simMesh, runResult.finalState, 'depth');
check('ESRI ASCII Grid has standard header',
  asciiGrid.includes('ncols') &&
  asciiGrid.includes('nrows') &&
  asciiGrid.includes('xllcorner') &&
  asciiGrid.includes('yllcorner') &&
  asciiGrid.includes('cellsize') &&
  asciiGrid.includes('NODATA_value')
);

// 3. CSV Summary Report
const csvSummary = exportRiverHydraulicsCSV(simMesh, runResult.finalState, runResult.summary, benchmark.structures);
check('CSV Summary Report has valid headers',
  csvSummary.includes('Station_m') &&
  csvSummary.includes('Mean_Bed_Elev_m') &&
  csvSummary.includes('Water_Surface_Elev_m') &&
  csvSummary.includes('Mean_Velocity_ms') &&
  csvSummary.includes('Froude_Number')
);
check('CSV Summary Report includes reach records', csvSummary.split('\n').length > simMesh.nx);

// ---------------------------------------------------------------------------
console.log('\n[7] Pre-configured Engineering Demos Verification');
// ---------------------------------------------------------------------------

check('Arbitrary river demos list contains multiple river configurations', ARBITRARY_RIVER_DEMOS.length >= 3);
for (const demo of ARBITRARY_RIVER_DEMOS) {
  check(`Demo reach: ${demo.mesh.name}`, demo.mesh.cells.length > 0 && demo.boundaries.upstreamDischargeM3s > 0);
}

// ---------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL 2D RIVER ANALYSIS & CFD SELF-TESTS PASSED!\n');
}
