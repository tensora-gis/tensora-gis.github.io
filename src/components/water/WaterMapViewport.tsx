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
import { calculateGeodesicDistanceM } from '../../utils/waterTerrainService';
import { Layers, ZoomIn, ZoomOut, Crosshair, AlertTriangle } from 'lucide-react';

interface WaterMapViewportProps {
  network: WaterDistributionNetwork;
  activeTool: ActiveTool;
  thematicDisplay: MapThematicDisplay;
  selectedElement: NetworkElement | null;
  onSelectElement: (elem: NetworkElement | null) => void;
  onAddJunction: (lat: number, lng: number) => void;
  onAddPipe: (startNodeId: string, endNodeId: string) => void;
  onAddReservoir: (lat: number, lng: number) => void;
  onAddTank: (lat: number, lng: number) => void;
  onAddPump: (startNodeId: string, endNodeId: string) => void;
  onDeleteElement: (id: string, type: NetworkElement['type']) => void;
  onProfileRouteSelected: (nodeIds: string[]) => void;
}

export const WaterMapViewport: React.FC<WaterMapViewportProps> = ({
  network,
  activeTool,
  thematicDisplay,
  selectedElement,
  onSelectElement,
  onAddJunction,
  onAddPipe,
  onAddReservoir,
  onAddTank,
  onAddPump,
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
      } else if (activeTool === 'select') {
        onSelectElement(null);
      }
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [activeTool, onAddJunction, onAddReservoir, onAddTank, onSelectElement]);

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

      L.polyline([c1, c2], {
        color: '#f59e0b',
        weight: 4,
        dashArray: '2, 4',
      }).addTo(pipesLayer);

      const pumpIcon = L.divIcon({
        className: 'pump-marker-icon',
        html: `
          <div style="
            width: 26px; height: 26px; border-radius: 50%;
            background: #171717; border: 2px solid ${isSelected ? '#fbbf24' : '#f59e0b'};
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.7); cursor: pointer; color: #f59e0b;
            font-size: 12px; font-weight: bold;
          ">
            ⚡
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const pumpMarker = L.marker([midLat, midLng], { icon: pumpIcon }).addTo(nodesLayer);
      pumpMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeTool === 'delete') onDeleteElement(pmp.id, 'pump');
        else onSelectElement(pmp);
      });

      pumpMarker.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <strong>Pump: ${pmp.label || pmp.id}</strong><br/>
          Design: ${pmp.designFlow} L/s @ ${pmp.designHead} m<br/>
          ${pmp.operatingFlow !== undefined ? `Operating Flow: <strong>${pmp.operatingFlow} L/s</strong><br/>` : ''}
          ${pmp.operatingHead !== undefined ? `Operating Head: <strong>${pmp.operatingHead} m</strong><br/>` : ''}
          Power: ${pmp.powerKw} kW
        </div>`,
        { sticky: true }
      );
    });

    // 3. Draw Reservoirs
    network.reservoirs.forEach((r) => {
      const isSelected = selectedElement?.id === r.id;
      const isPending = pendingStartNode === r.id;

      const reservoirIcon = L.divIcon({
        className: 'reservoir-marker',
        html: `
          <div style="
            width: 32px; height: 32px; border-radius: 6px;
            background: #0284c7; border: 2.5px solid ${isSelected || isPending ? '#fbbf24' : '#38bdf8'};
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            box-shadow: 0 3px 10px rgba(2,132,199,0.5); cursor: pointer; color: white;
            font-size: 14px;
          ">
            ⛲
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([r.lat, r.lng], { icon: reservoirIcon }).addTo(nodesLayer);
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

      const tankIcon = L.divIcon({
        className: 'tank-marker',
        html: `
          <div style="
            width: 30px; height: 30px; border-radius: 50%;
            background: #0d9488; border: 2.5px solid ${isSelected || isPending ? '#fbbf24' : '#2dd4bf'};
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 3px 10px rgba(13,148,136,0.5); cursor: pointer; color: white;
            font-size: 13px;
          ">
            🛢️
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([t.lat, t.lng], { icon: tankIcon }).addTo(nodesLayer);
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

      // Thematic node color
      let nodeColor = '#3b82f6';
      if (thematicDisplay === 'pressure' && j.pressure !== undefined) {
        const p = j.pressure;
        if (p < 0) nodeColor = '#dc2626'; // Negative pressure warning!
        else if (p < 15) nodeColor = '#f59e0b'; // Low pressure
        else if (p <= 50) nodeColor = '#10b981'; // Optimal
        else if (p <= 75) nodeColor = '#3b82f6'; // High
        else nodeColor = '#a855f7'; // Excessive
      } else if (thematicDisplay === 'elevation') {
        nodeColor = '#f59e0b';
      }

      const size = isSelected || isPending ? 18 : 14;

      const junctionIcon = L.divIcon({
        className: 'junction-marker',
        html: `
          <div style="
            width: ${size}px; height: ${size}px; border-radius: 50%;
            background: ${nodeColor}; border: 2px solid ${isSelected || isPending ? '#fbbf24' : '#ffffff'};
            box-shadow: 0 2px 6px rgba(0,0,0,0.8); cursor: pointer;
            transition: transform 0.1s ease;
          "></div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([j.lat, j.lng], { icon: junctionIcon }).addTo(nodesLayer);
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
      {pendingStartNode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#171717]/95 border border-amber-500 px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 text-xs font-mono text-white backdrop-blur">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
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
    </div>
  );
};
