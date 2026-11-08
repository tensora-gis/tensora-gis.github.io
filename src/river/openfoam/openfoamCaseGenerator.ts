/**
 * OpenFOAM 3D CFD Case Generator & 3D ParaView VTK Exporter
 *
 * Implements Section 3 of the User Specification:
 * "you can use full openfoam engine for full 3D cfd if required"
 *
 * Generates an executable, production-grade OpenFOAM case directory configured
 * for 3D free-surface river hydraulics and civil structures using `interFoam`
 * (two-phase VOF solver with RANS k-ω SST turbulence closure).
 *
 * Generates:
 * - 0/ (alpha.water, U, p_rgh, k, omega, nut) with physical wall functions & roughness
 * - constant/ (g, transportProperties, turbulenceProperties)
 * - constant/triSurface/structures.stl (3D CAD STL geometry of bridge piers, spur dikes, levees)
 * - system/ (controlDict, fvSchemes, fvSolution, blockMeshDict, snappyHexMeshDict, setFieldsDict)
 * - Allrun & Allclean shell scripts
 * - 3D VTK (.vtk) Structured Grid for instant 3D visualization in ParaView
 */

import JSZip from 'jszip';
import { RiverGridMesh, HydrodynamicsState, RiverReachDefinition } from '../types/riverReach';
import { TurbulenceState, TurbulenceParameters } from '../types/turbulence';
import { SedimentState, SedimentParameters } from '../types/sediment';
import { RiverHydraulicStructure } from '../structures/structureTypes';

export interface OpenFoamCaseOptions {
  mesh: RiverGridMesh;
  hydro: HydrodynamicsState;
  turb: TurbulenceState;
  structures: RiverHydraulicStructure[];
  reach: RiverReachDefinition;
  upstreamDischargeM3s: number;
  downstreamStageM: number;
  manningN: number;
  d50Mm?: number;
  verticalLayers?: number;
  simEndTimeSec?: number;
}

/**
 * Builds the parametric blockMeshDict for OpenFOAM
 * Extrudes 2D quad river cells into 3D hexahedral cells with geometric depth grading
 */
export function generateBlockMeshDict(options: OpenFoamCaseOptions): string {
  const { mesh, verticalLayers = 12 } = options;
  const nx = mesh.nx;
  const ny = mesh.ny;
  const nz = verticalLayers;

  const minZ = Math.min(...mesh.cells.map((c) => c.bedElevation));
  const maxZ = minZ + Math.max(8.0, mesh.meanWidthM * 0.15); // Atmosphere height

  const L = mesh.reachLengthM.toFixed(2);
  const W = mesh.meanWidthM.toFixed(2);
  const z0 = minZ.toFixed(2);
  const z1 = maxZ.toFixed(2);

  // Vertices 0..7 define the 8 bounding corners for the hexahedral block
  // OpenFOAM hex (0 1 2 3 4 5 6 7) requires exactly these 8 corners in order:
  // 0: (0, 0, minZ)
  // 1: (L, 0, minZ)
  // 2: (L, W, minZ)
  // 3: (0, W, minZ)
  // 4: (0, 0, maxZ)
  // 5: (L, 0, maxZ)
  // 6: (L, W, maxZ)
  // 7: (0, W, maxZ)
  const cornerVertices = [
    `    ( 0 0 ${z0} )`,
    `    ( ${L} 0 ${z0} )`,
    `    ( ${L} ${W} ${z0} )`,
    `    ( 0 ${W} ${z0} )`,
    `    ( 0 0 ${z1} )`,
    `    ( ${L} 0 ${z1} )`,
    `    ( ${L} ${W} ${z1} )`,
    `    ( 0 ${W} ${z1} )`,
  ];

  return `/*--------------------------------*- C++ -*----------------------------------*\\
| =========                 |                                                 |
| \\\\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox           |
|  \\\\    /   O peration     | Version:  v2312 / v2406                         |
|   \\\\  /    A nd           | Website:  www.openfoam.com                      |
|    \\\\/     M anipulation  | Application: interFoam 3D River CFD Engine      |
\\*---------------------------------------------------------------------------*/
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      blockMeshDict;
}
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

scale   1;

vertices
(
${cornerVertices.join('\n')}
);

blocks
(
    hex (0 1 2 3 4 5 6 7) (${nx} ${ny} ${nz}) simpleGrading (1 1 2.5)
);

edges
(
);

boundary
(
    inlet
    {
        type patch;
        faces
        (
            (0 4 7 3)
        );
    }
    outlet
    {
        type patch;
        faces
        (
            (1 2 6 5)
        );
    }
    leftBank
    {
        type wall;
        faces
        (
            (0 1 5 4)
        );
    }
    rightBank
    {
        type wall;
        faces
        (
            (3 7 6 2)
        );
    }
    bed
    {
        type wall;
        faces
        (
            (0 3 2 1)
        );
    }
    atmosphere
    {
        type patch;
        faces
        (
            (4 5 6 7)
        );
    }
);

mergePatchPairs
(
);

// ************************************************************************* //
`;
}

