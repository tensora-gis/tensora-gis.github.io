/**
 * Knowledge Graph Pipeline Self-Test & COVERAGE.md Generator
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateKnowledgeGraphCoverageReport, formatCoverageMarkdown } from '../data-pipeline/validate/knowledgeGraphReport';
import { assembleGlobalReach } from '../data-pipeline/fuse/reachAssembler';
import { buildReachIndexBuffer } from '../data-pipeline/export/binaryReachIndex';
import { exportBundledGeoJsonSubset } from '../data-pipeline/export/geojsonSubset';

console.log('--- RUNNING KNOWLEDGE GRAPH PIPELINE SELF-TEST ---');

async function main() {
  // 1. Generate Coverage Report
  const report = generateKnowledgeGraphCoverageReport();
  console.log(`✓ Audited Knowledge Graph: ${report.totalReaches} world river reaches across ${Object.keys(report.byContinent).length} continents`);

  if (report.totalReaches < 10) {
    throw new Error('Too few reaches in knowledge graph');
  }

  // 2. Generate and write COVERAGE.md
  const markdown = formatCoverageMarkdown(report);
  const coveragePath = path.resolve(process.cwd(), 'COVERAGE.md');
  fs.writeFileSync(coveragePath, markdown, 'utf-8');
  console.log(`✓ Published COVERAGE.md (${(markdown.length / 1024).toFixed(1)} KB)`);

  // 3. Test Reach Assembler
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
  });

  if (sampleReach.meanWidthM !== 295 || sampleReach.upstreamDischargeEstimateM3s !== 1850) {
    throw new Error('Reach assembler failed to bind correct width/discharge');
  }
  console.log(`✓ Reach Assembler verified: ${sampleReach.name}, Width = ${sampleReach.meanWidthM}m, Q = ${sampleReach.upstreamDischargeEstimateM3s}m³/s`);

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

  console.log('✓ ALL KNOWLEDGE GRAPH PIPELINE TESTS PASSED WITH 100% SUCCESS!\n');
}

main().catch((err) => {
  console.error('Knowledge graph selftest failed:', err);
  process.exit(1);
});
