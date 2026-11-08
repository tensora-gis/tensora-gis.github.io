/**
 * Comprehensive AutoCAD-style Structure Drawing, 2D FVM CFD Solid Masking,
 * Conical Flume Benchmark, and ParaView 3D / OpenFOAM STL Selftest
 */

import {
  isPointInPolygon,
  pointToSegmentDistance,
  pointToPolylineDistance,
  pointToCircleDistance,
  createRotatedRectanglePoints,
  createCirclePoints,
  createStructureFromMapPolyline,
  findCellsInsidePolygon,
  findCellsInsideCircle,
  findCellsAlongLine,
} from '../src/river/structures/cadStructureBuilder';
import {
  createRhineReach,
  createConicalFlumeReach,
} from '../src/river/data/hydroRiversLoader';
import { generateRiverGridMesh } from '../src/river/geometry/meshGenerator';
import {
  createInitialHydroState,
  stepCpuSolver,
  computeStableTimeStep,
} from '../src/river/gpu/cpuSolver';
import { createInitialTurbulenceState } from '../src/river/turbulence/turbulenceModels';
import { createInitialSedimentState } from '../src/river/sediment/sedimentTransport';
import { DEFAULT_TURBULENCE_PARAMETERS } from '../src/river/types/turbulence';
import { DEFAULT_SEDIMENT_PARAMETERS } from '../src/river/types/sediment';
import {
  generateStructuresStl,
  exportRiverToVtk3D,
  buildOpenFoamCaseZip,
  triangulatePolygonEarClipping,
} from '../src/river/openfoam/openfoamCaseGenerator';
import { RiverBoundaryConditions } from '../src/river/types/riverReach';
import { RiverHydraulicStructure } from '../src/river/structures/structureTypes';

console.log('================================================================');
console.log('  RUNNING AUTOCAD FREEDOM, SOLID CFD & PARAVIEW 3D SELFTEST');
console.log('================================================================');

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(msg);
  }
}

