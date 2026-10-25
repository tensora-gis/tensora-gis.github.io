import React, { useMemo } from 'react';
import {
  WaterDistributionNetwork,
  WaterJunction,
  WaterPipe,
  WaterReservoir,
  WaterTank,
} from '../../types/waterDistribution';
import { X, TrendingUp, AlertTriangle, Layers } from 'lucide-react';

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
  pressure: number;
  velocity: number;
}

export const WaterProfileViewer: React.FC<WaterProfileViewerProps> = ({
  network,
  selectedRouteNodeIds,
  onClose,
}) => {
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

      // Find velocity in connecting pipe
      let velocity = 0;
      if (i < validNodes.length - 1) {
        const nextNode = validNodes[i + 1];
        const p = network.pipes.find(
          (item) =>
            (item.startNodeId === node.id && item.endNodeId === nextNode.id) ||
            (item.startNodeId === nextNode.id && item.endNodeId === node.id)
        );
        if (p && p.velocity) velocity = p.velocity;
      }

      points.push({
        id: node.id,
        label: node.label || node.id,
        distanceM: Math.round(cumulativeDist * 10) / 10,
        groundElevation: groundElev,
        hydraulicHead: Math.round(head * 100) / 100,
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
  const padding = { left: 60, right: 40, top: 25, bottom: 40 };
  const width = 850;
  const height = 220;

  const totalDist = profileData[profileData.length - 1].distanceM;
  const allElevations = [
    ...profileData.map((p) => p.groundElevation),
    ...profileData.map((p) => p.hydraulicHead),
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

  return (
    <div className="h-72 bg-[#0d0d0d] border-t border-[#222] flex flex-col z-30 select-none shadow-2xl shrink-0">
      {/* Profile Header */}
      <div className="px-4 py-2 border-b border-[#222] bg-[#141414] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-white font-tech text-xs uppercase font-bold">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <span>Longitudinal Hydraulic Grade Line Profile</span>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#10b981]" />
              <span className="text-[#a3a3a3] text-[11px]">Ground Surface (Real DEM)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#38bdf8]" />
              <span className="text-[#a3a3a3] text-[11px]">Hydraulic Grade Line (HGL)</span>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[#222] text-[#737373] hover:text-white"
          title="Close Profile Viewer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* SVG Canvas */}
      <div className="flex-1 p-2 overflow-x-auto flex items-center justify-center">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full max-w-4xl h-full overflow-visible font-mono text-[10px]"
        >
          {/* Background Grid Lines */}
          {[0.25, 0.5, 0.75, 1.0].map((t) => {
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

          {/* Ground Terrain Surface Line (Real DEM) */}
          <path d={groundPath} fill="none" stroke="#10b981" strokeWidth="2.5" />

          {/* Hydraulic Grade Line (HGL) */}
          <path
            d={hglPath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            strokeDasharray="4, 2"
          />

          {/* Node Markers & Annotations */}
          {profileData.map((p, idx) => {
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

                {/* Pressure Label */}
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
