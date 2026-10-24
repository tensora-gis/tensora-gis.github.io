import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  ActiveWastewaterTool,
  WastewaterThematicDisplay,
  WastewaterNetworkElement,
  WastewaterNetwork,
  WastewaterManhole,
  WastewaterConduit,
  WastewaterWetWell,
  WastewaterPump,
  WastewaterForceMain,
  WastewaterOutfall,
} from '../../types/wastewater';
import { calculateWastewaterDistanceM } from '../../utils/wastewaterTerrainService';
import { Layers, ZoomIn, ZoomOut, Crosshair } from 'lucide-react';

interface WastewaterMapViewportProps {
  network: WastewaterNetwork;
  activeTool: ActiveWastewaterTool;
  thematicDisplay: WastewaterThematicDisplay;
  selectedElement: WastewaterNetworkElement | null;
  onSelectElement: (elem: WastewaterNetworkElement | null) => void;
  onAddManhole: (lat: number, lng: number) => void;
  onAddConduit: (startNodeId: string, endNodeId: string) => void;
  onAddWetWell: (lat: number, lng: number) => void;
  onAddPump: (startNodeId: string, endNodeId: string) => void;
  onAddForceMain: (startNodeId: string, endNodeId: string) => void;
  onAddOutfall: (lat: number, lng: number) => void;
  onDeleteElement: (id: string, type: WastewaterNetworkElement['type']) => void;
  onProfileRouteSelected: (nodeIds: string[]) => void;
}