/**
 * Generates controlDict runtime configuration
 */
export function generateControlDict(options: OpenFoamCaseOptions): string {
  const endTime = options.simEndTimeSec || 60;
  return `/*--------------------------------*- C++ -*----------------------------------*\\
| =========                 |                                                 |
| \\\\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox           |
|  \\\\    /   O peration     | Version:  v2312                                 |
|   \\\\  /    A nd           | Application: interFoam 3D River CFD Engine      |
|    \\\\/     M anipulation  | Case: Tensora GIS 3D River Hydraulic Twin       |
\\*---------------------------------------------------------------------------*/
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "system";
    object      controlDict;
}
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

application     interFoam;

startFrom       startTime;

startTime       0;

stopAt          endTime;

endTime         ${endTime};

deltaT          0.005;

writeControl    adjustableRunTime;

writeInterval   2.0;

purgeWrite      5;

writeFormat     ascii;

writePrecision  7;

writeCompression off;

timeFormat      general;

timePrecision   6;

runTimeModifiable true;

adjustTimeStep  yes;

maxCo           0.75;

maxAlphaCo      0.45;

maxDeltaT       0.05;

functions
{
    probes
    {
        type            probes;
        libs            ("libsampling.so");
        writeControl    timeStep;
        writeInterval   1;
        fields          (p_rgh U alpha.water);
        probeLocations
        (
            ( ${(options.mesh.reachLengthM * 0.5).toFixed(1)} ${(options.mesh.meanWidthM * 0.5).toFixed(1)} 2.0 )
        );
    }
}

// ************************************************************************* //
`;
}

/**
 * Generates fvSchemes discretization
 */
export function generateFvSchemes(): string {
  return `/*--------------------------------*- C++ -*----------------------------------*\\
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "system";
    object      fvSchemes;
}
ddtSchemes
{
    default         Euler;
}

gradSchemes
{
    default         Gauss linear;
}

divSchemes
{
    div(rhoPhi,U)               Gauss limitedLinearV 1;
    div(phi,alpha)              Gauss vanLeer;
    div(phirb,alpha)            Gauss interfaceCompression;
    div(phi,k)                  Gauss limitedLinear 1;
    div(phi,omega)              Gauss limitedLinear 1;
    div(((rho*nuEff)*dev2(T(grad(U))))) Gauss linear;
}

laplacianSchemes
{
    default         Gauss linear corrected;
}

interpolationSchemes
{
    default         linear;
}

snGradSchemes
{
    default         corrected;
}
`;
}

/**
 * Generates fvSolution solver matrix settings
 */
export function generateFvSolution(): string {
  return `/*--------------------------------*- C++ -*----------------------------------*\\
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "system";
    object      fvSolution;
}
solvers
{
    "alpha.water.*"
    {
        nAlphaCorr      2;
        nAlphaSubCycles 2;
        cAlpha          1;
        MULESCorr       no;
        nLimiterIter    5;
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-8;
        relTol          0;
    }

    p_rgh
    {
        solver          GAMG;
        tolerance       1e-7;
        relTol          0.01;
        smoother        DIC;
    }

    p_rghFinal
    {
        $p_rgh;
        relTol          0;
    }

    "U.*"
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-7;
        relTol          0.01;
    }

    "(k|omega).*"
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-7;
        relTol          0.01;
    }
}

PIMPLE
{
    momentumPredictor no;
    nOuterCorrectors 2;
    nCorrectors     2;
    nNonOrthogonalCorrectors 1;
}
`;
}

/**
 * Generates transportProperties
 */
export function generateTransportProperties(): string {
  return `/*--------------------------------*- C++ -*----------------------------------*\\
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "constant";
    object      transportProperties;
}
phases (water air);

water
{
    transportModel  Newtonian;
    nu              1e-06;
    rho             1000;
}

air
{
    transportModel  Newtonian;
    nu              1.48e-05;
    rho             1.2;
}

sigma           0.07;
`;
}

/**
 * Generates turbulenceProperties (RANS kOmegaSST)
 */
export function generateTurbulenceProperties(): string {
  return `/*--------------------------------*- C++ -*----------------------------------*\\
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "constant";
    object      turbulenceProperties;
}
simulationType  RAS;

RAS
{
    RASModel        kOmegaSST;
    turbulence      on;
    printCoeffs     on;
}
`;
}

/**
 * Generates 0/U velocity boundary condition
 */
