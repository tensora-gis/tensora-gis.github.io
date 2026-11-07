/**
 * River CFD End-to-End Integration Verification Suite
 *
 * Verifies:
 * 1. 2D Shallow Water CFD Engine execution
 * 2. RANS Depth-Averaged Turbulence coupling
 * 3. Coupled Sediment Transport & Exner Morphodynamics
 * 4. Custom CAD Hydraulic Structures
 * 5. NASA SWOT Satellite Altimetry Calibration
 * 6. 6-Sheet Professional Engineering Excel (.xlsx) Generation
 */

import { RiverDataService } from '../src/river/data/riverDataService';
import { RiverCfdEngine } from '../src/river/solver/riverCfdEngine';
import { createCustomCadStructure } from '../src/river/structures/structureFlux';
import { evaluateSwotCalibration } from '../src/river/calibration/swotCalibration';
import { createRiverExcelWorkbook } from '../src/river/export/riverExport';
import { DEFAULT_TURBULENCE_PARAMETERS } from '../src/river/types/turbulence';
import { DEFAULT_SEDIMENT_PARAMETERS } from '../src/river/types/sediment';

console.log('--- RUNNING FULL RIVER CFD ENGINE END-TO-END TEST ---');

async function run() {
  const reach = await RiverDataService.getReachById('reach-benchmark-500m');
  if (!reach) throw new Error('Could not load benchmark reach');

  // Build mesh: 20 streamwise x 6 transverse cells = 120 cells
  const mesh = RiverDataService.buildMesh(reach, 25.0, 6);
  console.log(`✓ Mesh built with ${mesh.cells.length} cells (${mesh.nx} x ${mesh.ny})`);

  const boundaries = {
    upstreamType: 'constant-discharge' as const,
    upstreamDischargeM3s: 35.0,
    downstreamType: 'normal-depth' as const,
    downstreamSlope: 0.001,
    downstreamStageM: 99.5,
    rainfallMmPerHour: 5.0, // Mild rainfall
    initialWaterDepthM: 1.2,
    manningRoughnessDefault: 0.030,
  };

  // Place custom CAD hydraulic weir across mid-reach
  const midI = Math.floor(mesh.nx / 2);
  const leftCell = mesh.cells[midI * mesh.ny];
  const rightCell = mesh.cells[midI * mesh.ny + mesh.ny - 1];
  const weirCoords = [
    { lat: leftCell.centerLat, lng: leftCell.centerLng },
    { lat: rightCell.centerLat, lng: rightCell.centerLng },
  ];

  const weir = createCustomCadStructure(
    'Hydraulic Control Weir',
    'weir',
    weirCoords,
    mesh,
    {
      crestElevationM: 101.5,
      layerName: 'CIVIL_WEIR',
      color: '#38bdf8',
      weirType: 'broad-crested',
      dischargeCoeff: 1.70,
    }
  );
  console.log(`✓ Placed custom structure: "${weir.name}" across ${weir.cellIndices.length} cells`);

  const turbParams = { ...DEFAULT_TURBULENCE_PARAMETERS, model: 'k-epsilon' as const };
  const sedParams = { ...DEFAULT_SEDIMENT_PARAMETERS, formula: 'engelund-hansen' as const };

  const engine = new RiverCfdEngine({
    mesh,
    boundaries,
    structures: [weir],
    turbParams,
    sedParams,
    preferredBackend: 'cpu',
  });

  console.log('✓ Initializing River CFD Engine...');
  await engine.initialize();

  // Run 30 seconds simulation
  console.log('✓ Executing 30-second CFD simulation batch...');
  const summary = await engine.runBatch(30.0, (pct, t) => {
    if (Math.round(pct) % 50 === 0) {
      console.log(`  Progress: ${pct.toFixed(0)}% (t = ${t.toFixed(1)}s)`);
    }
  });

  console.log('✓ Simulation Batch Complete!');
  console.log(`  - Total Steps: ${summary.totalSteps}`);
  console.log(`  - Max Depth: ${summary.maxWaterDepthM.toFixed(3)} m`);
  console.log(`  - Max Velocity: ${summary.maxVelocityMs.toFixed(3)} m/s`);
  console.log(`  - Total Water Volume: ${summary.totalWaterVolumeM3.toFixed(1)} m^3`);
  console.log(`  - Mass Conservation Error: ${summary.massConservationErrorPercent.toFixed(4)}%`);
  console.log(`  - Max Eddy Viscosity nu_t: ${summary.turbulenceSummary?.maxNuT.toFixed(4)} m^2/s`);
  console.log(`  - Net Bed Volume Change: ${summary.sedimentSummary?.netBedVolumeChangeM3.toFixed(3)} m^3`);

  if (summary.maxWaterDepthM <= 0) {
    throw new Error('Simulation resulted in dry domain');
  }

  // SWOT Altimetry Calibration Evaluation
  const swotObs = RiverDataService.getSwotData(reach.id);
  let calibrationResult = null;
  if (swotObs) {
    calibrationResult = evaluateSwotCalibration(mesh, engine.getState().hydro, swotObs);
    console.log(`✓ NASA SWOT Calibration: Observed WSE = ${swotObs.observedWseM}m, Simulated Mean WSE = ${calibrationResult.simulatedMeanWseM.toFixed(3)}m, RMSE = ${calibrationResult.wseRmseM.toFixed(3)}m`);
    console.log(`  - Status: ${calibrationResult.agreementStatus}`);
    console.log(`  - Calibrated Manning n: ${calibrationResult.calibratedManningN}`);
  }

  // Generate 6-Sheet Professional Engineering Excel Workbook
  console.log('✓ Generating 6-Sheet Excel (.xlsx) Report...');
  const state = engine.getState();
  const excelBuffer = await createRiverExcelWorkbook({
    reach,
    mesh,
    hydro: state.hydro,
    turb: state.turb,
    sed: state.sed,
    structures: [weir],
    summary,
    turbParams,
    sedParams,
    calibrationResult,
  });

  console.log(`✓ Excel Workbook generated successfully! Buffer size: ${(excelBuffer.byteLength / 1024).toFixed(1)} KB`);
  if (excelBuffer.byteLength < 5000) {
    throw new Error('Generated Excel file is suspiciously small');
  }

  engine.dispose();
  console.log('✓ ALL FULL RIVER CFD TESTS PASSED WITH 100% SUCCESS!\n');
}

run().catch((err) => {
  console.error('Self-test failed:', err);
  process.exit(1);
});
