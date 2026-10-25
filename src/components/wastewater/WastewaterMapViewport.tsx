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
import { Crosshair } from 'lucide-react';

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
  onAddPumpOnGround?: (lat: number, lng: number) => void;
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
  onAddPumpOnGround,
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

  // Connection state for two-click tools (Conduit, Pump, Force Main, Profile)
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

    conduitsLayerRef.current = L.layerGroup().addTo(map);
    forceMainsLayerRef.current = L.layerGroup().addTo(map);
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

      if (activeTool === 'add-manhole') {
        onAddManhole(lat, lng);
      } else if (activeTool === 'add-wetwell') {
        onAddWetWell(lat, lng);
      } else if (activeTool === 'add-outfall') {
        onAddOutfall(lat, lng);
      } else if (activeTool === 'add-pump' && onAddPumpOnGround && !pendingStartNode) {
        onAddPumpOnGround(lat, lng);
      } else if (activeTool === 'select') {
        onSelectElement(null);
      }
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [activeTool, onAddManhole, onAddWetWell, onAddOutfall, onAddPumpOnGround, onSelectElement, pendingStartNode]);

  // Handle Node Clicks (connecting conduits, selecting, deleting)
  const handleNodeClick = useCallback(
    (nodeId: string, nodeType: WastewaterNetworkElement['type']) => {
      if (activeTool === 'delete') {
        onDeleteElement(nodeId, nodeType);
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
        if (!pendingStartNode) {
          setPendingStartNode(nodeId);
        } else if (pendingStartNode !== nodeId) {
          onProfileRouteSelected([pendingStartNode, nodeId]);
          setPendingStartNode(null);
        }
        return;
      }

      // Default: Select Element
      const m = network.manholes.find((item) => item.id === nodeId);
      if (m) {
        onSelectElement(m);
        return;
      }
      const w = network.wetWells.find((item) => item.id === nodeId);
      if (w) {
        onSelectElement(w);
        return;
      }
      const o = network.outfalls.find((item) => item.id === nodeId);
      if (o) {
        onSelectElement(o);
        return;
      }
    },
    [
      activeTool,
      pendingStartNode,
      network,
      onAddConduit,
      onAddPump,
      onAddForceMain,
      onDeleteElement,
      onProfileRouteSelected,
      onSelectElement,
    ]
  );

  // Render Network on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const conduitsLayer = conduitsLayerRef.current;
    const forceMainsLayer = forceMainsLayerRef.current;
    const nodesLayer = nodesLayerRef.current;
    const arrowsLayer = arrowsLayerRef.current;

    if (!map || !conduitsLayer || !forceMainsLayer || !nodesLayer || !arrowsLayer) return;

    conduitsLayer.clearLayers();
    forceMainsLayer.clearLayers();
    arrowsLayer.clearLayers();
    nodesLayer.clearLayers();

    // Map of all node coordinates
    const nodeCoords = new Map<string, [number, number]>();
    network.manholes.forEach((m) => nodeCoords.set(m.id, [m.lat, m.lng]));
    network.wetWells.forEach((w) => nodeCoords.set(w.id, [w.lat, w.lng]));
    network.outfalls.forEach((o) => nodeCoords.set(o.id, [o.lat, o.lng]));

    // 1. Draw Gravity Conduits
    network.conduits.forEach((c) => {
      const c1 = nodeCoords.get(c.startNodeId);
      const c2 = nodeCoords.get(c.endNodeId);
      if (!c1 || !c2) return;

      const isSelected = selectedElement?.id === c.id;

      let color = '#38bdf8';
      let weight = Math.max(3, Math.min(8, (c.diameterMm || 250) / 70));

      if (thematicDisplay === 'capacity') {
        const ratio = c.flowDepthRatio ?? 0;
        if (ratio > 1.0) color = '#ef4444';
        else if (ratio > 0.75) color = '#f59e0b';
        else if (ratio > 0.5) color = '#84cc16';
        else color = '#10b981';
      } else if (thematicDisplay === 'velocity') {
        const v = c.actualVelocityMs ?? 0;
        if (v < 0.6 && (c.designFlowLs || 0) > 0.5) color = '#f59e0b';
        else if (v > 3.0) color = '#ef4444';
        else color = '#10b981';
      } else if (thematicDisplay === 'slope') {
        if (c.isReverseSlope) color = '#ef4444';
        else if (c.slopeMPerM < 0.002) color = '#f59e0b';
        else color = '#10b981';
      } else if (thematicDisplay === 'surcharge') {
        color = c.isSurcharged ? '#ef4444' : '#10b981';
      }

      if (isSelected) {
        color = '#fbbf24';
        weight = Math.max(weight + 2, 5);
      }

      const polyline = L.polyline([c1, c2], {
        color,
        weight,
        opacity: 0.95,
        lineCap: 'round',
      }).addTo(conduitsLayer);

      polyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeTool === 'delete') {
          onDeleteElement(c.id, 'conduit');
        } else {
          onSelectElement(c);
        }
      });

      polyline.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <strong>${c.label || c.id}</strong><br/>
          Diameter: <strong>${c.diameterMm} mm</strong> (${c.material})<br/>
          Length: ${c.lengthM.toFixed(1)} m | Slope: ${(c.slopeMPerM * 100).toFixed(3)}%<br/>
          ${c.designFlowLs !== undefined ? `Flow Q: <strong>${c.designFlowLs.toFixed(2)} L/s</strong><br/>` : ''}
          ${c.actualVelocityMs !== undefined ? `Velocity: <strong>${c.actualVelocityMs.toFixed(2)} m/s</strong><br/>` : ''}
          ${c.flowDepthRatio !== undefined ? `Fullness d/D: <strong>${c.flowDepthRatio.toFixed(2)}</strong>` : ''}
        </div>`,
        { sticky: true }
      );

      // Flow direction arrow in middle of conduit
      const midLat = (c1[0] + c2[0]) / 2;
      const midLng = (c1[1] + c2[1]) / 2;
      const angle = (Math.atan2(c2[0] - c1[0], c2[1] - c1[1]) * 180) / Math.PI;

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

    // 2. Draw Force Mains
    network.forceMains.forEach((fm) => {
      const c1 = nodeCoords.get(fm.startNodeId);
      const c2 = nodeCoords.get(fm.endNodeId);
      if (!c1 || !c2) return;

      const isSelected = selectedElement?.id === fm.id;
      const polyline = L.polyline([c1, c2], {
        color: isSelected ? '#fbbf24' : '#a855f7',
        weight: isSelected ? 6 : 4,
        dashArray: '6, 6',
        opacity: 0.95,
      }).addTo(forceMainsLayer);

      polyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeTool === 'delete') {
          onDeleteElement(fm.id, 'force-main');
        } else {
          onSelectElement(fm);
        }
      });

      polyline.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <strong>Force Main: ${fm.label || fm.id}</strong><br/>
          Diameter: ${fm.diameterMm} mm (${fm.material})<br/>
          Length: ${fm.lengthM.toFixed(1)} m<br/>
          ${fm.velocityMs !== undefined ? `Velocity: <strong>${fm.velocityMs.toFixed(2)} m/s</strong>` : ''}
        </div>`,
        { sticky: true }
      );
    });

    // 3. Draw Pumps
    network.pumps.forEach((pmp) => {
      const c1 = nodeCoords.get(pmp.startNodeId);
      const c2 = nodeCoords.get(pmp.endNodeId);
      if (!c1 || !c2) return;

      const midLat = (c1[0] + c2[0]) / 2;
      const midLng = (c1[1] + c2[1]) / 2;
      const isSelected = selectedElement?.id === pmp.id;
      const isRunning = pmp.status === 'ON';

      const pumpLine = L.polyline([c1, c2], {
        color: isRunning ? '#f59e0b' : '#525252',
        weight: 4,
        dashArray: isRunning ? '3, 4' : '2, 6',
      }).addTo(conduitsLayer);

      pumpLine.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeTool === 'delete') onDeleteElement(pmp.id, 'pump');
        else onSelectElement(pmp);
      });

      const pumpIcon = L.divIcon({
        className: 'pump-marker-icon',
        html: `
          <div style="
            width: 28px; height: 28px; border-radius: 50%;
            background: #171717; border: 2px solid ${isSelected ? '#fbbf24' : isRunning ? '#10b981' : '#ef4444'};
            display: flex; align-items: center; justify-content: center;
            box-shadow: ${isRunning ? '0 0 10px rgba(16,185,129,0.35)' : '0 2px 6px rgba(0,0,0,0.7)'};
            cursor: pointer; color: ${isRunning ? '#10b981' : '#737373'};
            position: relative;
          ">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            <div style="
              position: absolute; top: -2px; right: -2px; width: 8px; height: 8px; border-radius: 50%;
              background: ${isRunning ? '#10b981' : '#ef4444'}; border: 1px solid #171717;
              box-shadow: 0 0 4px ${isRunning ? '#34d399' : '#f87171'};
            "></div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
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
          Status: <strong style="color: ${isRunning ? '#10b981' : '#ef4444'};">${isRunning ? 'RUNNING (ONLINE)' : 'STOPPED (OFFLINE)'}</strong><br/>
          Rated Flow: <strong>${pmp.ratedDischargeLs} L/s</strong><br/>
          Dynamic Head: <strong>${pmp.dynamicHeadM} m</strong><br/>
          Power: ${pmp.powerKw ?? 0} kW
        </div>`,
        { sticky: true }
      );
    });

    // 4. Draw Wet Wells
    network.wetWells.forEach((w) => {
      const isSelected = selectedElement?.id === w.id;
      const isPending = pendingStartNode === w.id;

      const wetWellIcon = L.divIcon({
        className: 'wetwell-marker',
        html: `
          <div style="
            width: 28px; height: 28px; border-radius: 4px;
            background: #0ea5e9; border: 2px solid ${isSelected || isPending ? '#fbbf24' : '#ffffff'};
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.6); cursor: pointer; color: white;
            font-size: 10px; font-weight: bold;
          ">
            W
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([w.lat, w.lng], { icon: wetWellIcon }).addTo(nodesLayer);
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        handleNodeClick(w.id, 'wet-well');
      });

      marker.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <strong>Wet Well: ${w.label || w.id}</strong><br/>
          Rim Elev: <strong>${w.rimElevation.toFixed(2)} m MSL</strong><br/>
          Floor Elev: <strong>${w.floorElevation.toFixed(2)} m MSL</strong><br/>
          Active Storage: ${w.storageVolumeM3} m³ (${w.diameterM}m Dia)
        </div>`,
        { sticky: true }
      );
    });

    // 5. Draw Outfalls
    network.outfalls.forEach((o) => {
      const isSelected = selectedElement?.id === o.id;
      const isPending = pendingStartNode === o.id;

      const outfallIcon = L.divIcon({
        className: 'outfall-marker',
        html: `
          <div style="
            width: 28px; height: 28px; border-radius: 6px;
            background: #10b981; border: 2px solid ${isSelected || isPending ? '#fbbf24' : '#ffffff'};
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.6); cursor: pointer; color: #0a0a0a;
            font-size: 9px; font-weight: bold;
          ">
            OUT
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([o.lat, o.lng], { icon: outfallIcon }).addTo(nodesLayer);
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        handleNodeClick(o.id, 'outfall');
      });

      marker.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <strong>Outfall: ${o.label || o.id}</strong><br/>
          Invert Elev: <strong>${o.invertElevation.toFixed(2)} m MSL</strong><br/>
          Receiving Water: ${o.receivingWaterElevation.toFixed(2)} m MSL<br/>
          ${o.totalDischargeLs !== undefined ? `Total Flow: <strong>${o.totalDischargeLs.toFixed(2)} L/s</strong>` : ''}
        </div>`,
        { sticky: true }
      );
    });

    // 6. Draw Manholes
    network.manholes.forEach((m) => {
      const isSelected = selectedElement?.id === m.id;
      const isPending = pendingStartNode === m.id;

      let nodeColor = '#3b82f6';
      if (thematicDisplay === 'depth') {
        nodeColor = m.depth > 5.0 ? '#8b5cf6' : m.depth > 3.0 ? '#3b82f6' : '#10b981';
      } else if (m.isFlooding) {
        nodeColor = '#ef4444';
      } else if (m.isSurcharged) {
        nodeColor = '#f97316';
      } else {
        nodeColor = '#f59e0b';
      }

      const size = isSelected || isPending ? 18 : 14;

      const manholeIcon = L.divIcon({
        className: 'manhole-marker',
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

      const marker = L.marker([m.lat, m.lng], { icon: manholeIcon }).addTo(nodesLayer);
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        handleNodeClick(m.id, 'manhole');
      });

      marker.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <strong>Manhole: ${m.label || m.id}</strong><br/>
          Rim Elev: <strong>${m.rimElevation.toFixed(2)} m MSL</strong><br/>
          Invert Elev: <strong>${m.invertElevation.toFixed(2)} m MSL</strong><br/>
          Depth: ${m.depth.toFixed(2)} m<br/>
          Contributing Pop: ${m.population.toLocaleString()} Capita<br/>
          ${m.peakSanitaryFlowLs !== undefined ? `Peak Flow: <strong>${m.peakSanitaryFlowLs.toFixed(2)} L/s</strong><br/>` : ''}
          ${m.waterElevationM !== undefined ? `HGL: <strong>${m.waterElevationM.toFixed(2)} m</strong>` : ''}
          ${m.isFlooding ? '<br/><strong style="color: #ef4444;">SURFACE FLOODING</strong>' : ''}
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
      ...network.manholes.map((m): [number, number] => [m.lat, m.lng]),
      ...network.wetWells.map((w): [number, number] => [w.lat, w.lng]),
      ...network.outfalls.map((o): [number, number] => [o.lat, o.lng]),
    ];

    if (allPts.length > 0) {
      const bounds = L.latLngBounds(allPts);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  };

  return (
    <div className="flex-1 h-full relative overflow-hidden bg-[#0a0a0a]">
      {/* Leaflet container - strictly static className so Leaflet classes are never stripped */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Mode / Pending Action Overlay Banner - identical to Water Distribution */}
      {activeTool === 'add-pump' && !pendingStartNode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#171717] border border-amber-500/60 px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-2 text-xs font-mono text-white backdrop-blur">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>Pump Tool Active: Click wet well then outfall, or click ground to place pump station.</span>
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

      {/* Map Controls Float: Zoom to Extents & Coords - identical to Water Distribution */}
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

      {/* Legend for Thematic Visualization - identical to Water Distribution */}
      {thematicDisplay === 'capacity' && (
        <div className="absolute bottom-4 left-4 z-20 bg-[#111]/95 border border-[#222] rounded-lg p-2.5 text-[11px] font-mono shadow-xl backdrop-blur flex flex-col gap-1">
          <span className="text-[10px] uppercase font-tech text-[#737373] font-bold">
            Fullness Legend (d/D)
          </span>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-4 h-1 bg-[#10b981]" />
            <span>&lt; 0.50 (Low)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-4 h-1 bg-[#84cc16]" />
            <span>0.50 – 0.75 (Optimal)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-4 h-1 bg-[#f59e0b]" />
            <span>0.75 – 1.00 (High)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-4 h-1 bg-[#ef4444]" />
            <span>&gt; 1.00 (Surcharged)</span>
          </div>
        </div>
      )}

      {thematicDisplay === 'velocity' && (
        <div className="absolute bottom-4 left-4 z-20 bg-[#111]/95 border border-[#222] rounded-lg p-2.5 text-[11px] font-mono shadow-xl backdrop-blur flex flex-col gap-1">
          <span className="text-[10px] uppercase font-tech text-[#737373] font-bold">
            Velocity Legend (m/s)
          </span>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-4 h-1 bg-[#f59e0b]" />
            <span>&lt; 0.6 m/s (Sub-cleansing)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-4 h-1 bg-[#10b981]" />
            <span>0.6 – 3.0 m/s (Optimal)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-4 h-1 bg-[#ef4444]" />
            <span>&gt; 3.0 m/s (High Scour)</span>
          </div>
        </div>
      )}
    </div>
  );
};