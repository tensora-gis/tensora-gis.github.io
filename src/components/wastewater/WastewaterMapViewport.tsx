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
import { Crosshair, Info, X } from 'lucide-react';

interface WastewaterMapViewportProps {
  network: WastewaterNetwork;
  activeTool: ActiveWastewaterTool;
  thematicDisplay: WastewaterThematicDisplay;
  selectedElement: WastewaterNetworkElement | null;
  onSelectTool: (tool: ActiveWastewaterTool) => void;
  onSelectElement: (elem: WastewaterNetworkElement | null) => void;
  onAddManhole: (lat: number, lng: number) => Promise<string>;
  onAddConduit: (startNodeId: string, endNodeId: string) => string | null;
  onAddManholeAndConnect: (fromNodeId: string, lat: number, lng: number) => Promise<string>;
  onMoveNode: (id: string, lat: number, lng: number) => void;
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
  onSelectTool,
  onSelectElement,
  onAddManhole,
  onAddConduit,
  onAddManholeAndConnect,
  onMoveNode,
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
  const rubberbandLayerRef = useRef<L.LayerGroup | null>(null);

  const [pendingStartNode, setPendingStartNode] = useState<string | null>(null);
  const [rubberbandDistM, setRubberbandDistM] = useState<number | null>(null);
  const [routeNodes, setRouteNodes] = useState<string[]>([]);
  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Keep latest props in a mutable ref to eliminate any stale closures in Leaflet events
  const propsRef = useRef({
    network,
    activeTool,
    thematicDisplay,
    selectedElement,
    pendingStartNode,
    onSelectTool,
    onSelectElement,
    onAddManhole,
    onAddConduit,
    onAddManholeAndConnect,
    onMoveNode,
    onAddWetWell,
    onAddPump,
    onAddForceMain,
    onAddOutfall,
    onDeleteElement,
    onProfileRouteSelected,
  });

  useEffect(() => {
    propsRef.current = {
      network,
      activeTool,
      thematicDisplay,
      selectedElement,
      pendingStartNode,
      onSelectTool,
      onSelectElement,
      onAddManhole,
      onAddConduit,
      onAddManholeAndConnect,
      onMoveNode,
      onAddWetWell,
      onAddPump,
      onAddForceMain,
      onAddOutfall,
      onDeleteElement,
      onProfileRouteSelected,
    };
  });

  // Reset pending start node when active tool changes
  useEffect(() => {
    setPendingStartNode(null);
    setRubberbandDistM(null);
    if (rubberbandLayerRef.current) {
      rubberbandLayerRef.current.clearLayers();
    }
  }, [activeTool]);

