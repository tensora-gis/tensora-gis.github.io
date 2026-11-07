/**
 * Global River Search & Real Reach Ingestion Verification Suite
 */

import {
  searchGlobalRivers,
  buildRealWorldRiverReach,
  FAMOUS_GLOBAL_RIVERS,
} from '../src/river/data/globalRiverSearchService';

console.log('--- RUNNING GLOBAL RIVER SEARCH SELF-TEST ---');

async function run() {
  // 1. Curated Global Rivers
  console.log(`✓ Loaded ${FAMOUS_GLOBAL_RIVERS.length} curated major world rivers`);
  if (FAMOUS_GLOBAL_RIVERS.length < 8) {
    throw new Error('Expected at least 8 curated global rivers');
  }

  // 2. Search local query
  const amazonResults = await searchGlobalRivers('Amazon');
  console.log(`✓ Searched "Amazon" -> Found ${amazonResults.length} matches. Top: ${amazonResults[0].name} (${amazonResults[0].country})`);
  if (amazonResults.length === 0 || !amazonResults[0].name.includes('Amazon')) {
    throw new Error('Amazon river search failed');
  }

  // 3. Search Rhine query
  const rhineResults = await searchGlobalRivers('Rhine');
  console.log(`✓ Searched "Rhine" -> Found ${rhineResults.length} matches.`);

  // 4. Test Real-World Reach Building with Copernicus DEM
  console.log('✓ Testing real river reach construction for Danube River (Wachau Valley)...');
  const danube = FAMOUS_GLOBAL_RIVERS.find((r) => r.name.includes('Danube')) || FAMOUS_GLOBAL_RIVERS[1];
  const realReach = await buildRealWorldRiverReach(
    danube.id,
    danube.name,
    danube.lat,
    danube.lng,
    {
      reachLengthM: 2500,
      meanWidthM: danube.estimatedWidthM,
      dischargeM3s: danube.estimatedDischargeM3s,
    }
  );

  console.log(`✓ Built Real Reach: "${realReach.name}", Stations: ${realReach.centerline.length}, Mean Width: ${realReach.meanWidthM} m`);
  console.log(`  - Upstream Bed Elev: ${realReach.centerline[0].bedElevationM?.toFixed(1)} m`);
  console.log(`  - Downstream Bed Elev: ${realReach.centerline[realReach.centerline.length - 1].bedElevationM?.toFixed(1)} m`);
  console.log(`  - Discharge: ${realReach.upstreamDischargeEstimateM3s} m^3/s`);

  if (!realReach.centerline || realReach.centerline.length < 2) {
    throw new Error('Reach construction failed to build centerline');
  }

  console.log('✓ ALL GLOBAL RIVER INGESTION TESTS PASSED!\n');
}

run().catch((err) => {
  console.error('Self-test error:', err);
  process.exit(1);
});
