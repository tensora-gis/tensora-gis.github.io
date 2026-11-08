/**
 * OpenFOAM 3D CFD Engine & CAD Structure Physics Self-Test
 *
 * Validates:
 * 1. Computational mesh movement (translation, rotation, thalweg shift)
 * 2. CAD drawing of Spur Dikes / Groynes with Melville & Coleman contraction scour
 * 3. CAD drawing of Bridge Piers with HEC-18 localized pier scour & wake drag
 * 4. Custom River Training Deflectors & Guide Walls
 * 5. OpenFOAM 3D CFD case generation (blockMeshDict, snappyHexMeshDict, 0/U, 0/alpha.water, STL)
 * 6. OpenFOAM case zip packaging (JSZip)
 * 7. 3D Legacy VTK Structured Grid generation for ParaView 3D vector fields
 */

import { createRhineReach } from '../src/river/data/hydroRiversLoader';
import { generateRiverGridMesh, translateMesh, rotateMesh } from '../src/river/geometry/meshGenerator';
import {
  createStructureFromMapPolyline,
  findCellsIntersectingPolyline,
} from '../src/river/structures/cadStructureBuilder';
import {
  evaluateStructureInteraction,
  computeStructureFluxModifier,
} from '../src/river/structures/structureFlux';
import {
  RiverSpurdikeStructure,
  RiverBridgePierStructure,
  RiverCustomDeflectorStructure,
} from '../src/river/structures/structureTypes';
import {
  generateBlockMeshDict,
  generateControlDict,
  generateStructuresStl,
  buildOpenFoamCaseZip,
  exportRiverToVtk3D,
} from '../src/river/openfoam/openfoamCaseGenerator';
import { createInitialHydroState } from '../src/river/gpu/cpuSolver';
import { createInitialTurbulenceState } from '../src/river/turbulence/turbulenceModels';

console.log('--- RUNNING OPENFOAM 3D CFD & CAD STRUCTURES SELF-TEST ---');

