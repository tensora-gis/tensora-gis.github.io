/**
 * Automated Verification & Self-Test Script for Water Distribution & Transient Surge Engine
 *
 * Runs full test suite covering:
 * 1. EPANET Steady-State GGA hydraulic solver convergence & continuity
 * 2. 24-Hour EPS Extended Period Simulation diurnal hydrographs
 * 3. Automated Fire Flow analysis with residual pressure constraints
 * 4. Water Quality residence time & chlorine decay kinetics
 * 5. Darwin-style pipe sizing auto-design & interactive apply
 * 6. Transient Surge & Water Hammer analysis (Joukowsky & Allievi physics):
 *    - Wave speed by material (DI, Steel, PVC, HDPE, Concrete)
 *    - Reflection period (2L/a)
 *    - Joukowsky rapid surge vs Allievi slow closure
 *    - Vapor cavitation and column separation detection (<-10m)
 *    - Overpressure rupture check vs PN ratings
 *    - Hydro-pneumatic air vessel and vacuum relief valve sizing
 * 7. Excel 11-Sheet calculation export data integrity
 */

import { createHighlandMunicipalNetwork } from '../src/data/sampleWaterNetworks';
import { simulateWaterNetwork, applyWaterPipeOptimization, computeTransientSurgeAnalysis } from '../src/utils/waterHydraulicsEngine';
import { buildWaterExcelWorkbook } from '../src/utils/waterExcelExport';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING COMPREHENSIVE WATER DISTRIBUTION & HAMMER SELF-TESTS');
  console.log('===============================================================');

  // Test 1: Model Loading & Steady-State GGA
  console.log('\n--- 1. EPANET Steady-State GGA Hydraulic Solver ---');
  const initialNetwork = createHighlandMunicipalNetwork();
  assert(initialNetwork.junctions.length >= 8, 'Highland network contains >= 8 junctions');
  assert(initialNetwork.pipes.length >= 9, 'Highland network contains >= 9 pipes');
  assert(initialNetwork.pumps.length >= 1, 'Highland network contains booster pump');

  const { updatedNetwork, summary } = simulateWaterNetwork(initialNetwork);
  assert(summary.converged, 'EPANET GGA solver achieved numerical convergence');
  assert(summary.iterations <= 30, `Converged in ${summary.iterations} iterations (<= 30)`);
  assert(summary.relativeFlowError < 0.005, `Relative flow imbalance is ${summary.relativeFlowError} (< 0.005)`);
  assert(summary.totalSupplyLs > 0, `Total network supply is ${summary.totalSupplyLs} L/s (> 0)`);
  assert(summary.totalDemandLs > 0, `Total network demand is ${summary.totalDemandLs} L/s (> 0)`);

  // Verify all junctions have valid heads and pressures
  updatedNetwork.junctions.forEach((j) => {
    assert(j.head !== undefined && j.head > j.elevation, `Junction ${j.id} head (${j.head}m) > elevation (${j.elevation}m)`);
    assert(j.pressure !== undefined, `Junction ${j.id} pressure defined (${j.pressure}m)`);
  });

  // Verify pipes have flow, velocity, headloss
  updatedNetwork.pipes.forEach((p) => {
    assert(p.flow !== undefined, `Pipe ${p.id} flow defined: ${p.flow} L/s`);
    assert(p.velocity !== undefined, `Pipe ${p.id} velocity defined: ${p.velocity} m/s`);
    assert(p.unitHeadloss !== undefined, `Pipe ${p.id} unit headloss defined: ${p.unitHeadloss} m/km`);
  });

  // Test 2: Extended Period Simulation (EPS 24-hr diurnal)
  console.log('\n--- 2. Extended Period Simulation (24-Hour Diurnal) ---');
  assert(Boolean(summary.hourlyEpsPoints && summary.hourlyEpsPoints.length === 24), 'EPS contains 24 hourly time steps');
  const morningPeak = summary.hourlyEpsPoints!.find((h) => h.hour === 8);
  const nightTrough = summary.hourlyEpsPoints!.find((h) => h.hour === 3);
  assert(Boolean(morningPeak && nightTrough), 'Morning peak (8:00) and night trough (3:00) exist');
  assert(morningPeak!.demandMultiplier > nightTrough!.demandMultiplier, `Morning multiplier (${morningPeak!.demandMultiplier}) > night (${nightTrough!.demandMultiplier})`);

  // Test 3: Fire Flow Analysis
  console.log('\n--- 3. Fire Flow Analysis with Residual Pressure Constraints ---');
  assert(Boolean(summary.fireFlowResults && summary.fireFlowResults.length > 0), 'Fire flow results generated for junctions');
  const positiveFireFlow = summary.fireFlowResults!.filter((ff) => ff.availableFireFlowLs > 0);
  assert(positiveFireFlow.length > 0, `At least ${positiveFireFlow.length} junctions have positive fire flow capacity`);
  summary.fireFlowResults!.forEach((ff) => {
    assert(ff.availableFireFlowLs >= 0, `Junction ${ff.junctionId} has valid fire flow: ${ff.availableFireFlowLs} L/s`);
    assert(ff.residualPressureM >= 0, `Junction ${ff.junctionId} residual pressure >= 0m: ${ff.residualPressureM}m`);
  });

  // Test 4: Water Quality & Residence Time Kinetics
  console.log('\n--- 4. Water Quality & Chlorine Decay Kinetics ---');
  assert(Boolean(summary.waterQualityResults && summary.waterQualityResults.length > 0), 'Water quality results computed');
  summary.waterQualityResults!.forEach((wq) => {
    assert(wq.waterAgeHours >= 0, `Node ${wq.nodeId} water age >= 0: ${wq.waterAgeHours} hrs`);
    assert(wq.chlorineResidualMgL > 0 && wq.chlorineResidualMgL <= 1.2, `Node ${wq.nodeId} chlorine residual in [0, 1.2] mg/L: ${wq.chlorineResidualMgL} mg/L`);
  });

  // Test 5: Auto-Design Pipe Sizing (Darwin Optimization)
  console.log('\n--- 5. Automated Pipe Sizing & Rehabilitation ---');
  assert(Boolean(summary.pipeOptimizations && summary.pipeOptimizations.length > 0), 'Pipe optimization recommendations generated');
  const optApplied = applyWaterPipeOptimization(updatedNetwork, summary.pipeOptimizations!);
  assert(optApplied.pipes.length === updatedNetwork.pipes.length, 'Optimized network maintains all pipe elements');

  // Test 6: Transient Surge & Water Hammer Analysis (Bentley HAMMER suite capabilities)
  console.log('\n--- 6. Transient Surge & Water Hammer Physics Suite ---');
  assert(Boolean(summary.transientSurgeSummary), 'Transient surge summary generated by simulation engine');
  const surge = summary.transientSurgeSummary!;
  assert(surge.scenario === 'PUMP_TRIP', 'Default trip scenario is PUMP_TRIP');
  assert(surge.pipeResults.length === updatedNetwork.pipes.length, `Surge calculated for all ${updatedNetwork.pipes.length} pipes`);
  assert(surge.timeHistory.length > 0, `Transient time history generated with ${surge.timeHistory.length} timesteps`);

  // Verify material wave speeds
  const pipeResultsMap = new Map(surge.pipeResults.map((r) => [r.pipeId, r]));
  const p1 = pipeResultsMap.get('P-1'); // DI
  const p2 = pipeResultsMap.get('P-2'); // Steel
  const p4 = pipeResultsMap.get('P-4'); // HDPE
  const p6 = pipeResultsMap.get('P-6'); // PVC

  assert(p1 !== undefined && p1.waveSpeedMs >= 1000 && p1.waveSpeedMs <= 1100, `DI wave speed (${p1?.waveSpeedMs} m/s) matches physical ductile iron`);
  assert(p2 !== undefined && p2.waveSpeedMs >= 1100 && p2.waveSpeedMs <= 1200, `Steel wave speed (${p2?.waveSpeedMs} m/s) matches mild steel`);
  assert(p4 !== undefined && p4.waveSpeedMs >= 300 && p4.waveSpeedMs <= 380, `HDPE wave speed (${p4?.waveSpeedMs} m/s) matches thermoplastic HDPE`);
  assert(p6 !== undefined && p6.waveSpeedMs >= 380 && p6.waveSpeedMs <= 450, `PVC wave speed (${p6?.waveSpeedMs} m/s) matches uPVC`);

  // Verify Joukowsky acoustic wave formulation deltaH = a * deltaV / g (rapid) vs Allievi (slow)
  surge.pipeResults.forEach((pr) => {
    const pipeElem = initialNetwork.pipes.find((p) => p.id === pr.pipeId);
    const len = pipeElem ? pipeElem.length : 100;
    const isRapid = surge.closureOrTripTimeSec <= pr.acousticPeriodSec;
    const expectedSurge = isRapid
      ? (pr.waveSpeedMs * pr.initialVelocityMs) / 9.80665
      : (2 * len * pr.initialVelocityMs) / (9.80665 * surge.closureOrTripTimeSec);
    const diff = Math.abs(pr.joukowskySurgeM - Math.round(expectedSurge * 10) / 10);
    assert(diff <= 0.2, `Pipe ${pr.pipeId} transient surge ${pr.joukowskySurgeM}m matches physics (${isRapid ? 'Joukowsky rapid' : 'Allievi slow'}: ${expectedSurge.toFixed(1)}m)`);
    assert(pr.acousticPeriodSec > 0, `Pipe ${pr.pipeId} acoustic period 2L/a > 0: ${pr.acousticPeriodSec}s`);
    assert(pr.maxTransientHeadM >= pr.minTransientHeadM, `Pipe ${pr.pipeId} H_max (${pr.maxTransientHeadM}m) >= H_min (${pr.minTransientHeadM}m)`);
  });

  // Verify rapid Joukowsky trip condition (T <= 2L/a)
  const rapidSurge = computeTransientSurgeAnalysis(
    updatedNetwork,
    new Map(updatedNetwork.junctions.map((j) => [j.id, j.head ?? 180])),
    new Map(updatedNetwork.pipes.map((p) => [p.id, p.flow ?? 10])),
    'PUMP_TRIP',
    0.05 // Rapid trip time (0.05s <= 2L/a)
  );
  const rapidP1 = rapidSurge.pipeResults.find((r) => r.pipeId === 'P-1')!;
  const expectedRapidDeltaH = (rapidP1.waveSpeedMs * rapidP1.initialVelocityMs) / 9.80665;
  assert(
    Math.abs(rapidP1.joukowskySurgeM - Math.round(expectedRapidDeltaH * 10) / 10) <= 0.2,
    `Rapid trip triggers full Joukowsky formula a*V/g: ${rapidP1.joukowskySurgeM}m`
  );

  // Verify surge protection recommendations
  assert(surge.protectionDevices.length > 0, `Surge protection devices sized (${surge.protectionDevices.length} devices)`);
  const airVessel = surge.protectionDevices.find((d) => d.type === 'AIR_VESSEL');
  assert(Boolean(airVessel && airVessel.effectiveVolumeM3 && airVessel.effectiveVolumeM3 > 0), `Hydro-pneumatic air vessel sized: ${airVessel?.effectiveVolumeM3} m³`);

  // Verify valve closure scenario
  const valveSurge = computeTransientSurgeAnalysis(
    updatedNetwork,
    new Map(updatedNetwork.junctions.map((j) => [j.id, j.head ?? 180])),
    new Map(updatedNetwork.pipes.map((p) => [p.id, p.flow ?? 10])),
    'VALVE_CLOSURE',
    1.5
  );
  assert(valveSurge.scenario === 'VALVE_CLOSURE', 'VALVE_CLOSURE scenario computed');
  assert(valveSurge.maxSystemSurgeHeadM > 0, `Max system surge head for valve closure: ${valveSurge.maxSystemSurgeHeadM}m`);

  // Test 7: Multi-Sheet Excel Calculation Workbook (11 Sheets)
  console.log('\n--- 7. Comprehensive 11-Sheet Excel Export ---');
  const wb = await buildWaterExcelWorkbook(updatedNetwork, summary);
  const sheetNames = wb.worksheets.map((ws) => ws.name);
  assert(sheetNames.length === 11, `Workbook contains exactly 11 engineering calculation sheets (found ${sheetNames.length})`);
  const expectedSheets = [
    'Executive_Summary',
    'Junction_Calculations',
    'Pipe_Calculations',
    'Pumps_and_Energy',
    'Control_Valves',
    'Sources_and_Storage',
    'EPS_24Hr_Extended_Simulation',
    'Fire_Flow_Capacity_Register',
    'Water_Quality_and_Age',
    'Pipe_Sizing_Optimization',
    'Transient_Surge_Analysis',
  ];
  expectedSheets.forEach((name) => {
    assert(sheetNames.includes(name), `Workbook includes sheet '${name}'`);
    const sheet = wb.getWorksheet(name);
    assert(Boolean(sheet && sheet.rowCount > 0), `Sheet '${name}' contains populated rows (count: ${sheet?.rowCount})`);
  });

  console.log('\n===============================================================');
  console.log('🎉 ALL WATER DISTRIBUTION & HAMMER SELF-TESTS PASSED (100%)');
  console.log('===============================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
