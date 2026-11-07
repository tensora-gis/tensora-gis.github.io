/**
 * Full-Scale 2D CFD Simulation Runner & Multi-Format Export Modal
 */

import React, { useState } from 'react';
import {
  RiverGridMesh,
  HydrodynamicsState,
  RiverBoundaryConditions,
  RiverCfdSummary,
  RiverReachDefinition,
} from '../types/riverReach';
import { TurbulenceParameters, TurbulenceState } from '../types/turbulence';
import { SedimentParameters, SedimentState } from '../types/sediment';
import { RiverHydraulicStructure } from '../structures/structureTypes';
import { RiverCfdEngine } from '../solver/riverCfdEngine';
import {
  createRiverExcelWorkbook,
  exportRiverToGeoJson,
  exportRiverToAsciiGrid,
  triggerFileDownload,
} from '../export/riverExport';
import { SwotCalibrationResult } from '../calibration/swotCalibration';

interface SimulationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  reach: RiverReachDefinition;
  mesh: RiverGridMesh;
  boundaries: RiverBoundaryConditions;
  structures: RiverHydraulicStructure[];
  turbParams: TurbulenceParameters;
  sedParams: SedimentParameters;
  onSimulationFinished: (
    hydro: HydrodynamicsState,
    turb: TurbulenceState,
    sed: SedimentState,
    summary: RiverCfdSummary
  ) => void;
  calibrationResult?: SwotCalibrationResult | null;
}

