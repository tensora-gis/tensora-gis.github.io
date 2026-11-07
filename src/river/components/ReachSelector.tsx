/**
 * Reach Selector Component
 * Allows selecting bundled canonical reaches or opening Global River Finder
 */

import React from 'react';
import { RiverReachDefinition } from '../types/riverReach';
import { GLOBAL_BUNDLED_REACHES } from '../data/hydroRiversLoader';

interface ReachSelectorProps {
  currentReach: RiverReachDefinition;
  onSelectReach: (reach: RiverReachDefinition) => void;
  onOpenGlobalSearch: () => void;
  onOpenCenterlineDrawer: () => void;
  onOpenImportModal: () => void;
}

export const ReachSelector: React.FC<ReachSelectorProps> = ({
  currentReach,
  onSelectReach,
  onOpenGlobalSearch,
  onOpenCenterlineDrawer,
  onOpenImportModal,
}) => {
  return (
    <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-lg p-2.5 text-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-lg">
      <div className="flex items-center gap-2.5">
        <button
          onClick={onOpenGlobalSearch}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg text-xs font-bold transition shadow-md"
          title="Search or Probe any river in the world"
        >
          <span>🌍</span>
          <span>Find Any River</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider hidden sm:inline">Active Reach:</span>
          <select
            value={currentReach.id}
            onChange={(e) => {
              const selected = GLOBAL_BUNDLED_REACHES.find((r) => r.id === e.target.value);
              if (selected) onSelectReach(selected);
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-cyan-500 max-w-xs"
          >
            <optgroup label="Real World Rivers">
              {GLOBAL_BUNDLED_REACHES.filter((r) => r.id !== 'reach-benchmark-500m').map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Validation Benchmarks">
              {GLOBAL_BUNDLED_REACHES.filter((r) => r.id === 'reach-benchmark-500m').map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="hidden lg:flex items-center gap-3 text-xs text-slate-400 pl-2 border-l border-slate-800">
          <span>Length: <strong className="text-slate-200">{currentReach.reachLengthM.toFixed(0)} m</strong></span>
          <span>Width: <strong className="text-slate-200">{currentReach.meanWidthM.toFixed(0)} m</strong></span>
          <span>Q: <strong className="text-cyan-400">≈{currentReach.upstreamDischargeEstimateM3s} m³/s</strong></span>
          <span>Manning n: <strong className="text-slate-200">{currentReach.defaultManningN.toFixed(3)}</strong></span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenCenterlineDrawer}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
          title="Draw custom river reach centerline on map"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          Draw Centerline
        </button>

        <button
          onClick={onOpenImportModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
          title="Import or Export River Project Archive"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Project
        </button>
      </div>
    </div>
  );
};
