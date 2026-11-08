/**
 * High-Performance Leaflet / Canvas 2D CFD Results Overlay & Velocity Field Renderer
 * (Uses native Leaflet L.Map directly, no react-leaflet dependency)
 *
 * Implements continuous, ultra-smooth sub-grid bilinear CFD contour plotting
 * with classic Ansys Fluent / OpenFOAM multi-stop Rainbow palette, solid CAD
 * mechanical structures with sharp specular boundaries, no-slip boundary layers,
 * and an on-canvas scientific colorbar legend.
 */

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  RiverGridMesh,
  HydrodynamicsState,
  RiverGridCell,
} from '../types/riverReach';
import { TurbulenceState } from '../types/turbulence';
import { SedimentState } from '../types/sediment';
import { RiverHydraulicStructure } from '../structures/structureTypes';
import { expandPolylineToSolidPolygon } from '../structures/cadStructureBuilder';

export type RiverThematicField =
  | 'depth'
  | 'pressure'
  | 'velocity'
  | 'turbK'
  | 'froude'
  | 'wse'
  | 'shear'
  | 'nuT'
  | 'sediment'
  | 'bedChange';

interface RiverResultsOverlayProps {
  map: L.Map | null;
  mesh: RiverGridMesh;
  hydro: HydrodynamicsState;
  turb: TurbulenceState;
  sed: SedimentState;
  structures: RiverHydraulicStructure[];
  thematicDisplay: RiverThematicField;
  onSelectCell?: (cell: RiverGridCell, cellIdx: number) => void;
  showVelocityVectors?: boolean;
  showStreamlines?: boolean;
  isSimulating?: boolean;
  hydroRef?: React.RefObject<HydrodynamicsState | null>;
  turbRef?: React.RefObject<TurbulenceState | null>;
  sedRef?: React.RefObject<SedimentState | null>;
  isMoveMeshMode?: boolean;
}

import {
  getFluentCfdColor,
  interpolateIsoSegment,
} from '../visualization/cfdColorMap';

export { getFluentCfdColor };