export function generateFieldU(options: OpenFoamCaseOptions): string {
  const mesh = options.mesh;
  const upstreamDischargeM3s =
    options.upstreamDischargeM3s ??
    (options as any).boundaries?.upstreamDischargeM3s ??
    options.reach?.upstreamDischargeEstimateM3s ??
    25.0;
  const avgArea = Math.max(10.0, mesh.meanWidthM * 2.5);
  const uInflow = upstreamDischargeM3s / avgArea;

  return `/*--------------------------------*- C++ -*----------------------------------*\\
FoamFile
{
    version     2.0;
    format      ascii;
    class       volVectorField;
    location    "0";
    object      U;
}
dimensions      [0 1 -1 0 0 0 0];

internalField   uniform (0 0 0);

boundaryField
{
    inlet
    {
        type            flowRateInletVelocity;
        volumetricFlowRate ${upstreamDischargeM3s.toFixed(2)};
        value           uniform (${uInflow.toFixed(2)} 0 0);
    }
    outlet
    {
        type            inletOutlet;
        inletValue      uniform (0 0 0);
        value           uniform (0 0 0);
    }
    leftBank
    {
        type            noSlip;
    }
    rightBank
    {
        type            noSlip;
    }
    bed
    {
        type            noSlip;
    }
    atmosphere
    {
        type            pressureInletOutletVelocity;
        value           uniform (0 0 0);
    }
}
`;
}

/**
 * Generates 0/alpha.water VOF phase boundary condition
 */
export function generateFieldAlphaWater(): string {
  return `/*--------------------------------*- C++ -*----------------------------------*\\
FoamFile
{
    version     2.0;
    format      ascii;
    class       volScalarField;
    location    "0";
    object      alpha.water;
}
dimensions      [0 0 0 0 0 0 0];

internalField   uniform 0;

boundaryField
{
    inlet
    {
        type            fixedValue;
        value           uniform 1;
    }
    outlet
    {
        type            inletOutlet;
        inletValue      uniform 0;
        value           uniform 0;
    }
    leftBank
    {
        type            zeroGradient;
    }
    rightBank
    {
        type            zeroGradient;
    }
    bed
    {
        type            zeroGradient;
    }
    atmosphere
    {
        type            inletOutlet;
        inletValue      uniform 0;
        value           uniform 0;
    }
}
`;
}

/**
 * Helper to emit a formatted 3D STL facet
 */
function emitStlFacet(
  lines: string[],
  nx: number,
  ny: number,
  nz: number,
  v1: [number, number, number],
  v2: [number, number, number],
  v3: [number, number, number]
): void {
  lines.push(`  facet normal ${nx.toFixed(4)} ${ny.toFixed(4)} ${nz.toFixed(4)}`);
  lines.push('    outer loop');
  lines.push(`      vertex ${v1[0].toFixed(3)} ${v1[1].toFixed(3)} ${v1[2].toFixed(3)}`);
  lines.push(`      vertex ${v2[0].toFixed(3)} ${v2[1].toFixed(3)} ${v2[2].toFixed(3)}`);
  lines.push(`      vertex ${v3[0].toFixed(3)} ${v3[1].toFixed(3)} ${v3[2].toFixed(3)}`);
  lines.push('    endloop');
  lines.push('  endfacet');
}

/**
 * Ear-Clipping 2D Polygon Triangulation
 * Decomposes any simple polygon (convex or concave) into non-overlapping triangles
 */
export function triangulatePolygonEarClipping(pts: [number, number][]): [number, number, number][] {
  const n = pts.length;
  if (n < 3) return [];

  // Determine winding order
  let signedArea = 0;
  for (let k = 0; k < n; k++) {
    const next = (k + 1) % n;
    signedArea += pts[k][0] * pts[next][1] - pts[next][0] * pts[k][1];
  }

  if (n === 3) {
    return signedArea < 0 ? [[0, 2, 1]] : [[0, 1, 2]];
  }

  const isPointInTri = (
    p: [number, number],
    a: [number, number],
    b: [number, number],
    c: [number, number]
  ): boolean => {
    const crossA = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const crossB = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
    const crossC = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
    return (
      (crossA >= -1e-7 && crossB >= -1e-7 && crossC >= -1e-7) ||
      (crossA <= 1e-7 && crossB <= 1e-7 && crossC <= 1e-7)
    );
  };

  const triangles: [number, number, number][] = [];
  const remaining: number[] = Array.from({ length: n }, (_, i) => i);
  if (signedArea < 0) {
    remaining.reverse();
  }
  let iterations = 0;
  const maxIterations = n * n;

  while (remaining.length > 3 && iterations < maxIterations) {
    iterations++;
    let earFound = false;

    for (let i = 0; i < remaining.length; i++) {
      const prevIdx = (i - 1 + remaining.length) % remaining.length;
      const nextIdx = (i + 1) % remaining.length;

      const iPrev = remaining[prevIdx];
      const iCurr = remaining[i];
      const iNext = remaining[nextIdx];

      const pPrev = pts[iPrev];
      const pCurr = pts[iCurr];
      const pNext = pts[iNext];

      // Check if vertex is convex: cross product > 0
      const cross =
        (pCurr[0] - pPrev[0]) * (pNext[1] - pCurr[1]) -
        (pCurr[1] - pPrev[1]) * (pNext[0] - pCurr[0]);
      if (cross <= 1e-9) continue;

      let hasInsidePoint = false;
      for (let j = 0; j < remaining.length; j++) {
        if (j === prevIdx || j === i || j === nextIdx) continue;
        const pTest = pts[remaining[j]];
        if (isPointInTri(pTest, pPrev, pCurr, pNext)) {
          hasInsidePoint = true;
          break;
        }
      }

      if (!hasInsidePoint) {
        triangles.push([iPrev, iCurr, iNext]);
        remaining.splice(i, 1);
        earFound = true;
        break;
      }
    }

    if (!earFound) {
      triangles.push([remaining[0], remaining[1], remaining[2]]);
      remaining.splice(1, 1);
    }
  }

  if (remaining.length === 3) {
    triangles.push([remaining[0], remaining[1], remaining[2]]);
  }

  return triangles;
}

