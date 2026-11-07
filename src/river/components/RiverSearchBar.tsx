/**
 * Global River Search Bar with Fuzzy Search & Continent Filters
 *
 * Implements Section 7.1 (Phase 3 Deliverables) of the Global River Digital Twin Plan.
 */

import React, { useState, useMemo } from 'react';
import { GLOBAL_RIVER_DATABASE, GlobalRiverEntry, convertEntryToReachDefinition } from '../data/globalRiverDatabase';
import { RiverReachDefinition } from '../types/riverReach';
import { ConfidenceBadge } from './ConfidenceBadge';

interface RiverSearchBarProps {
  onSelectReach: (reach: RiverReachDefinition) => void;
  className?: string;
}

export const RiverSearchBar: React.FC<RiverSearchBarProps> = ({ onSelectReach, className = '' }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeContinent, setActiveContinent] = useState<string>('All');

  const continents = ['All', 'North America', 'South America', 'Europe', 'Asia', 'Africa', 'Oceania'];

  const filteredRivers = useMemo(() => {
    return GLOBAL_RIVER_DATABASE.filter((r) => {
      const matchesContinent = activeContinent === 'All' || r.continent === activeContinent;
      const cleanQ = query.trim().toLowerCase();
      const matchesQuery =
        !cleanQ ||
        r.name.toLowerCase().includes(cleanQ) ||
        r.reachName.toLowerCase().includes(cleanQ) ||
        r.basin.toLowerCase().includes(cleanQ) ||
        r.countries.some((c) => c.toLowerCase().includes(cleanQ));
      return matchesContinent && matchesQuery;
    });
  }, [query, activeContinent]);

  const handleSelect = (river: GlobalRiverEntry) => {
    const reachDef = convertEntryToReachDefinition(river);
    onSelectReach(reachDef);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className={`relative ${className}`}>
      {/* Search Input Box */}
      <div className="relative flex items-center">
        <input
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          placeholder="Search any river (Amazon, Nile, Rhine, Mississippi...)"
          className="w-64 lg:w-80 bg-slate-950/90 border border-slate-700/80 rounded-xl px-3.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 shadow-inner"
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
            }}
            className="absolute right-2.5 text-slate-400 hover:text-white text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown Results Overlay */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-[1000] bg-transparent" onClick={() => setIsOpen(false)} />

          <div className="absolute top-full left-0 mt-1.5 w-80 lg:w-96 max-h-80 overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-[1001] space-y-2">
            {/* Continent filter chips */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] border-b border-slate-800">
              {continents.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveContinent(c)}
                  className={`px-2 py-0.5 rounded-lg whitespace-nowrap transition ${
                    activeContinent === c ? 'bg-cyan-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* List of matching rivers */}
            <div className="space-y-1">
              {filteredRivers.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-500">
                  No matching rivers found. Try another search or continent.
                </div>
              ) : (
                filteredRivers.slice(0, 10).map((river) => (
                  <div
                    key={river.id}
                    onClick={() => handleSelect(river)}
                    className="p-2 rounded-lg bg-slate-950/50 hover:bg-slate-800 border border-slate-800/80 hover:border-cyan-500/60 cursor-pointer transition flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                        <span>{river.name}</span>
                        <span className="text-[10px] text-slate-400 font-normal">({river.countries[0]})</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {river.reachName} • Q: {river.meanDischargeM3s.toLocaleString()} m³/s
                      </div>
                    </div>

                    <ConfidenceBadge
                      compact
                      tier={river.swotWseM > 0 ? 'Calibrated (SWOT)' : 'Estimated (Global)'}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