  // Global ESC key to cancel active drafting or connection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPendingStartNode(null);
        setRubberbandDistM(null);
        if (rubberbandLayerRef.current) {
          rubberbandLayerRef.current.clearLayers();
        }
        if (activeTool !== 'select') {
          onSelectTool('select');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, onSelectTool]);

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

    // High-resolution satellite imagery
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
    rubberbandLayerRef.current = L.layerGroup().addTo(map);
    nodesLayerRef.current = L.layerGroup().addTo(map);

    // Live mouse move handler with rubberband preview
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setMouseCoords({ lat: e.latlng.lat, lng: e.latlng.lng });

      const { pendingStartNode: curPending, network: curNet } = propsRef.current;
      const rubberLayer = rubberbandLayerRef.current;

      if (curPending && rubberLayer) {
        rubberLayer.clearLayers();
        const allNodes = [...curNet.manholes, ...curNet.wetWells, ...curNet.outfalls];
        const startNode = allNodes.find((n) => n.id === curPending);
        if (startNode) {
          const dist = calculateWastewaterDistanceM(startNode.lat, startNode.lng, e.latlng.lat, e.latlng.lng);
          setRubberbandDistM(Math.round(dist * 10) / 10);

          L.polyline(
            [
              [startNode.lat, startNode.lng],
              [e.latlng.lat, e.latlng.lng],
            ],
            {
              color: '#f59e0b',
              weight: 2.5,
              dashArray: '6, 6',
              opacity: 0.85,
            }
          ).addTo(rubberLayer);
        }
      } else if (rubberLayer) {
        rubberLayer.clearLayers();
        setRubberbandDistM(null);
      }
    });

    map.on('mouseout', () => {
      if (rubberbandLayerRef.current) {
        rubberbandLayerRef.current.clearLayers();
      }
      setRubberbandDistM(null);
    });

    // Map click listener reading propsRef directly - guaranteed no stale closures
    map.on('click', async (e: L.LeafletMouseEvent) => {
      const {
        activeTool: currentTool,
        pendingStartNode: currentPending,
        onAddManhole: addMh,
        onAddWetWell: addWw,
        onAddOutfall: addOut,
        onAddManholeAndConnect: addMhAndConnect,
        onSelectElement: selectElem,
      } = propsRef.current;

      const { lat, lng } = e.latlng;

      if (currentTool === 'add-manhole') {
        await addMh(lat, lng);
      } else if (currentTool === 'add-wetwell') {
        addWw(lat, lng);
      } else if (currentTool === 'add-outfall') {
        addOut(lat, lng);
      } else if (currentTool === 'add-conduit') {
        if (!currentPending) {
          // If no start node yet, clicking on terrain creates the first manhole and sets it as start
          const newId = await addMh(lat, lng);
          setPendingStartNode(newId);
        } else {
          // Continuous drafting: creates next manhole and connects conduit from previous node
          const newId = await addMhAndConnect(currentPending, lat, lng);
          setPendingStartNode(newId);
        }
      } else if (currentTool === 'select') {
        selectElem(null);
      }
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Fit bounds to entire network
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
          color: isSelected ? '#fbbf24' : color,
          weight: isSelected ? weight + 3 : weight,
          opacity: 0.95,
          lineCap: 'round',
        }
      );

      polyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        const curTool = propsRef.current.activeTool;
        if (curTool === 'delete') {
          propsRef.current.onDeleteElement(c.id, 'conduit');
        } else {
          propsRef.current.onSelectElement(c);
        }
      });

      const tooltipContent = `
        <div style="font-family: monospace; font-size: 11px; padding: 2px;">
          <strong style="color: #f59e0b;">${c.id} (${c.label})</strong><br/>
          From: <strong>${c.startNodeId}</strong> → To: <strong>${c.endNodeId}</strong><br/>
          Diameter: <strong>${c.diameterMm} mm</strong> (${c.material})<br/>
          Length: ${c.lengthM.toFixed(1)} m | Slope: ${(c.slopeMPerM * 100).toFixed(3)}%<br/>
          Design Flow Q: <strong>${c.designFlowLs?.toFixed(2) ?? '0.00'} L/s</strong><br/>
          Velocity: <strong>${c.actualVelocityMs?.toFixed(2) ?? '0.00'} m/s</strong><br/>
          Fullness d/D: <strong>${c.flowDepthRatio?.toFixed(2) ?? '0.00'}</strong> ${
            (c.flowDepthRatio ?? 0) > 1.0 ? '<span style="color:#ef4444;font-weight:bold;">(SURCHARGED)</span>' : ''
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
          color: isSelected ? '#fbbf24' : '#a855f7', // Purple for force main
          weight: isSelected ? 6 : 4,
          dashArray: '6, 6',
          opacity: 0.95,
        }
      );

      polyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        const curTool = propsRef.current.activeTool;
        if (curTool === 'delete') {
          propsRef.current.onDeleteElement(fm.id, 'force-main');
        } else {
          propsRef.current.onSelectElement(fm);
        }
      });

      polyline.bindTooltip(
        `<div style="font-family:monospace;font-size:11px;">
          <strong style="color:#a855f7;">${fm.id} (${fm.label})</strong><br/>
          From: <strong>${fm.startNodeId}</strong> → To: <strong>${fm.endNodeId}</strong><br/>
          Diameter: ${fm.diameterMm} mm (${fm.material})<br/>
          Length: ${fm.lengthM.toFixed(1)} m<br/>
          Velocity: ${fm.velocityMs?.toFixed(2) ?? '0.00'} m/s<br/>
          Friction Loss: ${fm.frictionHeadlossM?.toFixed(2) ?? '0.00'} m
        </div>`,
        { sticky: true }
      );
      polyline.addTo(forceMainsLayer);
    });

    // 3. Common Node Click Handler
    const handleNodeClick = (nodeId: string, elem: WastewaterNetworkElement) => {
      const {
        activeTool: curTool,
        pendingStartNode: curPending,
        onDeleteElement: delElem,
        onAddConduit: addCon,
        onAddPump: addPmp,
        onAddForceMain: addFm,
        onProfileRouteSelected: profileSelected,
        onSelectElement: selectElem,
      } = propsRef.current;

      if (curTool === 'delete') {
        delElem(nodeId, elem.type);
        return;
      }

      if (curTool === 'add-conduit') {
        if (!curPending) {
          setPendingStartNode(nodeId);
        } else if (curPending !== nodeId) {
          addCon(curPending, nodeId);
          // Keep chaining for continuous sewer line drafting
          setPendingStartNode(nodeId);
        }
        return;
      }

      if (curTool === 'add-pump') {
        if (!curPending) {
          setPendingStartNode(nodeId);
        } else if (curPending !== nodeId) {
          addPmp(curPending, nodeId);
          setPendingStartNode(null);
        }
        return;
      }

      if (curTool === 'add-forcemain') {
        if (!curPending) {
          setPendingStartNode(nodeId);
        } else if (curPending !== nodeId) {
          addFm(curPending, nodeId);
          setPendingStartNode(null);
        }
        return;
      }

      if (curTool === 'profile-select') {
        setRouteNodes((prev) => {
          const next = prev.includes(nodeId) ? prev : [...prev, nodeId];
          if (next.length >= 2) {
            profileSelected(next);
          }
          return next;
        });
        return;
      }

      if (curTool === 'select') {
        selectElem(elem);
      }
    };

    // 4. Render Manholes
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
            box-shadow: 0 0 ${isSelected || isPending ? '12px #38bdf8' : '4px rgba(0,0,0,0.8)'};
            display: flex;
            align-items: center;
            justify-content: center;
            color: #0a0a0a;
            font-weight: bold;
            font-size: 9px;
            font-family: monospace;
            cursor: ${activeTool === 'select' ? 'grab' : 'pointer'};
            transition: transform 0.15s ease;
          ">
            ${isInRoute ? '★' : ''}
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([m.lat, m.lng], {
        icon,
        draggable: activeTool === 'select',
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        handleNodeClick(m.id, m);
      });

      // Drag to relocate manhole on terrain
      marker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        propsRef.current.onMoveNode(m.id, pos.lat, pos.lng);
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

    // 5. Render Wet Wells
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
            border: 2px solid ${isSelected ? '#ffffff' : isPending ? '#fbbf24' : '#111'};
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 8px rgba(14,165,233,0.8);
            color: #ffffff;
            font-size: 10px;
            font-weight: bold;
            cursor: ${activeTool === 'select' ? 'grab' : 'pointer'};
          ">
            W
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([w.lat, w.lng], {
        icon,
        draggable: activeTool === 'select',
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        handleNodeClick(w.id, w);
      });

      marker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        propsRef.current.onMoveNode(w.id, pos.lat, pos.lng);
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

    // 6. Render Outfalls
    network.outfalls.forEach((o) => {
      const isSelected = selectedElement?.id === o.id;
      const isPending = pendingStartNode === o.id;

      const icon = L.divIcon({
        className: 'custom-outfall-marker',
        html: `
          <div style="
            width: ${isSelected || isPending ? '26px' : '22px'};
            height: ${isSelected || isPending ? '26px' : '22px'};
            background: #10b981;
            border: 2px solid ${isSelected ? '#ffffff' : isPending ? '#fbbf24' : '#111'};
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 8px rgba(16,185,129,0.8);
            color: #0a0a0a;
            font-size: 10px;
            font-weight: bold;
            cursor: ${activeTool === 'select' ? 'grab' : 'pointer'};
          ">
            OUT
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([o.lat, o.lng], {
        icon,
        draggable: activeTool === 'select',
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        handleNodeClick(o.id, o);
      });

      marker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        propsRef.current.onMoveNode(o.id, pos.lat, pos.lng);
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

  // Contextual helper prompt for active tool
  const getToolHelperMessage = () => {
    switch (activeTool) {
      case 'add-manhole':
        return 'Click anywhere on terrain to place a new Manhole with real Earth DEM elevation';
      case 'add-conduit':
        if (!pendingStartNode) {
          return 'Drafting Gravity Pipe: Click a manhole to start, or click anywhere on terrain to place first manhole';
        }
        return `Drafting Pipe from ${pendingStartNode}: Click next node or click on terrain to place next manhole (${
          rubberbandDistM ? `${rubberbandDistM} m` : ''
        })`;
      case 'add-wetwell':
        return 'Click anywhere on terrain to place a Wet Well / Pump Station Sump';
      case 'add-pump':
        if (!pendingStartNode) return 'Click starting node (Wet Well) to connect pump';
        return `Click destination node to complete Sewage Pump from ${pendingStartNode}`;
      case 'add-forcemain':
        if (!pendingStartNode) return 'Click starting node for Force Main';
        return `Click destination node to complete Force Main from ${pendingStartNode}`;
      case 'add-outfall':
        return 'Click anywhere on terrain to place an Outfall discharge point';
      case 'delete':
        return 'Click any node or conduit to delete it from the network';
      case 'profile-select':
        return `Click nodes along sewer alignment to view Longitudinal Profile (${routeNodes.length} nodes selected)`;
      case 'select':
      default:
        return 'Click any node or conduit to inspect; drag manholes to relocate; click empty terrain to deselect';
    }
  };

  return (
    <div className="flex-1 h-full relative overflow-hidden bg-[#0a0a0a]">
      {/* Map Container */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full z-0 ${
          activeTool === 'select'
            ? 'cursor-default'
            : activeTool === 'delete'
            ? 'cursor-pointer'
            : 'cursor-crosshair'
        }`}
      />

      {/* Interactive Contextual Guidance Floating Banner */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
        <div className="bg-[#111111]/95 text-white border border-[#2a2a2a] px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-mono">
          <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-[#e5e7eb] font-medium">{getToolHelperMessage()}</span>

          {pendingStartNode && (
            <button
              onClick={() => {
                setPendingStartNode(null);
                setRubberbandDistM(null);
                if (rubberbandLayerRef.current) {
                  rubberbandLayerRef.current.clearLayers();
                }
              }}
              className="ml-2 px-2 py-0.5 rounded bg-[#262626] hover:bg-[#333] text-amber-400 hover:text-amber-300 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Cancel</span>
            </button>
          )}

          {activeTool !== 'select' && !pendingStartNode && (
            <button
              onClick={() => onSelectTool('select')}
              className="ml-1 text-[11px] text-[#888] hover:text-white underline cursor-pointer"
            >
              Done
            </button>
          )}
        </div>
      </div>

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
          {rubberbandDistM !== null && (
            <>
              <span className="mx-1.5 text-[#333]">|</span>
              <span className="text-amber-400 font-bold">Drafting: {rubberbandDistM} m</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};