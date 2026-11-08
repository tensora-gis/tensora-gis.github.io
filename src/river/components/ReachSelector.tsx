/**
 * Global River Reach Selector & CAD Engineering Toolbar
 *
 * Provides instant access to the Global River Database (all continents),
 * live Copernicus GloFAS discharge query, and direct CAD hydraulic structure drawing.
 */

import React, { useState } from 'react';
import { RiverReachDefinition } from '../types/riverReach';
import { GLOBAL_BUNDLED_REACHES } from '../data/hydroRiversLoader';
import {
  GLOBAL_RIVER_DATABASE,
  convertEntryToReachDefinition,
  fetchLiveCopernicusDischarge,
} from '../data/globalRiverDatabase';
import { ConfidenceBadge } from './ConfidenceBadge';

interface ReachSelectorProps {
  currentReach: RiverReachDefinition;
  onSelectReach: (reach: RiverReachDefinition) => void;
  onOpenGlobalSearch: () => void;
  onOpenStructurePlacer: () => void;
  onOpenImportModal: () => void;
  onUpdateDischarge?: (qM3s: number) => void;
}

export const ReachSelector: React.FC<ReachSelectorProps> = ({
  currentReach,
  onSelectReach,
  onOpenGlobalSearch,
  onOpenStructurePlacer,
  onOpenImportModal,
  onUpdateDischarge,
}) => {
  const [isFetchingLiveQ, setIsFetchingLiveQ] = useState(false);
  const [liveQNotice, setLiveQNotice] = useState<string | null>(null);

  // Group database entries by continent
  const continents = ['North America', 'South America', 'Europe', 'Asia', 'Africa', 'Oceania'] as const;

  const handleFetchLiveDischarge = async () => {
    const midLat = 0.5 * (currentReach.bounds[0] + currentReach.bounds[2]);
    const midLng = 0.5 * (currentReach.bounds[1] + currentReach.bounds[3]);

    setIsFetchingLiveQ(true);
    setLiveQNotice(null);

    try {
      const liveData = await fetchLiveCopernicusDischarge(midLat, midLng);
      if (liveData) {
        setLiveQNotice(`Live GloFAS (${liveData.timestamp}): ${liveData.dischargeM3s} m³/s`);
        if (onUpdateDischarge) {
          onUpdateDischarge(liveData.dischargeM3s);
        }
      } else {
        setLiveQNotice('Live flood API returned baseline modeled flow.');
      }
    } catch {
      setLiveQNotice('Could not reach Copernicus flood service.');
    } finally {
      setIsFetchingLiveQ(false);
      setTimeout(() => setLiveQNotice(null), 5000);
    }
  };

  return (
    <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl p-2.5 text-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-xl">
      {/* Left side: Global Database Explorer & River Dropdown */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <button
          onClick={onOpenGlobalSearch}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-cyan-900/30"
          title="Open Global River Database & Interactive Map Explorer"
        >
          <span>🌍</span>
          <span>World Rivers DB</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider hidden sm:inline">
            Active River:
          </span>
          <select
            value={currentReach.id}
            onChange={(e) => {
              const val = e.target.value;
              const dbEntry = GLOBAL_RIVER_DATABASE.find((r) => r.id === val);
              if (dbEntry) {
                onSelectReach(convertEntryToReachDefinition(dbEntry));
                return;
              }
              const bundled = GLOBAL_BUNDLED_REACHES.find((r) => r.id === val);
              if (bundled) {
                onSelectReach(bundled);
              }
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-semibold focus:outline-none focus:border-cyan-500 max-w-xs shadow-inner"
          >
            {continents.map((continent) => {
              const riversInContinent = GLOBAL_RIVER_DATABASE.filter((r) => r.continent === continent);
              if (riversInContinent.length === 0) return null;
              return (
                <optgroup key={continent} label={`📍 ${continent}`}>
                  {riversInContinent.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {r.reachName}
                    </option>
                  ))}
                </optgroup>
              );
            })}
            <optgroup label="🧪 Validation Benchmarks">
              <option value="conical-flume">Conical Flume Benchmark (CFD Flume)</option>
              <option value="reach-benchmark-500m">500m Canonical Flume Benchmark</option>
            </optgroup>
          </select>

          {/* Accuracy Tier & Confidence Badge */}
          <ConfidenceBadge
            tier={currentReach.accuracyTier}
            licenseMetadata={currentReach.licenseMetadata}
          />
        </div>

        {/* Live Copernicus GloFAS Discharge Ingestion Button */}
        <button
          type="button"
          onClick={handleFetchLiveDischarge}
          disabled={isFetchingLiveQ}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 hover:text-cyan-200 rounded-lg text-xs font-medium transition"
          title="Query Copernicus GloFAS via Open-Meteo Flood API for real-time daily flow (No API Key Required)"
        >
          {isFetchingLiveQ ? (
            <span className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>🌊</span>
          )}
          <span>Live Flow</span>
        </button>

        {liveQNotice && (
          <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-200 animate-fade-in">
            {liveQNotice}
          </span>
        )}

        {/* River Hydrological Metadata Chips */}
        <div className="hidden xl:flex items-center gap-3 text-xs text-slate-400 pl-2 border-l border-slate-800">
          <span>
            Length: <strong className="text-slate-200">{currentReach.reachLengthM.toFixed(0)} m</strong>
          </span>
          <span>
            Width: <strong className="text-slate-200">{currentReach.meanWidthM.toFixed(0)} m</strong>
          </span>
          <span>
            Q: <strong className="text-cyan-400">≈{currentReach.upstreamDischargeEstimateM3s} m³/s</strong>
          </span>
          <span>
            Manning n: <strong className="text-slate-200">{currentReach.defaultManningN.toFixed(3)}</strong>
          </span>
        </div>
      </div>

      {/* Right side: CAD Hydraulic Structures & Project Management */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenStructurePlacer}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-amber-900/40"
          title="Open CAD Hydraulic Structure Editor (Levees, Weirs, Bridges, Culverts, Gates, Embankments)"
        >
          <span className="text-sm">🏗️</span>
          <span>CAD Structures</span>
        </button>

        <button
          onClick={onOpenImportModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
          title="Import or Export River Project Archive (JSON / IndexedDB)"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            />
          </svg>
          <span>Project</span>
        </button>
      </div>
    </div>
  );
};
