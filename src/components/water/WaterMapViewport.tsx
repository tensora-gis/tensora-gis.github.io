import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  ActiveTool,
  MapThematicDisplay,
  NetworkElement,
  WaterDistributionNetwork,
  WaterJunction,
  WaterPipe,
  WaterPump,
  WaterReservoir,
  WaterTank,
} from '../../types/waterDistribution';
import { calculateGeodesicDistanceM, sampleGroundElevation } from '../../utils/waterTerrainService';
import { Layers, ZoomIn, ZoomOut, Crosshair, AlertTriangle } from 'lucide-react';

interface WaterMapViewportProps {
  network: WaterDistributionNetwork;
  activeTool: ActiveTool;
  thematicDisplay: MapThematicDisplay;
  selectedElement: NetworkElement | null;
  onSelectElement: (elem: NetworkElement | null) => void;
  onUpdateElement?: (updated: NetworkElement) => void;
  onAddJunction: (lat: number, lng: number) => void;
  onAddPipe: (startNodeId: string, endNodeId: string) => void;
  onAddReservoir: (lat: number, lng: number) => void;
  onAddTank: (lat: number, lng: number) => void;
  onAddPump: (startNodeId: string, endNodeId: string) => void;
  onAddPumpOnGround?: (lat: number, lng: number) => void;
  onAddValve?: (startNodeId: string, endNodeId: string) => void;
  onAddValveOnGround?: (lat: number, lng: number) => void;
  onDeleteElement: (id: string, type: NetworkElement['type']) => void;
  onProfileRouteSelected: (nodeIds: string[]) => void;
}

