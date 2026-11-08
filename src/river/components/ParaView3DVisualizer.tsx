/**
 * ParaView-Style Interactive 3D CFD Post-Processing & Real-Time Flow Visualizer
 *
 * Implements 3D free-surface water rendering, bathymetry, 3D streamlines,
 * velocity vector glyphs, cut-planes, CAD structures, and scalar field mapping
 * (velocity, WSE, depth, pressure head, Froude, turbulent k).
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  RiverGridMesh,
  HydrodynamicsState,
  RiverReachDefinition,
  RiverBoundaryConditions,
} from '../types/riverReach';
import { TurbulenceState, TurbulenceParameters } from '../types/turbulence';
import { SedimentState, SedimentParameters } from '../types/sediment';
import { RiverHydraulicStructure } from '../structures/structureTypes';
import { exportRiverToVtk3D } from '../openfoam/openfoamCaseGenerator';
import { triggerFileDownload } from '../export/riverExport';
import { getFluentCfdRgb } from '../visualization/cfdColorMap';

export type ParaViewScalarField =
  | 'velocity'
  | 'wse'
  | 'depth'
  | 'pressure'
  | 'froude'
  | 'turbK';

export type ColorMapPalette = 'cool-to-warm' | 'viridis' | 'rainbow' | 'turbo';

interface ParaView3DVisualizerProps {
  isOpen: boolean;
  onClose: () => void;
  reach: RiverReachDefinition;
  mesh: RiverGridMesh;
  hydro: HydrodynamicsState;
  turb: TurbulenceState;
  sed: SedimentState;
  structures: RiverHydraulicStructure[];
  boundaries: RiverBoundaryConditions;
  isSimulating?: boolean;
  onToggleSimulation?: () => void;
}

export const ParaView3DVisualizer: React.FC<ParaView3DVisualizerProps> = ({
  isOpen,
  onClose,
  reach,
  mesh,
  hydro,
  turb,
  sed,
  structures,
  boundaries,
  isSimulating = false,
  onToggleSimulation,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Visualization settings
  const [scalarField, setScalarField] = useState<ParaViewScalarField>('velocity');
  const [colorPalette, setColorPalette] = useState<ColorMapPalette>('rainbow');
  const [showWaterSurface, setShowWaterSurface] = useState(true);
  const [showBedTerrain, setShowBedTerrain] = useState(true);
  const [showStreamlines, setShowStreamlines] = useState(true);
  const [showVectorGlyphs, setShowVectorGlyphs] = useState(false);
  const [showCadStructures, setShowCadStructures] = useState(true);
  const [showCutPlane, setShowCutPlane] = useState(false);
  const [cutPlaneType, setCutPlaneType] = useState<'transverse' | 'longitudinal'>('transverse');
  const [cutStationRatio, setCutStationRatio] = useState(0.5); // 0.0 to 1.0 along reach
  const [verticalExaggeration, setVerticalExaggeration] = useState(3.5);
  const [wireframe, setWireframe] = useState(false);
  const [isAutoRotating, setIsAutoRotating] = useState(false);

  // Camera state: spherical coords
  const cameraRef = useRef({
    pitch: 0.65, // radians from top
    yaw: 0.85, // radians azimuth
    distance: 1.4, // zoom factor relative to scene radius
    target: [0, 0, 0] as [number, number, number],
  });

  const isDraggingRef = useRef(false);
  const dragButtonRef = useRef(0);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const animTimeRef = useRef(0);

  // Compute field extrema for colorbar
  const fieldRange = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    const numCells = mesh.cells.length;

    for (let c = 0; c < numCells; c++) {
      let val = 0;
      if (scalarField === 'velocity') {
        val = hydro.velocityMag[c] || 0;
      } else if (scalarField === 'wse') {
        val = (hydro.wse[c] || mesh.cells[c].bedElevation);
      } else if (scalarField === 'depth') {
        val = hydro.depth[c] || 0;
      } else if (scalarField === 'pressure') {
        val = (hydro.depth[c] || 0) * 9.81; // kPa / head
      } else if (scalarField === 'froude') {
        val = hydro.froude[c] || 0;
      } else if (scalarField === 'turbK') {
        val = turb.k[c] || 0;
      }

      if (val < min) min = val;
      if (val > max) max = val;
    }

    if (!isFinite(min) || min === max) {
      min = 0;
      max = 1;
    }
    return { min, max };
  }, [scalarField, hydro, turb, mesh]);

  // Colormap evaluation function
  const getColor = (tClamped: number, palette: ColorMapPalette): [number, number, number] => {
    const t = Math.max(0, Math.min(1, tClamped));
    if (palette === 'cool-to-warm') {
      // ParaView Cool-to-Warm (Blue -> White -> Red)
      if (t < 0.5) {
        const f = t / 0.5;
        return [
          Math.round(59 + f * 196),
          Math.round(76 + f * 179),
          Math.round(192 + f * 63),
        ];
      } else {
        const f = (t - 0.5) / 0.5;
        return [
          Math.round(255 - f * 75),
          Math.round(255 * (1 - f * 0.75)),
          Math.round(255 * (1 - f)),
        ];
      }
    } else if (palette === 'viridis') {
      // Viridis
      return [
        Math.round(68 + t * (253 - 68)),
        Math.round(1 + t * (231 - 1)),
        Math.round(84 + (1 - t) * (150 - 84)),
      ];
    } else if (palette === 'turbo') {
      // Turbo
      const r = Math.round(255 * Math.sin(t * Math.PI));
      const g = Math.round(255 * Math.sin(t * Math.PI * 0.85 + 0.3));
      const b = Math.round(255 * Math.cos(t * Math.PI * 0.5));
      return [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))];
    } else {
      // Classic Ansys Fluent / OpenFOAM CFD Rainbow Palette:
      // Deep Navy Blue -> Royal Blue -> Cyan -> Emerald Green -> Yellow -> Orange -> Crimson Red
      return getFluentCfdRgb(t);
    }
  };

  // 3D Render Loop
  useEffect(() => {
    if (!isOpen) return;
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Dark ParaView gradient viewport background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#1e293b');
      bgGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Auto rotation
      if (isAutoRotating) {
        cameraRef.current.yaw += 0.005;
      }
      animTimeRef.current += 0.03;

      const cam = cameraRef.current;
      const nx = mesh.nx;
      const ny = mesh.ny;
      const cells = mesh.cells;

      // Coordinate scaling: center bounding box at origin
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c];
        minX = Math.min(minX, cell.centerX);
        maxX = Math.max(maxX, cell.centerX);
        minY = Math.min(minY, cell.centerY);
        maxY = Math.max(maxY, cell.centerY);
        minZ = Math.min(minZ, cell.bedElevation);
        maxZ = Math.max(maxZ, cell.bedElevation + (hydro.depth[c] || 0));
      }

      const cx = 0.5 * (minX + maxX);
      const cy = 0.5 * (minY + maxY);
      const cz = 0.5 * (minZ + maxZ);
      const maxDim = Math.max(maxX - minX, maxY - minY, 10.0);
      const scale = (Math.min(width, height) * 0.8) / (maxDim * cam.distance);

      // 3D Camera Rotation Matrices
      const cosY = Math.cos(cam.yaw);
      const sinY = Math.sin(cam.yaw);
      const cosP = Math.cos(cam.pitch);
      const sinP = Math.sin(cam.pitch);

      const project = (x: number, y: number, z: number): { px: number; py: number; depth: number } => {
        // Translate to origin
        const dx = x - cx;
        const dy = y - cy;
        const dz = (z - cz) * verticalExaggeration;

        // Yaw rotation around z-axis
        const x1 = dx * cosY - dy * sinY;
        const y1 = dx * sinY + dy * cosY;
        const z1 = dz;

        // Pitch rotation around x-axis
        const x2 = x1;
        const y2 = y1 * cosP - z1 * sinP;
        const z2 = y1 * sinP + z1 * cosP;

        // Perspective projection
        const px = width / 2 + x2 * scale;
        const py = height / 2 - z2 * scale;
        return { px, py, depth: y2 };
      };

      // Collection of 3D polygonal primitives for depth sorting (Painter's algorithm)
      interface Polygon3D {
        depth: number;
        points: { px: number; py: number }[];
        fillColor: string;
        strokeColor?: string;
        lineWidth?: number;
      }

      const polygons: Polygon3D[] = [];

      const originLat = mesh.centerline[0]?.lat ?? 0;
      const originLng = mesh.centerline[0]?.lng ?? 0;
      const cosLatOrigin = Math.cos((originLat * Math.PI) / 180.0);
      const toLocalXY = (lat: number, lng: number): [number, number] => [
        (lng - originLng) * 111320.0 * cosLatOrigin,
        (lat - originLat) * 111320.0,
      ];

      // 3D Directional Diffuse Lighting
      const computeShading = (
        p0: [number, number, number],
        p1: [number, number, number],
        p2: [number, number, number]
      ): number => {
        const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
        const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-5) return 0.85;
        nx /= len; ny /= len; nz /= len;
        const dot = Math.max(0, nx * 0.35 + ny * 0.45 + nz * 0.82);
        return 0.72 + 0.28 * dot;
      };

      // 1. Render Bed Bathymetry Terrain Grid (All cells covering entire reach)
      if (showBedTerrain) {
        for (let c = 0; c < cells.length; c++) {
          const cell = cells[c];
          if (!cell || !cell.corners || cell.corners.length < 4) continue;

          const pts3D: [number, number, number][] = cell.corners.slice(0, 4).map(([lat, lng]) => {
            const [x, y] = toLocalXY(lat, lng);
            return [x, y, cell.bedElevation];
          });

          const p0 = project(pts3D[0][0], pts3D[0][1], pts3D[0][2]);
          const p1 = project(pts3D[1][0], pts3D[1][1], pts3D[1][2]);
          const p2 = project(pts3D[2][0], pts3D[2][1], pts3D[2][2]);
          const p3 = project(pts3D[3][0], pts3D[3][1], pts3D[3][2]);

          const shade = computeShading(pts3D[0], pts3D[1], pts3D[3]);
          const r = Math.round(51 * shade);
          const g = Math.round(65 * shade);
          const b = Math.round(85 * shade);

          const avgDepth = (p0.depth + p1.depth + p2.depth + p3.depth) * 0.25;
          polygons.push({
            depth: avgDepth - 2.0, // slight bias behind water
            points: [p0, p1, p2, p3],
            fillColor: `rgb(${r}, ${g}, ${b})`,
            strokeColor: '#1e293b',
            lineWidth: 0.5,
          });
        }
      }

      // 2. Render 3D Free-Surface Water Mesh (All wet cells with volumetric lighting)
      if (showWaterSurface) {
        for (let c = 0; c < cells.length; c++) {
          const cell = cells[c];
          if (!cell || !cell.corners || cell.corners.length < 4) continue;

          const h = hydro.depth[c] || 0;
          if (h < 0.005) continue; // Skip dry cells

          const wse = cell.bedElevation + h;
          const pts3D: [number, number, number][] = cell.corners.slice(0, 4).map(([lat, lng]) => {
            const [x, y] = toLocalXY(lat, lng);
            return [x, y, wse];
          });

          const p0 = project(pts3D[0][0], pts3D[0][1], pts3D[0][2]);
          const p1 = project(pts3D[1][0], pts3D[1][1], pts3D[1][2]);
          const p2 = project(pts3D[2][0], pts3D[2][1], pts3D[2][2]);
          const p3 = project(pts3D[3][0], pts3D[3][1], pts3D[3][2]);

          // Compute cell scalar value for color
          let scalarVal = 0;
          if (scalarField === 'velocity') {
            scalarVal = hydro.velocityMag[c] || 0;
          } else if (scalarField === 'wse') {
            scalarVal = wse;
          } else if (scalarField === 'depth') {
            scalarVal = h;
          } else if (scalarField === 'pressure') {
            scalarVal = h * 9.81;
          } else if (scalarField === 'froude') {
            scalarVal = hydro.froude[c] || 0;
          } else if (scalarField === 'turbK') {
            scalarVal = turb.k ? (turb.k[c] || 0) : 0;
          }

          const tNorm = (scalarVal - fieldRange.min) / Math.max(1e-5, fieldRange.max - fieldRange.min);
          const [rBase, gBase, bBase] = getColor(tNorm, colorPalette);
          const shade = computeShading(pts3D[0], pts3D[1], pts3D[3]);
          const r = Math.min(255, Math.round(rBase * shade));
          const g = Math.min(255, Math.round(gBase * shade));
          const b = Math.min(255, Math.round(bBase * shade));

          const avgDepth = (p0.depth + p1.depth + p2.depth + p3.depth) * 0.25;
          polygons.push({
            depth: avgDepth,
            points: [p0, p1, p2, p3],
            fillColor: `rgba(${r}, ${g}, ${b}, ${wireframe ? 0.35 : 0.96})`,
            strokeColor: wireframe ? `rgb(${r}, ${g}, ${b})` : undefined,
            lineWidth: wireframe ? 1.0 : 0.0,
          });
        }
      }

      // 3. Render 3D Extruded CAD Hydraulic Structures
      if (showCadStructures) {

        for (const s of structures) {
          if (!s.enabled) continue;
          const isObstacleOrBaffle =
            s.type === 'obstacle' ||
            s.type === 'circle' ||
            (s as any).solidMasking ||
            s.type === 'rectangle' ||
            s.type === 'polygon';
          const solidTopColor = isObstacleOrBaffle ? '#3b4758' : (s.cadProperties?.color || '#475569');
          const solidSideColor = isObstacleOrBaffle ? '#1e293b' : (s.cadProperties?.color || '#334155');
          const solidStrokeColor = isObstacleOrBaffle ? '#64748b' : '#94a3b8';

          let zBase = 100.0;
          if (s.cellIndices && s.cellIndices.length > 0) {
            let minBed = Infinity;
            for (const idx of s.cellIndices) {
              if (cells[idx]) minBed = Math.min(minBed, cells[idx].bedElevation);
            }
            if (minBed < Infinity) zBase = minBed;
          }
          const zTop =
            'crestElevationM' in s && typeof (s as any).crestElevationM === 'number'
              ? (s as any).crestElevationM
              : 'topElevationM' in s && typeof (s as any).topElevationM === 'number'
              ? (s as any).topElevationM
              : zBase + 3.0;

          // A. Cylindrical Circle Island / Obstacle
          if (s.type === 'circle') {
            const circle = s as any;
            const center = circle.center || s.coordinates?.[0];
            if (center) {
              const [cx, cy] = toLocalXY(center.lat, center.lng);
              const r = circle.radiusM || 4.0;
              const nSeg = 16;
              const topPts: { px: number; py: number; depth: number }[] = [];
              const botPts: { px: number; py: number; depth: number }[] = [];

              for (let k = 0; k < nSeg; k++) {
                const th = (2 * Math.PI * k) / nSeg;
                const px = cx + r * Math.cos(th);
                const py = cy + r * Math.sin(th);
                topPts.push(project(px, py, zTop));
                botPts.push(project(px, py, zBase));
              }

              // Top disc
              const avgDepth = topPts.reduce((sum, p) => sum + p.depth, 0) / nSeg;
              polygons.push({
                depth: avgDepth + 1.2,
                points: topPts.map((p) => ({ px: p.px, py: p.py })),
                fillColor: solidTopColor,
                strokeColor: solidStrokeColor,
                lineWidth: 1.0,
              });

              // Side cylinder facets
              for (let k = 0; k < nSeg; k++) {
                const next = (k + 1) % nSeg;
                const fTop1 = topPts[k];
                const fTop2 = topPts[next];
                const fBot1 = botPts[k];
                const fBot2 = botPts[next];
                const sideDepth = (fTop1.depth + fTop2.depth + fBot1.depth + fBot2.depth) * 0.25;
                polygons.push({
                  depth: sideDepth + 1.0,
                  points: [
                    { px: fBot1.px, py: fBot1.py },
                    { px: fBot2.px, py: fBot2.py },
                    { px: fTop2.px, py: fTop2.py },
                    { px: fTop1.px, py: fTop1.py },
                  ],
                  fillColor: solidSideColor,
                  strokeColor: '#0f172a',
                  lineWidth: 0.5,
                });
              }
              continue;
            }
          }

          // B. Extruded 3D Polygon, Rectangle, or Solid Obstacle
          if (
            (s.type === 'polygon' || s.type === 'rectangle' || s.type === 'obstacle') &&
            s.coordinates &&
            s.coordinates.length >= 3
          ) {
            const localCoords = s.coordinates.map((c) => toLocalXY(c.lat, c.lng));
            const topPts = localCoords.map(([x, y]) => project(x, y, zTop));
            const botPts = localCoords.map(([x, y]) => project(x, y, zBase));

            const avgDepth = topPts.reduce((sum, p) => sum + p.depth, 0) / topPts.length;

            // Top polygon cap
            polygons.push({
              depth: avgDepth + 1.2,
              points: topPts.map((p) => ({ px: p.px, py: p.py })),
              fillColor: solidTopColor,
              strokeColor: solidStrokeColor,
              lineWidth: 1.0,
            });

            // Side walls
            for (let k = 0; k < topPts.length; k++) {
              const next = (k + 1) % topPts.length;
              const fTop1 = topPts[k];
              const fTop2 = topPts[next];
              const fBot1 = botPts[k];
              const fBot2 = botPts[next];
              const sideDepth = (fTop1.depth + fTop2.depth + fBot1.depth + fBot2.depth) * 0.25;
              polygons.push({
                depth: sideDepth + 1.0,
                points: [
                  { px: fBot1.px, py: fBot1.py },
                  { px: fBot2.px, py: fBot2.py },
                  { px: fTop2.px, py: fTop2.py },
                  { px: fTop1.px, py: fTop1.py },
                ],
                fillColor: solidSideColor,
                strokeColor: '#0f172a',
                lineWidth: 0.5,
              });
            }
            continue;
          }

          // C. Volumetric Line / Polyline / Levee / Weir Wall Prism
          if (s.coordinates && s.coordinates.length >= 2) {
            const halfW = 0.5 * Math.max(1.0, (s as any).wallThicknessM || 2.0);
            for (let i = 0; i < s.coordinates.length - 1; i++) {
              const [x1, y1] = toLocalXY(s.coordinates[i].lat, s.coordinates[i].lng);
              const [x2, y2] = toLocalXY(s.coordinates[i + 1].lat, s.coordinates[i + 1].lng);
              const dx = x2 - x1;
              const dy = y2 - y1;
              const len = Math.max(1e-4, Math.hypot(dx, dy));
              const nx = (-dy / len) * halfW;
              const ny = (dx / len) * halfW;

              const c1 = project(x1 + nx, y1 + ny, zTop);
              const c2 = project(x1 - nx, y1 - ny, zTop);
              const c3 = project(x2 - nx, y2 - ny, zTop);
              const c4 = project(x2 + nx, y2 + ny, zTop);

              const b1 = project(x1 + nx, y1 + ny, zBase);
              const b2 = project(x1 - nx, y1 - ny, zBase);
              const b3 = project(x2 - nx, y2 - ny, zBase);
              const b4 = project(x2 + nx, y2 + ny, zBase);

              const segDepth = (c1.depth + c2.depth + c3.depth + c4.depth) * 0.25;

              // Top face
              polygons.push({
                depth: segDepth + 1.2,
                points: [c1, c2, c3, c4],
                fillColor: solidTopColor,
                strokeColor: solidStrokeColor,
                lineWidth: 1.0,
              });

              // Side faces
              polygons.push({
                depth: (b1.depth + b4.depth + c4.depth + c1.depth) * 0.25 + 1.0,
                points: [b1, b4, c4, c1],
                fillColor: solidSideColor,
                strokeColor: '#0f172a',
                lineWidth: 0.5,
              });
              polygons.push({
                depth: (b3.depth + b2.depth + c2.depth + c3.depth) * 0.25 + 1.0,
                points: [b3, b2, c2, c3],
                fillColor: solidSideColor,
                strokeColor: '#0f172a',
                lineWidth: 0.5,
              });
            }
            continue;
          }

          // Fallback cell-based bounding box
          for (const cellIdx of s.cellIndices) {
            const cell = cells[cellIdx];
            if (!cell) continue;

            const cBase = cell.bedElevation;
            const cTop = zTop;
            const hW = Math.max(2.0, Math.sqrt(cell.areaM2) * 0.4);
            const cX = cell.centerX;
            const cY = cell.centerY;

            const topP0 = project(cX - hW, cY - hW, cTop);
            const topP1 = project(cX + hW, cY - hW, cTop);
            const topP2 = project(cX + hW, cY + hW, cTop);
            const topP3 = project(cX - hW, cY + hW, cTop);

            const botP0 = project(cX - hW, cY - hW, cBase);
            const botP1 = project(cX + hW, cY - hW, cBase);
            const botP2 = project(cX + hW, cY + hW, cBase);
            const botP3 = project(cX - hW, cY + hW, cBase);

            const structDepth = (topP0.depth + topP1.depth + topP2.depth + topP3.depth) * 0.25;

            // Top face
            polygons.push({
              depth: structDepth + 1.0,
              points: [topP0, topP1, topP2, topP3],
              fillColor: solidTopColor,
              strokeColor: solidStrokeColor,
              lineWidth: 1.0,
            });

            // Side faces
            polygons.push({
              depth: structDepth + 0.8,
              points: [botP0, botP1, topP1, topP0],
              fillColor: solidSideColor,
              strokeColor: '#0f172a',
              lineWidth: 0.5,
            });
            polygons.push({
              depth: structDepth + 0.8,
              points: [botP1, botP2, topP2, topP1],
              fillColor: solidSideColor,
              strokeColor: '#0f172a',
              lineWidth: 0.5,
            });
          }
        }
      }

      // Sort polygons by depth (Back-to-Front Painter's Algorithm)
      polygons.sort((a, b) => a.depth - b.depth);

      // Draw sorted 3D polygons
      for (const poly of polygons) {
        if (poly.points.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(poly.points[0].px, poly.points[0].py);
        for (let k = 1; k < poly.points.length; k++) {
          ctx.lineTo(poly.points[k].px, poly.points[k].py);
        }
        ctx.closePath();
        ctx.fillStyle = poly.fillColor;
        ctx.fill();
        if (poly.strokeColor) {
          ctx.strokeStyle = poly.strokeColor;
          ctx.lineWidth = poly.lineWidth || 0.5;
          ctx.stroke();
        }
      }

      // 4. Render 3D Lagrangian Velocity Streamlines (Flow Ribbons)
      if (showStreamlines) {
        const numStreamlines = 14;
        const timeOffset = animTimeRef.current;

        for (let stream = 0; stream < numStreamlines; stream++) {
          const lateralFrac = (stream + 0.5) / numStreamlines;
          const startJ = Math.floor(lateralFrac * (ny - 1));

          ctx.beginPath();
          let started = false;

          for (let i = 0; i < nx; i += 2) {
            const cIdx = i * ny + startJ;
            const cell = cells[cIdx];
            if (!cell) continue;

            const h = hydro.depth[cIdx] || 0;
            if (h < 0.01) continue;

            const vel = hydro.velocityMag[cIdx] || 0;
            const wse = cell.bedElevation + h * 0.7; // 70% depth streamlines

            // Small wave oscillation along streamline
            const pulse = 0.05 * Math.sin(timeOffset * 2.0 + i * 0.4);
            const pt = project(cell.centerX, cell.centerY, wse + pulse);

            if (!started) {
              ctx.moveTo(pt.px, pt.py);
              started = true;
            } else {
              ctx.lineTo(pt.px, pt.py);
            }
          }

          if (started) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.lineWidth = 2.0;
            ctx.stroke();
          }
        }
      }

      // 5. Render 3D Velocity Vector Glyphs (Cones)
      if (showVectorGlyphs) {
        const step = Math.max(1, Math.floor(nx / 16));
        for (let i = 0; i < nx; i += step) {
          for (let j = 0; j < ny; j += Math.max(1, Math.floor(ny / 5))) {
            const cIdx = i * ny + j;
            const cell = cells[cIdx];
            if (!cell) continue;

            const h = hydro.depth[cIdx] || 0;
            const vel = hydro.velocityMag[cIdx] || 0;
            if (h < 0.02 || vel < 0.05) continue;

            const u = hydro.u[cIdx] || 0;
            const v = hydro.v[cIdx] || 0;
            const wse = cell.bedElevation + h;

            const pStart = project(cell.centerX, cell.centerY, wse);
            const vecLen = Math.min(25, vel * 12);
            const pEnd = project(
              cell.centerX + (u / vel) * (maxDim * 0.03),
              cell.centerY + (v / vel) * (maxDim * 0.03),
              wse
            );

            ctx.beginPath();
            ctx.moveTo(pStart.px, pStart.py);
            ctx.lineTo(pEnd.px, pEnd.py);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.8;
            ctx.stroke();

            // Arrow head
            const angle = Math.atan2(pEnd.py - pStart.py, pEnd.px - pStart.px);
            ctx.beginPath();
            ctx.moveTo(pEnd.px, pEnd.py);
            ctx.lineTo(pEnd.px - 6 * Math.cos(angle - Math.PI / 6), pEnd.py - 6 * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(pEnd.px - 6 * Math.cos(angle + Math.PI / 6), pEnd.py - 6 * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fillStyle = '#38bdf8';
            ctx.fill();
          }
        }
      }

      // 6. Render 3D Cut Plane / Slice
      if (showCutPlane) {
        if (cutPlaneType === 'transverse') {
          const stationIdx = Math.floor(cutStationRatio * (nx - 1));
          const wsePts: { px: number; py: number }[] = [];
          const bedPts: { px: number; py: number }[] = [];

          for (let j = 0; j < ny; j++) {
            const cIdx = stationIdx * ny + j;
            const cell = cells[cIdx];
            if (!cell) continue;
            const h = hydro.depth[cIdx] || 0;
            const wse = cell.bedElevation + h;
            wsePts.push(project(cell.centerX, cell.centerY, wse));
            bedPts.push(project(cell.centerX, cell.centerY, cell.bedElevation));
          }

          if (wsePts.length >= 2 && bedPts.length >= 2) {
            // Filled water column cross-section
            ctx.beginPath();
            ctx.moveTo(wsePts[0].px, wsePts[0].py);
            for (let k = 1; k < wsePts.length; k++) {
              ctx.lineTo(wsePts[k].px, wsePts[k].py);
            }
            for (let k = bedPts.length - 1; k >= 0; k--) {
              ctx.lineTo(bedPts[k].px, bedPts[k].py);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
            ctx.fill();

            // Water surface stroke
            ctx.beginPath();
            ctx.moveTo(wsePts[0].px, wsePts[0].py);
            for (let k = 1; k < wsePts.length; k++) {
              ctx.lineTo(wsePts[k].px, wsePts[k].py);
            }
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3.0;
            ctx.stroke();

            // Bed invert stroke
            ctx.beginPath();
            ctx.moveTo(bedPts[0].px, bedPts[0].py);
            for (let k = 1; k < bedPts.length; k++) {
              ctx.lineTo(bedPts[k].px, bedPts[k].py);
            }
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2.0;
            ctx.stroke();
          }
        } else if (cutPlaneType === 'longitudinal') {
          const latIdx = Math.floor(cutStationRatio * (ny - 1));
          const wsePts: { px: number; py: number }[] = [];
          const bedPts: { px: number; py: number }[] = [];

          for (let i = 0; i < nx; i++) {
            const cIdx = i * ny + latIdx;
            const cell = cells[cIdx];
            if (!cell) continue;
            const h = hydro.depth[cIdx] || 0;
            const wse = cell.bedElevation + h;
            wsePts.push(project(cell.centerX, cell.centerY, wse));
            bedPts.push(project(cell.centerX, cell.centerY, cell.bedElevation));
          }

          if (wsePts.length >= 2 && bedPts.length >= 2) {
            // Filled water column longitudinal profile
            ctx.beginPath();
            ctx.moveTo(wsePts[0].px, wsePts[0].py);
            for (let k = 1; k < wsePts.length; k++) {
              ctx.lineTo(wsePts[k].px, wsePts[k].py);
            }
            for (let k = bedPts.length - 1; k >= 0; k--) {
              ctx.lineTo(bedPts[k].px, bedPts[k].py);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
            ctx.fill();

            // Free surface profile
            ctx.beginPath();
            ctx.moveTo(wsePts[0].px, wsePts[0].py);
            for (let k = 1; k < wsePts.length; k++) {
              ctx.lineTo(wsePts[k].px, wsePts[k].py);
            }
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 3.0;
            ctx.stroke();

            // Bed thalweg profile
            ctx.beginPath();
            ctx.moveTo(bedPts[0].px, bedPts[0].py);
            for (let k = 1; k < bedPts.length; k++) {
              ctx.lineTo(bedPts[k].px, bedPts[k].py);
            }
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2.0;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    isOpen,
    mesh,
    hydro,
    turb,
    structures,
    scalarField,
    colorPalette,
    showWaterSurface,
    showBedTerrain,
    showStreamlines,
    showVectorGlyphs,
    showCadStructures,
    showCutPlane,
    cutPlaneType,
    cutStationRatio,
    verticalExaggeration,
    wireframe,
    isAutoRotating,
    fieldRange,
  ]);

  // Window mouseup listener prevents stuck dragging when mouse is released outside canvas
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Mouse interaction handlers for 3D Camera Orbit & Pan
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragButtonRef.current = e.button;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    if (e.buttons === 0) {
      isDraggingRef.current = false;
      return;
    }
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    if (dragButtonRef.current === 0 && !e.shiftKey) {
      // Left click: Orbit
      cameraRef.current.yaw += dx * 0.008;
      cameraRef.current.pitch = Math.max(
        0.05,
        Math.min(Math.PI * 0.48, cameraRef.current.pitch + dy * 0.008)
      );
    } else {
      // Right click or Shift+Left click: Pan
      cameraRef.current.distance = Math.max(0.4, cameraRef.current.distance + dy * 0.003);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomDelta = e.deltaY * 0.001;
    cameraRef.current.distance = Math.max(0.3, Math.min(4.0, cameraRef.current.distance + zoomDelta));
  };

  // Reset Camera Views
  const setCameraView = (view: 'iso' | 'top' | 'side') => {
    if (view === 'iso') {
      cameraRef.current.pitch = 0.65;
      cameraRef.current.yaw = 0.85;
      cameraRef.current.distance = 1.4;
    } else if (view === 'top') {
      cameraRef.current.pitch = 0.05;
      cameraRef.current.yaw = 0.0;
      cameraRef.current.distance = 1.2;
    } else if (view === 'side') {
      cameraRef.current.pitch = 1.45;
      cameraRef.current.yaw = Math.PI * 0.5;
      cameraRef.current.distance = 1.3;
    }
  };

  // Export 3D VTK for ParaView Desktop
  const handleExportVtk = () => {
    const vtkData = exportRiverToVtk3D(mesh, hydro, turb, 8, structures);
    const blob = new Blob([vtkData], { type: 'text/plain;charset=utf-8' });
    triggerFileDownload(blob, `${mesh.id}-paraview-3d.vtk`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 animate-fade-in">
      <div className="relative flex flex-col w-full h-full max-w-7xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="text-xl">📊</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  ParaView 3D CFD Interactive Post-Processor
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-950 text-blue-300 border border-blue-700/60 uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  OpenFOAM FVM Solver Core
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {mesh.name} &bull; {mesh.cells.length} Finite-Volume Cells &bull; t = {hydro.timeSec.toFixed(1)}s (Step #{hydro.stepCount})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Real-time simulation toggle */}
            {onToggleSimulation && (
              <button
                type="button"
                onClick={onToggleSimulation}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  isSimulating
                    ? 'bg-amber-600 hover:bg-amber-500 text-white shadow ring-2 ring-amber-400/50'
                    : 'bg-emerald-700 hover:bg-emerald-600 text-white shadow'
                }`}
              >
                <span>{isSimulating ? '⏸️' : '▶️'}</span>
                <span>{isSimulating ? 'Pause CFD' : 'Simulate 3D'}</span>
              </button>
            )}

            {/* Download ParaView VTK */}
            <button
              type="button"
              onClick={handleExportVtk}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition shadow"
              title="Download 3D Structured Grid (.vtk) for ParaView Desktop"
            >
              <span>📥</span>
              <span>Export .VTK</span>
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Toolbar & Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs">
          {/* Scalar Field Selector */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">Color by Field:</span>
            <select
              value={scalarField}
              onChange={(e) => setScalarField(e.target.value as ParaViewScalarField)}
              className="bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1 text-slate-100 font-medium focus:outline-none focus:border-cyan-500"
            >
              <option value="velocity">Velocity Magnitude |V| (m/s)</option>
              <option value="wse">Water Surface Elevation (m)</option>
              <option value="depth">Water Depth h (m)</option>
              <option value="pressure">Pressure / Head (kPa)</option>
              <option value="froude">Froude Number Fr</option>
              <option value="turbK">Turbulent Kinetic Energy k (m²/s²)</option>
            </select>

            {/* Colormap Palette Selector */}
            <select
              value={colorPalette}
              onChange={(e) => setColorPalette(e.target.value as ColorMapPalette)}
              className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-slate-200 text-xs"
            >
              <option value="cool-to-warm">ParaView Cool-to-Warm</option>
              <option value="viridis">Viridis</option>
              <option value="turbo">Google Turbo</option>
              <option value="rainbow">Rainbow / Jet</option>
            </select>
          </div>

          {/* 3D Visual Layer Toggles */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={showWaterSurface}
                onChange={(e) => setShowWaterSurface(e.target.checked)}
                className="rounded border-slate-700 text-cyan-500"
              />
              <span>Water Surface</span>
            </label>

            <label className="flex items-center gap-1 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={showBedTerrain}
                onChange={(e) => setShowBedTerrain(e.target.checked)}
                className="rounded border-slate-700 text-cyan-500"
              />
              <span>Bed Bathymetry</span>
            </label>

            <label className="flex items-center gap-1 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={showStreamlines}
                onChange={(e) => setShowStreamlines(e.target.checked)}
                className="rounded border-slate-700 text-cyan-500"
              />
              <span>Streamlines</span>
            </label>

            <label className="flex items-center gap-1 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={showVectorGlyphs}
                onChange={(e) => setShowVectorGlyphs(e.target.checked)}
                className="rounded border-slate-700 text-cyan-500"
              />
              <span>Vector Glyphs</span>
            </label>

            <label className="flex items-center gap-1 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={showCadStructures}
                onChange={(e) => setShowCadStructures(e.target.checked)}
                className="rounded border-slate-700 text-cyan-500"
              />
              <span>CAD Structures ({structures.length})</span>
            </label>

            <label className="flex items-center gap-1 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={wireframe}
                onChange={(e) => setWireframe(e.target.checked)}
                className="rounded border-slate-700 text-cyan-500"
              />
              <span>Wireframe</span>
            </label>
          </div>

          {/* Camera Presets & Vertical Exaggeration */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400">View:</span>
            <button
              type="button"
              onClick={() => setCameraView('iso')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 border border-slate-700 text-[11px]"
            >
              Isometric
            </button>
            <button
              type="button"
              onClick={() => setCameraView('top')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 border border-slate-700 text-[11px]"
            >
              Top (2D)
            </button>
            <button
              type="button"
              onClick={() => setCameraView('side')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 border border-slate-700 text-[11px]"
            >
              Section
            </button>

            <button
              type="button"
              onClick={() => setIsAutoRotating(!isAutoRotating)}
              className={`px-2 py-0.5 rounded text-[11px] border transition ${
                isAutoRotating
                  ? 'bg-cyan-700 border-cyan-400 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              {isAutoRotating ? '⏹ Stop' : '🔄 Orbit'}
            </button>

            {/* Vertical Exaggeration */}
            <div className="flex items-center gap-1 ml-2 text-slate-400">
              <span>Z:</span>
              <input
                type="range"
                min="1"
                max="8"
                step="0.5"
                value={verticalExaggeration}
                onChange={(e) => setVerticalExaggeration(parseFloat(e.target.value))}
                className="w-16 accent-cyan-500"
                title={`Vertical exaggeration: ${verticalExaggeration}x`}
              />
              <span className="text-[11px] text-cyan-400 font-mono w-6">{verticalExaggeration}x</span>
            </div>
          </div>
        </div>

        {/* Main 3D Canvas Area */}
        <div className="relative flex-1 w-full h-full min-h-[450px] bg-slate-950 overflow-hidden cursor-grab active:cursor-grabbing">
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            className="w-full h-full block"
          />

          {/* ParaView Scalar Colorbar (HUD Overlay) */}
          <div className="absolute top-4 right-4 bg-slate-900/90 border border-slate-700/80 p-3 rounded-xl shadow-2xl backdrop-blur-sm pointer-events-none w-48">
            <div className="text-[11px] font-bold text-slate-200 capitalize mb-1 flex items-center justify-between">
              <span>{scalarField}</span>
              <span className="text-[10px] text-slate-400 font-normal">
                {scalarField === 'velocity'
                  ? 'm/s'
                  : scalarField === 'wse' || scalarField === 'depth'
                  ? 'm'
                  : scalarField === 'pressure'
                  ? 'kPa'
                  : ''}
              </span>
            </div>

            {/* Gradient bar */}
            <div
              className="h-3.5 w-full rounded border border-slate-700 my-1"
              style={{
                background:
                  colorPalette === 'cool-to-warm'
                    ? 'linear-gradient(to right, rgb(59, 76, 192), rgb(220, 220, 220), rgb(180, 4, 38))'
                    : colorPalette === 'viridis'
                    ? 'linear-gradient(to right, #440154, #31688e, #35b779, #fde725)'
                    : colorPalette === 'turbo'
                    ? 'linear-gradient(to right, #30123b, #1ae4b6, #a2fc3c, #e8380d)'
                    : 'linear-gradient(to right, blue, cyan, lime, yellow, red)',
              }}
            />

            {/* Min and max ticks */}
            <div className="flex justify-between text-[10px] text-slate-300 font-mono">
              <span>{fieldRange.min.toFixed(2)}</span>
              <span>{((fieldRange.min + fieldRange.max) * 0.5).toFixed(2)}</span>
              <span>{fieldRange.max.toFixed(2)}</span>
            </div>
          </div>

          {/* Navigation Guide (HUD Overlay) */}
          <div className="absolute bottom-3 left-4 text-[10px] text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800 pointer-events-none flex items-center gap-3">
            <span>🖱️ Left-Drag: Orbit</span>
            <span>Right-Drag: Zoom</span>
            <span>Wheel: Scale</span>
            <span className="text-cyan-400 font-semibold">Ready for ParaView Desktop VTK</span>
          </div>
        </div>
      </div>
    </div>
  );
};
