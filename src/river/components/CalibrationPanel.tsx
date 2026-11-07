/**
 * NASA SWOT Radar Satellite Calibration & WSE Validation Panel
 */

import React, { useState } from 'react';
import {
  RiverGridMesh,
  HydrodynamicsState,
  SwotRiverObservation,
} from '../types/riverReach';
import {
  evaluateSwotCalibration,
  SwotCalibrationResult,
} from '../calibration/swotCalibration';

interface CalibrationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mesh: RiverGridMesh;
  hydro: HydrodynamicsState;
  swotObs?: SwotRiverObservation | null;
  onApplyCalibratedManningN: (calibratedN: number) => void;
}

export const CalibrationPanel: React.FC<CalibrationPanelProps> = ({
  isOpen,
  onClose,
  mesh,
  hydro,
  swotObs,
  onApplyCalibratedManningN,
}) => {
  const [result, setResult] = useState<SwotCalibrationResult | null>(null);

  if (!isOpen) return null;

  const handleRunCalibration = () => {
    if (!swotObs) return;
    const res = evaluateSwotCalibration(mesh, hydro, swotObs);
    setResult(res);
  };

  const handleApply = () => {
    if (result) {
      onApplyCalibratedManningN(result.calibratedManningN);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 shadow-2xl text-slate-100 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
              </svg>
            </span>
            <h3 className="text-base font-semibold">NASA SWOT Radar Satellite Altimetry Calibration</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            ✕
          </button>
        </div>

        {swotObs ? (
          <div className="space-y-3">
            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Satellite Pass Date:</span>
                <span className="font-semibold text-slate-200">{swotObs.satellitePassDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Observed WSE (KaRIn Altimeter):</span>
                <span className="font-bold text-cyan-400">{swotObs.observedWseM.toFixed(2)} m MSL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Observed Inundation Width:</span>
                <span className="font-semibold text-slate-200">{swotObs.observedWidthM.toFixed(1)} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Observed Water Surface Slope:</span>
                <span className="font-semibold text-slate-200">{(swotObs.observedSlope * 1000).toFixed(2)} m/km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Sensor Altimetric Uncertainty:</span>
                <span className="font-semibold text-amber-400">±{(swotObs.uncertaintyWseM * 100).toFixed(0)} cm</span>
              </div>
            </div>

            {result ? (
              <div className="p-3 bg-blue-950/40 rounded-lg border border-blue-800/60 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Validation Status:</span>
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      result.agreementStatus === 'EXCELLENT'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : result.agreementStatus === 'GOOD'
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    }`}
                  >
                    {result.agreementStatus}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="text-slate-400 block">WSE Root-Mean-Square Error:</span>
                    <strong className="text-slate-200">{result.wseRmseM.toFixed(3)} m</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Elevation Offset:</span>
                    <strong className={result.differenceM > 0 ? 'text-amber-300' : 'text-cyan-300'}>
                      {result.differenceM > 0 ? '+' : ''}{result.differenceM.toFixed(3)} m
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Current Manning n:</span>
                    <strong className="text-slate-300">{result.originalManningN.toFixed(4)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Calibrated Manning n:</span>
                    <strong className="text-emerald-400">{result.calibratedManningN.toFixed(4)}</strong>
                  </div>
                </div>

                <div className="text-[11px] text-slate-300 bg-slate-900/80 p-2 rounded border border-slate-800">
                  {result.recommendation}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                onClick={handleRunCalibration}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition"
              >
                Evaluate Calibration
              </button>

              {result && (
                <button
                  onClick={handleApply}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition shadow-md"
                >
                  Apply Calibrated Manning n ({result.calibratedManningN})
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-slate-400 text-center">
            No SWOT satellite pass currently linked to this reach. Draw a reach in a SWOT-monitored corridor or load a bundled reach.
          </div>
        )}
      </div>
    </div>
  );
};