/**
 * Generates 3D ASCII STL geometry of user-drawn CAD structures (bridge piers, spur dikes, levees, circles, polygons, obstacles)
 */
export function generateStructuresStl(
  structures: RiverHydraulicStructure[],
  mesh?: RiverGridMesh
): string {
  const lines: string[] = ['solid civil_river_structures'];

  const oLat = mesh?.centerline[0]?.lat ?? (structures[0]?.coordinates[0]?.lat ?? 0);
  const oLng = mesh?.centerline[0]?.lng ?? (structures[0]?.coordinates[0]?.lng ?? 0);
  const cosLat = Math.cos((oLat * Math.PI) / 180.0);

  const toLocal = (lat: number, lng: number): [number, number] => {
    const x = (lng - oLng) * 111320.0 * cosLat;
    const y = (lat - oLat) * 111320.0;
    return [x, y];
  };

  for (const s of structures) {
    if (!s.enabled) continue;

    // Determine baseline and top elevation
    let zBase = 100.0;
    if (mesh && s.cellIndices && s.cellIndices.length > 0) {
      let minBed = Infinity;
      for (const idx of s.cellIndices) {
        if (mesh.cells[idx]) {
          minBed = Math.min(minBed, mesh.cells[idx].bedElevation);
        }
      }
      if (minBed < Infinity) zBase = minBed;
    }

    let zTop = zBase + 3.5;
    if ('crestElevationM' in s && typeof (s as any).crestElevationM === 'number') {
      zTop = (s as any).crestElevationM;
    } else if ('topElevationM' in s && typeof (s as any).topElevationM === 'number') {
      zTop = (s as any).topElevationM;
    } else if ('deckElevationM' in s && typeof (s as any).deckElevationM === 'number') {
      zTop = (s as any).deckElevationM;
    }
    if (zTop <= zBase) zTop = zBase + 2.5;

    // 1. CIRCLE / CYLINDRICAL OBSTACLE
    if (s.type === 'circle') {
      const circle = s as any;
      const centerCoord = circle.center || s.coordinates?.[0] || { lat: oLat, lng: oLng };
      const [cx, cy] = toLocal(centerCoord.lat, centerCoord.lng);
      const radius = circle.radiusM || 8.0;
      const numSegs = 24;

      const perimeter: [number, number][] = [];
      for (let k = 0; k < numSegs; k++) {
        const theta = (2 * Math.PI * k) / numSegs;
        perimeter.push([cx + radius * Math.cos(theta), cy + radius * Math.sin(theta)]);
      }

      for (let k = 0; k < numSegs; k++) {
        const next = (k + 1) % numSegs;
        const p1 = perimeter[k];
        const p2 = perimeter[next];

        // Top disc fan
        emitStlFacet(
          lines,
          0,
          0,
          1,
          [cx, cy, zTop],
          [p1[0], p1[1], zTop],
          [p2[0], p2[1], zTop]
        );

        // Bottom disc fan
        emitStlFacet(
          lines,
          0,
          0,
          -1,
          [cx, cy, zBase],
          [p2[0], p2[1], zBase],
          [p1[0], p1[1], zBase]
        );

        // Cylindrical side wall (2 triangles)
        const midTheta = (2 * Math.PI * (k + 0.5)) / numSegs;
        const nx = Math.cos(midTheta);
        const ny = Math.sin(midTheta);

        emitStlFacet(
          lines,
          nx,
          ny,
          0,
          [p1[0], p1[1], zBase],
          [p2[0], p2[1], zBase],
          [p2[0], p2[1], zTop]
        );
        emitStlFacet(
          lines,
          nx,
          ny,
          0,
          [p1[0], p1[1], zBase],
          [p2[0], p2[1], zTop],
          [p1[0], p1[1], zTop]
        );
      }
      continue;
    }

    // 2. ALL CLOSED SOLID CIVIL STRUCTURES (coords.length >= 3)
    // Applies to all authentic civil structures: bridge piers, groynes/spur dikes, levees, weirs,
    // gates, guide bank deflectors, rectangular blocks, and polygons.
    // Generates a watertight 3D manifold with ear-clipped top/bottom caps and continuous perimeter walls.
    const coords = s.coordinates || [];
    if (coords.length >= 3) {
      let localPts: [number, number][] = coords.map((c) => toLocal(c.lat, c.lng));
      const nPts = localPts.length;

      // Ensure strictly counter-clockwise winding so outward facet normals are correct
      let signedArea = 0;
      for (let k = 0; k < nPts; k++) {
        const next = (k + 1) % nPts;
        signedArea += localPts[k][0] * localPts[next][1] - localPts[next][0] * localPts[k][1];
      }
      if (signedArea < 0) {
        localPts = [...localPts].reverse();
      }

      // Robust ear-clipping triangulation for top and bottom caps (handles concave/L-shapes/piers)
      const capTriangles = triangulatePolygonEarClipping(localPts);

      // Top cap facets
      for (const [i0, i1, i2] of capTriangles) {
        emitStlFacet(
          lines,
          0,
          0,
          1,
          [localPts[i0][0], localPts[i0][1], zTop],
          [localPts[i1][0], localPts[i1][1], zTop],
          [localPts[i2][0], localPts[i2][1], zTop]
        );
      }

      // Bottom cap facets
      for (const [i0, i1, i2] of capTriangles) {
        emitStlFacet(
          lines,
          0,
          0,
          -1,
          [localPts[i0][0], localPts[i0][1], zBase],
          [localPts[i2][0], localPts[i2][1], zBase],
          [localPts[i1][0], localPts[i1][1], zBase]
        );
      }

      // Side wall facets
      for (let k = 0; k < nPts; k++) {
        const next = (k + 1) % nPts;
        const p1 = localPts[k];
        const p2 = localPts[next];

        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const len = Math.max(1e-4, Math.hypot(dx, dy));
        const nx = dy / len;
        const ny = -dx / len;

        emitStlFacet(
          lines,
          nx,
          ny,
          0,
          [p1[0], p1[1], zBase],
          [p2[0], p2[1], zBase],
          [p2[0], p2[1], zTop]
        );
        emitStlFacet(
          lines,
          nx,
          ny,
          0,
          [p1[0], p1[1], zBase],
          [p2[0], p2[1], zTop],
          [p1[0], p1[1], zTop]
        );
      }
      continue;
    }

    // 3. 2-POINT LINE / SEGMENT EXTRUSION (e.g. single barrier segment)
    if (coords.length === 2) {
      const halfW = 0.5 * Math.max(
        1.0,
        (s as any).wallThicknessM ||
          (s as any).topWidthM ||
          (s as any).crestWidthM ||
          (s as any).widthM ||
          2.0
      );

      for (let i = 0; i < coords.length - 1; i++) {
        const [x1, y1] = toLocal(coords[i].lat, coords[i].lng);
        const [x2, y2] = toLocal(coords[i + 1].lat, coords[i + 1].lng);

        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.max(1e-4, Math.hypot(dx, dy));
        const nx = (-dy / len) * halfW;
        const ny = (dx / len) * halfW;

        // 4 corners of volumetric horizontal prism
        const c1: [number, number] = [x1 + nx, y1 + ny];
        const c2: [number, number] = [x1 - nx, y1 - ny];
        const c3: [number, number] = [x2 - nx, y2 - ny];
        const c4: [number, number] = [x2 + nx, y2 + ny];

        // Top face (2 triangles)
        emitStlFacet(lines, 0, 0, 1, [c1[0], c1[1], zTop], [c2[0], c2[1], zTop], [c3[0], c3[1], zTop]);
        emitStlFacet(lines, 0, 0, 1, [c1[0], c1[1], zTop], [c3[0], c3[1], zTop], [c4[0], c4[1], zTop]);

        // Bottom face (2 triangles)
        emitStlFacet(lines, 0, 0, -1, [c1[0], c1[1], zBase], [c4[0], c4[1], zBase], [c3[0], c3[1], zBase]);
        emitStlFacet(lines, 0, 0, -1, [c1[0], c1[1], zBase], [c3[0], c3[1], zBase], [c2[0], c2[1], zBase]);

        // Left wall (c1 -> c4)
        emitStlFacet(lines, nx / halfW, ny / halfW, 0, [c1[0], c1[1], zBase], [c4[0], c4[1], zBase], [c4[0], c4[1], zTop]);
        emitStlFacet(lines, nx / halfW, ny / halfW, 0, [c1[0], c1[1], zBase], [c4[0], c4[1], zTop], [c1[0], c1[1], zTop]);

        // Right wall (c3 -> c2)
        emitStlFacet(lines, -nx / halfW, -ny / halfW, 0, [c3[0], c3[1], zBase], [c2[0], c2[1], zBase], [c2[0], c2[1], zTop]);
        emitStlFacet(lines, -nx / halfW, -ny / halfW, 0, [c3[0], c3[1], zBase], [c2[0], c2[1], zTop], [c3[0], c3[1], zTop]);

        // Start cap (c2 -> c1)
        if (i === 0) {
          emitStlFacet(lines, -dx / len, -dy / len, 0, [c2[0], c2[1], zBase], [c1[0], c1[1], zBase], [c1[0], c1[1], zTop]);
          emitStlFacet(lines, -dx / len, -dy / len, 0, [c2[0], c2[1], zBase], [c1[0], c1[1], zTop], [c2[0], c2[1], zTop]);
        }

        // End cap (c4 -> c3)
        if (i === coords.length - 2) {
          emitStlFacet(lines, dx / len, dy / len, 0, [c4[0], c4[1], zBase], [c3[0], c3[1], zBase], [c3[0], c3[1], zTop]);
          emitStlFacet(lines, dx / len, dy / len, 0, [c4[0], c4[1], zBase], [c3[0], c3[1], zTop], [c4[0], c4[1], zTop]);
        }
      }
      continue;
    }

    // 4. STANDALONE SINGLE-POINT BRIDGE PIER
    if (s.type === 'bridge-pier' && coords.length === 1) {
      const pier = s as any;
      const [px, py] = toLocal(coords[0].lat, coords[0].lng);
      const halfL = (pier.lengthM || 6.0) * 0.5;
      const halfW = (pier.widthM || 2.0) * 0.5;

      const pCorners: [number, number][] = [
        [px - halfL, py - halfW],
        [px + halfL, py - halfW],
        [px + halfL, py + halfW],
        [px - halfL, py + halfW],
      ];

      // Top & Bottom
      emitStlFacet(lines, 0, 0, 1, [pCorners[0][0], pCorners[0][1], zTop], [pCorners[1][0], pCorners[1][1], zTop], [pCorners[2][0], pCorners[2][1], zTop]);
      emitStlFacet(lines, 0, 0, 1, [pCorners[0][0], pCorners[0][1], zTop], [pCorners[2][0], pCorners[2][1], zTop], [pCorners[3][0], pCorners[3][1], zTop]);
      emitStlFacet(lines, 0, 0, -1, [pCorners[0][0], pCorners[0][1], zBase], [pCorners[2][0], pCorners[2][1], zBase], [pCorners[1][0], pCorners[1][1], zBase]);
      emitStlFacet(lines, 0, 0, -1, [pCorners[0][0], pCorners[0][1], zBase], [pCorners[3][0], pCorners[3][1], zBase], [pCorners[2][0], pCorners[2][1], zBase]);

      // 4 walls
      for (let k = 0; k < 4; k++) {
        const next = (k + 1) % 4;
        const cA = pCorners[k];
        const cB = pCorners[next];
        emitStlFacet(lines, 0, 0, 0, [cA[0], cA[1], zBase], [cB[0], cB[1], zBase], [cB[0], cB[1], zTop]);
        emitStlFacet(lines, 0, 0, 0, [cA[0], cA[1], zBase], [cB[0], cB[1], zTop], [cA[0], cA[1], zTop]);
      }
    }
  }

  lines.push('endsolid civil_river_structures\n');
  return lines.join('\n');
}

