/**
 * High-Performance Leaflet / Canvas 2D CFD Results Overlay & Velocity Field Renderer
 * (Uses native Leaflet L.Map directly, no react-leaflet dependency)
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

export type RiverThematicField =
  | 'depth'
  | 'wse'
  | 'velocity'
  | 'froude'
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
}

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
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!map) return;

    // Create custom Leaflet Canvas overlay layer
    const CanvasOverlay = L.Layer.extend({
      onAdd: function () {
        const container = L.DomUtil.create('canvas', 'leaflet-river-cfd-layer');
        container.style.position = 'absolute';
        container.style.pointerEvents = 'auto';
        container.style.zIndex = '400';
        canvasRef.current = container;
        map.getPanes().overlayPane.appendChild(container);
        map.on('moveend resize zoomend', this._update, this);
        this._update();
      },

      onRemove: function () {
        if (canvasRef.current && canvasRef.current.parentNode) {
          canvasRef.current.parentNode.removeChild(canvasRef.current);
        }
        map.off('moveend resize zoomend', this._update, this);
        canvasRef.current = null;
      },

      _update: function () {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const size = map.getSize();
        const topLeft = map.containerPointToLayerPoint([0, 0]);

        L.DomUtil.setPosition(canvas, topLeft);
        canvas.width = size.x;
        canvas.height = size.y;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Render cells
        const numCells = mesh.cells.length;

        for (let c = 0; c < numCells; c++) {
          const cell = mesh.cells[c];
          const isWet = hydro.isWet[c] === 1;

          // Compute color based on thematicDisplay
          let color = 'rgba(100, 116, 139, 0.2)'; // Dry cell default

          if (isWet) {
            if (thematicDisplay === 'depth') {
              const h = hydro.depth[c];
              const t = Math.min(1.0, h / 3.0);
              color = `rgba(${Math.round(6 + (1 - t) * 30)}, ${Math.round(182 - t * 80)}, ${Math.round(212 + t * 40)}, 0.75)`;
            } else if (thematicDisplay === 'velocity') {
              const vel = hydro.velocityMag[c];
              const t = Math.min(1.0, vel / 3.0);
              const r = Math.round(t < 0.5 ? 2 * t * 255 : 255);
              const g = Math.round(t < 0.5 ? 255 : 2 * (1 - t) * 255);
              color = `rgba(${r}, ${g}, 40, 0.8)`;
            } else if (thematicDisplay === 'froude') {
              const fr = hydro.froude[c];
              color = fr >= 1.0 ? 'rgba(239, 68, 68, 0.85)' : 'rgba(56, 189, 248, 0.7)';
            } else if (thematicDisplay === 'shear') {
              const tau = hydro.shearStress[c];
              const t = Math.min(1.0, tau / 40.0);
              color = `rgba(${Math.round(245 * t + 30)}, ${Math.round(158 * (1 - t) + 80)}, 50, 0.8)`;
            } else if (thematicDisplay === 'nuT') {
              const nuT = turb.nuT[c];
              const t = Math.min(1.0, nuT / 2.0);
              color = `rgba(${Math.round(168 * t + 60)}, ${Math.round(85 * (1 - t) + 50)}, ${Math.round(247 * t + 100)}, 0.8)`;
            } else if (thematicDisplay === 'sediment') {
              const conc = sed.concentrationKgM3[c];
              const t = Math.min(1.0, conc / 5.0);
              color = `rgba(${Math.round(217 * t + 100)}, ${Math.round(119 * t + 80)}, ${Math.round(6 * t + 30)}, 0.8)`;
            } else if (thematicDisplay === 'bedChange') {
              const dz = sed.bedElevationChangeM[c];
              if (dz < -0.005) {
                color = 'rgba(14, 165, 233, 0.85)';
              } else if (dz > 0.005) {
                color = 'rgba(249, 115, 22, 0.85)';
              } else {
                color = 'rgba(148, 163, 184, 0.4)';
              }
            } else {
              color = 'rgba(14, 165, 233, 0.75)';
            }
          }

          // Draw quad polygon
          if (cell.corners.length >= 4) {
            ctx.beginPath();
            const p0 = map.latLngToContainerPoint([cell.corners[0][0], cell.corners[0][1]]);
            ctx.moveTo(p0.x, p0.y);
            for (let k = 1; k < cell.corners.length; k++) {
              const pk = map.latLngToContainerPoint([cell.corners[k][0], cell.corners[k][1]]);
              ctx.lineTo(pk.x, pk.y);
            }
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }

          // Draw Velocity Vector Arrow
          if (showVelocityVectors && isWet && hydro.velocityMag[c] > 0.05) {
            const centerPt = map.latLngToContainerPoint([cell.centerLat, cell.centerLng]);
            const u = hydro.u[c];
            const v = hydro.v[c];
            const vel = hydro.velocityMag[c];
            const scale = Math.min(25, Math.max(8, vel * 12));

            const arrowX = centerPt.x + (u / vel) * scale;
            const arrowY = centerPt.y - (v / vel) * scale;

            ctx.beginPath();
            ctx.moveTo(centerPt.x, centerPt.y);
            ctx.lineTo(arrowX, arrowY);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Arrowhead
            const angle = Math.atan2(arrowY - centerPt.y, arrowX - centerPt.x);
            ctx.beginPath();
            ctx.moveTo(arrowX, arrowY);
            ctx.lineTo(
              arrowX - 4 * Math.cos(angle - Math.PI / 6),
              arrowY - 4 * Math.sin(angle - Math.PI / 6)
            );
            ctx.lineTo(
              arrowX - 4 * Math.cos(angle + Math.PI / 6),
              arrowY - 4 * Math.sin(angle + Math.PI / 6)
            );
            ctx.closePath();
            ctx.fillStyle = '#ffffff';
            ctx.fill();
          }
        }

        // Draw Hydraulic Structures Overlay (Circles, Polygons, Rectangles, Obstacles, Lines)
        for (const s of structures) {
          if (!s.enabled) continue;
          const color = s.cadProperties?.color || '#f59e0b';

          if (s.type === 'circle') {
            const circle = s as any;
            const centerCoord = circle.center || s.coordinates?.[0];
            if (centerCoord) {
              const ptCenter = map.latLngToContainerPoint([centerCoord.lat, centerCoord.lng]);
              const ptRadius = map.latLngToContainerPoint([
                centerCoord.lat + (circle.radiusM || 8.0) / 111320.0,
                centerCoord.lng,
              ]);
              const rPx = Math.max(4, Math.hypot(ptCenter.x - ptRadius.x, ptCenter.y - ptRadius.y));

              ctx.beginPath();
              ctx.arc(ptCenter.x, ptCenter.y, rPx, 0, 2 * Math.PI);
              ctx.fillStyle = `${color}44`;
              ctx.fill();
              ctx.strokeStyle = color;
              ctx.lineWidth = 2.5;
              ctx.stroke();
            }
          } else if (
            (s.type === 'polygon' || s.type === 'rectangle' || s.type === 'obstacle') &&
            s.coordinates &&
            s.coordinates.length >= 3
          ) {
            ctx.beginPath();
            const p0 = map.latLngToContainerPoint([s.coordinates[0].lat, s.coordinates[0].lng]);
            ctx.moveTo(p0.x, p0.y);
            for (let k = 1; k < s.coordinates.length; k++) {
              const pk = map.latLngToContainerPoint([s.coordinates[k].lat, s.coordinates[k].lng]);
              ctx.lineTo(pk.x, pk.y);
            }
            ctx.closePath();
            ctx.fillStyle = `${color}55`;
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.stroke();
          } else if (s.coordinates && s.coordinates.length >= 2) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            const p0 = map.latLngToContainerPoint([s.coordinates[0].lat, s.coordinates[0].lng]);
            ctx.moveTo(p0.x, p0.y);
            for (let k = 1; k < s.coordinates.length; k++) {
              const pk = map.latLngToContainerPoint([s.coordinates[k].lat, s.coordinates[k].lng]);
              ctx.lineTo(pk.x, pk.y);
            }
            ctx.stroke();
          } else {
            // Fallback: draw through cell indices
            ctx.strokeStyle = color;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            let started = false;
            for (const cellIdx of s.cellIndices) {
              const cell = mesh.cells[cellIdx];
              if (cell) {
                const pt = map.latLngToContainerPoint([cell.centerLat, cell.centerLng]);
                if (!started) {
                  ctx.moveTo(pt.x, pt.y);
                  started = true;
                } else {
                  ctx.lineTo(pt.x, pt.y);
                }
              }
            }
            ctx.stroke();
          }
        }
      },
    });

    const overlay = new (CanvasOverlay as any)();
    overlay.addTo(map);

    // Click handler on canvas to inspect cell
    const canvas = canvasRef.current;
    const handleCanvasClick = (e: MouseEvent) => {
      if (!canvas || !onSelectCell) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      let closestCell: RiverGridCell | null = null;
      let closestIdx = -1;
      let minDistance = 25;

      for (let c = 0; c < mesh.cells.length; c++) {
        const cell = mesh.cells[c];
        const pt = map.latLngToContainerPoint([cell.centerLat, cell.centerLng]);
        const dist = Math.hypot(pt.x - clickX, pt.y - clickY);
        if (dist < minDistance) {
          minDistance = dist;
          closestCell = cell;
          closestIdx = c;
        }
      }

      if (closestCell && closestIdx >= 0) {
        onSelectCell(closestCell, closestIdx);
      }
    };

    if (canvas) {
      canvas.addEventListener('click', handleCanvasClick);
    }

    return () => {
      if (canvas) {
        canvas.removeEventListener('click', handleCanvasClick);
      }
      map.removeLayer(overlay);
    };
  }, [
    map,
    mesh,
    hydro,
    turb,
    sed,
    structures,
    thematicDisplay,
    showVelocityVectors,
    onSelectCell,
  ]);

  return null;
};
