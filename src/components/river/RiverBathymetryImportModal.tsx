/**
 * Surveyed Bathymetry Soundings Import Modal
 *
 * Imports field-measured river cross-section survey points (XYZ / CSV)
 * and blends them into the Copernicus DEM 2D mesh to resolve true channel depth.
 */

import React, { useState } from 'react';
import { RiverMesh } from '../../types/riverAnalysis';
import { parseSurveyedBathymetryCSV } from '../../utils/riverHydroDataService';
import { applySurveyedBathymetry } from '../../utils/riverMeshGenerator';
import { X, Upload, CheckCircle2, Anchor } from 'lucide-react';

interface RiverBathymetryImportModalProps {
  mesh: RiverMesh;
  onUpdateMesh: (updatedMesh: RiverMesh) => void;
  onClose: () => void;
}

export const RiverBathymetryImportModal: React.FC<RiverBathymetryImportModalProps> = ({
  mesh,
  onUpdateMesh,
  onClose,
}) => {
  const [csvText, setCsvText] = useState<string>(() => {
    // Generate realistic sample soundings based on current mesh centerline
    const pts = mesh.centerline.map((c) => `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}, ${(c.meanBedElevationM - 2.2).toFixed(2)}`);
    return `Latitude, Longitude, Bed_Elevation_m\n${pts.join('\n')}`;
  });

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handlePreviewParse = () => {
    const soundings = parseSurveyedBathymetryCSV(csvText);
    if (soundings.length > 0) {
      setStatusMessage(`Successfully parsed ${soundings.length} surveyed sounding points.`);
    } else {
      setStatusMessage('No valid coordinates found in input. Format: lat, lng, elevation');
    }
  };

  const handleApply = () => {
    const soundings = parseSurveyedBathymetryCSV(csvText);
    if (soundings.length === 0) {
      setStatusMessage('Cannot apply empty survey data');
      return;
    }

    const updated = applySurveyedBathymetry(mesh, soundings);
    onUpdateMesh(updated);
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        setCsvText(text);
        const soundings = parseSurveyedBathymetryCSV(text);
        setStatusMessage(`Loaded file "${file.name}" with ${soundings.length} points.`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-[#111] border border-[#262626] rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-[#e5e7eb]">
        {/* Header */}
        <div className="h-12 px-5 border-b border-[#222] flex items-center justify-between bg-[#141414]">
          <div className="flex items-center gap-2">
            <Anchor className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white font-tech">
              Import Surveyed River Bathymetry (XYZ Soundings)
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#222] text-[#888] hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs font-mono">
          <div className="text-[#a3a3a3]">
            Raw satellite radar & optical DEMs (e.g. Copernicus GLO-30) often reflect the water surface.
            Importing surveyed sonar/rod soundings carves the true underwater channel depth into your 2D CFD mesh.
          </div>

          <div className="flex items-center justify-between bg-[#171717] border border-[#262626] rounded-lg p-3">
            <div>
              <span className="text-white font-bold font-tech block">Upload Survey CSV / TXT File</span>
              <span className="text-[#666] text-[11px]">Format: Latitude, Longitude, Bed_Elevation_m</span>
            </div>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#222] hover:bg-[#2a2a2a] border border-[#333] text-white cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Choose File</span>
              <input type="file" accept=".csv,.txt,.xyz" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[#888]">Surveyed Coordinates & Soundings Data:</label>
              <button
                onClick={handlePreviewParse}
                className="text-cyan-400 hover:underline cursor-pointer"
              >
                Validate Format
              </button>
            </div>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={8}
              className="w-full bg-[#171717] border border-[#333] rounded p-2.5 text-white font-mono text-[11px]"
              placeholder="Latitude, Longitude, Bed_Elevation_m"
            />
          </div>

          {statusMessage && (
            <div className="p-2.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 px-5 border-t border-[#222] flex items-center justify-between bg-[#141414] text-xs">
          <span className="text-[#737373]">
            {mesh.surveyedBathymetryApplied ? 'Bathymetry Already Applied' : 'Using Synthetic/DEM Bed'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-[#222] hover:bg-[#2a2a2a] text-[#aaa] hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer"
            >
              Carve into 2D Mesh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