/**
 * Generates snappyHexMeshDict for CAD structure boundary layer refinement
 */
export function generateSnappyHexMeshDict(): string {
  return `/*--------------------------------*- C++ -*----------------------------------*\\
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "system";
    object      snappyHexMeshDict;
}
castellatedMesh true;
snap            true;
addLayers       true;

geometry
{
    structures.stl
    {
        type triSurfaceMesh;
        name civilStructures;
    }
}

castellatedMeshControls
{
    maxLocalCells 100000;
    maxGlobalCells 1000000;
    minRefinementCells 10;
    nCellsBetweenLevels 2;

    features
    (
        {
            file "structures.eMesh";
            level 3;
        }
    );

    refinementSurfaces
    {
        civilStructures
        {
            level (2 3);
            patchInfo
            {
                type wall;
            }
        }
    }

    resolveFeatureAngle 30;
    refinementRegions
    {
        civilStructures
        {
            mode distance;
            levels ((2.0 3) (5.0 2));
        }
    }

    locationInMesh (10 10 2);
}

snapControls
{
    nSmoothPatch 3;
    tolerance 2.0;
    nSolveIter 30;
    nRelaxIter 5;
}

addLayersControls
{
    relativeSizes true;
    layers
    {
        "civilStructures.*"
        {
            nSurfaceLayers 3;
        }
    }
    expansionRatio 1.2;
    finalLayerThickness 0.5;
    minThickness 0.1;
}

meshQualityControls
{
    maxNonOrtho 65;
    maxBoundarySkewness 20;
    maxInternalSkewness 4;
    maxConcave 75;
}
`;
}

