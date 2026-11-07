/**
 * Global River Search & World Hydrodynamic Ingestion Modal
 *
 * Allows users to search and simulate ANY river in the world with real data.
 */

import React, { useState } from 'react';
import {
  searchGlobalRivers,
  buildRealWorldRiverReach,
  GlobalRiverSearchResult,
  FAMOUS_GLOBAL_RIVERS,
} from '../data/globalRiverSearchService';
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
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<GlobalRiverSearchResult[]>(FAMOUS_GLOBAL_RIVERS);
  const [selectedResult, setSelectedResult] = useState<GlobalRiverSearchResult>(FAMOUS_GLOBAL_RIVERS[0]);
  const [reachLengthM, setReachLengthM] = useState<number>(3000);
  const [isLoadingReach, setIsLoadingReach] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSearching(true);
    setStatusMsg(null);

    try {
      const searchRes = await searchGlobalRivers(query);
      setResults(searchRes);
      if (searchRes.length > 0) {
        setSelectedResult(searchRes[0]);
      } else {
        setStatusMsg('No matching river found. Try another river name or use map probe.');
      }
    } catch (err: any) {
      setStatusMsg(`Search failed: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSimulateRiver = async () => {
    if (!selectedResult) return;
    setIsLoadingReach(true);
    setStatusMsg(`Ingesting actual river geometry & sampling Copernicus GLO-30 DEM for ${selectedResult.name}...`);

    try {
      const realReach = await buildRealWorldRiverReach(
        selectedResult.id,
        selectedResult.displayName || selectedResult.name,
        selectedResult.lat,
        selectedResult.lng,
        {
          reachLengthM,
          meanWidthM: selectedResult.estimatedWidthM,
          dischargeM3s: selectedResult.estimatedDischargeM3s,
          geojson: selectedResult.geojson,
        }
      );

      onSelectRealReach(realReach);
      onClose();
    } catch (err: any) {
      setStatusMsg(`Failed to build river reach: ${err.message}`);
    } finally {
      setIsLoadingReach(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl text-slate-100 flex flex-col gap-4 max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
              </svg>
            </span>
            <div>
              <h3 className="text-lg font-bold text-slate-100">Simulate Any World River (Real Data)</h3>
              <p className="text-xs text-slate-400">
                Ground-truth Copernicus GLO-30 DEM, real river geometry, and global runoff estimates
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={isLoadingReach} className="text-slate-400 hover:text-white transition">
            ✕
          </button>
        </div>

        {/* Search Bar & Action Buttons */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search any river on Earth (e.g. Amazon, Seine, Ganges, Mississippi, Nile, Rhine, Thames, Colorado...)"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 shadow-inner"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults(FAMOUS_GLOBAL_RIVERS);
                  setSelectedResult(FAMOUS_GLOBAL_RIVERS[0]);
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
                Searching...
              </>
            ) : (
              'Search River'
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onStartMapProbeMode();
            }}
            className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition"
            title="Click anywhere on the world map to simulate that river"
          >
            📍 Probe Map
          </button>
        </form>

        {statusMsg && (
          <div className="text-xs p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-800/60 text-cyan-200">
            {statusMsg}
          </div>
        )}

        {/* Main Selection Area: List + Details */}
        <div className="grid grid-cols-5 gap-3 flex-1 overflow-hidden min-h-[300px]">
          {/* Results / Catalog Column */}
          <div className="col-span-2 overflow-y-auto pr-1 space-y-1.5 max-h-[360px]">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
              {query ? `Search Results (${results.length})` : 'Major World Rivers'}
            </div>

            {results.map((r) => (
              <div
                key={r.id}
                onClick={() => setSelectedResult(r)}
                className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                  selectedResult?.id === r.id
                    ? 'bg-cyan-950/70 border-cyan-500/80 text-white shadow'
                    : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div className="font-semibold text-slate-100 flex items-center justify-between">
                  <span>{r.name}</span>
                  {r.country && (
                    <span className="text-[10px] text-cyan-400 font-normal">{r.country}</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                  Q ≈ {r.estimatedDischargeM3s.toLocaleString()} m³/s • W ≈ {r.estimatedWidthM} m
                </div>
              </div>
            ))}
          </div>

          {/* River Details & Simulation Setup Column */}
          <div className="col-span-3 bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between text-xs overflow-y-auto">
            {selectedResult ? (
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-bold text-cyan-400">{selectedResult.displayName}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{selectedResult.description}</div>
                </div>

                <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">Coordinates:</span>
                    <strong className="text-slate-200">
                      {selectedResult.lat.toFixed(4)}°, {selectedResult.lng.toFixed(4)}°
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Channel Width:</span>
                    <strong className="text-slate-200">{selectedResult.estimatedWidthM} meters</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Typical Discharge:</span>
                    <strong className="text-cyan-300">
                      {selectedResult.estimatedDischargeM3s.toLocaleString()} m³/s
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Terrain Source:</span>
                    <strong className="text-emerald-400">Copernicus GLO-30 DEM</strong>
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Reach Simulation Length</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { len: 1500, label: '1.5 km (Fast)' },
                      { len: 3000, label: '3.0 km (Standard)' },
                      { len: 6000, label: '6.0 km (Regional)' },
                    ].map((opt) => (
                      <button
                        key={opt.len}
                        type="button"
                        onClick={() => setReachLengthM(opt.len)}
                        className={`py-1.5 rounded-lg border text-xs font-medium transition ${
                          reachLengthM === opt.len
                            ? 'bg-cyan-600 border-cyan-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-2.5 bg-slate-900/50 rounded-lg border border-slate-800 text-[11px] text-slate-400">
                  ⚡ <strong>Automated 2D Mesh Generation:</strong> Tensora GIS will extract the real waterway thalweg, sample the 30m DEM terrain, carve channel bathymetry, and position satellite imagery.
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">
                Select a river from the list to preview
              </div>
            )}

            {/* Launch Button */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Zero backend dependency (100% Client-Side)</span>

              <button
                type="button"
                onClick={handleSimulateRiver}
                disabled={isLoadingReach || !selectedResult}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2"
              >
                {isLoadingReach ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Ingesting Real River Data...
                  </>
                ) : (
                  `Simulate ${selectedResult?.name || 'River'} Now →`
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
