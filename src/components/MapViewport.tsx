import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { CorridorAlignment, HydrologyReport } from '../types/hydrology';
import { decimalToDMS, formatChainageNumber, haversineDistanceM } from '../utils/geoUtils';
import { Layers, Map as MapIcon, Crosshair, Focus, Maximize2 } from 'lucide-react';

interface MapViewportProps {
  report: HydrologyReport | null;
  alignment: CorridorAlignment | null;
  onMapClickCoordinate?: (lat: number, lng: number) => void;
}

const CORRIDOR_CONTEXT_M = 600;
const MAX_VISIBLE_LABELS = 1500;

const TOOLTIP_CLASS =
  'bg-[#111] text-white border border-[#222] rounded px-2.5 py-1.5 shadow-xl font-mono text-xs';

export const MapViewport: React.FC<MapViewportProps> = ({
  report,
  alignment,
  onMapClickCoordinate,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const alignmentLayerRef = useRef<L.LayerGroup | null>(null);
  const chainagesLayerRef = useRef<L.LayerGroup | null>(null);
  const streamLayerRef = useRef<L.LayerGroup | null>(null);
  const catchmentLayerRef = useRef<L.LayerGroup | null>(null);
  const flowNetworkLayerRef = useRef<L.LayerGroup | null>(null);
  const targetPinLayerRef = useRef<L.LayerGroup | null>(null);

  const [showCatchment, setShowCatchment] = useState(true);
  const [showStream, setShowStream] = useState(true);
  const [showFlowNetwork, setShowFlowNetwork] = useState(true);
  const [showChainageLabels, setShowChainageLabels] = useState(true);
  const [showAlignment, setShowAlignment] = useState(true);
  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lng: number } | null>(null);

  const clickHandlerRef = useRef(onMapClickCoordinate);
  useEffect(() => {
    clickHandlerRef.current = onMapClickCoordinate;
  }, [onMapClickCoordinate]);

  const yellowPinIcon = useMemo(
    () =>
      L.divIcon({
        className: 'google-earth-pin',
        html: `
          <div style="position: relative; display: flex; align-items: center; cursor: pointer;">
            <div style="position: absolute; left: -2px; top: -2px; width: 36px; height: 36px; border: 2.5px solid #f59e0b; background: rgba(245, 158, 11, 0.15); border-radius: 2px;"></div>
            <svg viewBox="0 0 36 36" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg" style="position: relative; z-index: 2;">
              <circle cx="16" cy="12" r="9" fill="#f59e0b" stroke="#b45309" stroke-width="2"/>
              <circle cx="16" cy="12" r="5" fill="#fef3c7"/>
              <path d="M16 21 L16 32" stroke="#334155" stroke-width="3" stroke-linecap="round"/>
              <path d="M16 30 L16 33" stroke="#0a0a0a" stroke-width="2"/>
              <circle cx="16" cy="21" r="3.5" fill="#f59e0b" stroke="#a16207" stroke-width="1.5"/>
            </svg>
            <span style="
              margin-left: 8px;
              color: #FFFFFF;
              font-family: 'JetBrains Mono', ui-monospace, monospace;
              font-size: 11px;
              font-weight: 700;
              text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 5px #000;
              white-space: nowrap;
              pointer-events: none;
            ">Untitled Placemark</span>
          </div>
        `,
        iconSize: [160, 36],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      }),
    []
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 2,
      zoomControl: false,
      attributionControl: true,
    });

    const attribution = L.control.attribution({ position: 'bottomright' });
    attribution.addAttribution(
      'Imagery &copy; Esri, Maxar, Earthstar Geographics'
    );
    attribution.addTo(map);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, maxNativeZoom: 18, crossOrigin: 'anonymous' }
    ).addTo(map);

    L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, opacity: 0.85, crossOrigin: 'anonymous' }
    ).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    const catchmentPane = map.createPane('catchmentPane');
    catchmentPane.style.zIndex = '400';
    const flowPane = map.createPane('flowPane');
    flowPane.style.zIndex = '420';
    const streamPane = map.createPane('streamPane');
    streamPane.style.zIndex = '440';
    const alignmentPane = map.createPane('alignmentPane');
    alignmentPane.style.zIndex = '460';
    const chainagePane = map.createPane('chainagePane');
    chainagePane.style.zIndex = '480';
    const targetPinPane = map.createPane('targetPinPane');
    targetPinPane.style.zIndex = '600';

    alignmentLayerRef.current = L.layerGroup().addTo(map);
    chainagesLayerRef.current = L.layerGroup().addTo(map);
    catchmentLayerRef.current = L.layerGroup().addTo(map);
    flowNetworkLayerRef.current = L.layerGroup().addTo(map);
    streamLayerRef.current = L.layerGroup().addTo(map);
    targetPinLayerRef.current = L.layerGroup().addTo(map);

    map.on('mousemove', (e) => {
      setMouseCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    map.on('click', (e) => {
      clickHandlerRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      mapInstanceRef.current?.invalidateSize();
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const activeChainage = report?.targetChainage ?? null;

  useEffect(() => {
    const alignmentLayer = alignmentLayerRef.current;
    const chainagesLayer = chainagesLayerRef.current;
    if (!alignmentLayer || !chainagesLayer) return;

    alignmentLayer.clearLayers();
    chainagesLayer.clearLayers();

    if (!alignment || alignment.coordinates.length < 2) return;

    if (showAlignment) {
      const tracksToDraw =
        alignment.allTracks && alignment.allTracks.length > 0
          ? alignment.allTracks
          : [alignment.coordinates];

      tracksToDraw.forEach((trackCoords, idx) => {
        if (trackCoords.length < 2) return;

        const shared = { pane: 'alignmentPane', lineCap: 'round' as const, lineJoin: 'round' as const, bubblingMouseEvents: true };

        L.polyline(trackCoords, { ...shared, color: '#111827', weight: 6.5, opacity: 0.95 })
          .addTo(alignmentLayer);
        L.polyline(trackCoords, { ...shared, color: '#ffffff', weight: 4.5, opacity: 0.95, dashArray: '3, 6', lineCap: 'butt' })
          .addTo(alignmentLayer);

        const centreline = L.polyline(trackCoords, { ...shared, color: '#ef4444', weight: 2.5, opacity: 1 })
          .addTo(alignmentLayer);

        centreline.bindTooltip(
          `${alignment.name || 'Corridor alignment'}${tracksToDraw.length > 1 ? ` (track ${idx + 1})` : ''}`,
          { sticky: true, className: TOOLTIP_CLASS }
        );
      });
    }

    if (showChainageLabels && alignment.chainages.length > 0) {
      const stride = Math.max(1, Math.ceil(alignment.chainages.length / MAX_VISIBLE_LABELS));
      const chainagesToDraw = alignment.chainages.filter(
        (ch, index) =>
          index % stride === 0 ||
          ch.isMajorKm ||
          (activeChainage !== null && Math.abs(ch.chainage - activeChainage) < 0.1)
      );

      chainagesToDraw.forEach((ch) => {
        const isTarget =
          activeChainage !== null && Math.abs(ch.chainage - activeChainage) < 0.1;
        const isMajorKm =
          ch.isMajorKm || (stride === 1 && Math.round(ch.chainage) % 1000 === 0);
        const displayLabel = ch.formatted || formatChainageNumber(ch.chainage);

        const icon = L.divIcon({
          className: 'chainage-station-icon',
          html: `
            <div style="position: relative; white-space: nowrap; pointer-events: auto; cursor: pointer;">
              <div style="
                width: ${isTarget ? '8px' : '5px'};
                height: ${isTarget ? '8px' : '5px'};
                border-radius: 50%;
                background: ${isTarget ? '#ef4444' : '#000000'};
                border: ${isTarget ? '1.5px solid #FFFFFF' : '1px solid #FFFFFF'};
                box-shadow: ${isTarget ? '0 0 0 2px #ef4444' : '0 0 2px rgba(0,0,0,0.9)'};
                position: absolute; left: 0; top: 50%;
                transform: translate(-50%, -50%); z-index: 10;
              "></div>
              <div style="width: 6px; height: 1.5px; background: #000000; box-shadow: 0 0 1px #FFFFFF; margin-left: 2px;"></div>
              <span style="
                font-family: 'JetBrains Mono', ui-monospace, monospace;
                font-size: ${isMajorKm ? '12px' : '11px'};
                font-weight: ${isTarget ? '800' : isMajorKm ? '700' : '600'};
                color: #000000;
                text-shadow:
                  -1px -1px 0 #FFFFFF, 1px -1px 0 #FFFFFF,
                  -1px  1px 0 #FFFFFF,  1px  1px 0 #FFFFFF,
                   0px -1px 0 #FFFFFF,  0px  1px 0 #FFFFFF,
                  -1px  0px 0 #FFFFFF,  1px  0px 0 #FFFFFF, 0 0 2px #FFFFFF;
                letter-spacing: 0.2px; margin-left: 3px; line-height: 1;
              ">${displayLabel}</span>
            </div>
          `,
          iconSize: [0, 0],
          iconAnchor: [0, 8],
        });

        const marker = L.marker([ch.lat, ch.lng], {
          pane: 'chainagePane',
          icon,
          interactive: true,
        }).addTo(chainagesLayer);

        const elevationLine =
          ch.elevation !== undefined && ch.elevation !== null && isFinite(ch.elevation)
            ? `<div style="color:#CBD5E1;font-size:10px;margin-top:3px;">
                 Ground level: <span style="color:#34D399;">${ch.elevation.toFixed(1)} m MSL</span>
                 <span style="color:#6B7280;">(${ch.elevationSource === 'survey' ? 'survey sheet' : 'DEM 30 m'})</span>
               </div>`
            : `<div style="color:#6B7280;font-size:10px;margin-top:3px;">Ground level: not available</div>`;

        marker.bindTooltip(
          `<div style="font-family: ui-monospace, monospace; font-size: 11px;">
             <strong style="color: ${isTarget ? '#FACC15' : '#38BDF8'};">Station ${displayLabel}</strong>
             <div style="color:#CBD5E1;font-size:10px;margin-top:2px;line-height:1.5;">
               Latitude: ${ch.dmsLat}<br/>
               Longitude: ${ch.dmsLng}<br/>
               Decimal: ${(ch.decLat ?? ch.lat).toFixed(6)}, ${(ch.decLng ?? ch.lng).toFixed(6)}<br/>
               ${elevationLine}
               Distance from start: ${ch.distanceFromStartM.toFixed(0)} m
             </div>
             <div style="color:#94A3B8;font-size:9px;margin-top:4px;border-top:1px solid #334155;padding-top:3px;">
               Click to delineate this chainage
             </div>
           </div>`,
          { sticky: true, className: TOOLTIP_CLASS }
        );

        marker.on('click', () => {
          clickHandlerRef.current?.(ch.lat, ch.lng);
        });
      });
    }
  }, [alignment, activeChainage, showAlignment, showChainageLabels]);

  useEffect(() => {
    const catchmentLayer = catchmentLayerRef.current;
    const flowLayer = flowNetworkLayerRef.current;
    const streamLayer = streamLayerRef.current;
    const pinLayer = targetPinLayerRef.current;
    if (!catchmentLayer || !flowLayer || !streamLayer || !pinLayer) return;

    catchmentLayer.clearLayers();
    flowLayer.clearLayers();
    streamLayer.clearLayers();
    pinLayer.clearLayers();

    if (!report) return;

    if (showCatchment && report.catchmentPolygon.length > 2) {
      const polygon = L.polygon(report.catchmentPolygon, {
        pane: 'catchmentPane',
        color: '#06B6D4',
        weight: 2.5,
        fillColor: '#22D3EE',
        fillOpacity: 0.28,
        lineCap: 'round',
        lineJoin: 'round',
        bubblingMouseEvents: true,
      }).addTo(catchmentLayer);

      polygon.bindTooltip(
        `Catchment: ${report.catchmentAreaKm2} km² · ${report.contributingCells} cells at ${report.analysisCellSizeM} m · highest contour ${report.highestContourM} m MSL`,
        { sticky: true, className: TOOLTIP_CLASS }
      );
    }

    if (showFlowNetwork) {
      for (const cnt of report.contours ?? []) {
        if (cnt.coordinates.length < 2) continue;
        L.polyline(cnt.coordinates, {
          pane: 'flowPane',
          color: '#f59e0b',
          weight: 1.5,
          opacity: 0.75,
          dashArray: '3, 4',
          lineCap: 'round',
          lineJoin: 'round',
          bubblingMouseEvents: true,
        })
          .addTo(flowLayer)
          .bindTooltip(`Contour ${cnt.elevation} m MSL`, {
            sticky: true,
            className: TOOLTIP_CLASS,
          });
      }

      for (const path of report.tributaryPaths ?? []) {
        if (path.length < 2) continue;
        L.polyline(path, {
          pane: 'flowPane',
          color: '#38BDF8',
          weight: 1.8,
          opacity: 0.85,
          dashArray: '4, 4',
          lineCap: 'round',
          lineJoin: 'round',
          bubblingMouseEvents: true,
        })
          .addTo(flowLayer)
          .bindTooltip('Overland runoff tributary (DEM-derived)', {
            sticky: true,
            className: TOOLTIP_CLASS,
          });
      }
    }

    if (showStream && report.streamCoordinates.length > 1) {
      L.polyline(report.streamCoordinates, {
        pane: 'streamPane',
        color: '#ef4444',
        weight: 3.5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        bubblingMouseEvents: true,
      })
        .addTo(streamLayer)
        .bindTooltip(
          `Stream: ${report.lengthOfStreamKm} km · origin ${report.levelStreamOriginM} m MSL · highest contour ${report.highestContourM} m MSL · Δh ${report.elevationDropM} m`,
          { sticky: true, className: TOOLTIP_CLASS }
        );

      const headwaterPt = report.streamCoordinates[0];
      L.circleMarker(headwaterPt, {
        pane: 'streamPane',
        radius: 5,
        color: '#FFFFFF',
        fillColor: '#ef4444',
        fillOpacity: 1,
        weight: 2,
        bubblingMouseEvents: true,
      })
        .addTo(streamLayer)
        .bindTooltip(
          `Stream headwater (drainage divide) · highest contour ${report.highestContourM} m MSL · origin ${report.levelStreamOriginM} m MSL`,
          { sticky: true, className: TOOLTIP_CLASS }
        );
    }

    const marker = L.marker([report.latitudeDD, report.longitudeDD], {
      pane: 'targetPinPane',
      icon: yellowPinIcon,
      zIndexOffset: 1000,
    }).addTo(pinLayer);

    const row = (label: string, value: string, valueColor: string) => `
      <div style="display:flex;justify-content:space-between;gap:10px;padding:2px 0;">
        <span style="color:#737373;">${label}</span>
        <strong style="color:${valueColor};">${value}</strong>
      </div>`;

    marker.bindPopup(
      `<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #e5e7eb; width: 290px;">
         <div style="font-weight:600;font-size:13px;color:#f8fafc;border-bottom:1px solid #334155;padding-bottom:6px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
           <span>Untitled Placemark</span>
           <span style="font-size:10px;color:#737373;font-family:'JetBrains Mono',ui-monospace,monospace;">${report.targetChainageFormatted}</span>
         </div>
         <div style="margin-bottom:8px;">
           <div style="font-size:10px;color:#737373;">LATITUDE</div>
           <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#38BDF8;">${report.latitudeDMS}</div>
           <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;color:#6B7280;">${report.latitudeDD} (decimal)</div>
         </div>
         <div style="margin-bottom:8px;">
           <div style="font-size:10px;color:#737373;">LONGITUDE</div>
           <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#38BDF8;">${report.longitudeDMS}</div>
           <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;color:#6B7280;">${report.longitudeDD} (decimal)</div>
         </div>
         <div style="background:#0a0a0a;border:1px solid #1f2937;border-radius:4px;padding:8px;">
           ${row('Catchment area', `${report.catchmentAreaKm2} km²`, '#22D3EE')}
           ${row('Stream length', `${report.lengthOfStreamKm} km`, '#ef4444')}
           ${row('Level stream origin', `${report.levelStreamOriginM} m MSL`, '#e5e7eb')}
           ${row('Highest contour', `${report.highestContourM} m MSL`, '#34D399')}
           ${row('Elevation difference', `${report.elevationDropM} m`, '#60A5FA')}
           ${row('Analysis scope', `${report.scopeAppliedM} m`, '#f59e0b')}
           ${row('DEM coverage', `${(report.demCoverage * 100).toFixed(0)}%`, '#737373')}
         </div>
       </div>`,
      { maxWidth: 340 }
    );
  }, [report, showCatchment, showStream, showFlowNetwork, yellowPinIcon]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !report) return;

    const boundsPoints: L.LatLngExpression[] = [
      [report.latitudeDD, report.longitudeDD],
      ...report.streamCoordinates,
      ...report.catchmentPolygon,
    ];

    if (alignment) {
      for (const [lat, lng] of alignment.coordinates) {
        const d = haversineDistanceM(
          report.latitudeDD,
          report.longitudeDD,
          lat,
          lng
        );
        if (d <= CORRIDOR_CONTEXT_M) boundsPoints.push([lat, lng]);
      }
    }

    if (boundsPoints.length > 1) {
      map.fitBounds(L.latLngBounds(boundsPoints), { padding: [45, 45], maxZoom: 18 });
    } else {
      map.setView([report.latitudeDD, report.longitudeDD], 17);
    }
  }, [report]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || report || !alignment || alignment.coordinates.length < 2) return;
    map.fitBounds(L.polyline(alignment.coordinates).getBounds(), {
      padding: [50, 50],
      maxZoom: 18,
    });
  }, [alignment, report]);

  const handleFocusCatchment = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !report) return;
    const targetZoom = report.scopeAppliedM >= 1000 ? 15 : 16;
    map.flyTo([report.latitudeDD, report.longitudeDD], targetZoom, { duration: 1.0 });
  }, [report]);

  const handleFitCorridor = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !alignment || alignment.coordinates.length < 2) return;
    map.fitBounds(L.polyline(alignment.coordinates).getBounds(), {
      padding: [50, 50],
      maxZoom: 18,
    });
  }, [alignment]);

  const scopeSummary = report
    ? `Scope ${report.scopeAppliedM} m${report.scopeExpandedDueToFlatRelief ? ' (expanded)' : ''}`
    : null;

  return (
    <div className="relative w-full h-full bg-[#0a0a0a] flex flex-col overflow-hidden">
      <div
        id="catchment-map-viewport"
        ref={mapContainerRef}
        className="w-full h-full z-0 cursor-crosshair"
      />

      {!alignment && !report && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none p-4">
          <div className="bg-[#0a0a0a]/90 backdrop-blur-md border border-[#222]/80 rounded-lg p-6 text-center max-w-md shadow-2xl">
            <div className="w-12 h-12 rounded bg-[#171717] border border-[#222] flex items-center justify-center text-amber-400 mb-3">
              <MapIcon className="w-6 h-6 stroke-[1.8]" />
            </div>
            <h3 className="text-base font-bold text-white mb-1 font-tech">Satellite Viewport</h3>
            <p className="text-xs text-[#737373] leading-relaxed">
              Upload a corridor KML/KMZ or a chainage spreadsheet from the left panel, or
              click anywhere on the map to delineate at that point.
            </p>
          </div>
        </div>
      )}

      <div className="absolute top-4 left-4 z-20 flex flex-col gap-1.5 bg-[#111]/90 backdrop-blur border border-[#222]/80 rounded-lg p-2 shadow-2xl">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#737373] px-1.5 pb-1 border-b border-[#222] flex items-center justify-between font-tech">
          <span>Layers</span>
          <Layers className="w-3 h-3 text-amber-400" />
        </div>

        {(
          [
            ['Catchment', showCatchment, setShowCatchment, 'bg-amber-400'],
            ['Stream', showStream, setShowStream, 'bg-[#ef4444]'],
            ['Contours & tributaries', showFlowNetwork, setShowFlowNetwork, 'bg-amber-400'],
            ['Station labels', showChainageLabels, setShowChainageLabels, 'bg-[#737373]'],
            ['Corridor', showAlignment, setShowAlignment, 'bg-[#3B82F6]'],
          ] as const
        ).map(([label, active, setActive, swatch]) => (
          <button
            key={label}
            onClick={() => setActive(!active)}
            aria-pressed={active}
            className={`flex items-center justify-between gap-3 px-2 py-1 rounded text-xs transition-colors ${
              active
                ? 'bg-amber-950/30 text-amber-300 font-medium border border-amber-900/40'
                : 'text-[#737373] hover:text-[#e5e7eb]'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm inline-block ${swatch}`} />
              {label}
            </span>
            <span className="text-[10px] font-mono">{active ? 'ON' : 'OFF'}</span>
          </button>
        ))}

        <div className="pt-1.5 mt-1 border-t border-[#222] flex flex-col gap-1">
          {report && (
            <button
              onClick={handleFocusCatchment}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-amber-950/30 hover:bg-amber-900/30 text-amber-300 font-medium transition-colors border border-amber-900/40"
              title="Zoom to the active delineation"
            >
              <Focus className="w-3 h-3 text-amber-400 shrink-0" />
              <span>Focus Catchment</span>
            </button>
          )}

          {alignment && alignment.coordinates.length > 1 && (
            <button
              onClick={handleFitCorridor}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-[#171717]/80 hover:bg-[#171717] text-[#737373] transition-colors border border-[#222]"
              title="Fit the entire corridor on screen"
            >
              <Maximize2 className="w-3 h-3 text-[#737373] shrink-0" />
              <span>Fit Full Line</span>
            </button>
          )}
        </div>
      </div>

      <div className="absolute bottom-2 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 bg-[#0a0a0a]/90 backdrop-blur border border-[#222]/80 rounded-lg px-3 py-1.5 text-[11px] tabular-nums text-[#737373] shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[#737373]">CURSOR:</span>
            {mouseCoords ? (
              <span className="text-white font-tech">
                {decimalToDMS(mouseCoords.lat, true)}, {decimalToDMS(mouseCoords.lng, false)}
              </span>
            ) : (
              <span className="text-[#737373]">Hover over map</span>
            )}
          </div>

          {report && (
            <div className="hidden md:flex items-center gap-1.5 border-l border-[#222] pl-3">
              <span className="text-[#737373]">POINT:</span>
              <span className="text-[#38BDF8] font-semibold">
                {report.latitudeDMS}, {report.longitudeDMS}
              </span>
            </div>
          )}
        </div>

        {report && (
          <div className="flex flex-wrap items-center gap-3 text-[#737373]">
            <span>
              Level Stream Origin:{' '}
              <strong className="text-white">{report.levelStreamOriginM} m MSL</strong>
            </span>
            <span className="text-[#4B5563]">·</span>
            <span>
              Highest Contour:{' '}
              <strong className="text-[#34D399]">{report.highestContourM} m MSL</strong>
            </span>
            <span className="text-[#4B5563]">·</span>
            <span>
              Δh: <strong className="text-[#38BDF8]">{report.elevationDropM} m</strong>
              {!report.meetsReliefThreshold && (
                <span className="text-amber-400"> (below 5 m threshold)</span>
              )}
            </span>
            {scopeSummary && (
              <>
                <span className="text-[#4B5563]">·</span>
                <span>{scopeSummary}</span>
              </>
            )}
            <span className="text-[#4B5563]">·</span>
            <span className="text-[#737373]">{report.elevationSource}</span>
          </div>
        )}
      </div>
    </div>
  );
};