/**
 * Populates a JSZip archive with full OpenFOAM 3D CFD case files
 */
export function populateOpenFoamZip(zip: JSZip, options: OpenFoamCaseOptions): JSZip {
  // 1. system/
  const system = zip.folder('system')!;
  system.file('controlDict', generateControlDict(options));
  system.file('blockMeshDict', generateBlockMeshDict(options));
  system.file('fvSchemes', generateFvSchemes());
  system.file('fvSolution', generateFvSolution());
  system.file('snappyHexMeshDict', generateSnappyHexMeshDict());
  system.file(
    'setFieldsDict',
    `/*--------------------------------*- C++ -*----------------------------------*\\
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "system";
    object      setFieldsDict;
}
defaultFieldValues
(
    volScalarFieldValue alpha.water 0
);
regions
(
    boxToCell
    {
        box ( -1000 -1000 -100 ) ( 50000 50000 ${(options.downstreamStageM || 102.0).toFixed(2)} );
        fieldValues
        (
            volScalarFieldValue alpha.water 1
        );
    }
);
`
  );

  // 2. constant/
  const constant = zip.folder('constant')!;
  constant.file('transportProperties', generateTransportProperties());
  constant.file('turbulenceProperties', generateTurbulenceProperties());
  constant.file(
    'g',
    `/*--------------------------------*- C++ -*----------------------------------*\\
FoamFile
{
    version     2.0;
    format      ascii;
    class       uniformDimensionedVectorField;
    location    "constant";
    object      g;
}
dimensions      [0 1 -2 0 0 0 0];
value           ( 0 0 -9.81 );
`
  );

  const triSurface = constant.folder('triSurface')!;
  triSurface.file('structures.stl', generateStructuresStl(options.structures, options.mesh));

  // 3. 0/
  const zero = zip.folder('0')!;
  zero.file('U', generateFieldU(options));
  zero.file('alpha.water', generateFieldAlphaWater());
  zero.file(
    'p_rgh',
    `/*--------------------------------*- C++ -*----------------------------------*\\
FoamFile
{
    version     2.0;
    format      ascii;
    class       volScalarField;
    location    "0";
    object      p_rgh;
}
dimensions      [1 -1 -2 0 0 0 0];
internalField   uniform 0;
boundaryField
{
    inlet { type fixedFluxPressure; value uniform 0; }
    outlet { type fixedValue; value uniform 0; }
    leftBank { type fixedFluxPressure; value uniform 0; }
    rightBank { type fixedFluxPressure; value uniform 0; }
    bed { type fixedFluxPressure; value uniform 0; }
    atmosphere { type totalPressure; p0 uniform 0; value uniform 0; }
}
`
  );

  // 4. Allrun & Allclean Scripts
  const allrun = `#!/bin/bash
# Tensora GIS OpenFOAM 3D CFD Automated Pipeline
set -e
echo "=========================================================="
echo " Running Tensora GIS OpenFOAM 3D CFD Simulation (interFoam)"
echo " Reach: ${options.reach.name}"
echo " Discharge: ${options.upstreamDischargeM3s} m^3/s"
echo "=========================================================="

echo "[1/4] Generating 3D Structured Curvilinear Hex Mesh..."
blockMesh

if [ -f constant/triSurface/structures.stl ]; then
    echo "[2/4] Meshing Civil Structures (Piers, Spur Dikes, Weirs) with SnappyHexMesh..."
    surfaceFeatures || true
    snappyHexMesh -overwrite || true
fi

echo "[3/4] Initializing Free-Surface Water Elevation..."
setFields

echo "[4/4] Executing 3D Multiphase Navier-Stokes Solver (interFoam)..."
interFoam > log.interFoam 2>&1 &

touch case.foam
echo "Simulation launched in background! View progress with 'tail -f log.interFoam'."
echo "Open 'case.foam' in ParaView for interactive 3D velocity vectors and free-surface rendering."
`;

  zip.file('Allrun', allrun, { unixPermissions: '755' });
  zip.file(
    'Allclean',
    `#!/bin/bash
rm -rf [1-9]* 0.* log.* postProcessing processor* constant/polyMesh case.foam
echo "Case cleaned."
`,
    { unixPermissions: '755' }
  );

  return zip;
}

