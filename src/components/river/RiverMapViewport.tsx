/**
 * 2D River Hydrodynamic Map Viewport
 *
 * Renders an animated high-performance HTML5 Canvas overlay on top of Leaflet:
 * - 2D finite-volume cell depth / velocity / WSE / Froude heatmaps
 * - Dynamic velocity vector quivers and flow direction arrows
 * - Hydraulic structures footprints (levees, weirs, bridges, culverts, gates)
 * - Monitoring gauges and interactive cell inspection popup
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  RiverMesh,
  RiverFlowState,
  RiverStructure,
  RiverMonitoringGauge,
  RiverThematicDisplay,
  RiverMeshCell,
} from '../../types/riverAnalysis';
import { Maximize2, Crosshair, Eye, EyeOff } from 'lucide-react';

interface RiverMapViewportProps {
  mesh: RiverMesh;
  state: RiverFlowState;
  structures: RiverStructure[];
  gauges: RiverMonitoringGauge[];
  thematicDisplay: RiverThematicDisplay;
  selectedCell: RiverMeshCell | null;
  onSelectCell: (cell: RiverMeshCell | null) => void;
  isSimulating: boolean;
}

export const RiverMapViewport: React.FC<RiverMapViewportProps> = ({
  mesh,
  state,
  structures,
  gauges,
  thematicDisplay,
  selectedCell,
  onSelectCell,
  isSimulating,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const canvasLayerRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [showVectors, setShowVectors] = useState(true);
  const [showStructures, setShowStructures] = useState(true);
  const [showMeshGrid, setShowMeshGrid] = useState(true);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const [minLat, minLng, maxLat, maxLng] = mesh.bounds;
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    // High-resolution satellite / dark hybrid basemap
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
    }).addTo(map);

    // CartoDB dark labels overlay
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      opacity: 0.7,
    }).addTo(map);

    // Custom Canvas Overlay Layer
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '400';
    map.getPanes().overlayPane.appendChild(canvas);
    canvasLayerRef.current = canvas;

    const resizeCanvas = () => {
      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);
    };

    map.on('move', () => {
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);
    });

    map.on('resize', resizeCanvas);
    map.on('zoomend', resizeCanvas);
    resizeCanvas();

    // Map Click Handler for Cell Selection
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      let closestCell: RiverMeshCell | null = null;
      let minD = 999999;

      for (const cell of mesh.cells) {
        const d = Math.hypot(cell.centerLat - lat, cell.centerLng - lng);
        if (d < minD) {
          minD = d;
          closestCell = cell;
        }
      }

      onSelectCell(closestCell);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Map bounds when mesh changes
  useEffect(() => {
    if (!mapRef.current) return;
    const [minLat, minLng, maxLat, maxLng] = mesh.bounds;
    mapRef.current.fitBounds(
      [
        [minLat, minLng],
        [maxLat, maxLng],
      ],
      { padding: [50, 50], animate: true }
    );
  }, [mesh.id]);

  // Color Mapping Helper
  const getCellColor = useCallback(
    (cellIdx: number): string => {
      const h = state.depth[cellIdx];
      const vel = state.velocityMag[cellIdx];
      const froude = state.froude[cellIdx];
      const tau = state.shearStress[cellIdx];
      const wse = state.wse[cellIdx];

      if (thematicDisplay === 'depth') {
        if (h < 0.01) return 'rgba(0, 0, 0, 0)';
        if (h < 0.3) return 'rgba(56, 189, 248, 0.45)'; // Sky blue
        if (h < 0.8) return 'rgba(14, 165, 233, 0.65)'; // Light blue
        if (h < 1.5) return 'rgba(2, 132, 199, 0.80)'; // Azure
        if (h < 2.5) return 'rgba(3, 105, 161, 0.88)'; // Deep blue
        return 'rgba(30, 58, 138, 0.95)'; // Navy
      }

      if (thematicDisplay === 'velocity') {
        if (h < 0.01) return 'rgba(0, 0, 0, 0)';
        if (vel < 0.2) return 'rgba(34, 197, 94, 0.50)'; // Green
        if (vel < 0.6) return 'rgba(132, 204, 22, 0.65)'; // Lime
        if (vel < 1.2) return 'rgba(234, 179, 8, 0.78)'; // Yellow
        if (vel < 2.0) return 'rgba(249, 115, 22, 0.85)'; // Orange
        return 'rgba(239, 68, 68, 0.92)'; // Red
      }

      if (thematicDisplay === 'froude') {
        if (h < 0.01) return 'rgba(0, 0, 0, 0)';
        if (froude < 0.5) return 'rgba(59, 130, 246, 0.60)'; // Tranquil subcritical
        if (froude < 0.9) return 'rgba(16, 185, 129, 0.75)'; // Subcritical
        if (froude < 1.1) return 'rgba(234, 179, 8, 0.85)'; // Critical flow
        return 'rgba(239, 68, 68, 0.95)'; // Supercritical Fr >= 1.0
      }

      if (thematicDisplay === 'shear-stress') {
        if (h < 0.01) return 'rgba(0, 0, 0, 0)';
        if (tau < 2.0) return 'rgba(148, 163, 184, 0.50)'; // Sub-cleansing
        if (tau < 8.0) return 'rgba(20, 184, 166, 0.70)'; // Stable bed transport
        if (tau < 20.0) return 'rgba(245, 158, 11, 0.85)'; // Active scour
        return 'rgba(225, 29, 72, 0.95)'; // Severe erosion risk
      }

      if (thematicDisplay === 'wse') {
        if (h < 0.01) return 'rgba(0, 0, 0, 0)';
        const relWse = (wse % 5) / 5;
        return `rgba(6, 182, 212, ${0.4 + relWse * 0.5})`;
      }

      // Default bed elevation
      const z = mesh.cells[cellIdx].bedElevation;
      const tint = ((z % 10) / 10) * 0.5 + 0.3;
      return `rgba(168, 85, 247, ${tint})`;
    },
    [thematicDisplay, state, mesh]
  );

  // Render Canvas Loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasLayerRef.current;
    const map = mapRef.current;
    if (!canvas || !map) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Mesh Cells
    for (let i = 0; i < mesh.cells.length; i++) {
      const cell = mesh.cells[i];
      const color = getCellColor(i);

      if (cell.corners.length >= 4) {
        ctx.beginPath();
        const p0 = map.latLngToContainerPoint([cell.corners[0][0], cell.corners[0][1]]);
        ctx.moveTo(p0.x, p0.y);

        for (let k = 1; k < 4; k++) {
          const pk = map.latLngToContainerPoint([cell.corners[k][0], cell.corners[k][1]]);
          ctx.lineTo(pk.x, pk.y);
        }
        ctx.closePath();

        // Fill cell
        if (color !== 'rgba(0, 0, 0, 0)') {
          ctx.fillStyle = color;
          ctx.fill();
        }

        // Draw mesh grid outline
        if (showMeshGrid) {
          ctx.strokeStyle =
            selectedCell?.id === cell.id
              ? '#f59e0b'
              : 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = selectedCell?.id === cell.id ? 2 : 0.5;
          ctx.stroke();
        }
      }
    }

    // 2. Draw Velocity Vectors / Quiver Arrows
    if (showVectors) {
      const stepInterval = Math.max(1, Math.floor(mesh.cells.length / 180));

      for (let i = 0; i < mesh.cells.length; i += stepInterval) {
        const h = state.depth[i];
        const vel = state.velocityMag[i];

        if (h >= 0.05 && vel >= 0.04) {
          const cell = mesh.cells[i];
          const centerPt = map.latLngToContainerPoint([cell.centerLat, cell.centerLng]);

          const arrowLen = Math.min(28, Math.max(6, vel * 12));
          const angle = Math.atan2(state.v[i], state.u[i]);

          const endX = centerPt.x + arrowLen * Math.cos(angle);
          const endY = centerPt.y - arrowLen * Math.sin(angle); // Leaflet y is inverted

          ctx.beginPath();
          ctx.moveTo(centerPt.x, centerPt.y);
          ctx.lineTo(endX, endY);
          ctx.strokeStyle = vel > 1.5 ? '#f59e0b' : '#ffffff';
          ctx.lineWidth = 1.4;
          ctx.stroke();

          // Arrowhead
          const headLen = 4.5;
          ctx.beginPath();
          ctx.moveTo(endX, endY);
          ctx.lineTo(
            endX - headLen * Math.cos(angle - Math.PI / 6),
            endY + headLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            endX - headLen * Math.cos(angle + Math.PI / 6),
            endY + headLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
        }
      }
    }

    // 3. Draw Hydraulic Structures Footprints
    if (showStructures) {
      for (const struct of structures) {
        if (!struct.enabled || struct.coordinates.length < 2) continue;

        ctx.beginPath();
        const start = map.latLngToContainerPoint([struct.coordinates[0].lat, struct.coordinates[0].lng]);
        ctx.moveTo(start.x, start.y);

        for (let k = 1; k < struct.coordinates.length; k++) {
          const pt = map.latLngToContainerPoint([struct.coordinates[k].lat, struct.coordinates[k].lng]);
          ctx.lineTo(pt.x, pt.y);
        }

        if (struct.type === 'levee') {
          ctx.strokeStyle = '#a855f7'; // Purple
          ctx.lineWidth = 5;
          ctx.setLineDash([6, 4]);
        } else if (struct.type === 'bridge') {
          ctx.strokeStyle = '#f97316'; // Orange
          ctx.lineWidth = 6;
          ctx.setLineDash([]);
        } else if (struct.type === 'weir') {
          ctx.strokeStyle = '#06b6d4'; // Cyan
          ctx.lineWidth = 4;
          ctx.setLineDash([4, 2]);
        } else if (struct.type === 'culvert') {
          ctx.strokeStyle = '#10b981'; // Emerald
          ctx.lineWidth = 5;
          ctx.setLineDash([]);
        } else if (struct.type === 'gate') {
          ctx.strokeStyle = '#ec4899'; // Pink
          ctx.lineWidth = 5;
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = '#eab308'; // Amber
          ctx.lineWidth = 4;
          ctx.setLineDash([]);
        }

        ctx.stroke();
        ctx.setLineDash([]); // Reset
      }
    }

    // 4. Draw Monitoring Gauges
    for (const g of gauges) {
      const pt = map.latLngToContainerPoint([g.lat, g.lng]);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(g.id, pt.x + 8, pt.y + 3);
    }
  }, [mesh, state, structures, gauges, thematicDisplay, selectedCell, showVectors, showStructures, showMeshGrid, getCellColor]);

  // Animation frame loop
  useEffect(() => {
    renderCanvas();
    if (isSimulating) {
      animationFrameRef.current = requestAnimationFrame(renderCanvas);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderCanvas, isSimulating, state.stepCount]);

  const handleZoomToFit = () => {
    if (!mapRef.current) return;
    const [minLat, minLng, maxLat, maxLng] = mesh.bounds;
    mapRef.current.fitBounds([
      [minLat, minLng],
      [maxLat, maxLng],
    ]);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0a0a0a]">
      {/* Leaflet Map Div */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Top Map Controls Overlay */}
      <div className="absolute top-3 left-3 z-[500] flex items-center gap-1.5 bg-[#111]/90 backdrop-blur border border-[#262626] rounded p-1 shadow-lg text-xs">
        <button
          onClick={handleZoomToFit}
          className="p-1.5 rounded hover:bg-[#222] text-[#888] hover:text-white transition-colors cursor-pointer"
          title="Zoom to River Reach Extent"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-3 w-[1px] bg-[#333]" />

        <button
          onClick={() => setShowVectors((v) => !v)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors ${
            showVectors ? 'bg-cyan-500/20 text-cyan-400 font-semibold' : 'text-[#888] hover:text-white'
          }`}
          title="Toggle Velocity Vector Quiver Arrows"
        >
          {showVectors ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          <span>Vectors</span>
        </button>

        <button
          onClick={() => setShowStructures((s) => !s)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors ${
            showStructures ? 'bg-amber-500/20 text-amber-400 font-semibold' : 'text-[#888] hover:text-white'
          }`}
          title="Toggle Hydraulic Structures"
        >
          <span>Structures</span>
        </button>

        <button
          onClick={() => setShowMeshGrid((g) => !g)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors ${
            showMeshGrid ? 'bg-purple-500/20 text-purple-400 font-semibold' : 'text-[#888] hover:text-white'
          }`}
          title="Toggle 2D Finite-Volume Mesh Grid"
        >
          <span>Mesh</span>
        </button>
      </div>

      {/* Top Right Live Telemetry Banner */}
      <div className="absolute top-3 right-14 z-[500] bg-[#111]/90 backdrop-blur border border-[#262626] rounded px-3 py-1.5 shadow-lg text-xs font-mono flex items-center gap-4 text-[#e5e7eb]">
        <div>
          <span className="text-[#737373] text-[10px] block">SIM TIME</span>
          <span className="text-cyan-400 font-bold">{state.timeSec.toFixed(1)}s</span>
        </div>
        <div className="h-5 w-[1px] bg-[#222]" />
        <div>
          <span className="text-[#737373] text-[10px] block">STEPS</span>
          <span className="text-[#e5e7eb] font-semibold">{state.stepCount}</span>
        </div>
        <div className="h-5 w-[1px] bg-[#222]" />
        <div>
          <span className="text-[#737373] text-[10px] block">REACH</span>
          <span className="text-amber-400 truncate max-w-[120px]">{mesh.reachLengthM.toFixed(0)}m</span>
        </div>
      </div>

      {/* Bottom Right Floating Inspector Panel */}
      {selectedCell && (
        <div className="absolute bottom-4 right-4 z-[500] w-72 bg-[#111]/95 backdrop-blur border border-[#333] rounded-lg p-3 shadow-2xl text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-[#222] mb-2">
            <span className="font-tech font-bold text-cyan-400 flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5" />
              Cell #{selectedCell.id} (Row {selectedCell.i}, Col {selectedCell.j})
            </span>
            <button
              onClick={() => onSelectCell(null)}
              className="text-[#666] hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
            <div>
              <span className="text-[#666] block text-[9px]">BED ELEVATION</span>
              <span className="text-white font-semibold">{selectedCell.bedElevation.toFixed(2)} m MSL</span>
            </div>
            <div>
              <span className="text-[#666] block text-[9px]">WATER DEPTH (h)</span>
              <span className="text-cyan-400 font-bold">{state.depth[selectedCell.id].toFixed(2)} m</span>
            </div>
            <div>
              <span className="text-[#666] block text-[9px]">WATER STAGE (η)</span>
              <span className="text-blue-400">{state.wse[selectedCell.id].toFixed(2)} m MSL</span>
            </div>
            <div>
              <span className="text-[#666] block text-[9px]">VELOCITY (|V|)</span>
              <span className="text-amber-400 font-bold">{state.velocityMag[selectedCell.id].toFixed(2)} m/s</span>
            </div>
            <div>
              <span className="text-[#666] block text-[9px]">FROUDE NUMBER</span>
              <span
                className={`font-semibold ${
                  state.froude[selectedCell.id] >= 1.0 ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {state.froude[selectedCell.id].toFixed(2)} (
                {state.froude[selectedCell.id] >= 1.0 ? 'Supercritical' : 'Subcritical'})
              </span>
            </div>
            <div>
              <span className="text-[#666] block text-[9px]">BED SHEAR (τ)</span>
              <span className="text-purple-400">{state.shearStress[selectedCell.id].toFixed(1)} N/m²</span>
            </div>
          </div>

          {selectedCell.structureId && (
            <div className="mt-2.5 pt-2 border-t border-[#222] text-[11px] text-amber-400">
              ⚡ Structure: <span className="font-semibold">{selectedCell.structureId}</span>
            </div>
          )}
        </div>
      )}

      {/* Bottom Left Thematic Legend */}
      <div className="absolute bottom-4 left-4 z-[500] bg-[#111]/90 backdrop-blur border border-[#262626] rounded px-3 py-2 text-[10px] font-mono shadow-lg text-[#a3a3a3]">
        <div className="font-bold text-white mb-1 uppercase tracking-wider">
          {thematicDisplay === 'depth' && 'Water Depth (h)'}
          {thematicDisplay === 'velocity' && 'Flow Velocity (|V|)'}
          {thematicDisplay === 'froude' && 'Froude Number (Fr)'}
          {thematicDisplay === 'shear-stress' && 'Bed Shear Stress (τ)'}
          {thematicDisplay === 'wse' && 'Water Surface Elevation (η)'}
          {thematicDisplay === 'elevation' && 'Bed Elevation (z)'}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[#888]">Low</span>
          <div
            className="w-24 h-2.5 rounded"
            style={{
              background:
                thematicDisplay === 'velocity'
                  ? 'linear-gradient(to right, #22c55e, #eab308, #ef4444)'
                  : thematicDisplay === 'froude'
                  ? 'linear-gradient(to right, #3b82f6, #10b981, #ef4444)'
                  : 'linear-gradient(to right, #38bdf8, #0284c7, #1e3a8a)',
            }}
          />
          <span className="text-[#888]">High</span>
        </div>
      </div>
    </div>
  );
};
