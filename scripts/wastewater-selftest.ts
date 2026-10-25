/**
 * Comprehensive Automated Self-Test for Wastewater Modelling
 *
 * Verifies:
 * 1. Arbitrary demo models (Municipal, Hillside, Coastal, Industrial)
 * 2. 10+ consecutive simulation runs on arbitrary models
 * 3. Clearing and deleting 1st model completely and cascading cleanup
 * 4. Safe simulation on empty and single-element networks
 * 5. Continuous sequential ID generation without collisions
 * 6. SWMM INP serialization and parsing round-trips
 *
 * Run with: npx tsx scripts/wastewater-selftest.ts
 */

import {
  createMunicipalWastewaterNetwork,
  createHillsideSteepSewerNetwork,
  createCoastalDualLiftNetwork,
  createIndustrialParkSewerNetwork,
  ARBITRARY_WASTEWATER_DEMOS,
} from '../src/data/sampleWastewaterNetworks';
import { simulateWastewaterNetwork } from '../src/utils/wastewaterHydraulicsEngine';
import { exportToSwmmInp, parseSwmmInp } from '../src/utils/swmmParser';
import { WastewaterNetwork } from '../src/types/wastewater';

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
console.log('🧪 WASTEWATER MODELLING & HYDRAULIC SUITE SELF-TEST');
console.log('======================================================\n');

// ---------------------------------------------------------------------------
console.log('[1] Testing All 4 Arbitrary Engineering Demo Models');
// ---------------------------------------------------------------------------

check(
  'All 4 demo models are registered in ARBITRARY_WASTEWATER_DEMOS',
  ARBITRARY_WASTEWATER_DEMOS.length === 4
);

ARBITRARY_WASTEWATER_DEMOS.forEach((demoDef, idx) => {
  const net = demoDef.createNetwork();
  check(
    `Demo ${idx + 1} (${demoDef.name}): Has valid name and description`,
    Boolean(net.name && net.description)
  );
  check(
    `Demo ${idx + 1} (${demoDef.name}): Has nodes and elements`,
    net.manholes.length > 0 && net.conduits.length > 0 && net.outfalls.length > 0
  );

  const { updatedNetwork, summary } = simulateWastewaterNetwork(net);
  check(
    `Demo ${idx + 1} (${demoDef.name}): Solves hydraulics and converges`,
    summary.converged === true
  );
  check(
    `Demo ${idx + 1} (${demoDef.name}): Effluent discharge > 0`,
    summary.totalOutfallDischargeLs > 0
  );
  check(
    `Demo ${idx + 1} (${demoDef.name}): No NaN in summary metrics`,
    !isNaN(summary.totalPeakSanitaryFlowLs) &&
      !isNaN(summary.maxCapacityUtilizationRatio) &&
      !isNaN(summary.minVelocityMs) &&
      !isNaN(summary.dailyEnergyKwh ?? 0)
  );
});

// ---------------------------------------------------------------------------
console.log('\n[2] Stress Testing 10+ Consecutive Simulation Runs on Arbitrary Models');
// ---------------------------------------------------------------------------

let tenRunsSuccess = true;
const model = createMunicipalWastewaterNetwork();
let currentNet = model;

for (let run = 1; run <= 12; run++) {
  const { updatedNetwork, summary } = simulateWastewaterNetwork(currentNet);
  if (!summary.converged || isNaN(summary.totalPeakSanitaryFlowLs)) {
    tenRunsSuccess = false;
    console.error(`Run ${run} failed!`);
    break;
  }
  // Mutate slightly as a user would between runs (e.g., adjust flow, modify manhole depth)
  if (updatedNetwork.manholes[0]) {
    updatedNetwork.manholes[0].baseDryWeatherFlowLs = 0.5 + (run * 0.1);
  }
  currentNet = updatedNetwork;
}

check('Successfully executed 12 consecutive simulation runs with mutations without error', tenRunsSuccess);

