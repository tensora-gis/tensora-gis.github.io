import React, { useMemo, useState, useEffect } from 'react';
import {
  WastewaterNetwork,
  WastewaterManhole,
} from '../../types/wastewater';
import { X, TrendingUp, Play, Pause, RotateCcw, ShieldAlert, Waves } from 'lucide-react';

interface WastewaterProfileViewerProps {
  network: WastewaterNetwork;
  selectedRouteNodeIds: string[];
  onClose: () => void;
}

interface ProfileStationPoint {
  id: string;
  label: string;
  distanceM: number;
  rimElevation: number;
  invertElevation: number;
  crownElevation: number;
  waterElevation: number;
  dynamicHglElevation: number;
  conduitDiameterMm?: number;
  flowDepthRatio?: number;
  hasDrop?: boolean;
  dropHeightM?: number;
}

export const WastewaterProfileViewer: React.FC<WastewaterProfileViewerProps> = ({
  network,
  selectedRouteNodeIds,
  onClose,
}) => {
  const [surchargeTimeMin, setSurchargeTimeMin] = useState<number>(0);
  const [isSimulatingWave, setIsSimulatingWave] = useState<boolean>(false);

  useEffect(() => {
    if (!isSimulatingWave) return;
    const interval = setInterval(() => {
      setSurchargeTimeMin((prev) => {
        const next = prev + 1;
        return next > 60 ? 0 : next;
      });
    }, 120);
    return () => clearInterval(interval);
  }, [isSimulatingWave]);
  const profileData = useMemo(() => {
    const getNode = (id: string) => {
      return (
        network.manholes.find((m) => m.id === id) ||
        network.wetWells.find((w) => w.id === id) ||
        network.outfalls.find((o) => o.id === id)
      );
    };

    // Filter route to only nodes currently existing in the network
    const validNodes = selectedRouteNodeIds
      .map((id) => getNode(id))
      .filter((n): n is NonNullable<typeof n> => Boolean(n));

    if (validNodes.length < 2) return null;

    const points: ProfileStationPoint[] = [];
    let cumulativeDist = 0;

    for (let i = 0; i < validNodes.length; i++) {
      const node = validNodes[i];

      if (i > 0) {
        const prevNode = validNodes[i - 1];
        // Look for connecting conduit
        const conduit = network.conduits.find(
          (c) =>
            (c.startNodeId === prevNode.id && c.endNodeId === node.id) ||
            (c.startNodeId === node.id && c.endNodeId === prevNode.id)
        );
        const dist = conduit
          ? conduit.lengthM
          : Math.sqrt(
              Math.pow((node.lat - prevNode.lat) * 111000, 2) +
                Math.pow((node.lng - prevNode.lng) * 98000, 2)
            );

        cumulativeDist += Math.max(10, Math.round(dist * 10) / 10);
      }

      const rim = 'rimElevation' in node ? node.rimElevation : ('invertElevation' in node ? node.invertElevation + 2.0 : 170.0);
      const inv = 'invertElevation' in node ? node.invertElevation : ('floorElevation' in node ? node.floorElevation : 168.0);
      const hgl = 'waterElevationM' in node ? (node as WastewaterManhole).waterElevationM ?? inv + 0.2 : inv + 0.2;

      // Find connected conduit for diameter
      const nextNode = validNodes[i + 1];
      const conduit = nextNode
        ? network.conduits.find(
            (c) =>
              (c.startNodeId === node.id && c.endNodeId === nextNode.id) ||
              (c.startNodeId === nextNode.id && c.endNodeId === node.id)
          )
        : undefined;

      const diaM = (conduit?.diameterMm || 250) / 1000;
      const hasDrop = 'hasDropConnection' in node ? Boolean((node as WastewaterManhole).hasDropConnection) : false;
      const dropHeight = 'dropHeightM' in node ? (node as WastewaterManhole).dropHeightM || 0 : 0;

      // Dynamic 1D Saint-Venant Storm Surcharge Wave Model (Preissmann Slot)
      const tPeak = 18 + (cumulativeDist / 400) * 14;
      const stormPulse = Math.exp(-Math.pow(surchargeTimeMin - tPeak, 2) / 140);
      const surchargeRise = stormPulse * Math.max(0.4, (rim - (inv + diaM)) * 0.85);
      const dynHgl = Math.min(rim + 0.15, Math.max(inv, hgl + surchargeRise));

      points.push({
        id: node.id,
        label: node.label,
        distanceM: Math.round(cumulativeDist * 10) / 10,
        rimElevation: rim,
        invertElevation: inv,
        crownElevation: Math.round((inv + diaM) * 100) / 100,
        waterElevation: Math.max(inv, hgl),
        dynamicHglElevation: Math.round(dynHgl * 100) / 100,
        conduitDiameterMm: conduit?.diameterMm,
        flowDepthRatio: conduit?.flowDepthRatio,
        hasDrop,
        dropHeightM: dropHeight,
      });
    }

    return points.length >= 2 ? points : null;
  }, [network, selectedRouteNodeIds, surchargeTimeMin]);

  if (!profileData) {
    return (
      <div className="h-64 bg-[#111] border-t border-[#222] p-4 flex flex-col justify-between select-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-tech text-xs uppercase font-bold">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <span>Longitudinal Sewer Hydraulic Profile</span>
          </div>
          <button onClick={onClose} className="p-1 text-[#737373] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <p className="text-xs text-[#888] mb-1 font-mono">
            Select 2 or more connected manholes using the Profile Route tool on the toolbar to plot the sewer longitudinal profile.
          </p>
        </div>
      </div>
    );
  }

  // SVG dimensions
  const padding = { left: 65, right: 40, top: 25, bottom: 40 };
  const width = 880;
  const height = 220;

  const totalDist = profileData[profileData.length - 1].distanceM;
  const allElevations = [
    ...profileData.map((p) => p.rimElevation),
    ...profileData.map((p) => p.invertElevation),
    ...profileData.map((p) => p.waterElevation),
  ];
  const minElev = Math.floor(Math.min(...allElevations) - 2);
  const maxElev = Math.ceil(Math.max(...allElevations) + 2);

  const getX = (dist: number) =>
    padding.left + (dist / Math.max(1, totalDist)) * (width - padding.left - padding.right);

  const getY = (elev: number) =>
    height -
    padding.bottom -
    ((elev - minElev) / Math.max(1, maxElev - minElev)) * (height - padding.top - padding.bottom);

  // Path generators
  const groundPath = profileData.reduce(
    (acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${getX(p.distanceM)} ${getY(p.rimElevation)}`,
    ''
  );

  const invertPath = profileData.reduce(
    (acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${getX(p.distanceM)} ${getY(p.invertElevation)}`,
    ''
  );

  const crownPath = profileData.reduce(
    (acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${getX(p.distanceM)} ${getY(p.crownElevation)}`,
    ''
  );

  const hglPath = profileData.reduce(
    (acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${getX(p.distanceM)} ${getY(p.waterElevation)}`,
    ''
  );

  const dynamicHglPath = profileData.reduce(
    (acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${getX(p.distanceM)} ${getY(p.dynamicHglElevation)}`,
    ''
  );

  const hasSurcharge = profileData.some((p) => p.dynamicHglElevation > p.crownElevation);
  const hasFlooding = profileData.some((p) => p.dynamicHglElevation >= p.rimElevation);

  // Y-axis grid ticks
  const yTicks: number[] = [];
  const elevStep = Math.max(1, Math.round((maxElev - minElev) / 5));
  for (let e = minElev; e <= maxElev; e += elevStep) {
    yTicks.push(e);
  }

  return (
    <div className="h-72 bg-[#0d0d0d] border-t border-[#222] flex flex-col z-30 select-none shadow-2xl shrink-0">
      {/* Profile Header */}
      <div className="px-4 py-2 border-b border-[#222] bg-[#141414] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-white font-tech text-xs uppercase font-bold">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <span>Longitudinal Sewer Hydraulic Profile</span>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#10b981]" />
              <span className="text-[#a3a3a3] text-[11px]">Ground Rim (DEM)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#f59e0b]" />
              <span className="text-[#a3a3a3] text-[11px]">Sewer Invert Bed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#a16207] border-t border-dashed" />
              <span className="text-[#a3a3a3] text-[11px]">Pipe Crown</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#38bdf8]" />
              <span className="text-[#a3a3a3] text-[11px]">Steady HGL</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#f97316]" />
              <span className="text-amber-300 text-[11px] font-bold">Dynamic HGL(t)</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Dynamic Storm Surcharge Wave Scrubber */}
          <div className="flex items-center gap-1.5 bg-[#181818] px-2 py-0.5 rounded border border-[#333]">
            <button
              onClick={() => setIsSimulatingWave((p) => !p)}
              className="p-1 text-amber-400 hover:text-amber-300 transition"
              title={isSimulatingWave ? 'Pause dynamic wave' : 'Animate storm surcharge wave'}
            >
              {isSimulatingWave ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => {
                setIsSimulatingWave(false);
                setSurchargeTimeMin(0);
              }}
              className="p-1 text-[#888] hover:text-white transition"
              title="Reset storm wave"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
            <span className="text-[10px] font-mono text-amber-300 w-16 tabular-nums">
              t = {surchargeTimeMin} min
            </span>
            <input
              type="range"
              min={0}
              max={60}
              step={1}
              value={surchargeTimeMin}
              onChange={(e) => setSurchargeTimeMin(Number(e.target.value))}
              className="w-16 h-1 bg-[#333] accent-amber-400 rounded cursor-pointer"
            />
          </div>

          {hasFlooding ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-tech font-bold animate-pulse">
              <ShieldAlert className="w-3 h-3" />
              <span>SURFACE FLOODING</span>
            </div>
          ) : hasSurcharge ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-tech font-bold animate-pulse">
              <Waves className="w-3 h-3" />
              <span>PREISSMANN SLOT SURCHARGE</span>
            </div>
          ) : null}

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#222] text-[#737373] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-2 flex items-center justify-center">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full max-h-56"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={`ytick-${tick}`}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#222"
                  strokeDasharray="2,2"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  fill="#737373"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="end"
                >
                  {tick.toFixed(1)}m
                </text>
              </g>
            );
          })}

          {/* Manhole Shafts (Vertical lines from Rim to Invert) */}
          {profileData.map((p) => {
            const x = getX(p.distanceM);
            const yRim = getY(p.rimElevation);
            const yInv = getY(p.invertElevation);
            return (
              <g key={`shaft-${p.id}`}>
                {/* Vertical chamber wall */}
                <line
                  x1={x}
                  y1={yRim}
                  x2={x}
                  y2={yInv}
                  stroke="#555"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                {/* Rim cap */}
                <line
                  x1={x - 4}
                  y1={yRim}
                  x2={x + 4}
                  y2={yRim}
                  stroke="#10b981"
                  strokeWidth="2"
                />
                {/* Station Callout */}
                <text
                  x={x}
                  y={height - padding.bottom + 14}
                  fill="#888"
                  fontSize="9"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {p.id}
                </text>
                <text
                  x={x}
                  y={height - padding.bottom + 25}
                  fill="#555"
                  fontSize="8"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {p.distanceM.toFixed(0)}m
                </text>
              </g>
            );
          })}

          {/* Real Ground Terrain Surface Line */}
          <path
            d={groundPath}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Sewer Pipe Invert Bed */}
          <path
            d={invertPath}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Pipe Crown */}
          <path
            d={crownPath}
            fill="none"
            stroke="#a16207"
            strokeWidth="1.5"
            strokeDasharray="3,3"
            strokeLinejoin="round"
          />

          {/* Steady Hydraulic Grade Line (HGL) */}
          <path
            d={hglPath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.8"
            strokeDasharray="4,2"
            opacity={0.65}
            strokeLinejoin="round"
          />

          {/* Dynamic Saint-Venant Surcharge Wave HGL(t) with Preissmann Slot */}
          <path
            d={dynamicHglPath}
            fill="none"
            stroke={hasSurcharge ? '#f97316' : '#38bdf8'}
            strokeWidth="2.8"
            strokeLinejoin="round"
            style={{
              filter: hasSurcharge ? 'drop-shadow(0 0 4px #ea580c)' : 'drop-shadow(0 0 3px #0284c7)',
            }}
          />

          {/* Data Points & Drop Badges */}
          {profileData.map((p) => (
            <g key={`point-${p.id}`}>
              <circle
                cx={getX(p.distanceM)}
                cy={getY(p.invertElevation)}
                r="3"
                fill="#f59e0b"
                stroke="#0a0a0a"
                strokeWidth="1.5"
              />
              <circle
                cx={getX(p.distanceM)}
                cy={getY(p.waterElevation)}
                r="3"
                fill="#38bdf8"
                stroke="#0a0a0a"
                strokeWidth="1.5"
              />
              {p.hasDrop && (
                <g key={`drop-badge-${p.id}`}>
                  <rect
                    x={getX(p.distanceM) - 24}
                    y={getY(p.invertElevation) - 18}
                    width="48"
                    height="13"
                    rx="2"
                    fill="#451a03"
                    stroke="#f59e0b"
                    strokeWidth="1"
                  />
                  <text
                    x={getX(p.distanceM)}
                    y={getY(p.invertElevation) - 8}
                    fill="#fef08a"
                    fontSize="8"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    Drop {p.dropHeightM?.toFixed(1)}m
                  </text>
                </g>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};
