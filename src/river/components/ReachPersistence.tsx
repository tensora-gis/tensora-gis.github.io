/**
 * River Project Persistence Modal
 * Manages saving/loading projects to IndexedDB and JSON file archive import/export
 */

import React, { useState } from 'react';
import {
  RiverReachDefinition,
  RiverGridMesh,
  RiverBoundaryConditions,
  RiverMonitoringGauge,
  SwotRiverObservation,
} from '../types/riverReach';
import { RiverHydraulicStructure } from '../structures/structureTypes';
import { TurbulenceParameters } from '../types/turbulence';
import { SedimentParameters } from '../types/sediment';
import {
  serializeRiverProject,
  deserializeRiverProject,
  TensoraRiverProjectArchive,
} from '../reachSerializer';
import { RiverDataService } from '../data/riverDataService';
import { triggerFileDownload } from '../export/riverExport';

interface ReachPersistenceProps {
  isOpen: boolean;
  onClose: () => void;
  reach: RiverReachDefinition;
  mesh: RiverGridMesh;
  boundaries: RiverBoundaryConditions;
  structures: RiverHydraulicStructure[];
  gauges: RiverMonitoringGauge[];
  swotObservation?: SwotRiverObservation;
  turbParams: TurbulenceParameters;
  sedParams: SedimentParameters;
  onLoadArchive: (archive: TensoraRiverProjectArchive) => void;
}

export const ReachPersistence: React.FC<ReachPersistenceProps> = ({
  isOpen,
  onClose,
  reach,
  mesh,
  boundaries,
  structures,
  gauges,
  swotObservation,
  turbParams,
  sedParams,
  onLoadArchive,
}) => {
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveToIndexedDb = async () => {
    try {
      await RiverDataService.saveReach(reach);
      setSaveStatus('Project reach saved successfully to browser local database!');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      setSaveStatus(`Failed to save: ${err.message}`);
    }
  };

  const handleExportJson = () => {
    const jsonStr = serializeRiverProject({
      reach,
      mesh,
      boundaries,
      structures,
      gauges,
      swotObservation,
      turbParams,
      sedParams,
    });
    const blob = new Blob([jsonStr], { type: 'application/json' });
    triggerFileDownload(blob, `${reach.id}.tensora-reach.json`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const archive = deserializeRiverProject(text);
        onLoadArchive(archive);
        onClose();
      } catch (err: any) {
        alert(`Invalid project file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl text-slate-100 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            </span>
            <h3 className="text-base font-semibold">Project Storage & JSON File Archive</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            ✕
          </button>
        </div>

        <div className="space-y-3 text-xs">
          {/* IndexedDB Section */}
          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-2">
            <div className="font-semibold text-slate-200">Local Browser Storage (IndexedDB)</div>
            <p className="text-slate-400 text-[11px]">
              Persists your customized river reaches, meshes, and structures directly in your browser.
            </p>
            <button
              onClick={handleSaveToIndexedDb}
              className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded font-medium transition"
            >
              Save Project to Browser Storage
            </button>
            {saveStatus && <div className="text-cyan-400 text-[11px]">{saveStatus}</div>}
          </div>

          {/* JSON Archive Section */}
          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-2">
            <div className="font-semibold text-slate-200">Project JSON Archive (.tensora-reach.json)</div>
            <p className="text-slate-400 text-[11px]">
              Export or import your entire river simulation setup (geometry, CAD structures, boundary conditions, turbulence, and sediment settings) as a portable file.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleExportJson}
                className="py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium transition"
              >
                Export JSON Archive
              </button>

              <label className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded font-medium transition text-center cursor-pointer">
                Import JSON Archive
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