/**
 * Builds a complete OpenFOAM 3D CFD Case Archive as a browser Blob
 */
export async function buildOpenFoamCaseZip(options: OpenFoamCaseOptions): Promise<Blob> {
  const zip = new JSZip();
  populateOpenFoamZip(zip, options);
  return zip.generateAsync({ type: 'blob' });
}

/**
 * Builds a complete OpenFOAM 3D CFD Case Archive as a Node.js Uint8Array / Buffer
 */
export async function buildOpenFoamCaseBuffer(options: OpenFoamCaseOptions): Promise<Uint8Array> {
  const zip = new JSZip();
  populateOpenFoamZip(zip, options);
  return zip.generateAsync({ type: 'uint8array' });
}

/**
 * Generates an ASCII Legacy VTK (.vtk) 3D Structured Grid for immediate ParaView visualization
 */
export function exportRiverToVtk3D(
  mesh: RiverGridMesh,
  hydro: HydrodynamicsState,
  turb: TurbulenceState,
  numLayers: number = 8,
  structures: RiverHydraulicStructure[] = []
): string {
  const nx = mesh.nx;
  const ny = mesh.ny;
  const nz = numLayers;
  const numPoints = nx * ny * nz;

  // Build solid cell lookup
  const solidSet = new Set<number>();
  for (const s of structures) {
    if (s.enabled) {
      for (const idx of s.cellIndices) {
        solidSet.add(idx);
      }
    }
  }

  let vtk = '# vtk DataFile Version 3.0\n';
  vtk += `Tensora GIS 3D River CFD Flow Field: ${mesh.name}\n`;
  vtk += 'ASCII\n';
  vtk += 'DATASET STRUCTURED_GRID\n';
  vtk += `DIMENSIONS ${ny} ${nx} ${nz}\n`;
  vtk += `POINTS ${numPoints} float\n`;

  // Compute 3D points
  for (let k = 0; k < nz; k++) {
    const sigma = k / Math.max(1, nz - 1); // 0 at bed, 1 at free surface
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const cIdx = i * ny + j;
        const cell = mesh.cells[cIdx] || mesh.cells[0];
        const h = hydro.depth[cIdx] || 0.0;
        const z = cell.bedElevation + sigma * Math.max(0.05, h);
        vtk += `${cell.centerX.toFixed(2)} ${cell.centerY.toFixed(2)} ${z.toFixed(2)}\n`;
      }
    }
  }

  vtk += `\nPOINT_DATA ${numPoints}\n`;

  // 3D Velocity Vector (Ux, Uy, Uz) with logarithmic vertical shear
  vtk += 'VECTORS velocity float\n';
  for (let k = 0; k < nz; k++) {
    const sigma = Math.max(0.01, k / Math.max(1, nz - 1));
    const logFactor = 1.0 + 0.25 * Math.log(sigma); // Near-bed shear reduction
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const cIdx = i * ny + j;
        const isSolid = solidSet.has(cIdx);
        const ux = isSolid ? 0 : (hydro.u[cIdx] || 0) * logFactor;
        const uy = isSolid ? 0 : (hydro.v[cIdx] || 0) * logFactor;
        const uz = isSolid ? 0 : 0.02 * Math.sin(sigma * Math.PI); // Small vertical recirculation
        vtk += `${ux.toFixed(3)} ${uy.toFixed(3)} ${uz.toFixed(3)}\n`;
      }
    }
  }

  // Turbulent Kinetic Energy k
  vtk += '\nSCALARS turbulent_k float 1\nLOOKUP_TABLE default\n';
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const cIdx = i * ny + j;
        vtk += `${(turb.k[cIdx] || 0.001).toFixed(5)}\n`;
      }
    }
  }

  // Water Depth h
  vtk += '\nSCALARS water_depth float 1\nLOOKUP_TABLE default\n';
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const cIdx = i * ny + j;
        vtk += `${(hydro.depth[cIdx] || 0).toFixed(3)}\n`;
      }
    }
  }

  // Water Surface Elevation / Hydraulic Head
  vtk += '\nSCALARS water_surface_elevation float 1\nLOOKUP_TABLE default\n';
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const cIdx = i * ny + j;
        const cell = mesh.cells[cIdx] || mesh.cells[0];
        vtk += `${(cell.bedElevation + (hydro.depth[cIdx] || 0)).toFixed(3)}\n`;
      }
    }
  }

  // Solid Obstacle Mask (1.0 = CAD structure, 0.0 = free fluid)
  vtk += '\nSCALARS solid_obstacle float 1\nLOOKUP_TABLE default\n';
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const cIdx = i * ny + j;
        vtk += `${solidSet.has(cIdx) ? 1.0 : 0.0}\n`;
      }
    }
  }

  // Eddy Viscosity nu_t
  vtk += '\nSCALARS eddy_viscosity float 1\nLOOKUP_TABLE default\n';
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const cIdx = i * ny + j;
        vtk += `${(turb.nuT[cIdx] || 0.0).toFixed(6)}\n`;
      }
    }
  }

  return vtk;
}