export const RiverResultsOverlay: React.FC<RiverResultsOverlayProps> = ({
  map,
  mesh,
  hydro,
  turb,
  sed,
  structures,
  thematicDisplay,
  onSelectCell,
  showVelocityVectors = true,
  showStreamlines = true,
  isSimulating = false,
  hydroRef,
  turbRef,
  sedRef,
  isMoveMeshMode = false,
}) => {
  const overlayRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodeCacheRef = useRef<{ key: string; pts: { px: number; py: number }[][] } | null>(null);
  const particlesRef = useRef<{ fi: number; fj: number; age: number; maxAge: number; trail: { x: number; y: number }[] }[]>([]);

  // Store latest props in a ref to avoid recreating the Leaflet layer on every tick
  const propsRef = useRef({
    mesh,
    hydro,
    turb,
    sed,
    structures,
    thematicDisplay,
    showVelocityVectors,
    showStreamlines,
    onSelectCell,
    isSimulating,
    hydroRef,
    turbRef,
    sedRef,
    isMoveMeshMode,
  });

  propsRef.current = {
    mesh,
    hydro,
    turb,
    sed,
    structures,
    thematicDisplay,
    showVelocityVectors,
    showStreamlines,
    onSelectCell,
    isSimulating,
    hydroRef,
    turbRef,
    sedRef,
    isMoveMeshMode,
  };

  // Main rendering routine executed on every redraw
  const renderFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;

    const {
      mesh: curMesh,
      hydro: stateHydro,
      turb: stateTurb,
      sed: stateSed,
      structures: curStructures,
      thematicDisplay: curThematic,
      showVelocityVectors: curShowVectors,
      showStreamlines: curShowStreamlines,
      isSimulating: simulatingActive,
      hydroRef: liveHydroRef,
      turbRef: liveTurbRef,
      sedRef: liveSedRef,
      isMoveMeshMode: curIsMoveMode,
    } = propsRef.current;

    const curHydro = (simulatingActive && liveHydroRef?.current) ? liveHydroRef.current : stateHydro;
    const curTurb = (simulatingActive && liveTurbRef?.current) ? liveTurbRef.current : stateTurb;
    const curSed = (simulatingActive && liveSedRef?.current) ? liveSedRef.current : stateSed;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = map.getSize();
    const topLeft = map.containerPointToLayerPoint([0, 0]);

    L.DomUtil.setPosition(canvas, topLeft);

    const targetW = Math.round(size.x * dpr);
    const targetH = Math.round(size.y * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.style.width = size.x + 'px';
      canvas.style.height = size.y + 'px';
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);

    const nx = curMesh.nx;
    const ny = curMesh.ny;
    const numCells = curMesh.cells.length;

    // Build solid obstacle set for no-slip masking
    const solidCellSet = new Set<number>();
    for (const s of curStructures) {
      if (!s.enabled) continue;
      const isSolid =
        (s as any).solidMasking === true ||
        (s.type === 'obstacle' && (s as any).solidMasking !== false) ||
        (s.type === 'circle' && (s as any).solidMasking !== false) ||
        (s.type === 'bridge-pier' && (s as any).solidMasking !== false) ||
        (s.type === 'spurdike' && (s as any).solidMasking !== false && (s.permeability === undefined || s.permeability < 0.2)) ||
        ((s.type === 'polygon' ||
          s.type === 'rectangle' ||
          s.type === 'line' ||
          s.type === 'polyline' ||
          s.type === 'levee' ||
          s.type === 'custom-deflector' ||
          s.type === 'gate' ||
          s.type === 'weir') &&
          (s as any).solidMasking);
      if (isSolid && s.cellIndices) {
        for (const idx of s.cellIndices) {
          if (idx >= 0 && idx < numCells) solidCellSet.add(idx);
        }
      }
    }

    // 1. Extract dynamic scalar field range
    let minVal = Infinity;
    let maxVal = -Infinity;

    const cellScalars = new Float32Array(numCells);
    let fieldTitle = 'Velocity Magnitude';
    let fieldUnit = 'm/s';

    for (let c = 0; c < numCells; c++) {
      if (solidCellSet.has(c)) {
        cellScalars[c] = 0.0;
        continue;
      }

      let val = 0.0;
      if (curThematic === 'depth') {
        val = curHydro.depth[c] || 0.0;
        fieldTitle = 'Water Depth';
        fieldUnit = 'm';
      } else if (curThematic === 'pressure') {
        const h = curHydro.depth[c] || 0.0;
        const vel = curHydro.velocityMag[c] || 0.0;
        val = h + (vel * vel) / (2.0 * 9.80665);
        fieldTitle = 'Total Pressure Head';
        fieldUnit = 'm';
      } else if (curThematic === 'turbK') {
        val = curTurb.k ? curTurb.k[c] : 0.0;
        fieldTitle = 'Turbulent Kinetic Energy k';
        fieldUnit = 'm²/s²';
      } else if (curThematic === 'wse') {
        val = curHydro.wse[c] || curMesh.cells[c].bedElevation;
        fieldTitle = 'Water Surface Elev';
        fieldUnit = 'm MSL';
      } else if (curThematic === 'velocity') {
        val = curHydro.velocityMag[c] || 0.0;
        fieldTitle = 'Velocity Magnitude';
        fieldUnit = 'm/s';
      } else if (curThematic === 'froude') {
        val = curHydro.froude[c] || 0.0;
        fieldTitle = 'Froude Number';
        fieldUnit = 'Fr';
      } else if (curThematic === 'shear') {
        val = curHydro.shearStress[c] || 0.0;
        fieldTitle = 'Bed Shear Stress';
        fieldUnit = 'Pa';
      } else if (curThematic === 'nuT') {
        val = curTurb.nuT[c] || 0.0;
        fieldTitle = 'Eddy Viscosity nu_t';
        fieldUnit = 'm²/s';
      } else if (curThematic === 'sediment') {
        val = curSed.concentrationKgM3[c] || 0.0;
        fieldTitle = 'Suspended Sediment';
        fieldUnit = 'kg/m³';
      } else if (curThematic === 'bedChange') {
        val = curSed.bedElevationChangeM[c] || 0.0;
        fieldTitle = 'Bed Morphodynamics';
        fieldUnit = 'm';
      } else {
        val = curHydro.velocityMag[c] || 0.0;
      }

      cellScalars[c] = val;

      if (curHydro.isWet[c] === 1) {
        minVal = Math.min(minVal, val);
        maxVal = Math.max(maxVal, val);
      }
    }

    if (curThematic === 'velocity') {
      minVal = 0.0;
      maxVal = Math.max(1.0, maxVal);
    } else if (curThematic === 'pressure') {
      minVal = 0.0;
      maxVal = Math.max(0.5, maxVal);
    } else if (curThematic === 'turbK') {
      minVal = 0.0;
      maxVal = Math.max(1e-4, maxVal);
    } else if (minVal >= maxVal) {
      minVal = 0.0;
      maxVal = 1.0;
    }

    // 2. Reconstruct nodal positions and nodal scalar values on (nx+1) x (ny+1) mesh
    const zoom = map.getZoom();
    const center = map.getCenter();
    const boundsKey = curMesh.bounds ? curMesh.bounds.map((b) => b.toFixed(6)).join(',') : '';
    const c0 = curMesh.cells[0]?.corners?.[0];
    const c0Key = c0 ? `${c0[0].toFixed(6)}_${c0[1].toFixed(6)}` : '';
    const lastCell = curMesh.cells[curMesh.cells.length - 1];
    const cN = lastCell?.corners?.[2] || lastCell?.corners?.[0];
    const cNKey = cN ? `${cN[0].toFixed(6)}_${cN[1].toFixed(6)}` : '';
    const cacheKey = `${curMesh.nx}_${curMesh.ny}_${boundsKey}_${c0Key}_${cNKey}_${zoom}_${center.lat.toFixed(5)}_${center.lng.toFixed(5)}_${size.x}_${size.y}`;

    let nodePts: { px: number; py: number }[][];
    if (nodeCacheRef.current && nodeCacheRef.current.key === cacheKey) {
      nodePts = nodeCacheRef.current.pts;
    } else {
      particlesRef.current = []; // Re-seed streamline traces on mesh movement/zoom change
      nodePts = [];
      for (let i = 0; i <= nx; i++) {
        nodePts[i] = [];
        for (let j = 0; j <= ny; j++) {
          let lat = 0;
          let lng = 0;

          if (i < nx && j < ny && curMesh.cells[i * ny + j]?.corners?.[0]) {
            [lat, lng] = curMesh.cells[i * ny + j].corners[0];
          } else if (i === nx && j < ny && curMesh.cells[(nx - 1) * ny + j]?.corners?.[1]) {
            [lat, lng] = curMesh.cells[(nx - 1) * ny + j].corners[1];
          } else if (i === nx && j === ny && curMesh.cells[(nx - 1) * ny + ny - 1]?.corners?.[2]) {
            [lat, lng] = curMesh.cells[(nx - 1) * ny + ny - 1].corners[2];
          } else if (i < nx && j === ny && curMesh.cells[i * ny + ny - 1]?.corners?.[3]) {
            [lat, lng] = curMesh.cells[i * ny + ny - 1].corners[3];
          } else {
            const fallbackCell = curMesh.cells[Math.min(i, nx - 1) * ny + Math.min(j, ny - 1)];
            if (fallbackCell) {
              lat = fallbackCell.centerLat;
              lng = fallbackCell.centerLng;
            }
          }

          const pt = map.latLngToContainerPoint([lat, lng]);
          nodePts[i][j] = { px: pt.x, py: pt.y };
        }
      }
      nodeCacheRef.current = { key: cacheKey, pts: nodePts };
    }

    const nodeScalars: number[][] = [];

    for (let i = 0; i <= nx; i++) {
      nodeScalars[i] = [];

      for (let j = 0; j <= ny; j++) {
        // Average adjacent cell values (4 quadrants)
        const adjacentIndices: number[] = [];
        if (i > 0 && j > 0) adjacentIndices.push((i - 1) * ny + (j - 1));
        if (i < nx && j > 0) adjacentIndices.push(i * ny + (j - 1));
        if (i > 0 && j < ny) adjacentIndices.push((i - 1) * ny + j);
        if (i < nx && j < ny) adjacentIndices.push(i * ny + j);

        let hasSolidNeighbor = false;
        let sumVal = 0.0;
        let wetCount = 0;

        for (const cIdx of adjacentIndices) {
          if (cIdx >= 0 && cIdx < numCells) {
            if (solidCellSet.has(cIdx)) {
              hasSolidNeighbor = true;
            }
            if (curHydro.isWet[cIdx] === 1 && !solidCellSet.has(cIdx)) {
              sumVal += cellScalars[cIdx];
              wetCount++;
            }
          }
        }

        // Strict no-slip wall boundary layer: velocity drops to zero at solid interface
        if (hasSolidNeighbor && curThematic === 'velocity') {
          nodeScalars[i][j] = 0.0;
        } else if (wetCount > 0) {
          nodeScalars[i][j] = sumVal / wetCount;
        } else {
          nodeScalars[i][j] = 0.0;
        }
      }
    }

    // 3. Ultra-Smooth Continuous Sub-Grid Bilinear CFD Contour Plotting
    // Subdivides each quadrilateral into 2x2 micro-mesh (4 sub-quads) for 60 FPS real-time rendering
    const subM = 2;

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const cIdx = i * ny + j;
        if (solidCellSet.has(cIdx)) continue; // Handled by solid CAD renderer

        const isWet = curHydro.isWet[cIdx] === 1;

        // Quad 4 corners
        const p00 = nodePts[i][j];
        const p10 = nodePts[i + 1][j];
        const p11 = nodePts[i + 1][j + 1];
        const p01 = nodePts[i][j + 1];

        if (!isWet) {
          // Dry bed terrain background
          ctx.beginPath();
          ctx.moveTo(p00.px, p00.py);
          ctx.lineTo(p10.px, p10.py);
          ctx.lineTo(p11.px, p11.py);
          ctx.lineTo(p01.px, p01.py);
          ctx.closePath();
          ctx.fillStyle = 'rgba(71, 85, 105, 0.25)';
          ctx.fill();
          continue;
        }

        const s00 = nodeScalars[i][j];
        const s10 = nodeScalars[i + 1][j];
        const s11 = nodeScalars[i + 1][j + 1];
        const s01 = nodeScalars[i][j + 1];

        // Bilinear point interpolation helper
        const interpPt = (u: number, v: number): { x: number; y: number } => {
          const invU = 1.0 - u;
          const invV = 1.0 - v;
          return {
            x: invU * invV * p00.px + u * invV * p10.px + u * v * p11.px + invU * v * p01.px,
            y: invU * invV * p00.py + u * invV * p10.py + u * v * p11.py + invU * v * p01.py,
          };
        };

        const interpScalar = (u: number, v: number): number => {
          const invU = 1.0 - u;
          const invV = 1.0 - v;
          return invU * invV * s00 + u * invV * s10 + u * v * s11 + invU * v * s01;
        };

        for (let subU = 0; subU < subM; subU++) {
          const u0 = subU / subM;
          const u1 = (subU + 1) / subM;
          const uMid = (u0 + u1) * 0.5;

          for (let subV = 0; subV < subM; subV++) {
            const v0 = subV / subM;
            const v1 = (subV + 1) / subM;
            const vMid = (v0 + v1) * 0.5;

            const qA = interpPt(u0, v0);
            const qB = interpPt(u1, v0);
            const qC = interpPt(u1, v1);
            const qD = interpPt(u0, v1);

            const sMid = interpScalar(uMid, vMid);
            const tNorm = (sMid - minVal) / Math.max(1e-5, maxVal - minVal);
            const color = getFluentCfdColor(tNorm, 0.98);

            ctx.beginPath();
            ctx.moveTo(qA.x, qA.y);
            ctx.lineTo(qB.x, qB.y);
            ctx.lineTo(qC.x, qC.y);
            ctx.lineTo(qD.x, qD.y);
            ctx.closePath();

            ctx.fillStyle = color;
            ctx.fill();
          }
        }
      }
    }

    // 3b. Interactive Mesh Alignment Wireframe & Guidance Grid (When moving mesh)
    if (curIsMoveMode) {
      ctx.save();
      // Quad cell interior edges
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      for (let j = 0; j <= ny; j++) {
        if (!nodePts[0]?.[j]) continue;
        ctx.moveTo(nodePts[0][j].px, nodePts[0][j].py);
        for (let i = 1; i <= nx; i++) {
          if (nodePts[i]?.[j]) ctx.lineTo(nodePts[i][j].px, nodePts[i][j].py);
        }
      }
      for (let i = 0; i <= nx; i++) {
        if (!nodePts[i]?.[0]) continue;
        ctx.moveTo(nodePts[i][0].px, nodePts[i][0].py);
        for (let j = 1; j <= ny; j++) {
          if (nodePts[i]?.[j]) ctx.lineTo(nodePts[i][j].px, nodePts[i][j].py);
        }
      }
      ctx.stroke();

      // Outer bounding boundary in vibrant cyan
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(nodePts[0][0].px, nodePts[0][0].py);
      for (let i = 1; i <= nx; i++) ctx.lineTo(nodePts[i][0].px, nodePts[i][0].py);
      for (let j = 1; j <= ny; j++) ctx.lineTo(nodePts[nx][j].px, nodePts[nx][j].py);
      for (let i = nx - 1; i >= 0; i--) ctx.lineTo(nodePts[i][ny].px, nodePts[i][ny].py);
      for (let j = ny - 1; j >= 0; j--) ctx.lineTo(nodePts[0][j].px, nodePts[0][j].py);
      ctx.closePath();
      ctx.stroke();

      // Centerline / Thalweg in luminous amber with dashed pattern
      if (curMesh.centerline && curMesh.centerline.length > 0) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.4;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        const p0 = map.latLngToContainerPoint([curMesh.centerline[0].lat, curMesh.centerline[0].lng]);
        ctx.moveTo(p0.x, p0.y);
        for (let k = 1; k < curMesh.centerline.length; k++) {
          const pk = map.latLngToContainerPoint([curMesh.centerline[k].lat, curMesh.centerline[k].lng]);
          ctx.lineTo(pk.x, pk.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Centroid Target Reticle
      const midLat = 0.5 * (curMesh.bounds[0] + curMesh.bounds[2]);
      const midLng = 0.5 * (curMesh.bounds[1] + curMesh.bounds[3]);
      const centerPt = map.latLngToContainerPoint([midLat, midLng]);
      ctx.strokeStyle = '#22d3ee';
      ctx.fillStyle = 'rgba(6, 182, 212, 0.20)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(centerPt.x, centerPt.y, 22, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centerPt.x - 28, centerPt.y);
      ctx.lineTo(centerPt.x + 28, centerPt.y);
      ctx.moveTo(centerPt.x, centerPt.y - 28);
      ctx.lineTo(centerPt.x, centerPt.y + 28);
      ctx.stroke();

      ctx.restore();
    }

    // 4. Subtle Ansys Fluent / ParaView Isocontour Lines
    const numContourLevels = 8;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.lineWidth = 0.8;

    for (let lvl = 1; lvl < numContourLevels; lvl++) {
      const isoTarget = minVal + (lvl / numContourLevels) * (maxVal - minVal);

      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          const cIdx = i * ny + j;
          if (solidCellSet.has(cIdx) || curHydro.isWet[cIdx] !== 1) continue;

          const s00 = nodeScalars[i][j];
          const s10 = nodeScalars[i + 1][j];
          const s11 = nodeScalars[i + 1][j + 1];
          const s01 = nodeScalars[i][j + 1];

          const minCellS = Math.min(s00, s10, s11, s01);
          const maxCellS = Math.max(s00, s10, s11, s01);

          if (isoTarget >= minCellS && isoTarget <= maxCellS) {
            const p00 = nodePts[i][j];
            const p10 = nodePts[i + 1][j];
            const p11 = nodePts[i + 1][j + 1];
            const p01 = nodePts[i][j + 1];

            const crossPts: { x: number; y: number }[] = [];

            // Check edge 00 -> 10
            const t00_10 = interpolateIsoSegment(s00, s10, isoTarget);
            if (t00_10 !== null) {
              crossPts.push({ x: p00.px + t00_10 * (p10.px - p00.px), y: p00.py + t00_10 * (p10.py - p00.py) });
            }
            // Check edge 10 -> 11
            const t10_11 = interpolateIsoSegment(s10, s11, isoTarget);
            if (t10_11 !== null) {
              crossPts.push({ x: p10.px + t10_11 * (p11.px - p10.px), y: p10.py + t10_11 * (p11.py - p10.py) });
            }
            // Check edge 11 -> 01
            const t11_01 = interpolateIsoSegment(s11, s01, isoTarget);
            if (t11_01 !== null) {
              crossPts.push({ x: p11.px + t11_01 * (p01.px - p11.px), y: p11.py + t11_01 * (p01.py - p11.py) });
            }
            // Check edge 01 -> 00
            const t01_00 = interpolateIsoSegment(s01, s00, isoTarget);
            if (t01_00 !== null) {
              crossPts.push({ x: p01.px + t01_00 * (p00.px - p01.px), y: p01.py + t01_00 * (p00.py - p01.py) });
            }

            if (crossPts.length >= 2) {
              ctx.beginPath();
              ctx.moveTo(crossPts[0].x, crossPts[0].y);
              ctx.lineTo(crossPts[1].x, crossPts[1].y);
              if (crossPts.length >= 4) {
                ctx.moveTo(crossPts[2].x, crossPts[2].y);
                ctx.lineTo(crossPts[3].x, crossPts[3].y);
              }
              ctx.stroke();
            }
          }
        }
      }
    }

    // 5. Solid CAD Structures Overlay (Baffles, Impellers, Piers, Weirs, Deflectors)
    // Rendered with brushed metallic steel gradients, specular chamfered borders, and drop shadow
    for (const s of curStructures) {
      if (!s.enabled) continue;

      ctx.save();
      // Drop shadow for authentic 3D depth
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 3;

      const borderMetallicColor = '#64748b';

      if (s.type === 'circle') {
        const circle = s as any;
        const centerCoord = circle.center || s.coordinates?.[0];
        if (centerCoord) {
          const ptCenter = map.latLngToContainerPoint([centerCoord.lat, centerCoord.lng]);
          const ptRadius = map.latLngToContainerPoint([
            centerCoord.lat + (circle.radiusM || 8.0) / 111320.0,
            centerCoord.lng,
          ]);
          const rPx = Math.max(5, Math.hypot(ptCenter.x - ptRadius.x, ptCenter.y - ptRadius.y));

          // Solid metallic gradient disc (brushed titanium/steel)
          const discGrad = ctx.createRadialGradient(
            ptCenter.x - rPx * 0.35,
            ptCenter.y - rPx * 0.35,
            rPx * 0.1,
            ptCenter.x,
            ptCenter.y,
            rPx
          );
          discGrad.addColorStop(0, '#64748b');
          discGrad.addColorStop(0.35, '#334155');
          discGrad.addColorStop(0.75, '#1e293b');
          discGrad.addColorStop(1, '#0f172a');

          ctx.beginPath();
          ctx.arc(ptCenter.x, ptCenter.y, rPx, 0, 2 * Math.PI);
          ctx.fillStyle = discGrad;
          ctx.fill();

          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = borderMetallicColor;
          ctx.lineWidth = 2.0;
          ctx.stroke();

          // Inner specular highlight ring
          ctx.beginPath();
          ctx.arc(ptCenter.x, ptCenter.y, Math.max(2, rPx - 2), 0, 2 * Math.PI);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = 1.0;
          ctx.stroke();
        }
      } else if (s.coordinates && s.coordinates.length >= 3) {
        ctx.beginPath();
        const p0 = map.latLngToContainerPoint([s.coordinates[0].lat, s.coordinates[0].lng]);
        ctx.moveTo(p0.x, p0.y);
        let minX = p0.x, maxX = p0.x, minY = p0.y, maxY = p0.y;
        let sumX = p0.x, sumY = p0.y;

        for (let k = 1; k < s.coordinates.length; k++) {
          const pk = map.latLngToContainerPoint([s.coordinates[k].lat, s.coordinates[k].lng]);
          ctx.lineTo(pk.x, pk.y);
          minX = Math.min(minX, pk.x);
          maxX = Math.max(maxX, pk.x);
          minY = Math.min(minY, pk.y);
          maxY = Math.max(maxY, pk.y);
          sumX += pk.x;
          sumY += pk.y;
        }
        ctx.closePath();

        // Brushed metallic civil gradient
        const metalGrad = ctx.createLinearGradient(minX, minY, maxX, maxY);
        metalGrad.addColorStop(0, '#475569');
        metalGrad.addColorStop(0.25, '#334155');
        metalGrad.addColorStop(0.65, '#1e293b');
        metalGrad.addColorStop(1, '#0f172a');

        ctx.fillStyle = metalGrad;
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = borderMetallicColor;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Inner specular highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
        ctx.lineWidth = 1.0;
        ctx.stroke();

        // Technical badge (Name + Crest Elevation)
        const count = s.coordinates.length;
        const centerPx = { x: sumX / count, y: sumY / count };
        const labelText = `${s.name || s.type.toUpperCase()}${s.crestElevationM !== undefined ? ` • ${s.crestElevationM.toFixed(1)}m` : ''}`;
        ctx.font = 'bold 9px system-ui, -apple-system, sans-serif';
        const textMetrics = ctx.measureText(labelText);
        const badgeW = textMetrics.width + 10;
        const badgeH = 14;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.roundRect(centerPx.x - badgeW * 0.5, centerPx.y - badgeH * 0.5, badgeW, badgeH, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, centerPx.x, centerPx.y);
      } else if (s.coordinates && s.coordinates.length >= 2) {
        // Expand 2-point structure to authentic solid 2D polygon with physical wall thickness
        const wallThick = (s as any).wallThicknessM || (s as any).topWidthM || (s as any).crestWidthM || 3.0;
        const solidFootprint = expandPolylineToSolidPolygon(s.coordinates, wallThick);
        if (solidFootprint.length >= 3) {
          ctx.beginPath();
          const p0 = map.latLngToContainerPoint([solidFootprint[0].lat, solidFootprint[0].lng]);
          ctx.moveTo(p0.x, p0.y);
          let minX = p0.x, maxX = p0.x, minY = p0.y, maxY = p0.y;
          for (let k = 1; k < solidFootprint.length; k++) {
            const pk = map.latLngToContainerPoint([solidFootprint[k].lat, solidFootprint[k].lng]);
            ctx.lineTo(pk.x, pk.y);
            minX = Math.min(minX, pk.x);
            maxX = Math.max(maxX, pk.x);
            minY = Math.min(minY, pk.y);
            maxY = Math.max(maxY, pk.y);
          }
          ctx.closePath();

          const metalGrad = ctx.createLinearGradient(minX, minY, maxX, maxY);
          metalGrad.addColorStop(0, '#475569');
          metalGrad.addColorStop(0.25, '#334155');
          metalGrad.addColorStop(0.65, '#1e293b');
          metalGrad.addColorStop(1, '#0f172a');

          ctx.fillStyle = metalGrad;
          ctx.fill();

          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = borderMetallicColor;
          ctx.lineWidth = 2.0;
          ctx.stroke();
        }
      } else if (s.cellIndices && s.cellIndices.length > 0) {
        // Draw via cell bounds
        for (const cellIdx of s.cellIndices) {
          const cell = curMesh.cells[cellIdx];
          if (cell && cell.corners.length >= 4) {
            ctx.beginPath();
            const p0 = map.latLngToContainerPoint([cell.corners[0][0], cell.corners[0][1]]);
            ctx.moveTo(p0.x, p0.y);
            for (let k = 1; k < cell.corners.length; k++) {
              const pk = map.latLngToContainerPoint([cell.corners[k][0], cell.corners[k][1]]);
              ctx.lineTo(pk.x, pk.y);
            }
            ctx.closePath();
            ctx.fillStyle = '#242f3d';
            ctx.fill();
            ctx.strokeStyle = borderMetallicColor;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    // 6. Animated CFD Streamlines (Flow-3D / Ansys Fluent streaklines)
    // 6. Dynamic Flowing Streamlines & Particle Advection Traces (Ansys Fluent / Flow-3D Grade)
    if (curShowStreamlines) {
      let particles = particlesRef.current;
      const targetCount = 320;
      if (!particles || particles.length < targetCount) {
        particles = particles || [];
        while (particles.length < targetCount) {
          particles.push({
            fi: Math.random() * Math.max(1, nx - 0.5),
            fj: 0.15 + Math.random() * Math.max(0.2, ny - 1.3),
            age: Math.floor(Math.random() * 60),
            maxAge: 45 + Math.floor(Math.random() * 50),
            trail: [],
          });
        }
        particlesRef.current = particles;
      }

      ctx.save();
      for (let pIdx = 0; pIdx < particles.length; pIdx++) {
        const p = particles[pIdx];
        const ci = Math.floor(p.fi);
        const cj = Math.floor(p.fj);
        const cIdx = ci * ny + cj;

        const isOOB = ci < 0 || ci >= nx || cj < 0 || cj >= ny;
        const isSolid = !isOOB && solidCellSet.has(cIdx);
        const isDry = !isOOB && curHydro.isWet[cIdx] !== 1;

        if (isOOB || isSolid || isDry || p.age >= p.maxAge) {
          // Continuous recirculation replenishment: 70% upstream inflow, 30% distributed along reach
          if (Math.random() < 0.70) {
            p.fi = Math.random() * Math.min(2.5, nx * 0.15);
          } else {
            p.fi = Math.random() * Math.max(1, nx - 1.0);
          }
          p.fj = 0.15 + Math.random() * Math.max(0.2, ny - 1.3);
          p.age = 0;
          p.maxAge = 45 + Math.floor(Math.random() * 50);
          p.trail = [];
          continue;
        }

        const uFrac = Math.max(0, Math.min(1, p.fi - ci));
        const vFrac = Math.max(0, Math.min(1, p.fj - cj));
        const p00 = nodePts[ci][cj];
        const p10 = nodePts[ci + 1][cj];
        const p11 = nodePts[ci + 1][cj + 1];
        const p01 = nodePts[ci][cj + 1];

        const screenX =
          (1 - uFrac) * (1 - vFrac) * p00.px +
          uFrac * (1 - vFrac) * p10.px +
          uFrac * vFrac * p11.px +
          (1 - uFrac) * vFrac * p01.px;
        const screenY =
          (1 - uFrac) * (1 - vFrac) * p00.py +
          uFrac * (1 - vFrac) * p10.py +
          uFrac * vFrac * p11.py +
          (1 - uFrac) * vFrac * p01.py;

        p.trail.push({ x: screenX, y: screenY });

        const cell = curMesh.cells[cIdx];
        const u = curHydro.u[cIdx] || 0.0;
        const v = curHydro.v[cIdx] || 0.0;
        const vel = curHydro.velocityMag[cIdx] || 0.0;

        // Dynamic trail length scaled with velocity
        const maxTrailLen = Math.min(14, Math.max(4, Math.round(4 + (vel / Math.max(1.0, maxVal)) * 10)));
        while (p.trail.length > maxTrailLen) {
          p.trail.shift();
        }

        // Streamwise unit tangent from cell (ci, cj) to (ci+1, cj)
        let dxS = 1.0, dyS = 0.0;
        if (ci + 1 < nx) {
          const nextCell = curMesh.cells[(ci + 1) * ny + cj];
          dxS = nextCell.centerX - cell.centerX;
          dyS = nextCell.centerY - cell.centerY;
        } else if (ci > 0) {
          const prevCell = curMesh.cells[(ci - 1) * ny + cj];
          dxS = cell.centerX - prevCell.centerX;
          dyS = cell.centerY - prevCell.centerY;
        }
        const lenS = Math.max(1.0, Math.hypot(dxS, dyS));
        const tx = dxS / lenS;
        const ty = dyS / lenS;

        // Cross-stream unit normal from cell (ci, cj) to (ci, cj+1)
        let dxN = 0.0, dyN = 1.0;
        if (cj + 1 < ny) {
          const rightCell = curMesh.cells[ci * ny + cj + 1];
          dxN = rightCell.centerX - cell.centerX;
          dyN = rightCell.centerY - cell.centerY;
        } else if (cj > 0) {
          const leftCell = curMesh.cells[ci * ny + cj - 1];
          dxN = cell.centerX - leftCell.centerX;
          dyN = cell.centerY - leftCell.centerY;
        }
        const lenN = Math.max(1.0, Math.hypot(dxN, dyN));
        const nxDir = dxN / lenN;
        const nyDir = dyN / lenN;

        // Project Cartesian velocity (u, v) into curvilinear grid coordinates
        const uStream = u * tx + v * ty;
        const vCross = u * nxDir + v * nyDir;

        // Visual advection time step: velocity-dependent displacement
        const dtVis = 0.45;
        const dFi = (uStream / lenS) * dtVis;
        const dFj = (vCross / lenN) * dtVis;

        // Check ahead for solid structure wall collision: slide along wall
        const nextFi = p.fi + dFi;
        const nextFj = p.fj + dFj;
        const targetCi = Math.floor(nextFi);
        const targetCj = Math.floor(nextFj);
        const targetIdx = targetCi * ny + targetCj;

        if (targetCi >= 0 && targetCi < nx && targetCj >= 0 && targetCj < ny) {
          if (solidCellSet.has(targetIdx)) {
            // Deflect around solid obstacle
            p.fj += Math.sign(vCross || (p.fj > ny * 0.5 ? 1 : -1)) * 0.08;
            p.age += 2;
          } else {
            p.fi = nextFi;
            p.fj = Math.max(0.05, Math.min(ny - 1.05, nextFj));
          }
        } else {
          p.fi = nextFi;
          p.fj = Math.max(0.05, Math.min(ny - 1.05, nextFj));
        }
        p.age++;

        if (p.trail.length >= 2) {
          const lifeAlpha = Math.sin((p.age / p.maxAge) * Math.PI);
          const speedFrac = Math.min(1.0, vel / Math.max(0.5, maxVal));

          ctx.beginPath();
          ctx.moveTo(p.trail[0].x, p.trail[0].y);
          for (let t = 1; t < p.trail.length; t++) {
            ctx.lineTo(p.trail[t].x, p.trail[t].y);
          }
          // Glowing electric cyan/white streamline with velocity-dependent width
          const alpha = Math.max(0.12, Math.min(0.95, lifeAlpha * 0.9));
          ctx.strokeStyle = `rgba(186, 230, 253, ${alpha})`;
          ctx.lineWidth = 1.6 + speedFrac * 1.2;
          ctx.stroke();

          // Luminous particle bead head
          const head = p.trail[p.trail.length - 1];
          // Outer glow halo
          ctx.beginPath();
          ctx.arc(head.x, head.y, 3.2 + speedFrac * 1.5, 0, 2 * Math.PI);
          ctx.fillStyle = `rgba(56, 189, 248, ${Math.max(0.2, lifeAlpha * 0.5)})`;
          ctx.fill();

          // Inner bright core
          ctx.beginPath();
          ctx.arc(head.x, head.y, 1.6, 0, 2 * Math.PI);
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.4, lifeAlpha * 0.95)})`;
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // 7. Velocity Vector Arrows (Wrapping around structures with wake separation)
    if (curShowVectors) {
      const strideX = Math.max(1, Math.round(nx / 35));
      const strideY = Math.max(1, Math.round(ny / 8));

      for (let i = 0; i < nx; i += strideX) {
        for (let j = 0; j < ny; j += strideY) {
          const c = i * ny + j;
          if (solidCellSet.has(c) || curHydro.isWet[c] !== 1) continue;

          const cell = curMesh.cells[c];
          const u = curHydro.u[c];
          const v = curHydro.v[c];
          const vel = curHydro.velocityMag[c];

          if (vel < 0.04) continue;

          const p00 = nodePts[i][j];
          const p10 = nodePts[i + 1][j];
          const p11 = nodePts[i + 1][j + 1];
          const p01 = nodePts[i][j + 1];
          const centerPt = {
            x: 0.25 * (p00.px + p10.px + p11.px + p01.px),
            y: 0.25 * (p00.py + p10.py + p11.py + p01.py),
          };
          const scale = Math.min(24, Math.max(7, (vel / Math.max(1.0, maxVal)) * 26));

          const arrowX = centerPt.x + (u / vel) * scale;
          const arrowY = centerPt.y - (v / vel) * scale;

          // Dark outline for contrast against bright colors
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(centerPt.x, centerPt.y);
          ctx.lineTo(arrowX, arrowY);
          ctx.stroke();

          // Crisp white arrow shaft
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(centerPt.x, centerPt.y);
          ctx.lineTo(arrowX, arrowY);
          ctx.stroke();

          // Arrowhead
          const angle = Math.atan2(arrowY - centerPt.y, arrowX - centerPt.x);
          const headLen = Math.min(5.5, scale * 0.45);

          ctx.beginPath();
          ctx.moveTo(arrowX, arrowY);
          ctx.lineTo(
            arrowX - headLen * Math.cos(angle - Math.PI / 6),
            arrowY - headLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            arrowX - headLen * Math.cos(angle + Math.PI / 6),
            arrowY - headLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      }
    }

    // 7. Sleek On-Canvas CFD Scientific Colorbar Legend (Ansys Fluent / ParaView style)
    const legendW = 210;
    const legendH = 68;
    const legendX = size.x - legendW - 20;
    const legendY = 20;

    ctx.save();
    // Legend Card Background
    ctx.fillStyle = 'rgba(10, 15, 26, 0.90)';
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.roundRect(legendX, legendY, legendW, legendH, 8);
    ctx.fill();
    ctx.stroke();

    // Legend Title
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${fieldTitle} [${fieldUnit}]`, legendX + 10, legendY + 16);

    // Continuous CFD Gradient Bar
    const barX = legendX + 10;
    const barY = legendY + 23;
    const barW = legendW - 20;
    const barH = 14;

    const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    grad.addColorStop(0.0, 'rgb(0, 18, 120)');
    grad.addColorStop(0.15, 'rgb(0, 60, 255)');
    grad.addColorStop(0.35, 'rgb(0, 220, 255)');
    grad.addColorStop(0.50, 'rgb(0, 230, 80)');
    grad.addColorStop(0.68, 'rgb(255, 235, 0)');
    grad.addColorStop(0.84, 'rgb(255, 120, 0)');
    grad.addColorStop(1.0, 'rgb(220, 20, 20)');

    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(barX, barY, barW, barH);

    // Tick marks and values
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    const minStr = minVal.toFixed(2);
    const midStr = ((minVal + maxVal) * 0.5).toFixed(2);
    const maxStr = maxVal.toFixed(2);

    ctx.fillText(minStr, barX, barY + barH + 12);
    const midTextW = ctx.measureText(midStr).width;
    ctx.fillText(midStr, barX + barW * 0.5 - midTextW * 0.5, barY + barH + 12);
    const maxTextW = ctx.measureText(maxStr).width;
    ctx.fillText(maxStr, barX + barW - maxTextW, barY + barH + 12);

    ctx.restore(); // Restore dpr transform
  };

  // Mount Leaflet layer ONCE per map instance
  useEffect(() => {
    if (!map) return;

    const CanvasOverlay = L.Layer.extend({
      onAdd: function () {
        const container = L.DomUtil.create('canvas', 'leaflet-river-cfd-layer');
        container.style.position = 'absolute';
        container.style.pointerEvents = 'auto';
        container.style.zIndex = '400';
        canvasRef.current = container;
        map.getPanes().overlayPane.appendChild(container);

        const redraw = () => {
          this._update();
        };
        map.on('move moveend resize zoom zoomend viewreset', redraw);
        (this as any)._redrawHandler = redraw;
        this._update();
      },

      onRemove: function () {
        if ((this as any)._redrawHandler) {
          map.off('move moveend resize zoom zoomend viewreset', (this as any)._redrawHandler);
        }
        if (canvasRef.current && canvasRef.current.parentNode) {
          canvasRef.current.parentNode.removeChild(canvasRef.current);
        }
        canvasRef.current = null;
      },

      _update: function () {
        renderFrame();
      },
    });

    const overlay = new (CanvasOverlay as any)();
    overlayRef.current = overlay;
    overlay.addTo(map);

    // Click handler on canvas to inspect cell (disabled during mesh movement)
    const canvas = canvasRef.current;
    const handleCanvasClick = (e: MouseEvent) => {
      const curCanvas = canvasRef.current;
      const { onSelectCell: curOnSelect, mesh: curMesh, isMoveMeshMode: curIsMoveMode } = propsRef.current;
      if (!curCanvas || !curOnSelect || curIsMoveMode) return;
      const rect = curCanvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      let closestCell: RiverGridCell | null = null;
      let closestIdx = -1;
      let minDistance = 25;

      for (let c = 0; c < curMesh.cells.length; c++) {
        const cell = curMesh.cells[c];
        const pt = map.latLngToContainerPoint([cell.centerLat, cell.centerLng]);
        const dist = Math.hypot(pt.x - clickX, pt.y - clickY);
        if (dist < minDistance) {
          minDistance = dist;
          closestCell = cell;
          closestIdx = c;
        }
      }

      if (closestCell && closestIdx >= 0) {
        curOnSelect(closestCell, closestIdx);
      }
    };

    if (canvas) {
      canvas.addEventListener('click', handleCanvasClick);
    }

    return () => {
      if (canvas) {
        canvas.removeEventListener('click', handleCanvasClick);
      }
      overlayRef.current = null;
      map.removeLayer(overlay);
    };
  }, [map]);

  // Redraw canvas smoothly without DOM recreation whenever simulation or display props update
  useEffect(() => {
    if (overlayRef.current && overlayRef.current._update) {
      overlayRef.current._update();
    }
  }, [
    mesh,
    hydro,
    turb,
    sed,
    structures,
    thematicDisplay,
    showVelocityVectors,
    showStreamlines,
    isMoveMeshMode,
  ]);

  // High-performance decoupled 60 FPS render loop when simulation is running or streamlines active
  useEffect(() => {
    if (!isSimulating && !showStreamlines) return;
    let animId: number;
    const tick = () => {
      if (overlayRef.current && overlayRef.current._update) {
        overlayRef.current._update();
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isSimulating, showStreamlines]);

  return null;
};