export const WastewaterMapViewport: React.FC<WastewaterMapViewportProps> = ({
  network,
  activeTool,
  thematicDisplay,
  selectedElement,
  onSelectElement,
  onAddManhole,
  onAddConduit,
  onAddWetWell,
  onAddPump,
  onAddForceMain,
  onAddOutfall,
  onDeleteElement,
  onProfileRouteSelected,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const conduitsLayerRef = useRef<L.LayerGroup | null>(null);
  const forceMainsLayerRef = useRef<L.LayerGroup | null>(null);
  const nodesLayerRef = useRef<L.LayerGroup | null>(null);
  const arrowsLayerRef = useRef<L.LayerGroup | null>(null);

  const [pendingStartNode, setPendingStartNode] = useState<string | null>(null);
  const [routeNodes, setRouteNodes] = useState<string[]>([]);
  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lng: number } | null>(null);

  // ResizeObserver for clean map sizing
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      mapInstanceRef.current?.invalidateSize();
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [27.247, 77.825],
      zoom: 15,
      zoomControl: false,
      attributionControl: true,
    });

    // High-resolution satellite tiles
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

    conduitsLayerRef.current = L.layerGroup().addTo(map);
    forceMainsLayerRef.current = L.layerGroup().addTo(map);
    arrowsLayerRef.current = L.layerGroup().addTo(map);
    nodesLayerRef.current = L.layerGroup().addTo(map);

    map.on('mousemove', (e) => {
      setMouseCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    map.on('click', (e) => {
      if (activeTool === 'add-manhole') {
        onAddManhole(e.latlng.lat, e.latlng.lng);
      } else if (activeTool === 'add-wetwell') {
        onAddWetWell(e.latlng.lat, e.latlng.lng);
      } else if (activeTool === 'add-outfall') {
        onAddOutfall(e.latlng.lat, e.latlng.lng);
      } else if (activeTool === 'select') {
        onSelectElement(null);
      }
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Fit bounds to network
  const handleFitBounds = useCallback(() => {
    if (!mapInstanceRef.current) return;
    const allCoords: [number, number][] = [
      ...network.manholes.map((m) => [m.lat, m.lng] as [number, number]),
      ...network.wetWells.map((w) => [w.lat, w.lng] as [number, number]),
      ...network.outfalls.map((o) => [o.lat, o.lng] as [number, number]),
    ];
    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords);
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    }
  }, [network]);

  // Redraw all nodes, gravity conduits, force mains and arrows
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const conduitsLayer = conduitsLayerRef.current;
    const forceMainsLayer = forceMainsLayerRef.current;
    const arrowsLayer = arrowsLayerRef.current;
    const nodesLayer = nodesLayerRef.current;

    if (!conduitsLayer || !forceMainsLayer || !arrowsLayer || !nodesLayer) return;

    conduitsLayer.clearLayers();
    forceMainsLayer.clearLayers();
    arrowsLayer.clearLayers();
    nodesLayer.clearLayers();

    // Map of all node coordinates
    const nodeCoords = new Map<string, { lat: number; lng: number }>();
    network.manholes.forEach((m) => nodeCoords.set(m.id, { lat: m.lat, lng: m.lng }));
    network.wetWells.forEach((w) => nodeCoords.set(w.id, { lat: w.lat, lng: w.lng }));
    network.outfalls.forEach((o) => nodeCoords.set(o.id, { lat: o.lat, lng: o.lng }));

    // 1. Render Gravity Conduits
    network.conduits.forEach((c) => {
      const start = nodeCoords.get(c.startNodeId);
      const end = nodeCoords.get(c.endNodeId);
      if (!start || !end) return;

      const isSelected = selectedElement?.id === c.id;

      // Color coding based on thematic mode
      let color = '#38bdf8'; // Default cyan
      let weight = Math.max(3, Math.min(8, (c.diameterMm || 250) / 70));

      if (thematicDisplay === 'capacity') {
        const ratio = c.flowDepthRatio ?? 0;
        if (ratio > 1.0) color = '#ef4444'; // Red (surcharged)
        else if (ratio > 0.75) color = '#f59e0b'; // Amber (high fullness)
        else if (ratio > 0.5) color = '#84cc16'; // Lime
        else color = '#10b981'; // Green
      } else if (thematicDisplay === 'velocity') {
        const v = c.actualVelocityMs ?? 0;
        if (v < 0.6 && (c.designFlowLs || 0) > 0.5) color = '#f59e0b'; // Sub-cleansing (amber)
        else if (v > 3.0) color = '#ef4444'; // Scour risk (red)
        else color = '#10b981'; // Optimal (green)
      } else if (thematicDisplay === 'slope') {
        if (c.isReverseSlope) color = '#ef4444';
        else if (c.slopeMPerM < 0.002) color = '#f59e0b';
        else color = '#10b981';
      } else if (thematicDisplay === 'surcharge') {
        color = c.isSurcharged ? '#ef4444' : '#10b981';
      }

      const polyline = L.polyline(
        [
          [start.lat, start.lng],
          [end.lat, end.lng],
        ],
        {
          color: isSelected ? '#f59e0b' : color,
          weight: isSelected ? weight + 3 : weight,
          opacity: 0.95,
          lineCap: 'round',
        }
      );

      polyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeTool === 'delete') {
          onDeleteElement(c.id, 'conduit');
        } else {
          onSelectElement(c);
        }
      });

      const tooltipContent = `
        <div style="font-family: monospace; font-size: 11px; padding: 2px;">
          <strong style="color: #f59e0b;">${c.id} (${c.label})</strong><br/>
          Diameter: <strong>${c.diameterMm} mm</strong> (${c.material})<br/>
          Length: ${c.lengthM.toFixed(1)} m | Slope: ${(c.slopeMPerM * 100).toFixed(3)}%<br/>
          Design Flow Q: <strong>${c.designFlowLs?.toFixed(2) ?? '0.00'} L/s</strong><br/>
          Velocity: <strong>${c.actualVelocityMs?.toFixed(2) ?? '0.00'} m/s</strong><br/>
          Fullness d/D: <strong>${c.flowDepthRatio?.toFixed(2) ?? '0.00'}</strong> ${
            (c.flowDepthRatio ?? 0) > 1.0 ? '<span style="color:#ef4444;">(SURCHARGED)</span>' : ''
          }
        </div>
      `;
      polyline.bindTooltip(tooltipContent, { sticky: true });
      polyline.addTo(conduitsLayer);

      // Flow direction arrow in middle of conduit
      const midLat = (start.lat + end.lat) / 2;
      const midLng = (start.lng + end.lng) / 2;
      const angle =
        (Math.atan2(end.lat - start.lat, end.lng - start.lng) * 180) / Math.PI;

      const arrowIcon = L.divIcon({
        className: 'custom-flow-arrow',
        html: `
          <div style="transform: rotate(${-angle + 90}deg); width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="${color}" stroke="#0a0a0a" stroke-width="2">
              <polygon points="12,2 22,22 12,17 2,22"/>
            </svg>
          </div>
        `,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      L.marker([midLat, midLng], { icon: arrowIcon, interactive: false }).addTo(arrowsLayer);
    });

    // 2. Render Force Mains
    network.forceMains.forEach((fm) => {
      const start = nodeCoords.get(fm.startNodeId);
      const end = nodeCoords.get(fm.endNodeId);
      if (!start || !end) return;

      const isSelected = selectedElement?.id === fm.id;
      const polyline = L.polyline(
        [
          [start.lat, start.lng],
          [end.lat, end.lng],
        ],
        {
          color: isSelected ? '#f59e0b' : '#a855f7', // Purple for force main
          weight: isSelected ? 6 : 4,
          dashArray: '6, 6',
          opacity: 0.95,
        }
      );

      polyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeTool === 'delete') {
          onDeleteElement(fm.id, 'force-main');
        } else {
          onSelectElement(fm);
        }
      });

      polyline.bindTooltip(
        `<div style="font-family:monospace;font-size:11px;">
          <strong style="color:#a855f7;">${fm.id} (Force Main)</strong><br/>
          Diameter: ${fm.diameterMm} mm (${fm.material})<br/>
          Velocity: ${fm.velocityMs?.toFixed(2) ?? '0.00'} m/s<br/>
          Headloss hf: ${fm.frictionHeadlossM?.toFixed(2) ?? '0.00'} m
        </div>`,
        { sticky: true }
      );
      polyline.addTo(forceMainsLayer);
    });

    // 3. Render Nodes: Manholes, Wet Wells, Outfalls
    const handleNodeClick = (nodeId: string, elem: WastewaterNetworkElement) => {
      if (activeTool === 'delete') {
        onDeleteElement(nodeId, elem.type);
        return;
      }

      if (activeTool === 'add-conduit') {
        if (!pendingStartNode) {
          setPendingStartNode(nodeId);
        } else if (pendingStartNode !== nodeId) {
          onAddConduit(pendingStartNode, nodeId);
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

      if (activeTool === 'add-forcemain') {
        if (!pendingStartNode) {
          setPendingStartNode(nodeId);
        } else if (pendingStartNode !== nodeId) {
          onAddForceMain(pendingStartNode, nodeId);
          setPendingStartNode(null);
        }
        return;
      }

      if (activeTool === 'profile-select') {
        setRouteNodes((prev) => {
          const next = prev.includes(nodeId) ? prev : [...prev, nodeId];
          if (next.length >= 2) {
            onProfileRouteSelected(next);
          }
          return next;
        });
        return;
      }

      onSelectElement(elem);
    };

    // Render Manholes
    network.manholes.forEach((m) => {
      const isSelected = selectedElement?.id === m.id;
      const isPending = pendingStartNode === m.id;
      const isInRoute = routeNodes.includes(m.id);
      const isFlooding = m.isFlooding || false;
      const isSurcharged = m.isSurcharged || false;

      let markerBg = '#f59e0b'; // Amber
      if (isFlooding) markerBg = '#ef4444';
      else if (isSurcharged) markerBg = '#f97316';
      else if (thematicDisplay === 'depth') {
        markerBg = m.depth > 5.0 ? '#8b5cf6' : m.depth > 3.0 ? '#3b82f6' : '#10b981';
      }

      const icon = L.divIcon({
        className: 'custom-manhole-marker',
        html: `
          <div style="
            width: ${isSelected || isPending ? '24px' : '18px'};
            height: ${isSelected || isPending ? '24px' : '18px'};
            border-radius: 50%;
            background: ${markerBg};
            border: 2px solid ${isSelected ? '#ffffff' : isPending ? '#38bdf8' : '#171717'};
            box-shadow: 0 0 ${isSelected || isPending ? '10px #f59e0b' : '4px rgba(0,0,0,0.8)'};
            display: flex;
            align-items: center;
            justify-content: center;
            color: #0a0a0a;
            font-weight: bold;
            font-size: 9px;
            font-family: monospace;
          ">
            ${isInRoute ? '★' : ''}
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([m.lat, m.lng], { icon });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        handleNodeClick(m.id, m);
      });

      marker.bindTooltip(
        `<div style="font-family:monospace;font-size:11px;">
          <strong style="color:#f59e0b;">${m.id} (${m.label})</strong><br/>
          Rim Elev (DEM): <strong>${m.rimElevation.toFixed(2)} m MSL</strong><br/>
          Invert Elev: <strong>${m.invertElevation.toFixed(2)} m MSL</strong><br/>
          Chamber Depth: <strong>${m.depth.toFixed(2)} m</strong><br/>
          Contributing Pop: ${m.population.toLocaleString()} Capita<br/>
          Peak Sanitary Flow: <strong>${m.peakSanitaryFlowLs?.toFixed(2) ?? '0.00'} L/s</strong><br/>
          HGL Water Elev: <strong>${m.waterElevationM?.toFixed(2) ?? m.invertElevation.toFixed(2)} m</strong>
          ${isFlooding ? '<br/><strong style="color:#ef4444;">SURFACE FLOODING RISK</strong>' : ''}
          ${isSurcharged && !isFlooding ? '<br/><strong style="color:#f97316;">SURCHARGED</strong>' : ''}
        </div>`,
        { sticky: true }
      );
      marker.addTo(nodesLayer);
    });

    // Render Wet Wells
    network.wetWells.forEach((w) => {
      const isSelected = selectedElement?.id === w.id;
      const isPending = pendingStartNode === w.id;

      const icon = L.divIcon({
        className: 'custom-wetwell-marker',
        html: `
          <div style="
            width: ${isSelected || isPending ? '26px' : '20px'};
            height: ${isSelected || isPending ? '26px' : '20px'};
            background: #0ea5e9;
            border: 2px solid ${isSelected ? '#ffffff' : '#111'};
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 8px rgba(14,165,233,0.8);
            color: #ffffff;
            font-size: 10px;
            font-weight: bold;
          ">
            W
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([w.lat, w.lng], { icon });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        handleNodeClick(w.id, w);
      });

      marker.bindTooltip(
        `<div style="font-family:monospace;font-size:11px;">
          <strong style="color:#0ea5e9;">${w.id} (${w.label})</strong><br/>
          Ground Rim (DEM): <strong>${w.rimElevation.toFixed(2)} m MSL</strong><br/>
          Floor Invert: <strong>${w.floorElevation.toFixed(2)} m MSL</strong><br/>
          Active Storage: <strong>${w.storageVolumeM3} m³</strong> (${w.diameterM}m Dia)<br/>
          Duty Start: ${w.maxWaterLevelM.toFixed(2)} m | Alarm: ${w.alarmLevelM.toFixed(2)} m
        </div>`,
        { sticky: true }
      );
      marker.addTo(nodesLayer);
    });

    // Render Outfalls
    network.outfalls.forEach((o) => {
      const isSelected = selectedElement?.id === o.id;

      const icon = L.divIcon({
        className: 'custom-outfall-marker',
        html: `
          <div style="
            width: ${isSelected ? '26px' : '22px'};
            height: ${isSelected ? '26px' : '22px'};
            background: #10b981;
            border: 2px solid ${isSelected ? '#ffffff' : '#111'};
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 8px rgba(16,185,129,0.8);
            color: #0a0a0a;
            font-size: 10px;
            font-weight: bold;
          ">
            OUT
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([o.lat, o.lng], { icon });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        handleNodeClick(o.id, o);
      });

      marker.bindTooltip(
        `<div style="font-family:monospace;font-size:11px;">
          <strong style="color:#10b981;">${o.id} (${o.label})</strong><br/>
          Discharge Invert: <strong>${o.invertElevation.toFixed(2)} m MSL</strong><br/>
          Receiving Water Level: <strong>${o.receivingWaterElevation.toFixed(2)} m MSL</strong><br/>
          Total Effluent Discharge: <strong>${o.totalDischargeLs?.toFixed(2) ?? '0.00'} L/s</strong>
        </div>`,
        { sticky: true }
      );
      marker.addTo(nodesLayer);
    });
  }, [network, thematicDisplay, selectedElement, activeTool, pendingStartNode, routeNodes]);

  return (
    <div className="flex-1 h-full relative overflow-hidden bg-[#0a0a0a]">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0 cursor-crosshair" />

      {/* Connection Mode Indicator */}
      {pendingStartNode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-amber-500/90 text-[#0a0a0a] px-4 py-1.5 rounded-full shadow-lg font-tech font-bold text-xs flex items-center gap-2 backdrop-blur-sm animate-pulse">
          <span>Click second node to complete connection from {pendingStartNode}</span>
          <button
            onClick={() => setPendingStartNode(null)}
            className="text-[10px] underline ml-1 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Floating View Controls */}
      <div className="absolute bottom-6 right-4 z-20 flex flex-col gap-1.5">
        <button
          onClick={handleFitBounds}
          className="p-2 rounded-lg bg-[#111]/90 hover:bg-[#1a1a1a] border border-[#222] text-[#888] hover:text-white shadow-lg backdrop-blur-sm transition-colors cursor-pointer"
          title="Fit view to entire sewer network"
        >
          <Crosshair className="w-4 h-4 text-amber-500" />
        </button>
      </div>

      {/* Live Coordinates Footer */}
      {mouseCoords && (
        <div className="absolute bottom-2 left-20 z-10 bg-[#0a0a0a]/80 px-2.5 py-0.5 rounded border border-[#222] text-[10px] text-[#737373] font-mono pointer-events-none">
          <span>Lat: {mouseCoords.lat.toFixed(6)}°</span>
          <span className="mx-1.5 text-[#333]">|</span>
          <span>Lng: {mouseCoords.lng.toFixed(6)}°</span>
        </div>
      )}
    </div>
  );
};