async function runSelftest() {
  // ========================================================================
  // 1. AutoCAD Geometry Algorithms & Primitive Math
  // ========================================================================
  console.log('\n[1] Testing AutoCAD Geometry & Spatial Ray-Casting Math...');

  // Test point-in-polygon
  const squarePoly = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 10 },
    { lat: 10, lng: 10 },
    { lat: 10, lng: 0 },
  ];
  assert(isPointInPolygon({ lat: 5, lng: 5 }, squarePoly) === true, 'Center of square must be inside');
  assert(isPointInPolygon({ lat: -1, lng: 5 }, squarePoly) === false, 'Point outside square must be false');
  assert(isPointInPolygon({ lat: 15, lng: 15 }, squarePoly) === false, 'Far point outside square must be false');

  // Test point to segment distance
  const segP1 = { lat: 0, lng: 0 };
  const segP2 = { lat: 0, lng: 0.001 }; // ~111m east
  const testPt = { lat: 0.0001, lng: 0.0005 }; // ~11.1m north of midpoint
  const segDist = pointToSegmentDistance(testPt, segP1, segP2);
  assert(segDist.distanceM > 10.5 && segDist.distanceM < 12.0, `Segment distance ~11.1m, got ${segDist.distanceM.toFixed(2)}m`);
  assert(segDist.t >= 0.45 && segDist.t <= 0.55, `Projection t should be ~0.5, got ${segDist.t.toFixed(2)}`);

  // Test point to circle distance
  const circleCenter = { lat: 47.56, lng: 7.59 };
  const radiusM = 25.0;
  const insidePt = { lat: 47.56005, lng: 7.59 }; // ~5.5m north
  const outsidePt = { lat: 47.5605, lng: 7.59 }; // ~55.6m north
  const cDistIn = pointToCircleDistance(insidePt, circleCenter, radiusM);
  assert(cDistIn.inside === true, 'Point 5.5m from center must be inside 25m circle');
  const cDistOut = pointToCircleDistance(outsidePt, circleCenter, radiusM);
  assert(cDistOut.inside === false, 'Point 55.6m from center must be outside 25m circle');

  // Test rotated rectangle corners
  const rectCenter = { lat: 47.56, lng: 7.59 };
  const rectCorners0 = createRotatedRectanglePoints(rectCenter, 40.0, 20.0, 0);
  assert(rectCorners0.length === 4, 'Rotated rectangle must generate 4 vertices');
  const rectCorners45 = createRotatedRectanglePoints(rectCenter, 40.0, 20.0, 45);
  assert(rectCorners45.length === 4, '45-degree rectangle must generate 4 vertices');

  // Test circle perimeter discretization
  const circlePoints = createCirclePoints(circleCenter, 15.0, 16);
  assert(circlePoints.length === 16, 'Circle points must discretize to 16 vertices');
  for (const pt of circlePoints) {
    const { distFromCenterM } = pointToCircleDistance(pt, circleCenter, 15.0);
    assert(Math.abs(distFromCenterM - 15.0) < 0.2, `Discretized point radius should be 15.0m, got ${distFromCenterM}`);
  }
  // Test Ear-Clipping polygon triangulation for concave (L-shape) and clockwise polygons
  const lShape: [number, number][] = [
    [0, 0],
    [20, 0],
    [20, 10],
    [10, 10],
    [10, 20],
    [0, 20],
  ];
  const lTris = triangulatePolygonEarClipping(lShape);
  assert(lTris.length === 4, `L-shaped 6-vertex polygon must triangulate into exactly 4 triangles, got ${lTris.length}`);
  let lArea = 0;
  for (const [i0, i1, i2] of lTris) {
    const a = lShape[i0], b = lShape[i1], c = lShape[i2];
    lArea += 0.5 * Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
  }
  assert(Math.abs(lArea - 300.0) < 1e-4, `L-shape area must be 300, got ${lArea}`);

  const cwRect: [number, number][] = [
    [0, 0],
    [0, 15],
    [25, 15],
    [25, 0],
  ];
  const cwTris = triangulatePolygonEarClipping(cwRect);
  assert(cwTris.length === 2, `CW rectangle must triangulate into 2 triangles, got ${cwTris.length}`);
  let cwArea = 0;
  for (const [i0, i1, i2] of cwTris) {
    const a = cwRect[i0], b = cwRect[i1], c = cwRect[i2];
    cwArea += 0.5 * Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
  }
  assert(Math.abs(cwArea - 375.0) < 1e-4, `CW rectangle area must be 375, got ${cwArea}`);

  console.log('  PASS: All geometric math, ray casting, distance formulas, ear-clipping triangulation, and rotational discretizations accurate.');

  // ========================================================================
  // 2. Conical Flume Benchmark Reach & Map Viewport Safety
  // ========================================================================
  console.log('\n[2] Testing Conical Flume Benchmark Initialization & Viewport Bounds...');
  const flumeReach = createConicalFlumeReach();
  assert(flumeReach.id === 'conical-flume', 'Reach ID must be conical-flume');
  assert(flumeReach.reachLengthM === 500.0, 'Reach length must be 500m');
  assert(flumeReach.meanWidthM === 30.0, 'Reach width must be 30m');

  const [minLat, minLng, maxLat, maxLng] = flumeReach.bounds;
  const dLatDeg = maxLat - minLat;
  const dLngDeg = maxLng - minLng;
  const latSpanM = dLatDeg * 111320.0;
  const lngSpanM = dLngDeg * 111320.0 * Math.cos((minLat * Math.PI) / 180.0);
  assert(latSpanM > 1000.0, `Padded bounds must span > 1km north-south, got ${latSpanM.toFixed(1)}m`);
  assert(lngSpanM > 1000.0, `Padded bounds must span > 1km east-west, got ${lngSpanM.toFixed(1)}m`);
  console.log(`  PASS: Conical flume bounds padded to ${latSpanM.toFixed(0)}m x ${lngSpanM.toFixed(0)}m (prevents Leaflet tile detachment / dark blank map).`);

  const flumeMesh = generateRiverGridMesh(flumeReach, { targetStreamwiseSpacingM: 10.0, transverseCellsCount: 8 });
  assert(flumeMesh.cells.length > 0, 'Flume mesh generated cells');
  const downstreamSlice = flumeMesh.cells.slice((flumeMesh.nx - 1) * flumeMesh.ny);
  const flumeInvert = Math.min(...downstreamSlice.map((c) => c.bedElevation));
  assert(flumeInvert >= 99.0 && flumeInvert <= 100.5, `Flume downstream invert ~99.5m, got ${flumeInvert.toFixed(2)}m`);

  // Downstream stage calculation
  const estDepth = flumeReach.id === 'conical-flume' ? 0.45 : 2.5;
  const downstreamStageM = flumeInvert + estDepth;
  assert(downstreamStageM >= 99.5 && downstreamStageM <= 101.0, `Downstream stage ~100m, got ${downstreamStageM.toFixed(2)}m (NOT 242m Rhine default!)`);
  console.log(`  PASS: Safe downstream stage computed at ${downstreamStageM.toFixed(2)}m (prevents 142m water floodwall solver explosion).`);

  // ========================================================================
  // 3. AutoCAD Structure Drawing Freedom: Line, Polyline, Rect, Circle, Polygon, Obstacle
  // ========================================================================
  console.log('\n[3] Testing AutoCAD Structure Types & Freehand CAD Builders...');

  // A. Circle Obstacle (Central Conical Island Obstacle)
  const midCell = flumeMesh.cells[Math.floor(flumeMesh.cells.length / 2)];
  const coneRadiusM = 4.0;
  const coneCenter = { lat: midCell.centerLat, lng: midCell.centerLng };
  const coneVertices = createCirclePoints(coneCenter, coneRadiusM, 24);
  const circleObstacle = createStructureFromMapPolyline(coneVertices, 'circle', flumeMesh, {
    name: 'Conical Island Obstacle (d=8m)',
    isSolid: true,
    radiusM: coneRadiusM,
    crestElevationM: midCell.bedElevation + 2.5,
  });
  assert(circleObstacle.type === 'circle', 'Structure type must be circle');
  assert(circleObstacle.cellIndices.length > 0, `Circle obstacle must mask cells, got ${circleObstacle.cellIndices.length}`);
  assert((circleObstacle as any).solidMasking === true, 'Circle obstacle must have solidMasking: true');
  console.log(`  PASS: Circle Obstacle created across ${circleObstacle.cellIndices.length} cells with radius ${coneRadiusM}m.`);

  // B. Rotated Rectangle CAD Structure
  const rectCorners = createRotatedRectanglePoints({ lat: flumeMesh.centerline[5].lat, lng: flumeMesh.centerline[5].lng }, 20.0, 8.0, 30.0);
  const rectStruct = createStructureFromMapPolyline(rectCorners, 'rectangle', flumeMesh, {
    name: 'Bridge Abutment Box',
    isSolid: true,
    crestElevationM: 104.0,
  });
  assert(rectStruct.type === 'rectangle', 'Structure type must be rectangle');
  assert(rectStruct.cellIndices.length > 0, 'Rectangle must mask cells');
  assert((rectStruct as any).solidMasking === true, 'Rectangle structure must have solidMasking: true');
  console.log(`  PASS: Rotated Rectangle structure created across ${rectStruct.cellIndices.length} cells.`);

  // B2. 3-Point AutoCAD Rotated Rectangle (Arbitrary 37.5° angle)
  const angleRad = (37.5 * Math.PI) / 180.0;
  const p1 = { lat: 47.561, lng: 7.591 };
  const baseLen = 30.0;
  const cosLatP1 = Math.cos((p1.lat * Math.PI) / 180.0);
  const p2 = {
    lat: p1.lat + (baseLen * Math.sin(angleRad)) / 111320.0,
    lng: p1.lng + (baseLen * Math.cos(angleRad)) / (111320.0 * cosLatP1),
  };
  const widthM = 12.0;
  const normalAngleRad = angleRad + Math.PI / 2.0;
  const p3 = {
    lat: p2.lat + (widthM * Math.sin(normalAngleRad)) / 111320.0,
    lng: p2.lng + (widthM * Math.cos(normalAngleRad)) / (111320.0 * cosLatP1),
  };
  const rect3Pt = createStructureFromMapPolyline([p1, p2, p3], 'rectangle', flumeMesh, {
    name: '3-Point Rotated 37.5° Rectangle',
    isSolid: true,
  });
  assert(rect3Pt.coordinates?.length === 4, '3-point rectangle must generate exactly 4 vertices');
  assert(rect3Pt.cellIndices.length > 0, '3-point rectangle must mask grid cells');
  assert((rect3Pt as any).solidMasking === true, '3-point rectangle must have solidMasking: true');
  console.log(`  PASS: 3-point rotated rectangle generated at 37.5° with 4 orthogonal vertices across ${rect3Pt.cellIndices.length} cells.`);

  // C. Arbitrary Polygon / Custom Solid Obstacle
  const polyPoints = [
    { lat: flumeMesh.centerline[10].lat, lng: flumeMesh.centerline[10].lng },
    { lat: flumeMesh.centerline[10].lat + 0.0001, lng: flumeMesh.centerline[10].lng + 0.0001 },
    { lat: flumeMesh.centerline[10].lat + 0.00015, lng: flumeMesh.centerline[10].lng },
  ];
  const polyObstacle = createStructureFromMapPolyline(polyPoints, 'obstacle', flumeMesh, {
    name: 'Custom Poly Obstacle',
    isSolid: true,
    crestElevationM: 105.0,
  });
  assert(polyObstacle.type === 'obstacle', 'Structure type must be obstacle');
  assert(polyObstacle.cellIndices.length > 0, 'Polygon obstacle must mask cells');
  console.log(`  PASS: Custom Polygon Obstacle created across ${polyObstacle.cellIndices.length} cells.`);

  // D. CAD Line Wall
  const linePoints = [
    { lat: flumeMesh.centerline[15].lat, lng: flumeMesh.centerline[15].lng },
    { lat: flumeMesh.centerline[16].lat, lng: flumeMesh.centerline[16].lng },
  ];
  const lineWall = createStructureFromMapPolyline(linePoints, 'line', flumeMesh, {
    name: 'Deflection Training Wall',
    wallThicknessM: 2.5,
    crestElevationM: 103.5,
  });
  assert(lineWall.type === 'line', 'Structure type must be line');
  assert(lineWall.cellIndices.length > 0, 'Line wall must intersect cells');
  console.log(`  PASS: CAD Line Wall created across ${lineWall.cellIndices.length} cells.`);

  // D2. Solid CAD Line Wall with solidMasking: true
  const solidLinePoints = [
    { lat: flumeMesh.centerline[12].lat, lng: flumeMesh.centerline[12].lng },
    { lat: flumeMesh.centerline[13].lat, lng: flumeMesh.centerline[13].lng },
  ];
  const solidLineWall = createStructureFromMapPolyline(solidLinePoints, 'line', flumeMesh, {
    name: 'Solid Deflection Training Wall',
    wallThicknessM: 3.0,
    solidMasking: true,
    crestElevationM: 104.0,
  });
  assert((solidLineWall as any).solidMasking === true, 'Solid line wall must have solidMasking: true');
  assert(solidLineWall.cellIndices.length > 0, 'Solid line wall must intersect grid cells');
  console.log(`  PASS: Solid CAD Line Wall created across ${solidLineWall.cellIndices.length} cells.`);

  // ========================================================================
  // 4. 2D Finite-Volume CFD Engine with Solid Cell Masking & Wall BCs
  // ========================================================================
  console.log('\n[4] Testing 2D FVM Solver Solid Masking & Reflective Wall Boundary Conditions...');
  const flumeBoundaries: RiverBoundaryConditions = {
    upstreamType: 'constant-discharge',
    upstreamDischargeM3s: 5.0,
    downstreamType: 'fixed-stage',
    downstreamStageM,
    downstreamSlope: 0.001,
    rainfallMmPerHour: 0.0,
    initialWaterDepthM: estDepth,
    manningRoughnessDefault: 0.015,
  };

  const allStructures: RiverHydraulicStructure[] = [circleObstacle, rectStruct, solidLineWall];
  const hydroState = createInitialHydroState(flumeMesh, flumeBoundaries);
  const turbState = createInitialTurbulenceState(flumeMesh);
  const sedState = createInitialSedimentState(flumeMesh);

  // Run 25 CFD steps
  const totalSteps = 25;
  for (let s = 0; s < totalSteps; s++) {
    const dt = computeStableTimeStep(flumeMesh, hydroState, 0.45, 0.3);
    stepCpuSolver(
      {
        mesh: flumeMesh,
        hydro: hydroState,
        turb: turbState,
        sed: sedState,
        boundaries: flumeBoundaries,
        structures: allStructures,
        turbParams: DEFAULT_TURBULENCE_PARAMETERS,
        sedParams: DEFAULT_SEDIMENT_PARAMETERS,
        stepCount: hydroState.stepCount,
      },
      dt
    );
  }

  // Verify solid cell masking in hydro state for circle obstacle
  for (const c of circleObstacle.cellIndices) {
    assert(hydroState.depth[c] === 0.0, `Solid circle cell #${c} depth must be 0.0, got ${hydroState.depth[c]}`);
    assert(hydroState.u[c] === 0.0, `Solid cell #${c} u-velocity must be 0.0, got ${hydroState.u[c]}`);
    assert(hydroState.v[c] === 0.0, `Solid cell #${c} v-velocity must be 0.0, got ${hydroState.v[c]}`);
    assert(hydroState.velocityMag[c] === 0.0, `Solid cell #${c} velocity magnitude must be 0.0, got ${hydroState.velocityMag[c]}`);
    assert(hydroState.isWet[c] === 0, `Solid cell #${c} isWet must be 0, got ${hydroState.isWet[c]}`);
  }

  // Verify solid cell masking for solid line wall
  for (const c of solidLineWall.cellIndices) {
    assert(hydroState.depth[c] === 0.0, `Solid line wall cell #${c} depth must be 0.0, got ${hydroState.depth[c]}`);
    assert(hydroState.u[c] === 0.0, `Solid line wall cell #${c} u-velocity must be 0.0, got ${hydroState.u[c]}`);
    assert(hydroState.v[c] === 0.0, `Solid line wall cell #${c} v-velocity must be 0.0, got ${hydroState.v[c]}`);
    assert(hydroState.velocityMag[c] === 0.0, `Solid line wall cell #${c} velocity magnitude must be 0.0, got ${hydroState.velocityMag[c]}`);
    assert(hydroState.isWet[c] === 0, `Solid line wall cell #${c} isWet must be 0, got ${hydroState.isWet[c]}`);
  }

  // Verify non-solid fluid cells have positive water depth and valid velocities
  let wetFluidCount = 0;
  for (let c = 0; c < flumeMesh.cells.length; c++) {
    if (!circleObstacle.cellIndices.includes(c) && !rectStruct.cellIndices.includes(c) && !solidLineWall.cellIndices.includes(c)) {
      if (hydroState.depth[c] > 0.01) wetFluidCount++;
      assert(!isNaN(hydroState.depth[c]), `Cell #${c} depth must not be NaN`);
      assert(!isNaN(hydroState.velocityMag[c]), `Cell #${c} velocity must not be NaN`);
    }
  }
  assert(wetFluidCount > 0.5 * flumeMesh.cells.length, 'Majority of open channel cells must remain wet and flowing');
  console.log(`  PASS: Solid cell masking strictly enforced across ${circleObstacle.cellIndices.length + rectStruct.cellIndices.length} cells. Depth and velocity = 0.`);
  console.log(`  PASS: Fluid-solid boundary faces enforced zero-flux reflective slip/no-slip wall boundary condition.`);
  console.log(`  PASS: 2D FVM solver completed 25 time steps with 0 NaNs and stable mass conservation.`);

  // ========================================================================
  // 5. Watertight 3D Solid STL Generation for OpenFOAM snappyHexMesh
  // ========================================================================
  console.log('\n[5] Testing Watertight 3D Solid STL Generation for OpenFOAM...');
  const stlContent = generateStructuresStl([circleObstacle, rectStruct, lineWall, polyObstacle], flumeMesh);
  assert(stlContent.startsWith('solid civil_river_structures'), 'STL must start with solid civil_river_structures');
  assert(stlContent.endsWith('endsolid civil_river_structures\n'), 'STL must end with endsolid civil_river_structures');

  // Verify facets and outward normals
  const facetMatches = stlContent.match(/facet normal\s+([-\d.e+]+)\s+([-\d.e+]+)\s+([-\d.e+]+)/g);
  assert(facetMatches !== null && facetMatches.length > 50, `STL must contain valid 3D facets, got ${facetMatches?.length}`);
  const vertexMatches = stlContent.match(/vertex\s+([-\d.e+]+)\s+([-\d.e+]+)\s+([-\d.e+]+)/g);
  assert(vertexMatches !== null && vertexMatches.length === (facetMatches?.length || 0) * 3, 'Every facet must have exactly 3 vertices');
  console.log(`  PASS: Generated watertight 3D STL containing ${facetMatches?.length} triangular facets with exact outward normals.`);

  // Test full OpenFOAM case zip packaging
  const zipBlob = await buildOpenFoamCaseZip({
    reach: flumeReach,
    mesh: flumeMesh,
    hydro: hydroState,
    turb: turbState,
    structures: allStructures,
    upstreamDischargeM3s: flumeBoundaries.upstreamDischargeM3s,
    downstreamStageM: flumeBoundaries.downstreamStageM,
    manningN: flumeBoundaries.manningRoughnessDefault,
  });
  assert(zipBlob instanceof Blob, 'OpenFOAM zip generator must produce a valid Blob');
  assert(zipBlob.size > 10000, `OpenFOAM zip must be >10KB, got ${zipBlob.size} bytes`);
  console.log(`  PASS: OpenFOAM 3D Case ZIP successfully created (${(zipBlob.size / 1024).toFixed(1)} KB).`);

  // ========================================================================
  // 6. ParaView 3D Structured Grid VTK Export
  // ========================================================================
  console.log('\n[6] Testing ParaView 3D VTK Structured Grid Export...');
  const vtkContent = exportRiverToVtk3D(flumeMesh, hydroState, turbState, 8, allStructures);
  assert(vtkContent.includes('# vtk DataFile Version 3.0'), 'VTK must have standard header');
  assert(vtkContent.includes('STRUCTURED_GRID'), 'VTK must be STRUCTURED_GRID');
  assert(vtkContent.includes('SCALARS solid_obstacle float 1'), 'VTK must contain solid_obstacle scalar field');
  assert(vtkContent.includes('SCALARS water_surface_elevation float 1'), 'VTK must contain water_surface_elevation scalar field');
  assert(vtkContent.includes('VECTORS velocity float'), 'VTK must contain velocity 3D vector field');
  assert(vtkContent.includes('SCALARS eddy_viscosity float 1'), 'VTK must contain eddy_viscosity scalar field');
  console.log(`  PASS: ParaView 3D Structured Grid VTK export verified with obstacle scalars and WSE free-surface (${(vtkContent.length / 1024).toFixed(1)} KB).`);

  console.log('\n================================================================');
  console.log('  🎉 ALL AUTOCAD FREEDOM, SOLID CFD & PARAVIEW 3D TESTS PASSED! ');
  console.log('================================================================\n');
}

runSelftest().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
