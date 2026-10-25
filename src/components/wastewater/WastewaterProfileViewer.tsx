import React, { useMemo } from 'react';
import {
  WastewaterNetwork,
  WastewaterManhole,
  WastewaterConduit,
  WastewaterWetWell,
  WastewaterOutfall,
} from '../../types/wastewater';
import { X, TrendingUp, AlertTriangle } from 'lucide-react';

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
  waterElevation: number;
  conduitDiameterMm?: number;
  flowDepthRatio?: number;
}

export const WastewaterProfileViewer: React.FC<WastewaterProfileViewerProps> = ({
  network,
  selectedRouteNodeIds,
  onClose,
}) => {
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

      points.push({
        id: node.id,
        label: node.label,
        distanceM: Math.round(cumulativeDist * 10) / 10,
        rimElevation: rim,
        invertElevation: inv,
        waterElevation: Math.max(inv, hgl),
        conduitDiameterMm: conduit?.diameterMm,
        flowDepthRatio: conduit?.flowDepthRatio,
      });
    }

    return points.length >= 2 ? points : null;
  }, [network, selectedRouteNodeIds]);

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

  const hglPath = profileData.reduce(
    (acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${getX(p.distanceM)} ${getY(p.waterElevation)}`,
    ''
  );

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
              <span className="w-3 h-0.5 bg-[#38bdf8]" />
              <span className="text-[#a3a3a3] text-[11px]">Hydraulic Grade Line (HGL)</span>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[#222] text-[#737373] hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
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

          {/* Hydraulic Grade Line (HGL) */}
          <path
            d={hglPath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeDasharray="4,2"
            strokeLinejoin="round"
          />

          {/* Data Points */}
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
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};
