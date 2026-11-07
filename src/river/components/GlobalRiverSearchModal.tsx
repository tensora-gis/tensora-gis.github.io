/**
 * Global River Database Explorer & Real-World Hydrodynamic Ingestion Modal
 *
 * Allows users to browse, search, and simulate major rivers across all continents
 * with verified hydrology, NASA SWOT satellite altimetry, and Copernicus GLO-30 DEM.
 */

import React, { useState } from 'react';
import {
  GLOBAL_RIVER_DATABASE,
  GlobalRiverEntry,
  convertEntryToReachDefinition,
  fetchLiveCopernicusDischarge,
} from '../data/globalRiverDatabase';
import { searchGlobalRivers, buildRealWorldRiverReach, GlobalRiverSearchResult } from '../data/globalRiverSearchService';
import { RiverReachDefinition } from '../types/riverReach';

interface GlobalRiverSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRealReach: (reach: RiverReachDefinition) => void;
  onStartMapProbeMode: () => void;
}

export const GlobalRiverSearchModal: React.FC<GlobalRiverSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectRealReach,
  onStartMapProbeMode,
}) => {
  const [activeContinent, setActiveContinent] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<GlobalRiverEntry>(GLOBAL_RIVER_DATABASE[0]);
  const [liveDischargeM3s, setLiveDischargeM3s] = useState<number | null>(null);
  const [isFetchingLiveQ, setIsFetchingLiveQ] = useState(false);
  const [customResults, setCustomResults] = useState<GlobalRiverSearchResult[] | null>(null);
  const [selectedCustomResult, setSelectedCustomResult] = useState<GlobalRiverSearchResult | null>(null);
  const [isLoadingReach, setIsLoadingReach] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter global database by continent and query
  const filteredDbRivers = GLOBAL_RIVER_DATABASE.filter((r) => {
    const matchesContinent = activeContinent === 'All' || r.continent === activeContinent;
    const matchesQuery =
      !query.trim() ||
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      r.reachName.toLowerCase().includes(query.toLowerCase()) ||
      r.basin.toLowerCase().includes(query.toLowerCase()) ||
      r.countries.some((c) => c.toLowerCase().includes(query.toLowerCase()));
    return matchesContinent && matchesQuery;
  });

  const handleSelectEntry = (entry: GlobalRiverEntry) => {
    setSelectedEntry(entry);
    setSelectedCustomResult(null);
    setLiveDischargeM3s(null);
  };

  const handleFetchLiveDischarge = async (entry: GlobalRiverEntry) => {
    const midLat = 0.5 * (entry.bounds[0] + entry.bounds[2]);
    const midLng = 0.5 * (entry.bounds[1] + entry.bounds[3]);
    setIsFetchingLiveQ(true);
    setStatusMsg(`Querying Copernicus GloFAS for ${entry.name}...`);
    try {
      const liveData = await fetchLiveCopernicusDischarge(midLat, midLng);
      if (liveData) {
        setLiveDischargeM3s(liveData.dischargeM3s);
        setStatusMsg(`Live GloFAS flow as of ${liveData.timestamp}: ${liveData.dischargeM3s} m³/s`);
      } else {
        setStatusMsg('Live flood model returned standard baseline flow.');
      }
    } catch {
      setStatusMsg('Live Copernicus flood service unreachable.');
    } finally {
      setIsFetchingLiveQ(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) {
      setCustomResults(null);
      return;
    }

    setIsSearching(true);
    setStatusMsg(null);

    try {
      const searchRes = await searchGlobalRivers(query);
      setCustomResults(searchRes);
      if (searchRes.length > 0) {
        setSelectedCustomResult(searchRes[0]);
      } else {
        setStatusMsg('No matching river found. Try another river name or use map probe.');
      }
    } catch (err: any) {
      setStatusMsg(`Search failed: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSimulateSelected = async () => {
    setIsLoadingReach(true);

    try {
      if (selectedCustomResult) {
        setStatusMsg(`Ingesting river geometry & sampling Copernicus GLO-30 DEM for ${selectedCustomResult.name}...`);
        const realReach = await buildRealWorldRiverReach(
          selectedCustomResult.id,
          selectedCustomResult.displayName || selectedCustomResult.name,
          selectedCustomResult.lat,
          selectedCustomResult.lng,
          {
            reachLengthM: 3000,
            meanWidthM: selectedCustomResult.estimatedWidthM,
            dischargeM3s: selectedCustomResult.estimatedDischargeM3s,
            geojson: selectedCustomResult.geojson,
          }
        );
        onSelectRealReach(realReach);
      } else if (selectedEntry) {
        setStatusMsg(`Loading ${selectedEntry.name} (${selectedEntry.reachName}) into 2D CFD Solver...`);
        const def = convertEntryToReachDefinition(selectedEntry);
        if (liveDischargeM3s) {
          def.upstreamDischargeEstimateM3s = liveDischargeM3s;
        }
        onSelectRealReach(def);
      }
      onClose();
    } catch (err: any) {
      setStatusMsg(`Failed to build river reach: ${err.message}`);
    } finally {
      setIsLoadingReach(false);
    }
  };

  const continents = ['All', 'North America', 'South America', 'Europe', 'Asia', 'Africa', 'Oceania'];

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl text-slate-100 flex flex-col gap-4 max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064"
                />
              </svg>
            </span>
            <div>
              <h3 className="text-lg font-bold text-slate-100">Global River Hydrodynamic Database</h3>
              <p className="text-xs text-slate-400">
                Authoritative worldwide river database (USGS HydroSHEDS, Copernicus GloFAS, NASA SWOT, GLO-30 DEM)
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={isLoadingReach} className="text-slate-400 hover:text-white transition">
            ✕
          </button>
        </div>

        {/* Search Bar & Map Probe Button */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!e.target.value.trim()) setCustomResults(null);
              }}
              placeholder="Search by river name, country, basin (e.g. Rhine, Mississippi, Amazon, Nile, Ganges, Yangtze, Danube...)"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 shadow-inner"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCustomResults(null);
                }}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={isSearching}
            className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition shadow-md flex items-center gap-1.5"
          >
            {isSearching ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Searching...</span>
              </>
            ) : (
              <span>Filter / Search</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onStartMapProbeMode();
            }}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition flex items-center gap-1"
            title="Click anywhere on the world map to automatically detect and simulate that river"
          >
            <span>📍</span>
            <span>Click Map to Auto-Detect</span>
          </button>
        </form>

        {/* Continent Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Continent:</span>
          {continents.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setActiveContinent(c);
                setCustomResults(null);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                activeContinent === c && !customResults
                  ? 'bg-cyan-600 text-white font-semibold'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {statusMsg && (
          <div className="text-xs p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-800/60 text-cyan-200 animate-fade-in">
            {statusMsg}
          </div>
        )}

        {/* Main Selection Area: River List + Deep Hydrological Profile */}
        <div className="grid grid-cols-12 gap-4 flex-1 overflow-hidden min-h-[340px]">
          {/* River List Column */}
          <div className="col-span-5 overflow-y-auto pr-1 space-y-1.5 max-h-[380px]">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
              {customResults
                ? `Search Matches (${customResults.length})`
                : `${activeContinent} Rivers (${filteredDbRivers.length})`}
            </div>

            {customResults ? (
              customResults.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedCustomResult(r)}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                    selectedCustomResult?.id === r.id
                      ? 'bg-cyan-950/70 border-cyan-500/80 text-white shadow'
                      : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <div className="font-semibold text-slate-100 flex items-center justify-between">
                    <span>{r.name}</span>
                    {r.country && <span className="text-[10px] text-cyan-400 font-normal">{r.country}</span>}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                    Q ≈ {r.estimatedDischargeM3s.toLocaleString()} m³/s • W ≈ {r.estimatedWidthM} m
                  </div>
                </div>
              ))
            ) : filteredDbRivers.length > 0 ? (
              filteredDbRivers.map((r) => (
                <div
                  key={r.id}
                  onClick={() => handleSelectEntry(r)}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                    selectedEntry?.id === r.id
                      ? 'bg-cyan-950/70 border-cyan-500/80 text-white shadow'
                      : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <div className="font-semibold text-slate-100 flex items-center justify-between">
                    <span>{r.name}</span>
                    <span className="text-[10px] text-cyan-400 font-normal">{r.countries[0]}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-between">
                    <span>{r.reachName}</span>
                    <span className="text-cyan-300 font-medium">Q: {r.meanDischargeM3s.toLocaleString()} m³/s</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-slate-500">
                No rivers found in this category. Try selecting "All" continents.
              </div>
            )}
          </div>

          {/* Detailed Hydrological Specifications Column */}
          <div className="col-span-7 bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between text-xs overflow-y-auto max-h-[380px]">
            {selectedEntry && !selectedCustomResult ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-base font-bold text-cyan-400">{selectedEntry.name}</h4>
                    <p className="text-xs text-slate-300 font-medium">{selectedEntry.reachName}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Basin: <strong className="text-slate-200">{selectedEntry.basin}</strong> • Countries:{' '}
                      <strong className="text-slate-200">{selectedEntry.countries.join(', ')}</strong>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleFetchLiveDischarge(selectedEntry)}
                    disabled={isFetchingLiveQ}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 rounded-lg text-xs font-semibold flex items-center gap-1 shadow transition"
                    title="Fetch today's real Copernicus GloFAS discharge"
                  >
                    {isFetchingLiveQ ? (
                      <span className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>🌊</span>
                    )}
                    <span>Fetch Live Q</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                  {selectedEntry.description}
                </p>

                {/* Hydrological Matrix */}
                <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-900/90 rounded-xl border border-slate-800 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">Mean Discharge (Qmean):</span>
                    <strong className="text-cyan-300 font-bold">
                      {liveDischargeM3s
                        ? `${liveDischargeM3s.toLocaleString()} m³/s (Live)`
                        : `${selectedEntry.meanDischargeM3s.toLocaleString()} m³/s`}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">10-Yr Flood (Q10):</span>
                    <strong className="text-amber-400">{selectedEntry.floodDischarge10yrM3s.toLocaleString()} m³/s</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">100-Yr Flood (Q100):</span>
                    <strong className="text-rose-400">{selectedEntry.floodDischarge100yrM3s.toLocaleString()} m³/s</strong>
                  </div>

                  <div>
                    <span className="text-slate-400 block">Channel Width:</span>
                    <strong className="text-slate-200">{selectedEntry.meanWidthM} m</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Bed Slope:</span>
                    <strong className="text-slate-200">{(selectedEntry.averageSlope * 1000).toFixed(2)} m/km</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Catchment Area:</span>
                    <strong className="text-slate-200">{selectedEntry.catchmentAreaKm2.toLocaleString()} km²</strong>
                  </div>

                  <div>
                    <span className="text-slate-400 block">Strahler Order:</span>
                    <strong className="text-emerald-400">Order {selectedEntry.strahlerOrder}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Sediment d50:</span>
                    <strong className="text-amber-300">{selectedEntry.d50Mm} mm</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Manning Roughness n:</span>
                    <strong className="text-slate-200">{selectedEntry.manningN.toFixed(3)}</strong>
                  </div>

                  <div>
                    <span className="text-slate-400 block">NASA SWOT WSE:</span>
                    <strong className="text-blue-300">{selectedEntry.swotWseM.toFixed(1)} m</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">SWOT Surface Slope:</span>
                    <strong className="text-blue-300">{selectedEntry.swotSlopeMmPerKm} mm/km</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">DEM Bathymetry:</span>
                    <strong className="text-emerald-400">Copernicus GLO-30</strong>
                  </div>
                </div>

                <div className="p-2 bg-slate-900/40 rounded-lg border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                  <span>⚡</span>
                  <span>
                    Auto-generates curvilinear 2D CFD mesh with Audusse reconstruction, RANS turbulence, and sediment transport.
                  </span>
                </div>
              </div>
            ) : selectedCustomResult ? (
              <div className="space-y-3">
                <h4 className="text-base font-bold text-cyan-400">{selectedCustomResult.displayName}</h4>
                <p className="text-xs text-slate-400">{selectedCustomResult.description}</p>
                <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-900/90 rounded-lg border border-slate-800 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">Coordinates:</span>
                    <strong className="text-slate-200">
                      {selectedCustomResult.lat.toFixed(4)}°, {selectedCustomResult.lng.toFixed(4)}°
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Estimated Width:</span>
                    <strong className="text-slate-200">{selectedCustomResult.estimatedWidthM} m</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Estimated Discharge:</span>
                    <strong className="text-cyan-300">
                      {selectedCustomResult.estimatedDischargeM3s.toLocaleString()} m³/s
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Terrain Elevation:</span>
                    <strong className="text-emerald-400">Copernicus GLO-30 DEM</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">
                Select a river to inspect its hydrological profile
              </div>
            )}

            {/* Modal Bottom Buttons */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">100% Client-Side Simulation (No Backend)</span>

              <button
                type="button"
                onClick={handleSimulateSelected}
                disabled={isLoadingReach || (!selectedEntry && !selectedCustomResult)}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2"
              >
                {isLoadingReach ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Loading River Reach & DEM...</span>
                  </>
                ) : (
                  <span>
                    Simulate {selectedCustomResult?.name || selectedEntry?.name || 'River'} in 2D CFD →
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
