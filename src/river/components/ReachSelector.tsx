/**
 * Global River Reach Selector Dropdown & Hydrological Flow Toolbar
 *
 * Provides single-source global river selection via continent-grouped dropdown,
 * validation benchmarks, live Copernicus GloFAS discharge query, and confidence badge.
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

export interface ReachSelectorProps {
  currentReach: RiverReachDefinition;
  onSelectReach: (reach: RiverReachDefinition) => void;
  onUpdateDischarge?: (qM3s: number) => void;
}

export const ReachSelector: React.FC<ReachSelectorProps> = ({
  currentReach,
  onSelectReach,
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
    <div className="flex items-center gap-2 flex-wrap text-slate-200">
      {/* River Dropdown (Consolidated, Single Source of River Selection) */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider hidden sm:inline">
          River:
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
          className="bg-slate-800 hover:bg-slate-750 border border-slate-700 focus:border-cyan-500 rounded-lg px-2.5 py-1 text-xs text-slate-100 font-semibold focus:outline-none max-w-[210px] sm:max-w-xs shadow-inner transition cursor-pointer"
          title="Select active river reach or laboratory benchmark"
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
        className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 hover:text-cyan-200 rounded-lg text-xs font-medium transition shadow-sm"
        title="Query Copernicus GloFAS via Open-Meteo Flood API for real-time daily flow"
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

      {/* Compact River Hydrological Metadata Chips */}
      <div className="hidden lg:flex items-center gap-2.5 text-[11px] text-slate-400 pl-2 border-l border-slate-800">
        <span>
          L: <strong className="text-slate-200">{currentReach.reachLengthM.toFixed(0)}m</strong>
        </span>
        <span>
          W: <strong className="text-slate-200">{currentReach.meanWidthM.toFixed(0)}m</strong>
        </span>
        <span>
          Q: <strong className="text-cyan-400">≈{currentReach.upstreamDischargeEstimateM3s}m³/s</strong>
        </span>
        <span>
          n: <strong className="text-slate-200">{currentReach.defaultManningN.toFixed(3)}</strong>
        </span>
      </div>
    </div>
  );
};