export const SimulationPanel: React.FC<SimulationPanelProps> = ({
  isOpen,
  onClose,
  reach,
  mesh,
  boundaries,
  structures,
  turbParams,
  sedParams,
  onSimulationFinished,
  calibrationResult,
}) => {
  const [durationSec, setDurationSec] = useState<number>(60);
  const [backendPref, setBackendPref] = useState<'cpu' | 'webgpu' | 'webgl2'>('cpu');
  const [isRunning, setIsRunning] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [simTimeSec, setSimTimeSec] = useState(0);
  const [completedSummary, setCompletedSummary] = useState<RiverCfdSummary | null>(null);
  const [lastState, setLastState] = useState<{
    hydro: HydrodynamicsState;
    turb: TurbulenceState;
    sed: SedimentState;
  } | null>(null);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  if (!isOpen) return null;

  const handleStartSimulation = async () => {
    setIsRunning(true);
    setProgressPct(0);
    setSimTimeSec(0);
    setCompletedSummary(null);

    const engine = new RiverCfdEngine({
      mesh,
      boundaries,
      structures,
      turbParams,
      sedParams,
      preferredBackend: backendPref,
    });

    try {
      await engine.initialize();
      const summary = await engine.runBatch(durationSec, (pct, t) => {
        setProgressPct(pct);
        setSimTimeSec(t);
      });

      const state = engine.getState();
      setLastState(state);
      setCompletedSummary(summary);
      onSimulationFinished(state.hydro, state.turb, state.sed, summary);
    } catch (err: any) {
      alert(`Simulation error: ${err.message}`);
    } finally {
      setIsRunning(false);
      engine.dispose();
    }
  };

  const handleExportExcel = async () => {
    if (!completedSummary || !lastState) return;
    setIsExportingExcel(true);

    try {
      const buffer = await createRiverExcelWorkbook({
        reach,
        mesh,
        hydro: lastState.hydro,
        turb: lastState.turb,
        sed: lastState.sed,
        structures,
        summary: completedSummary,
        turbParams,
        sedParams,
        calibrationResult,
      });

      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      triggerFileDownload(blob, `${reach.id}_2D_River_CFD_Analysis.xlsx`);
    } catch (err: any) {
      alert(`Failed to export Excel report: ${err.message}`);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportGeoJson = () => {
    if (!lastState) return;
    const jsonStr = exportRiverToGeoJson(mesh, lastState.hydro, lastState.turb, lastState.sed);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    triggerFileDownload(blob, `${reach.id}_2D_Mesh_Results.geojson`);
  };

  const handleExportAscii = () => {
    if (!lastState) return;
    const ascStr = exportRiverToAsciiGrid(mesh, 'depth', lastState.hydro);
    const blob = new Blob([ascStr], { type: 'text/plain' });
    triggerFileDownload(blob, `${reach.id}_Depth_Grid.asc`);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-5 shadow-2xl text-slate-100 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <h3 className="text-base font-semibold">Run Full-Scale 2D Shallow-Water CFD Simulation</h3>
          </div>
          <button onClick={onClose} disabled={isRunning} className="text-slate-400 hover:text-white transition">
            ✕
          </button>
        </div>

        {/* Configuration */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Simulation Duration</label>
            <select
              value={durationSec}
              onChange={(e) => setDurationSec(parseInt(e.target.value) || 60)}
              disabled={isRunning}
              className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            >
              <option value="30">30 seconds (Rapid Test)</option>
              <option value="60">60 seconds (Standard Reach Flow)</option>
              <option value="180">180 seconds (Equilibrium Flood Stage)</option>
              <option value="300">300 seconds (Sediment Morphodynamics)</option>
              <option value="600">600 seconds (Long-Term Inundation)</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Computational Backend</label>
            <select
              value={backendPref}
              onChange={(e) => setBackendPref(e.target.value as any)}
              disabled={isRunning}
              className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            >
              <option value="cpu">CPU (Audusse HLL Finite-Volume)</option>
              <option value="webgpu">WebGPU (Hardware Compute Pipeline)</option>
              <option value="webgl2">WebGL2 GPGPU Shader Fallback</option>
            </select>
          </div>
        </div>

        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-1">
          <div className="flex justify-between text-slate-300">
            <span>Grid Resolution:</span>
            <span className="font-semibold text-slate-100">{mesh.nx} × {mesh.ny} ({mesh.cells.length} cells)</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>RANS Turbulence Model:</span>
            <span className="font-semibold text-purple-400">{turbParams.model.toUpperCase()}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Sediment Morphodynamics:</span>
            <span className="font-semibold text-amber-400">
              {sedParams.enabled ? `${sedParams.formula.toUpperCase()} (d50=${sedParams.d50Mm}mm)` : 'DISABLED'}
            </span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Active Hydraulic Structures:</span>
            <span className="font-semibold text-emerald-400">{structures.filter((s) => s.enabled).length} structures</span>
          </div>
        </div>

        {/* Progress Bar & Status */}
        {isRunning && (
          <div className="space-y-2 py-1">
            <div className="flex justify-between text-xs">
              <span className="text-cyan-400 font-medium">Solving Shallow-Water & RANS Transport...</span>
              <span className="text-slate-200 font-semibold">{simTimeSec.toFixed(1)}s / {durationSec}s ({progressPct.toFixed(0)}%)</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-cyan-500 h-2.5 rounded-full transition-all duration-150"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Completed Summary Cards */}
        {completedSummary && (
          <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-lg p-3 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Simulation Completed Successfully
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-slate-300">
              <div>
                <span className="text-[10px] text-slate-400 block">Peak Depth (h)</span>
                <strong className="text-slate-100">{completedSummary.maxWaterDepthM.toFixed(2)} m</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Peak Velocity (|V|)</span>
                <strong className="text-slate-100">{completedSummary.maxVelocityMs.toFixed(2)} m/s</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Inundation Area</span>
                <strong className="text-slate-100">{completedSummary.totalInundationAreaHa.toFixed(2)} ha</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Mass Balance Error</span>
                <strong className={completedSummary.massConservationErrorPercent < 2 ? 'text-emerald-400' : 'text-amber-400'}>
                  {completedSummary.massConservationErrorPercent.toFixed(3)}%
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Max Eddy Viscosity ν_t</span>
                <strong className="text-purple-300">{completedSummary.turbulenceSummary?.maxNuT.toFixed(3)} m²/s</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Net Bed Shift</span>
                <strong className="text-amber-300">{completedSummary.sedimentSummary?.netBedVolumeChangeM3.toFixed(1)} m³</strong>
              </div>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2">
            {completedSummary && (
              <>
                <button
                  onClick={handleExportExcel}
                  disabled={isExportingExcel}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition shadow"
                  title="Export 6-Sheet Professional Engineering Excel Report"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {isExportingExcel ? 'Exporting...' : 'Export Excel (.xlsx)'}
                </button>

                <button
                  onClick={handleExportGeoJson}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded text-xs transition"
                >
                  GeoJSON
                </button>

                <button
                  onClick={handleExportAscii}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded text-xs transition"
                >
                  ASCII Grid
                </button>
              </>
            )}
          </div>

          <button
            onClick={handleStartSimulation}
            disabled={isRunning}
            className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition shadow-md flex items-center gap-2"
          >
            {isRunning ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Simulating...
              </>
            ) : (
              'Run Full Simulation'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
