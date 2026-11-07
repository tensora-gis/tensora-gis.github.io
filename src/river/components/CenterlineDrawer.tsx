/**
 * Centerline Drawer & Thalweg Snapping Component
 */

import React, { useState } from 'react';
import { RiverCoordinate, RiverReachDefinition } from '../types/riverReach';
import { buildReachFromPolyline, snapCenterlinePointsToValley } from '../geometry/geometryBuilder';

interface CenterlineDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  drawnPoints: RiverCoordinate[];
  onClearPoints: () => void;
  onReachCreated: (reach: RiverReachDefinition) => void;
}

export const CenterlineDrawer: React.FC<CenterlineDrawerProps> = ({
  isOpen,
  onClose,
  drawnPoints,
  onClearPoints,
  onReachCreated,
}) => {
  const [reachName, setReachName] = useState('Custom River Reach');
  const [meanWidthM, setMeanWidthM] = useState(25);
  const [manningN, setManningN] = useState(0.035);
  const [slope, setSlope] = useState(0.001);
  const [invertElevM, setInvertElevM] = useState(100.0);
  const [dischargeM3s, setDischargeM3s] = useState(25.0);
  const [isSnapping, setIsSnapping] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreateReach = () => {
    if (drawnPoints.length < 2) {
      setStatusMsg('Please click at least 2 points on the map along the river.');
      return;
    }

    try {
      const reach = buildReachFromPolyline(
        `user-reach-${Date.now()}`,
        reachName,
        drawnPoints,
        {
          meanWidthM,
          defaultManningN: manningN,
          slope,
          initialInvertElevM: invertElevM,
          dischargeEstimateM3s: dischargeM3s,
        }
      );
      onReachCreated(reach);
      onClose();
    } catch (err: any) {
      setStatusMsg(err.message || 'Failed to generate reach');
    }
  };

  const handleSnapToValley = async () => {
    if (drawnPoints.length < 2) {
      setStatusMsg('Draw at least 2 points first.');
      return;
    }

    setIsSnapping(true);
    setStatusMsg('Sampling Copernicus DEM thalwegs along lateral transects...');

    try {
      const reachTemp = buildReachFromPolyline('temp', 'temp', drawnPoints, {
        meanWidthM,
        defaultManningN: manningN,
        slope,
        initialInvertElevM: invertElevM,
      });

      const snapped = await snapCenterlinePointsToValley(reachTemp.centerline, 80.0, 7);
      reachTemp.centerline = snapped;
      onReachCreated(reachTemp);
      setStatusMsg('Thalweg snap complete! Valley minima identified.');
      setTimeout(() => onClose(), 1000);
    } catch (err: any) {
      setStatusMsg(`Thalweg snap failed: ${err.message}`);
    } finally {
      setIsSnapping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 shadow-2xl text-slate-100 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </span>
            <h3 className="text-base font-semibold">Draw Custom River Centerline</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            ✕
          </button>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 text-xs text-slate-300 leading-relaxed">
          <strong className="text-cyan-400">Map Drawing Instructions:</strong> Click along the river thalweg on the map. Points will connect to delineate the channel. Then set your channel parameters below.
        </div>

        <div className="flex items-center justify-between text-xs bg-slate-800/50 rounded p-2.5">
          <span className="text-slate-300">Vertices Placed on Map:</span>
          <span className="font-semibold text-cyan-400 text-sm">{drawnPoints.length} points</span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Reach Name</label>
            <input
              type="text"
              value={reachName}
              onChange={(e) => setReachName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Mean Width (m)</label>
            <input
              type="number"
              value={meanWidthM}
              onChange={(e) => setMeanWidthM(parseFloat(e.target.value) || 20)}
              className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Manning Roughness n</label>
            <input
              type="number"
              step="0.001"
              value={manningN}
              onChange={(e) => setManningN(parseFloat(e.target.value) || 0.035)}
              className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Bed Slope (m/m)</label>
            <input
              type="number"
              step="0.0001"
              value={slope}
              onChange={(e) => setSlope(parseFloat(e.target.value) || 0.001)}
              className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Invert Elevation (m MSL)</label>
            <input
              type="number"
              value={invertElevM}
              onChange={(e) => setInvertElevM(parseFloat(e.target.value) || 100)}
              className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Discharge Estimate (m³/s)</label>
            <input
              type="number"
              value={dischargeM3s}
              onChange={(e) => setDischargeM3s(parseFloat(e.target.value) || 25)}
              className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {statusMsg && (
          <div className="text-xs p-2 rounded bg-cyan-950/60 border border-cyan-800/60 text-cyan-200">
            {statusMsg}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <button
            onClick={onClearPoints}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
          >
            Clear Points
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSnapToValley}
              disabled={isSnapping || drawnPoints.length < 2}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-xs font-medium transition"
              title="Snap drawn points to Copernicus DEM valley thalweg"
            >
              {isSnapping ? 'Snapping...' : 'Snap to DEM Valley'}
            </button>

            <button
              onClick={handleCreateReach}
              disabled={drawnPoints.length < 2}
              className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded text-xs font-semibold transition shadow-md"
            >
              Generate 2D Mesh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