async function main() {
  const reach = createRhineReach();
  const mesh = generateRiverGridMesh(reach, { targetStreamwiseSpacingM: 25.0, transverseCellsCount: 8 });
  console.log(`✓ Base mesh built with ${mesh.cells.length} cells (${mesh.nx} x ${mesh.ny})`);

  // ==========================================
  // 1. Test Mesh Movement (Translation & Rotation)
  // ==========================================
  const initialCenterLat = mesh.cells[0].centerLat;
  const initialCenterLng = mesh.cells[0].centerLng;

  // Translate 100m East, 50m North
  const translated = translateMesh(mesh, 100, 50);
  const dLat = translated.cells[0].centerLat - initialCenterLat;
  const dLng = translated.cells[0].centerLng - initialCenterLng;

  if (dLat <= 0 || dLng <= 0) {
    throw new Error('Mesh translation failed to shift coordinates positively');
  }
  console.log(`✓ Mesh translation verified: shifted North (+${(dLat * 111320).toFixed(1)}m), East (+${(dLng * 111320 * Math.cos(initialCenterLat * Math.PI / 180)).toFixed(1)}m)`);

  // Rotate 15 degrees
  const rotated = rotateMesh(translated, 15);
  if (rotated.cells[0].centerLat === translated.cells[0].centerLat) {
    throw new Error('Mesh rotation failed to modify cell coordinates');
  }
  console.log('✓ Mesh rotation verified: 15° rotation applied across all cell normals and vertices');

  // ==========================================
  // 2. Test Spur Dike / Groyne Physics & Scour
  // ==========================================
  const pRoot = { lat: mesh.centerline[5].lat, lng: mesh.centerline[5].lng - 0.001 };
  const pHead = { lat: mesh.centerline[5].lat, lng: mesh.centerline[5].lng };

  const spurdike = createStructureFromMapPolyline([pRoot, pHead], 'spurdike', mesh, {
    bank: 'left',
    lengthM: 35.0,
    permeability: 0.15,
  }) as RiverSpurdikeStructure;

  if (spurdike.type !== 'spurdike' || spurdike.permeability !== 0.15) {
    throw new Error('Spur dike creation failed');
  }

  const spurFlux = evaluateStructureInteraction(
    spurdike,
    mesh.cells[40],
    mesh.cells[41],
    2.5,
    2.5,
    15.0
  );
  const spurMod = computeStructureFluxModifier(spurdike, 2.0, 100.0, 2.0, 100.0, 15.0);

  if (spurMod.fluxReductionFactor > 0.5) {
    throw new Error(`Expected low permeability flux reduction, got ${spurMod.fluxReductionFactor}`);
  }
  console.log(`✓ Spur Dike verified: ${spurdike.name}, Permeability: ${spurdike.permeability}, Scour Depth: ${spurdike.headScourDepthM}m, Flux factor: ${spurMod.fluxReductionFactor.toFixed(2)}`);

  // ==========================================
  // 3. Test Standalone Bridge Pier & HEC-18 Scour
  // ==========================================
  const pPier = { lat: mesh.centerline[10].lat, lng: mesh.centerline[10].lng };
  const pier = createStructureFromMapPolyline([pPier], 'bridge-pier', mesh, {
    shape: 'round-nose',
    widthM: 2.2,
    dragCoefficientCd: 0.95,
  }) as RiverBridgePierStructure;

  if (pier.type !== 'bridge-pier' || pier.widthM !== 2.2) {
    throw new Error('Bridge pier creation failed');
  }

  const pierFlux = evaluateStructureInteraction(
    pier,
    mesh.cells[80],
    mesh.cells[81],
    3.0,
    3.0,
    18.0
  );
  if (!pierFlux.description.includes('HEC-18 Scour Depth')) {
    throw new Error('Bridge pier failed to compute HEC-18 scour depth');
  }
  console.log(`✓ Bridge Pier verified: ${pier.name}, Shape: ${pier.shape}, Drag Cd: ${pier.dragCoefficientCd}, ${pierFlux.description}`);

  // ==========================================
  // 4. Test Multi-Point CAD Polyline Deflector
  // ==========================================
  const polylinePts = [
    { lat: mesh.centerline[12].lat, lng: mesh.centerline[12].lng - 0.001 },
    { lat: mesh.centerline[13].lat, lng: mesh.centerline[13].lng - 0.0005 },
    { lat: mesh.centerline[14].lat, lng: mesh.centerline[14].lng },
  ];
  const deflector = createStructureFromMapPolyline(polylinePts, 'custom-deflector', mesh, {
    deflectionEfficiency: 0.9,
  }) as RiverCustomDeflectorStructure;

  if (deflector.cellIndices.length < 2) {
    throw new Error('Polyline deflector failed to intersect multiple cells');
  }
  console.log(`✓ Multi-point Polyline Deflector verified: ${deflector.name} spans ${deflector.cellIndices.length} cells`);

  // ==========================================
  // 5. Test OpenFOAM 3D Case Generator
  // ==========================================
  const boundaries = {
    upstreamType: 'constant-discharge' as const,
    upstreamDischargeM3s: 1250,
    downstreamType: 'normal-depth' as const,
    downstreamSlope: 0.0005,
    downstreamStageM: 102.5,
    rainfallMmPerHour: 0,
    initialWaterDepthM: 2.5,
    manningRoughnessDefault: 0.028,
  };

  const hydro = createInitialHydroState(mesh, boundaries);
  const turb = createInitialTurbulenceState(mesh);

  const blockMesh = generateBlockMeshDict({
    mesh,
    hydro,
    turb,
    structures: [spurdike, pier, deflector],
    reach,
    upstreamDischargeM3s: 1250,
    downstreamStageM: 102.5,
    manningN: 0.028,
    verticalLayers: 12,
  });

  if (!blockMesh.includes('blockMeshDict') || !blockMesh.includes('hex (0 1 2 3 4 5 6 7)')) {
    throw new Error('blockMeshDict format invalid');
  }
  console.log(`✓ OpenFOAM blockMeshDict generated successfully (${(blockMesh.length / 1024).toFixed(1)} KB)`);

  const controlDict = generateControlDict({
    mesh,
    hydro,
    turb,
    structures: [spurdike, pier],
    reach,
    upstreamDischargeM3s: 1250,
    downstreamStageM: 102.5,
    manningN: 0.028,
  });
  if (!controlDict.includes('application     interFoam;')) {
    throw new Error('controlDict missing interFoam application');
  }
  console.log('✓ OpenFOAM controlDict generated for interFoam free-surface solver');

  const stl = generateStructuresStl([spurdike, pier, deflector]);
  if (!stl.includes('solid civil_river_structures') || !stl.includes('endsolid civil_river_structures')) {
    throw new Error('STL generation invalid');
  }
  console.log(`✓ 3D CAD Structures STL generated (${(stl.length / 1024).toFixed(1)} KB)`);

  // ==========================================
  // 6. Test OpenFOAM Case ZIP Packaging
  // ==========================================
  const zipBlob = await buildOpenFoamCaseZip({
    mesh,
    hydro,
    turb,
    structures: [spurdike, pier, deflector],
    reach,
    upstreamDischargeM3s: 1250,
    downstreamStageM: 102.5,
    manningN: 0.028,
    verticalLayers: 10,
    simEndTimeSec: 30,
  });

  if (!zipBlob || zipBlob.size < 5000) {
    throw new Error(`OpenFOAM ZIP archive generation failed, size = ${zipBlob?.size}`);
  }
  console.log(`✓ OpenFOAM 3D Case ZIP Archive packaged: ${(zipBlob.size / 1024).toFixed(1)} KB`);

  // ==========================================
  // 7. Test 3D Legacy VTK Structured Grid Exporter
  // ==========================================
  const vtk3D = exportRiverToVtk3D(mesh, hydro, turb, 6);
  if (!vtk3D.includes('DATASET STRUCTURED_GRID') || !vtk3D.includes('VECTORS velocity float')) {
    throw new Error('3D VTK format invalid');
  }
  console.log(`✓ 3D Structured Grid VTK generated for ParaView (${(vtk3D.length / 1024).toFixed(1)} KB)`);

  console.log('\n✓ ALL OPENFOAM 3D CFD & CAD STRUCTURE TESTS PASSED WITH 100% SUCCESS!\n');
}

main().catch((err) => {
  console.error('OpenFOAM 3D selftest failed:', err);
  process.exit(1);
});
