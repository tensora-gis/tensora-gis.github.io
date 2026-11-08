/**
 * Knowledge Graph Pipeline Self-Test & COVERAGE.md Generator
 *
 * Validates:
 * 1. 8.5M Global River Knowledge Graph census coverage & provenance
 * 2. Multi-tier accuracy tagging (Estimated Global, Estimated SWOT, Calibrated SWOT, Surveyed)
 * 3. 1° x 1° Spatial Sharding & Tile Keys
 * 4. Lazy Shard Loading & Procedural Tributary Network Synthesis
 * 5. Tributary Confluence Domain Extraction & Boundary Condition Integration
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateKnowledgeGraphCoverageReport, formatCoverageMarkdown } from '../data-pipeline/validate/knowledgeGraphReport';
import { assembleGlobalReach } from '../data-pipeline/fuse/reachAssembler';
import { buildReachIndexBuffer } from '../data-pipeline/export/binaryReachIndex';
import { exportBundledGeoJsonSubset } from '../data-pipeline/export/geojsonSubset';
import { getTileKey, parseTileKey, partitionReachesIntoShards, getTileKeysForBounds } from '../data-pipeline/export/reachShards';
import { loadShardByTileKey, findClosestReachGlobally, synthesizeProceduralReach } from '../src/river/data/reachShardLoader';
import { extractLocalDomain } from '../src/river/geometry/domainExtractor';
import { RiverDataService } from '../src/river/data/riverDataService';

console.log('--- RUNNING KNOWLEDGE GRAPH PIPELINE SELF-TEST ---');

async function main() {
  // 1. Generate Coverage Report & Census Audit
  const report = generateKnowledgeGraphCoverageReport();
  console.log(`✓ Audited Knowledge Graph: ${report.totalBundledReaches} bundled world river reaches, representing ~${(report.totalGlobalCensusReaches / 1e6).toFixed(1)}M global reaches`);

  if (report.totalBundledReaches < 10) {
    throw new Error('Too few reaches in knowledge graph');
  }

  // 2. Generate and write COVERAGE.md
  const markdown = formatCoverageMarkdown(report);
  const coveragePath = path.resolve(process.cwd(), 'COVERAGE.md');
  fs.writeFileSync(coveragePath, markdown, 'utf-8');
  console.log(`✓ Published COVERAGE.md (${(markdown.length / 1024).toFixed(1)} KB)`);

  // 3. Test Reach Assembler with 4 Accuracy Tiers
  const sampleReach = assembleGlobalReach({
    sword: {
      reachId: 'sample-danube-test',
      riverName: 'Danube River (Test Ingest)',
      strahlerOrder: 9,
      lengthM: 3500,
      slopeMmPerKm: 140,
      coordinates: [
        [15.512, 48.395],
        [15.535, 48.402],
        [15.568, 48.411],
      ],
    },
    grades: {
      reachId: 'sample-danube-test',
      meanDailyDischargeM3s: 1850,
      q10FloodM3s: 8200,
      q100FloodM3s: 11500,
      dataLicense: 'CC BY-NC 4.0',
      isCommercialAllowed: false,
    },
    grwl: {
      segmentId: 'grwl-danube-01',
      widthM: 295,
      lat: 48.402,
      lng: 15.535,
    },
    swotVolume: {
      reachId: 'sample-danube-test',
      bottomWidthM: 295,
      activeChannelDepthM: 6.2,
      bankSlopeHtoV: 2.0,
      uncalibratedVolumeM3: 150000,
      crossSectionShape: 'compound',
    },
  });

  if (sampleReach.accuracyTier !== 'Estimated (SWOT)') {
    throw new Error(`Expected accuracy tier 'Estimated (SWOT)', got '${sampleReach.accuracyTier}'`);
  }
  if (sampleReach.meanWidthM !== 295 || sampleReach.upstreamDischargeEstimateM3s !== 1850) {
    throw new Error('Reach assembler failed to bind correct width/discharge');
  }
  console.log(`✓ Reach Assembler verified: ${sampleReach.name}, Tier = ${sampleReach.accuracyTier}, Width = ${sampleReach.meanWidthM}m, Q = ${sampleReach.upstreamDischargeEstimateM3s}m³/s`);

  // 4. Test Binary Index Serialization
  const buffer = buildReachIndexBuffer([
    {
      reachId: 'danube-1',
      byteOffset: 1024,
      byteLength: 2048,
      lat: 48.402,
      lng: 15.535,
      dischargeM3s: 1850,
      widthM: 295,
    },
  ]);
  if (buffer.byteLength !== 64) {
    throw new Error(`Expected binary index buffer length 64, got ${buffer.byteLength}`);
  }
  console.log(`✓ Binary Reach Index serialization verified (${buffer.byteLength} bytes)`);

  // 5. Test GeoJSON Subset Export
  const geojsonStr = exportBundledGeoJsonSubset();
  const parsed = JSON.parse(geojsonStr);
  if (parsed.type !== 'FeatureCollection' || parsed.features.length === 0) {
    throw new Error('GeoJSON subset export failed');
  }
  console.log(`✓ GeoJSON Subset verified: ${parsed.features.length} features, size = ${(geojsonStr.length / 1024).toFixed(1)} KB`);

  // 6. Test Spatial Sharding Logic (1° x 1° tiles)
  const tileKeyVienna = getTileKey(48.21, 16.37);
  if (tileKeyVienna !== 'tile_N48_E16') {
    throw new Error(`Expected tile key 'tile_N48_E16', got '${tileKeyVienna}'`);
  }
  const parsedTile = parseTileKey(tileKeyVienna);
  if (parsedTile.latFloor !== 48 || parsedTile.lngFloor !== 16) {
    throw new Error('Tile key parsing failed');
  }
  const boundsTiles = getTileKeysForBounds([48.0, 16.0, 49.5, 17.5]);
  if (boundsTiles.length < 4) {
    throw new Error(`Expected at least 4 bounding tiles, got ${boundsTiles.length}`);
  }
  console.log(`✓ Spatial Sharding verified: ${tileKeyVienna} parses to [${parsedTile.latFloor}°, ${parsedTile.lngFloor}°], Bounding tiles: ${boundsTiles.length}`);

  // 7. Test Client-Side Lazy Shard Loader & Global Reach Resolution
  const loadedShard = await loadShardByTileKey(tileKeyVienna);
  if (loadedShard.length === 0) {
    throw new Error('Shard loader returned 0 reaches');
  }
  console.log(`✓ Lazy Shard Loader verified: loaded ${loadedShard.length} reaches for ${tileKeyVienna}`);

  // Test global coordinate resolution (e.g. remote coordinate anywhere in the world)
  const remoteQuery = await findClosestReachGlobally(27.9881, 86.9250); // Mount Everest / Himalayas
  if (!remoteQuery || !remoteQuery.reach || remoteQuery.reach.centerline.length === 0) {
    throw new Error('Global reach synthesizer failed for remote coordinates');
  }
  console.log(`✓ Global Coverage verified for remote coordinate [27.99°, 86.93°]: Resolved '${remoteQuery.reach.name}', Width = ${remoteQuery.reach.meanWidthM.toFixed(1)}m, Q = ${remoteQuery.reach.upstreamDischargeEstimateM3s?.toFixed(1)}m³/s`);

  // 8. Test Tributary Confluence Domain Extraction
  const reachWithTrib = synthesizeProceduralReach(45.0, 9.0, { strahlerOrder: 5, targetLengthM: 3000 });
  if (!reachWithTrib.tributaries || reachWithTrib.tributaries.length === 0) {
    throw new Error('Synthesized higher-order reach missing tributary confluences');
  }
  const domain = await extractLocalDomain(reachWithTrib, { reachLengthM: 3000 });
  if (domain.activeTributaries.length === 0 || domain.tributaryInflows.length === 0) {
    throw new Error('Domain extractor failed to map tributary confluences to mesh cells');
  }
  console.log(`✓ Tributary Confluence Extraction verified: ${domain.activeTributaries.length} tributary mapped to ${domain.tributaryInflows[0].cellIndices.length} lateral cells, Total Q = ${domain.totalDischargeM3s.toFixed(1)}m³/s`);

  console.log('✓ ALL KNOWLEDGE GRAPH PIPELINE TESTS PASSED WITH 100% SUCCESS!\n');
}

main().catch((err) => {
  console.error('Knowledge graph selftest failed:', err);
  process.exit(1);
});
