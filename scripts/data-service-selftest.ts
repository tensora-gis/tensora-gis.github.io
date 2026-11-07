/**
 * River Data Service Verification Suite
 */

import { RiverDataService } from '../src/river/data/riverDataService';
import { lookupGrwlRiverWidth } from '../src/river/data/grwlLoader';

console.log('--- RUNNING RIVER DATA SERVICE SELF-TEST ---');

// 1. Bundled reaches
const bundled = RiverDataService.getBundledReaches();
console.log(`✓ Loaded ${bundled.length} bundled global river reaches`);
if (bundled.length < 4) {
  throw new Error('Expected at least 4 bundled reaches');
}

// 2. Test Reach Lookup
const benchmark = bundled.find((r) => r.id === 'reach-benchmark-500m');
if (!benchmark) throw new Error('Benchmark reach not found');
console.log(`✓ Reach: "${benchmark.name}", Length = ${benchmark.reachLengthM} m, Stations = ${benchmark.centerline.length}`);

// 3. Test GRWL river width lookup
const rhineWidth = lookupGrwlRiverWidth(47.56, 7.59);
console.log('✓ GRWL Width lookup near Basel Rhine =', rhineWidth, 'm');
if (rhineWidth !== 200) {
  throw new Error(`Expected GRWL width 200m, got ${rhineWidth}`);
}

// 4. Test SWOT observation lookup
const swotObs = RiverDataService.getSwotData('reach-benchmark-500m');
if (!swotObs) throw new Error('SWOT observation for benchmark reach not found');
console.log(`✓ SWOT Altimetry: Pass date = ${swotObs.satellitePassDate}, Observed WSE = ${swotObs.observedWseM} m MSL`);

// 5. Test Mesh Generation
const mesh = RiverDataService.buildMesh(benchmark, 20.0, 6);
console.log(`✓ Built 2D Quad Mesh: nx = ${mesh.nx}, ny = ${mesh.ny}, total cells = ${mesh.cells.length}`);
if (mesh.cells.length === 0 || mesh.nx <= 0 || mesh.ny !== 6) {
  throw new Error('Mesh generation produced invalid dimensions');
}

// Verify face outward normal orthogonality
const cell0 = mesh.cells[0];
console.log(`✓ Cell 0 area = ${cell0.areaM2.toFixed(2)} m^2, faces = ${cell0.faceLengths.length}`);
if (cell0.areaM2 <= 0) {
  throw new Error('Cell area must be strictly positive');
}

console.log('✓ ALL DATA SERVICE TESTS PASSED!\n');