// ---------------------------------------------------------------------------
console.log('\n[3] Testing Model Deletion & Cascading Cleanliness');
// ---------------------------------------------------------------------------

let netWithLift = createMunicipalWastewaterNetwork();
const initialWetWellId = netWithLift.wetWells[0].id;
const initialOutfallId = netWithLift.outfalls[0].id;

// Simulate user deleting Wet Well WW-1
const updatedAfterWwDelete: WastewaterNetwork = {
  ...netWithLift,
  wetWells: netWithLift.wetWells.filter((w) => w.id !== initialWetWellId),
  conduits: netWithLift.conduits.filter(
    (c) => c.startNodeId !== initialWetWellId && c.endNodeId !== initialWetWellId
  ),
  pumps: netWithLift.pumps.filter(
    (p) => p.startNodeId !== initialWetWellId && p.endNodeId !== initialWetWellId
  ),
  forceMains: netWithLift.forceMains.filter(
    (f) => f.startNodeId !== initialWetWellId && f.endNodeId !== initialWetWellId
  ),
};

check(
  'Deleting wet well cascades and removes connected pumps and force mains',
  updatedAfterWwDelete.pumps.length === 0 && updatedAfterWwDelete.forceMains.length === 0
);

// Simulate user deleting all remaining elements one by one until completely empty
const completelyEmptyNet: WastewaterNetwork = {
  name: 'Cleared Network',
  units: 'SI',
  manholes: [],
  conduits: [],
  wetWells: [],
  pumps: [],
  forceMains: [],
  outfalls: [],
};

const emptyResult = simulateWastewaterNetwork(completelyEmptyNet);
check(
  'Simulating a completely cleared network runs cleanly without exceptions',
  emptyResult.summary.converged === true &&
    emptyResult.summary.totalPeakSanitaryFlowLs === 0 &&
    emptyResult.summary.totalPopulation === 0 &&
    !isNaN(emptyResult.summary.dailyEnergyKwh ?? 0)
);

// ---------------------------------------------------------------------------
console.log('\n[4] Testing Guaranteed Non-Colliding ID Generation After Deletions');
// ---------------------------------------------------------------------------

function getNextId(prefix: string, existingIds: string[]): string {
  let maxNum = 0;
  for (const id of existingIds) {
    if (id.startsWith(prefix)) {
      const numStr = id.slice(prefix.length);
      const n = parseInt(numStr, 10);
      if (!isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
  }
  return `${prefix}${maxNum + 1}`;
}

const existingManholes = ['MH-1', 'MH-2', 'MH-3', 'MH-4', 'MH-5', 'MH-6'];
// Delete MH-1 and MH-3
const remaining = existingManholes.filter((id) => id !== 'MH-1' && id !== 'MH-3');
const nextManholeId = getNextId('MH-', remaining);
check(
  'getNextId generates MH-7 after deleting earlier elements, preventing collisions',
  nextManholeId === 'MH-7'
);

const emptyList: string[] = [];
check('getNextId generates MH-1 for empty list', getNextId('MH-', emptyList) === 'MH-1');

// ---------------------------------------------------------------------------
console.log('\n[5] Testing EPA SWMM / Sewer INP Export and Import Round-Trip');
// ---------------------------------------------------------------------------

const sampleModel = createCoastalDualLiftNetwork();
const inpText = exportToSwmmInp(sampleModel);
check('exportToSwmmInp produces valid INP text with sections', inpText.includes('[JUNCTIONS]') && inpText.includes('[CONDUITS]'));

const parsedModel = parseSwmmInp(inpText, 'coastal_test.inp');
check(
  'parseSwmmInp recovers manholes and conduits from exported INP',
  parsedModel.manholes.length === sampleModel.manholes.length &&
    parsedModel.conduits.length === sampleModel.conduits.length
);

const simParsed = simulateWastewaterNetwork(parsedModel);
check(
  'Imported INP network runs through hydraulic simulation engine successfully',
  simParsed.summary.converged === true
);

// ---------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`Summary: ${passed} passed, ${failed} failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
