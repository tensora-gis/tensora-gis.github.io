import React, { useMemo, useState } from 'react';
import {
  WaterDistributionNetwork,
  WaterReservoir,
  WaterTank,
} from '../../types/waterDistribution';
import { X, TrendingUp, ShieldAlert } from 'lucide-react';

interface WaterProfileViewerProps {
  network: WaterDistributionNetwork;
  selectedRouteNodeIds: string[];
  onClose: () => void;
}

interface ProfileNodePoint {
  id: string;
  label: string;
  distanceM: number;
  groundElevation: number;
  hydraulicHead: number;
  maxTransientHead: number;
  minTransientHead: number;
  vaporLimitHead: number;
  pressure: number;
  velocity: number;
}

export const WaterProfileViewer: React.FC<WaterProfileViewerProps> = ({
  network,
  selectedRouteNodeIds,
  onClose,
}) => {
  const [showTransientEnvelopes, setShowTransientEnvelopes] = useState(true);

  // Compute profile stations along the selected route
  const profileData = useMemo(() => {
    if (selectedRouteNodeIds.length < 2) return null;

    const getNode = (id: string) => {
      return (
        network.junctions.find((j) => j.id === id) ||
        network.reservoirs.find((r) => r.id === id) ||
        network.tanks.find((t) => t.id === id)
      );
    };

    const validNodes = selectedRouteNodeIds
      .map((id) => getNode(id))
      .filter((n): n is NonNullable<typeof n> => Boolean(n));

    if (validNodes.length < 2) return null;

    const points: ProfileNodePoint[] = [];
    let cumulativeDist = 0;

    for (let i = 0; i < validNodes.length; i++) {
      const node = validNodes[i];

      if (i > 0) {
        const prevNode = validNodes[i - 1];
        const connectingPipe = network.pipes.find(
          (p) =>
            (p.startNodeId === prevNode.id && p.endNodeId === node.id) ||
            (p.startNodeId === node.id && p.endNodeId === prevNode.id)
        );
        cumulativeDist += connectingPipe ? connectingPipe.length : 150;
      }

      let groundElev = node.elevation;
      let head = 'head' in node && node.head !== undefined ? node.head : groundElev;
      if (node.type === 'reservoir') {
        head = (node as WaterReservoir).totalHead;
      } else if (node.type === 'tank') {
        head = node.elevation + (node as WaterTank).initialLevel;
      }

      const pressure = head - groundElev;

      // Find velocity and transient heads in connecting pipes
      let velocity = 0;
      const connectedPipes = network.pipes.filter(
        (p) => p.startNodeId === node.id || p.endNodeId === node.id
      );

      let maxSurge = head;
      let minSurge = head;

      if (connectedPipes.length > 0) {
        let maxDelta = 0;
        let hasEngineSurge = false;
        for (const cp of connectedPipes) {
          if (cp.velocity && Math.abs(cp.velocity) > velocity) {
            velocity = Math.abs(cp.velocity);
          }
          if (cp.maxTransientHeadM !== undefined) {
            maxSurge = Math.max(maxSurge, cp.maxTransientHeadM);
            minSurge = Math.min(minSurge, cp.minTransientHeadM ?? head);
            hasEngineSurge = true;
          } else {
            const a = cp.waveSpeedMs || 1050;
            const v = Math.abs(cp.velocity || 0.8);
            const deltaH = (a * v) / 9.80665;
            maxDelta = Math.max(maxDelta, deltaH);
          }
        }
        if (!hasEngineSurge && maxDelta > 0) {
          maxSurge = head + maxDelta;
          minSurge = head - maxDelta;
        }
      } else {
        maxSurge = head + 12;
        minSurge = head - 12;
      }

      const vaporLimitHead = groundElev - 10.0;

      points.push({
        id: node.id,
        label: node.label || node.id,
        distanceM: Math.round(cumulativeDist * 10) / 10,
        groundElevation: groundElev,
        hydraulicHead: Math.round(head * 100) / 100,
        maxTransientHead: Math.round(maxSurge * 100) / 100,
        minTransientHead: Math.round(minSurge * 100) / 100,
        vaporLimitHead: Math.round(vaporLimitHead * 100) / 100,
        pressure: Math.round(pressure * 100) / 100,
        velocity,
      });
    }

    return points;
  }, [network, selectedRouteNodeIds]);

  if (!profileData || profileData.length < 2) {
    return (
      <div className="h-64 bg-[#111] border-t border-[#222] p-4 flex flex-col justify-between select-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-tech text-xs uppercase font-bold">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <span>Longitudinal Hydraulic Grade Line Profile</span>
          </div>
          <button onClick={onClose} className="p-1 text-[#737373] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <p className="text-xs text-[#888] mb-1 font-mono">
            Select 2 or more connected nodes using the Profile Route tool on the toolbar to plot the terrain and hydraulic grade line profile.
          </p>
        </div>
      </div>
    );
  }

  // Calculate SVG bounds
  const padding = { left: 60, right: 40, top: 30, bottom: 45 };
  const width = 850;
  const height = 240;

  const totalDist = profileData[profileData.length - 1].distanceM;
  const allElevations = [
    ...profileData.map((p) => p.groundElevation),
    ...profileData.map((p) => p.hydraulicHead),
    ...(showTransientEnvelopes
      ? [
          ...profileData.map((p) => p.maxTransientHead),
          ...profileData.map((p) => p.minTransientHead),
          ...profileData.map((p) => p.vaporLimitHead),
        ]
      : []),
  ];
  const minElev = Math.floor(Math.min(...allElevations) - 5);
  const maxElev = Math.ceil(Math.max(...allElevations) + 8);

  const getX = (dist: number) =>
    padding.left + (dist / Math.max(1, totalDist)) * (width - padding.left - padding.right);

  const getY = (elev: number) =>
    height -
    padding.bottom -
    ((elev - minElev) / Math.max(1, maxElev - minElev)) * (height - padding.top - padding.bottom);

  // SVG Path Strings
  const groundPoints = profileData.map((p) => `${getX(p.distanceM)},${getY(p.groundElevation)}`);
  const groundPath = `M ${groundPoints.join(' L ')}`;

  const hglPoints = profileData.map((p) => `${getX(p.distanceM)},${getY(p.hydraulicHead)}`);
  const hglPath = `M ${hglPoints.join(' L ')}`;

  const maxSurgePoints = profileData.map((p) => `${getX(p.distanceM)},${getY(p.maxTransientHead)}`);
  const maxSurgePath = `M ${maxSurgePoints.join(' L ')}`;

  const minSurgePoints = profileData.map((p) => `${getX(p.distanceM)},${getY(p.minTransientHead)}`);
  const minSurgePath = `M ${minSurgePoints.join(' L ')}`;

  const vaporLimitPoints = profileData.map((p) => `${getX(p.distanceM)},${getY(p.vaporLimitHead)}`);
  const vaporLimitPath = `M ${vaporLimitPoints.join(' L ')}`;

  // Cavitation risk check along route
  const hasCavitationRisk = profileData.some((p) => p.minTransientHead <= p.vaporLimitHead);

  return (
    <div className="h-80 bg-[#0d0d0d] border-t border-[#222] flex flex-col z-30 select-none shadow-2xl shrink-0">
      {/* Profile Header */}
      <div className="px-4 py-2 border-b border-[#222] bg-[#141414] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-white font-tech text-xs uppercase font-bold">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <span>Longitudinal HGL & Surge Head Envelopes</span>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#10b981]" />
              <span className="text-[#a3a3a3] text-[11px]">Ground (Real DEM)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#38bdf8]" />
              <span className="text-[#a3a3a3] text-[11px]">Steady HGL</span>
            </div>
            {showTransientEnvelopes && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#f43f5e] border-b border-dashed border-[#f43f5e]" />
                  <span className="text-rose-400 text-[11px] font-bold">H_max Surge</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#c084fc] border-b border-dashed border-[#c084fc]" />
                  <span className="text-purple-300 text-[11px] font-bold">H_min Surge</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#dc2626] border-b border-dotted border-[#dc2626]" />
                  <span className="text-red-400 text-[11px]">Cavitation Limit (-10m)</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasCavitationRisk && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-tech font-bold animate-pulse">
              <ShieldAlert className="w-3 h-3" />
              <span>VAPOR CAVITATION RISK</span>
            </div>
          )}

          <button
            onClick={() => setShowTransientEnvelopes((prev) => !prev)}
            className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
              showTransientEnvelopes
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                : 'bg-[#1a1a1a] border-[#333] text-[#777] hover:text-white'
            }`}
            title="Toggle Water Hammer Transient Surge Envelopes"
          >
            {showTransientEnvelopes ? 'Surge: ON' : 'Surge: OFF'}
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#222] text-[#737373] hover:text-white"
            title="Close Profile Viewer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="flex-1 p-2 overflow-x-auto flex items-center justify-center">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full max-w-4xl h-full overflow-visible font-mono text-[10px]"
        >
          {/* Background Grid Lines */}
          {[0.2, 0.4, 0.6, 0.8, 1.0].map((t) => {
            const elev = minElev + (maxElev - minElev) * t;
            const y = getY(elev);
            return (
              <g key={t}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#222"
                  strokeDasharray="2, 4"
                />
                <text x={padding.left - 8} y={y + 3} textAnchor="end" fill="#666">
                  {elev.toFixed(0)}m
                </text>
              </g>
            );
          })}

          {/* Vapor Pressure Limit Line (-10m gauge = column separation risk) */}
          {showTransientEnvelopes && (
            <path
              d={vaporLimitPath}
              fill="none"
              stroke="#dc2626"
              strokeWidth="1.5"
              strokeDasharray="3, 3"
              opacity="0.6"
            />
          )}

          {/* Ground Terrain Surface Line (Real DEM) */}
          <path d={groundPath} fill="none" stroke="#10b981" strokeWidth="2.5" />

          {/* Steady Hydraulic Grade Line (HGL) */}
          <path
            d={hglPath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            strokeDasharray="4, 2"
          />

          {/* Maximum Transient Surge Head Envelope (H_max) */}
          {showTransientEnvelopes && (
            <path
              d={maxSurgePath}
              fill="none"
              stroke="#f43f5e"
              strokeWidth="2"
              strokeDasharray="5, 3"
            />
          )}

          {/* Minimum Transient Surge Head Envelope (H_min) */}
          {showTransientEnvelopes && (
            <path
              d={minSurgePath}
              fill="none"
              stroke="#c084fc"
              strokeWidth="2"
              strokeDasharray="5, 3"
            />
          )}

          {/* Node Markers & Annotations */}
          {profileData.map((p) => {
            const x = getX(p.distanceM);
            const yGround = getY(p.groundElevation);
            const yHgl = getY(p.hydraulicHead);
            const isNegative = p.pressure < 0;

            return (
              <g key={p.id}>
                {/* Vertical connecting line between ground & HGL (pressure column) */}
                <line
                  x1={x}
                  y1={yGround}
                  x2={x}
                  y2={yHgl}
                  stroke={isNegative ? '#ef4444' : '#38bdf8'}
                  strokeWidth="1.5"
                  strokeDasharray="1, 2"
                />

                {/* Ground Node Point */}
                <circle cx={x} cy={yGround} r="4" fill="#10b981" stroke="#000" strokeWidth="1" />

                {/* HGL Point */}
                <circle
                  cx={x}
                  cy={yHgl}
                  r="4"
                  fill={isNegative ? '#ef4444' : '#38bdf8'}
                  stroke="#fff"
                  strokeWidth="1"
                />

                {/* Transient Surge Points */}
                {showTransientEnvelopes && (
                  <>
                    <circle
                      cx={x}
                      cy={getY(p.maxTransientHead)}
                      r="3"
                      fill="#f43f5e"
                      stroke="#000"
                      strokeWidth="1"
                    />
                    <circle
                      cx={x}
                      cy={getY(p.minTransientHead)}
                      r="3"
                      fill="#c084fc"
                      stroke="#000"
                      strokeWidth="1"
                    />
                  </>
                )}

                {/* Steady Pressure Label */}
                <text
                  x={x}
                  y={yHgl - 8}
                  textAnchor="middle"
                  fill={isNegative ? '#ef4444' : '#ffffff'}
                  fontWeight="bold"
                  fontSize="9px"
                >
                  {p.pressure > 0 ? `+${p.pressure}m` : `${p.pressure}m`}
                </text>

                {/* Node ID / Station below */}
                <text x={x} y={height - padding.bottom + 14} textAnchor="middle" fill="#888">
                  {p.id}
                </text>
                <text
                  x={x}
                  y={height - padding.bottom + 25}
                  textAnchor="middle"
                  fill="#555"
                  fontSize="8px"
                >
                  {p.distanceM}m
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