export const WaterMapViewport: React.FC<WaterMapViewportProps> = ({
  network,
  activeTool,
  thematicDisplay,
  selectedElement,
  onSelectElement,
  onUpdateElement,
  onAddJunction,
  onAddPipe,
  onAddReservoir,
  onAddTank,
  onAddPump,
  onAddPumpOnGround,
  onAddValve,
  onAddValveOnGround,
  onDeleteElement,
  onProfileRouteSelected,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const pipesLayerRef = useRef<L.LayerGroup | null>(null);
  const nodesLayerRef = useRef<L.LayerGroup | null>(null);
  const arrowsLayerRef = useRef<L.LayerGroup | null>(null);

  // Connection state for two-click tools (Pipe, Pump, Profile)
  const [pendingStartNode, setPendingStartNode] = useState<string | null>(null);
  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Clear any pending connection node whenever active tool changes
  useEffect(() => {
    setPendingStartNode(null);
  }, [activeTool]);

  // ResizeObserver to ensure Leaflet handles container resizing
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      mapInstanceRef.current?.invalidateSize();
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [27.247, 77.825],
      zoom: 15,
      zoomControl: false,
      attributionControl: true,
    });

    // Base Imagery: Esri World Imagery (Satellite)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, maxNativeZoom: 18, crossOrigin: 'anonymous' }
    ).addTo(map);

    // Place labels overlay
    L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, opacity: 0.8, crossOrigin: 'anonymous' }
    ).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    pipesLayerRef.current = L.layerGroup().addTo(map);
    arrowsLayerRef.current = L.layerGroup().addTo(map);
    nodesLayerRef.current = L.layerGroup().addTo(map);

    map.on('mousemove', (e) => {
      setMouseCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Map Click Handler for Adding Ground Elements
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;

      if (activeTool === 'add-junction') {
        onAddJunction(lat, lng);
      } else if (activeTool === 'add-reservoir') {
        onAddReservoir(lat, lng);
      } else if (activeTool === 'add-tank') {
        onAddTank(lat, lng);
      } else if (activeTool === 'add-pump' && onAddPumpOnGround && !pendingStartNode) {
        onAddPumpOnGround(lat, lng);
      } else if (activeTool === 'add-valve' && onAddValveOnGround && !pendingStartNode) {
        onAddValveOnGround(lat, lng);
      } else if (activeTool === 'select') {
        onSelectElement(null);
      }
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [activeTool, onAddJunction, onAddReservoir, onAddTank, onAddPumpOnGround, onSelectElement, pendingStartNode]);

  // Handle Node Clicks (connecting pipes, selecting, deleting)
  const handleNodeClick = useCallback(
    (nodeId: string, nodeType: NetworkElement['type']) => {
      if (activeTool === 'delete') {
        onDeleteElement(nodeId, nodeType);
        return;
      }

      if (activeTool === 'add-pipe') {
        if (!pendingStartNode) {
          setPendingStartNode(nodeId);
        } else if (pendingStartNode !== nodeId) {
          onAddPipe(pendingStartNode, nodeId);
          setPendingStartNode(null);
        }
        return;
      }

      if (activeTool === 'add-pump') {
        if (!pendingStartNode) {
          setPendingStartNode(nodeId);
        } else if (pendingStartNode !== nodeId) {
          onAddPump(pendingStartNode, nodeId);
          setPendingStartNode(null);
        }
        return;
      }

      if (activeTool === 'add-valve' && onAddValve) {
        if (!pendingStartNode) {
          setPendingStartNode(nodeId);
        } else if (pendingStartNode !== nodeId) {
          onAddValve(pendingStartNode, nodeId);
          setPendingStartNode(null);
        }
        return;
      }

      if (activeTool === 'profile-select') {
        if (!pendingStartNode) {
          setPendingStartNode(nodeId);
        } else if (pendingStartNode !== nodeId) {
          onProfileRouteSelected([pendingStartNode, nodeId]);
          setPendingStartNode(null);
        }
        return;
      }

      // Default: Select Element
      const j = network.junctions.find((item) => item.id === nodeId);
      if (j) {
        onSelectElement(j);
        return;
      }
      const r = network.reservoirs.find((item) => item.id === nodeId);
      if (r) {
        onSelectElement(r);
        return;
      }
      const t = network.tanks.find((item) => item.id === nodeId);
      if (t) {
        onSelectElement(t);
        return;
      }
    },
    [
      activeTool,
      pendingStartNode,
      network,
      onAddPipe,
      onAddPump,
      onDeleteElement,
      onProfileRouteSelected,
      onSelectElement,
    ]
  );

  // Render Network on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const pipesLayer = pipesLayerRef.current;
    const nodesLayer = nodesLayerRef.current;
    const arrowsLayer = arrowsLayerRef.current;

    if (!map || !pipesLayer || !nodesLayer || !arrowsLayer) return;

    pipesLayer.clearLayers();
    nodesLayer.clearLayers();
    arrowsLayer.clearLayers();

    // Map of all node coordinates
    const nodeCoords = new Map<string, [number, number]>();
    network.junctions.forEach((j) => nodeCoords.set(j.id, [j.lat, j.lng]));
    network.reservoirs.forEach((r) => nodeCoords.set(r.id, [r.lat, r.lng]));
    network.tanks.forEach((t) => nodeCoords.set(t.id, [t.lat, t.lng]));

    // 1. Draw Pipes
    network.pipes.forEach((p) => {
      const c1 = nodeCoords.get(p.startNodeId);
      const c2 = nodeCoords.get(p.endNodeId);
      if (!c1 || !c2) return;

      const isSelected = selectedElement?.id === p.id;

      // Thematic pipe coloring
      let pipeColor = '#0284c7'; // default sky blue
      let weight = 3.5;

      if (thematicDisplay === 'velocity' && p.velocity !== undefined) {
        const v = p.velocity;
        if (v < 0.6) pipeColor = '#38bdf8'; // low velocity
        else if (v <= 1.5) pipeColor = '#10b981'; // optimal design velocity
        else if (v <= 2.5) pipeColor = '#f59e0b'; // elevated
        else pipeColor = '#ef4444'; // high velocity
      } else if (thematicDisplay === 'diameter') {
        weight = Math.max(2, Math.min(8, (p.diameter / 400) * 6));
        pipeColor = p.diameter >= 250 ? '#f59e0b' : '#38bdf8';
      } else if (thematicDisplay === 'flow' && p.flow !== undefined) {
        weight = Math.max(2, Math.min(8, (Math.abs(p.flow) / 50) * 5));
        pipeColor = '#06b6d4';
      }

      if (p.status === 'CLOSED') {
        pipeColor = '#6b7280';
      }

      if (isSelected) {
        pipeColor = '#fbbf24';
        weight = Math.max(weight + 2, 5);
      }

      const polyline = L.polyline([c1, c2], {
        color: pipeColor,
        weight,
        opacity: p.status === 'CLOSED' ? 0.5 : 0.95,
        dashArray: p.status === 'CLOSED' ? '4, 6' : undefined,
      }).addTo(pipesLayer);

      polyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeTool === 'delete') {
          onDeleteElement(p.id, 'pipe');
        } else {
          onSelectElement(p);
        }
      });

      // Tooltip
      polyline.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <strong>${p.label || p.id}</strong><br/>
          Length: ${p.length} m | Diam: ${p.diameter} mm<br/>
          ${p.flow !== undefined ? `Flow: <strong>${p.flow} L/s</strong><br/>` : ''}
          ${p.velocity !== undefined ? `Velocity: <strong>${p.velocity} m/s</strong><br/>` : ''}
          ${p.unitHeadloss !== undefined ? `Headloss: ${p.unitHeadloss} m/km` : ''}
        </div>`,
        { sticky: true }
      );

      // Flow direction arrow if flow is calculated
      if (p.flow !== undefined && Math.abs(p.flow) > 0.05) {
        const midLat = (c1[0] + c2[0]) / 2;
        const midLng = (c1[1] + c2[1]) / 2;
        // Direction based on sign of flow
        const forward = p.flow >= 0;
        const fromPt = forward ? c1 : c2;
        const toPt = forward ? c2 : c1;
        const angleDeg =
          (Math.atan2(toPt[1] - fromPt[1], toPt[0] - fromPt[0]) * 180) / Math.PI;

        const arrowIcon = L.divIcon({
          className: 'flow-arrow-icon',
          html: `<div style="transform: rotate(${angleDeg}deg); color: #ffffff; font-size: 11px; text-shadow: 0 0 4px #000; font-weight: bold;">▶</div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        L.marker([midLat, midLng], { icon: arrowIcon, interactive: false }).addTo(arrowsLayer);
      }
    });

    // 2. Draw Pumps
    network.pumps.forEach((pmp) => {
      const c1 = nodeCoords.get(pmp.startNodeId);
      const c2 = nodeCoords.get(pmp.endNodeId);
      if (!c1 || !c2) return;

      const midLat = (c1[0] + c2[0]) / 2;
      const midLng = (c1[1] + c2[1]) / 2;
      const isSelected = selectedElement?.id === pmp.id;
      const isRunning = pmp.status === 'OPEN';

      const pumpLine = L.polyline([c1, c2], {
        color: isRunning ? '#f59e0b' : '#525252',
        weight: 4,
        dashArray: isRunning ? '3, 4' : '2, 6',
      }).addTo(pipesLayer);

      pumpLine.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeTool === 'delete') onDeleteElement(pmp.id, 'pump');
        else onSelectElement(pmp);
      });

      const isDraggablePump = isSelected && activeTool === 'select';
      const pumpIcon = L.divIcon({
        className: 'pump-marker-icon',
        html: `
          <div style="
            width: 30px; height: 30px; border-radius: 50%;
            background: #111; border: 2.5px solid ${isSelected ? '#fbbf24' : isRunning ? '#10b981' : '#ef4444'};
            display: flex; align-items: center; justify-content: center;
            box-shadow: ${isRunning ? '0 0 12px rgba(16,185,129,0.45)' : '0 2px 6px rgba(0,0,0,0.8)'};
            cursor: ${isDraggablePump ? 'grab' : 'pointer'}; color: ${isRunning ? '#10b981' : '#ef4444'};
            position: relative;
          ">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="8" fill="#1e1e1e" />
              <polygon points="9,8 16,12 9,16" fill="currentColor" stroke="none"/>
            </svg>
            <div style="
              position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%);
              background: #0a0a0a; border: 1px solid ${isRunning ? '#10b981' : '#ef4444'};
              color: ${isRunning ? '#34d399' : '#f87171'}; font-size: 8px; font-weight: bold;
              padding: 0 3px; border-radius: 3px; line-height: 11px; font-family: monospace;
              white-space: nowrap; pointer-events: none;
            ">PUMP</div>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const pumpMarker = L.marker([midLat, midLng], {
        icon: pumpIcon,
        draggable: isDraggablePump,
        zIndexOffset: isSelected ? 1200 : 500,
      }).addTo(nodesLayer);

      if (isDraggablePump) {
        pumpMarker.on('dragend', (e) => {
          const newPos = (e.target as L.Marker).getLatLng();
          const dLat = newPos.lat - midLat;
          const dLng = newPos.lng - midLng;
          const n1 = network.junctions.find((j) => j.id === pmp.startNodeId);
          const n2 = network.junctions.find((j) => j.id === pmp.endNodeId);
          if (n1 && n2 && onUpdateElement) {
            onUpdateElement({ ...n1, lat: Math.round((n1.lat + dLat) * 1000000) / 1000000, lng: Math.round((n1.lng + dLng) * 1000000) / 1000000 });
            onUpdateElement({ ...n2, lat: Math.round((n2.lat + dLat) * 1000000) / 1000000, lng: Math.round((n2.lng + dLng) * 1000000) / 1000000 });
          }
        });
      }

      pumpMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeTool === 'delete') onDeleteElement(pmp.id, 'pump');
        else onSelectElement(pmp);
      });

      pumpMarker.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <strong>Pump: ${pmp.label || pmp.id}</strong><br/>
          Status: <strong style="color: ${isRunning ? '#10b981' : '#ef4444'};">${isRunning ? 'RUNNING (ONLINE)' : 'STOPPED (OFFLINE)'}</strong><br/>
          Design: ${pmp.designFlow} L/s @ ${pmp.designHead} m<br/>
          ${pmp.operatingFlow !== undefined ? `Operating Flow: <strong>${pmp.operatingFlow} L/s</strong><br/>` : ''}
          ${pmp.operatingHead !== undefined ? `Operating Head: <strong>${pmp.operatingHead} m</strong><br/>` : ''}
          Power: ${pmp.powerKw ?? 0} kW
        </div>`,
        { sticky: true }
      );
    });

    // 2.5 Draw Control Valves (PRV, PSV, PBV, FCV, TCV)
    (network.valves || []).forEach((v) => {
      const c1 = nodeCoords.get(v.startNodeId);
      const c2 = nodeCoords.get(v.endNodeId);
      if (!c1 || !c2) return;

      const midLat = (c1[0] + c2[0]) / 2;
      const midLng = (c1[1] + c2[1]) / 2;
      const isSelected = selectedElement?.id === v.id;
      const isActive = v.status !== 'CLOSED';
      const isDraggableValve = isSelected && activeTool === 'select';

      const valveLine = L.polyline([c1, c2], {
        color: isActive ? '#06b6d4' : '#525252',
        weight: 4,
        dashArray: isActive ? '4, 4' : '2, 6',
      }).addTo(pipesLayer);

      valveLine.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeTool === 'delete') onDeleteElement(v.id, 'valve');
        else onSelectElement(v);
      });

      const valveIcon = L.divIcon({
        className: 'valve-marker-icon',
        html: `
          <div style="
            width: 26px; height: 26px; border-radius: 4px;
            background: #171717; border: 2px solid ${isSelected ? '#fbbf24' : isActive ? '#06b6d4' : '#ef4444'};
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.7); cursor: ${isDraggableValve ? 'grab' : 'pointer'}; color: ${isActive ? '#06b6d4' : '#737373'};
            font-family: monospace; font-size: 8px; font-weight: bold;
          ">
            ${v.valveType}
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const valveMarker = L.marker([midLat, midLng], {
        icon: valveIcon,
        draggable: isDraggableValve,
        zIndexOffset: isSelected ? 1200 : 500,
      }).addTo(nodesLayer);

      if (isDraggableValve) {
        valveMarker.on('dragend', (e) => {
          const newPos = (e.target as L.Marker).getLatLng();
          const dLat = newPos.lat - midLat;
          const dLng = newPos.lng - midLng;
          const n1 = network.junctions.find((j) => j.id === v.startNodeId);
          const n2 = network.junctions.find((j) => j.id === v.endNodeId);
          if (n1 && n2 && onUpdateElement) {
            onUpdateElement({ ...n1, lat: Math.round((n1.lat + dLat) * 1000000) / 1000000, lng: Math.round((n1.lng + dLng) * 1000000) / 1000000 });
            onUpdateElement({ ...n2, lat: Math.round((n2.lat + dLat) * 1000000) / 1000000, lng: Math.round((n2.lng + dLng) * 1000000) / 1000000 });
          }
        });
      }

      valveMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeTool === 'delete') onDeleteElement(v.id, 'valve');
        else onSelectElement(v);
      });

      valveMarker.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <strong>${v.valveType} Valve: ${v.label || v.id}</strong><br/>
          Status: <strong>${v.status}</strong><br/>
          Setting: <strong>${v.setting} ${v.valveType === 'FCV' ? 'L/s' : 'm'}</strong><br/>
          ${v.flow !== undefined ? `Through Flow: <strong>${v.flow} L/s</strong><br/>` : ''}
          ${v.headloss !== undefined ? `Headloss: <strong>${v.headloss} m</strong>` : ''}
        </div>`,
        { sticky: true }
      );
    });

    // 3. Draw Reservoirs
    network.reservoirs.forEach((r) => {
      const isSelected = selectedElement?.id === r.id;
      const isPending = pendingStartNode === r.id;
      const isDraggableRes = isSelected && activeTool === 'select';

      const reservoirIcon = L.divIcon({
        className: 'reservoir-marker',
        html: `
          <div style="
            width: 28px; height: 28px; border-radius: 4px;
            background: #0369a1; border: ${isSelected ? '3px solid #fbbf24' : isPending ? '2px solid #fbbf24' : '2px solid #38bdf8'};
            display: flex; align-items: center; justify-content: center;
            box-shadow: ${isSelected ? '0 0 14px rgba(251, 191, 36, 0.8)' : '0 2px 8px rgba(0,0,0,0.6)'};
            cursor: ${isDraggableRes ? 'grab' : 'pointer'}; color: white;
          ">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([r.lat, r.lng], {
        icon: reservoirIcon,
        draggable: isDraggableRes,
        zIndexOffset: isSelected ? 1500 : 400,
      }).addTo(nodesLayer);

      if (isDraggableRes) {
        marker.on('dragend', async (e) => {
          const newPos = (e.target as L.Marker).getLatLng();
          const newLat = Math.round(newPos.lat * 1000000) / 1000000;
          const newLng = Math.round(newPos.lng * 1000000) / 1000000;
          if (onUpdateElement) {
            onUpdateElement({ ...r, lat: newLat, lng: newLng });
            const newElev = await sampleGroundElevation(newLat, newLng);
            if (newElev !== null) {
              const rounded = Math.round(newElev * 10) / 10;
              onUpdateElement({ ...r, lat: newLat, lng: newLng, elevation: rounded, totalHead: Math.round((rounded + 15) * 10) / 10 });
            }
          }
        });
      }

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        handleNodeClick(r.id, 'reservoir');
      });

      marker.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <strong>Reservoir: ${r.label || r.id}</strong><br/>
          Ground Elevation: ${r.elevation} m MSL<br/>
          Total Water Head: <strong>${r.totalHead} m MSL</strong><br/>
          ${r.netFlow !== undefined ? `Supply: <strong>${r.netFlow} L/s</strong>` : ''}
        </div>`,
        { sticky: true }
      );
    });

    // 4. Draw Tanks
    network.tanks.forEach((t) => {
      const isSelected = selectedElement?.id === t.id;
      const isPending = pendingStartNode === t.id;
      const isDraggableTank = isSelected && activeTool === 'select';

      const tankIcon = L.divIcon({
        className: 'tank-marker',
        html: `
          <div style="
            width: 28px; height: 28px; border-radius: 50%;
            background: #0f766e; border: ${isSelected ? '3px solid #fbbf24' : isPending ? '2px solid #fbbf24' : '2px solid #2dd4bf'};
            display: flex; align-items: center; justify-content: center;
            box-shadow: ${isSelected ? '0 0 14px rgba(251, 191, 36, 0.8)' : '0 2px 8px rgba(0,0,0,0.6)'};
            cursor: ${isDraggableTank ? 'grab' : 'pointer'}; color: white;
          ">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/></svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([t.lat, t.lng], {
        icon: tankIcon,
        draggable: isDraggableTank,
        zIndexOffset: isSelected ? 1500 : 400,
      }).addTo(nodesLayer);

      if (isDraggableTank) {
        marker.on('dragend', async (e) => {
          const newPos = (e.target as L.Marker).getLatLng();
          const newLat = Math.round(newPos.lat * 1000000) / 1000000;
          const newLng = Math.round(newPos.lng * 1000000) / 1000000;
          if (onUpdateElement) {
            onUpdateElement({ ...t, lat: newLat, lng: newLng });
            const newElev = await sampleGroundElevation(newLat, newLng);
            if (newElev !== null) {
              onUpdateElement({ ...t, lat: newLat, lng: newLng, elevation: Math.round(newElev * 10) / 10 });
            }
          }
        });
      }

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        handleNodeClick(t.id, 'tank');
      });

      marker.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <strong>Tank: ${t.label || t.id}</strong><br/>
          Base Elev: ${t.elevation} m MSL<br/>
          Water Level: ${t.initialLevel} m (Max: ${t.maxLevel} m)<br/>
          Head: ${(t.elevation + t.initialLevel).toFixed(1)} m MSL<br/>
          Diam: ${t.diameter} m
        </div>`,
        { sticky: true }
      );
    });

    // 5. Draw Junctions
    network.junctions.forEach((j) => {
      const isSelected = selectedElement?.id === j.id;
      const isPending = pendingStartNode === j.id;
      const isDraggableJunction = isSelected && activeTool === 'select';

      // Thematic node color
      let nodeColor = '#3b82f6';
      if (thematicDisplay === 'pressure' && j.pressure !== undefined) {
        const p = j.pressure;
        if (p < 0) nodeColor = '#dc2626'; // Negative pressure warning!
        else if (p < 15) nodeColor = '#f59e0b'; // Low pressure
        else if (p <= 50) nodeColor = '#10b981'; // Optimal
        else if (p <= 75) nodeColor = '#3b82f6'; // High
        else nodeColor = '#a855f7'; // Excessive
      } else if (thematicDisplay === 'water-age') {
        const dist = Math.sqrt(Math.pow(j.lat - 27.247, 2) + Math.pow(j.lng - 77.825, 2)) * 111000;
        const age = dist / 2200;
        if (age > 48) nodeColor = '#dc2626';
        else if (age > 24) nodeColor = '#f59e0b';
        else nodeColor = '#10b981';
      } else if (thematicDisplay === 'fire-flow') {
        const p = j.pressure ?? 20;
        if (p < 15) nodeColor = '#dc2626';
        else if (p < 25) nodeColor = '#f59e0b';
        else nodeColor = '#10b981';
      } else if (thematicDisplay === 'elevation') {
        nodeColor = '#f59e0b';
      }

      const size = isSelected || isPending ? 18 : 14;

      const junctionIcon = L.divIcon({
        className: 'junction-marker',
        html: `
          <div style="
            width: ${size}px; height: ${size}px; border-radius: 50%;
            background: ${nodeColor}; border: ${isSelected ? '3px solid #fbbf24' : isPending ? '2px solid #fbbf24' : '2px solid #ffffff'};
            box-shadow: ${isSelected ? '0 0 14px rgba(251, 191, 36, 0.8)' : '0 2px 6px rgba(0,0,0,0.8)'};
            cursor: ${isDraggableJunction ? 'grab' : 'pointer'};
            transition: transform 0.1s ease;
          "></div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([j.lat, j.lng], {
        icon: junctionIcon,
        draggable: isDraggableJunction,
        zIndexOffset: isSelected ? 1500 : 300,
      }).addTo(nodesLayer);

      if (isDraggableJunction) {
        marker.on('dragend', async (e) => {
          const newPos = (e.target as L.Marker).getLatLng();
          const newLat = Math.round(newPos.lat * 1000000) / 1000000;
          const newLng = Math.round(newPos.lng * 1000000) / 1000000;
          if (onUpdateElement) {
            onUpdateElement({ ...j, lat: newLat, lng: newLng });
            const newElev = await sampleGroundElevation(newLat, newLng);
            if (newElev !== null) {
              onUpdateElement({ ...j, lat: newLat, lng: newLng, elevation: Math.round(newElev * 10) / 10 });
            }
          }
        });
      }

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        handleNodeClick(j.id, 'junction');
      });

      marker.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <strong>Junction: ${j.label || j.id}</strong><br/>
          Elevation: <strong>${j.elevation} m MSL</strong><br/>
          Demand: ${j.baseDemand} L/s<br/>
          ${j.head !== undefined ? `Head: ${j.head} m MSL<br/>` : ''}
          ${j.pressure !== undefined ? `Pressure: <strong style="color: ${j.pressure < 0 ? '#ef4444' : j.pressure < 15 ? '#f59e0b' : '#10b981'};">${j.pressure} m H2O (${(j.pressure * 1.42).toFixed(1)} psi)</strong>` : ''}
        </div>`,
        { sticky: true }
      );
    });
  }, [
    network,
    thematicDisplay,
    selectedElement,
    pendingStartNode,
    activeTool,
    handleNodeClick,
    onDeleteElement,
    onSelectElement,
    onUpdateElement,
  ]);

  // Center on network elements if any exist
  const handleZoomToFit = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const allPts: [number, number][] = [
      ...network.junctions.map((j): [number, number] => [j.lat, j.lng]),
      ...network.reservoirs.map((r): [number, number] => [r.lat, r.lng]),
      ...network.tanks.map((t): [number, number] => [t.lat, t.lng]),
    ];

    if (allPts.length > 0) {
      const bounds = L.latLngBounds(allPts);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  };

  return (
    <div className="flex-1 h-full relative overflow-hidden bg-[#0a0a0a]">
      {/* Leaflet container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Mode / Pending Action Overlay Banner */}
      {activeTool === 'add-pump' && !pendingStartNode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#171717] border border-amber-500/60 px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2 text-xs font-mono text-white backdrop-blur">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>Pump Tool Active: Click suction node then discharge node, or click ground to place pump.</span>
        </div>
      )}

      {activeTool === 'add-valve' && !pendingStartNode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#171717] border border-cyan-500/60 px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2 text-xs font-mono text-white backdrop-blur">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          <span>Valve Tool Active: Click upstream node then downstream node, or click ground to place valve.</span>
        </div>
      )}

      {pendingStartNode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#171717] border border-amber-500/60 px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2 text-xs font-mono text-white backdrop-blur">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>
            Connecting from <strong>{pendingStartNode}</strong>: click target node to finish
          </span>
          <button
            onClick={() => setPendingStartNode(null)}
            className="ml-2 text-xs text-[#737373] hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Map Controls Float: Zoom to Extents & Coords */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2">
        <button
          onClick={handleZoomToFit}
          className="p-2 rounded-lg bg-[#111]/90 hover:bg-[#1c1c1c] border border-[#222] text-[#d1d5db] hover:text-white shadow-xl transition-colors cursor-pointer"
          title="Zoom to Fit Network Extents"
        >
          <Crosshair className="w-4 h-4 text-amber-500" />
        </button>

        {mouseCoords && (
          <div className="px-2.5 py-1 rounded bg-[#0a0a0a]/90 border border-[#222] text-[10px] font-mono text-[#737373] shadow-md backdrop-blur">
            {mouseCoords.lat.toFixed(5)}° N, {mouseCoords.lng.toFixed(5)}° E
          </div>
        )}
      </div>

      {/* Legend for Thematic Visualization */}
      {thematicDisplay === 'pressure' && (
        <div className="absolute bottom-4 left-4 z-20 bg-[#111]/95 border border-[#222] rounded-lg p-2.5 text-[11px] font-mono shadow-xl backdrop-blur flex flex-col gap-1">
          <span className="text-[10px] uppercase font-tech text-[#737373] font-bold">
            Pressure Legend (m H2O)
          </span>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full bg-[#dc2626]" />
            <span>&lt; 0 m (Negative)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full bg-[#f59e0b]" />
            <span>0 – 15 m (Low)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full bg-[#10b981]" />
            <span>15 – 50 m (Optimal)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full bg-[#3b82f6]" />
            <span>50 – 75 m (High)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full bg-[#a855f7]" />
            <span>&gt; 75 m (Excessive)</span>
          </div>
        </div>
      )}

      {thematicDisplay === 'velocity' && (
        <div className="absolute bottom-4 left-4 z-20 bg-[#111]/95 border border-[#222] rounded-lg p-2.5 text-[11px] font-mono shadow-xl backdrop-blur flex flex-col gap-1">
          <span className="text-[10px] uppercase font-tech text-[#737373] font-bold">
            Velocity Legend (m/s)
          </span>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-4 h-1 bg-[#38bdf8]" />
            <span>&lt; 0.6 m/s (Low)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-4 h-1 bg-[#10b981]" />
            <span>0.6 – 1.5 m/s (Optimal)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-4 h-1 bg-[#f59e0b]" />
            <span>1.5 – 2.5 m/s (Elevated)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-4 h-1 bg-[#ef4444]" />
            <span>&gt; 2.5 m/s (High Scour)</span>
          </div>
        </div>
      )}

      {thematicDisplay === 'water-age' && (
        <div className="absolute bottom-4 left-4 z-20 bg-[#111]/95 border border-[#222] rounded-lg p-2.5 text-[11px] font-mono shadow-xl backdrop-blur flex flex-col gap-1">
          <span className="text-[10px] uppercase font-tech text-[#737373] font-bold">
            Water Age (Hours)
          </span>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full bg-[#10b981]" />
            <span>&lt; 24 hrs (Fresh)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full bg-[#f59e0b]" />
            <span>24 – 48 hrs (Moderate)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full bg-[#ef4444]" />
            <span>&gt; 48 hrs (Stagnant)</span>
          </div>
        </div>
      )}

      {thematicDisplay === 'fire-flow' && (
        <div className="absolute bottom-4 left-4 z-20 bg-[#111]/95 border border-[#222] rounded-lg p-2.5 text-[11px] font-mono shadow-xl backdrop-blur flex flex-col gap-1">
          <span className="text-[10px] uppercase font-tech text-[#737373] font-bold">
            Fire Flow Adequacy
          </span>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full bg-[#10b981]" />
            <span>Adequate (&ge; 35 L/s)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full bg-[#f59e0b]" />
            <span>Marginal (20 – 35 L/s)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full bg-[#ef4444]" />
            <span>Deficient (&lt; 20 L/s)</span>
          </div>
        </div>
      )}
    </div>
  );
};
