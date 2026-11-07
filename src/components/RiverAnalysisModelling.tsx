/**
 * River Analysis & 2D Hydrodynamic Modelling Workspace
 *
 * Professional 2D shallow-water CFD river modeling environment:
 * - Real-world global terrain referencing via Copernicus GLO-30 / SRTM DEM
 * - HydroRIVERS global river network & NASA SWOT radar satellite integration
 * - Modifiable hydraulic structures (Levees, Weirs, Bridges, Culverts, Gates, Embankments)
 * - 2D Finite-Volume Godunov-type Shallow Water solver with well-balanced bed reconstruction
 * - High-performance animated Leaflet canvas overlay (depth, velocity vectors, streamlines)
 * - Longitudinal profile & transverse cross-section hydraulic viewer
 * - Multi-format export (GeoJSON, GeoTIFF ASCII raster, Hydraulic summary CSV)
 * - IndexedDB in-browser persistent project storage
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  RiverMesh,
  RiverFlowState,
  RiverStructure,
  RiverBoundaryConditions,
  RiverMonitoringGauge,
  RiverSimulationSummary,
  RiverThematicDisplay,
  RiverMeshCell,
  SwotObservation,
} from '../types/riverAnalysis';
import {
  ARBITRARY_RIVER_DEMOS,
  createBenchmark500mRiverReach,
} from '../data/sampleRiverReaches';
import {
  initializeFlowState,
  step2DShallowWater,
  computeStableTimeStep,
  run2DSimulation,
} from '../utils/riverShallowWaterSolver';
import { sampleRiverMeshElevations } from '../utils/riverTerrainService';
import { RiverToolbar } from './river/RiverToolbar';
import { RiverMapViewport } from './river/RiverMapViewport';
import { RiverStructureEditorModal } from './river/RiverStructureEditorModal';
import { RiverBoundaryModal } from './river/RiverBoundaryModal';
import { RiverCrossSectionViewer } from './river/RiverCrossSectionViewer';
import { RiverResultsSummaryModal } from './river/RiverResultsSummaryModal';
import { RiverBathymetryImportModal } from './river/RiverBathymetryImportModal';
import { RiverHydroRiversModal } from './river/RiverHydroRiversModal';

export const RiverAnalysisModelling: React.FC = () => {
  // Demo Reach Index (Defaults to 500m Benchmark Reach)
  const [demoIndex, setDemoIndex] = useState(0);
  const currentDemo = ARBITRARY_RIVER_DEMOS[demoIndex] || createBenchmark500mRiverReach();

  // Primary River Model State
  const [mesh, setMesh] = useState<RiverMesh>(() => currentDemo.mesh);
  const [structures, setStructures] = useState<RiverStructure[]>(() => currentDemo.structures);
  const [boundaries, setBoundaries] = useState<RiverBoundaryConditions>(() => currentDemo.boundaries);
  const [gauges, setGauges] = useState<RiverMonitoringGauge[]>(() => currentDemo.gauges);
  const [swotObs, setSwotObs] = useState<SwotObservation | undefined>(() => currentDemo.swotObservation);

  // Dynamic Flow Field State
  const [flowState, setFlowState] = useState<RiverFlowState>(() =>
    initializeFlowState(currentDemo.mesh, currentDemo.boundaries)
  );
  const [summary, setSummary] = useState<RiverSimulationSummary | null>(null);

  // UI State
  const [thematicDisplay, setThematicDisplay] = useState<RiverThematicDisplay>('depth');
  const [selectedCell, setSelectedCell] = useState<RiverMeshCell | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState<number>(5);
  const [isSamplingElevation, setIsSamplingElevation] = useState(false);

  // Modals
  const [isStructuresModalOpen, setIsStructuresModalOpen] = useState(false);
  const [isBoundariesModalOpen, setIsBoundariesModalOpen] = useState(false);
  const [isCrossSectionModalOpen, setIsCrossSectionModalOpen] = useState(false);
  const [isBathymetryModalOpen, setIsBathymetryModalOpen] = useState(false);
  const [isHydroRiversModalOpen, setIsHydroRiversModalOpen] = useState(false);
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);

  // State reference for requestAnimationFrame loop
  const flowStateRef = useRef<RiverFlowState>(flowState);
  flowStateRef.current = flowState;
  const meshRef = useRef<RiverMesh>(mesh);
  meshRef.current = mesh;
  const structuresRef = useRef<RiverStructure[]>(structures);
  structuresRef.current = structures;
  const boundariesRef = useRef<RiverBoundaryConditions>(boundaries);
  boundariesRef.current = boundaries;
  const isSimulatingRef = useRef<boolean>(isSimulating);
  isSimulatingRef.current = isSimulating;
  const simSpeedRef = useRef<number>(simSpeed);
  simSpeedRef.current = simSpeed;

  // Real-Time Simulation Loop
  useEffect(() => {
    let animId: number;

    const loop = () => {
      if (isSimulatingRef.current) {
        const currentMesh = meshRef.current;
        const currentFlow = flowStateRef.current;
        const currentStructs = structuresRef.current;
        const currentBounds = boundariesRef.current;
        const speed = simSpeedRef.current;

        // Perform sub-steps per frame based on speed multiplier
        const subSteps = Math.max(1, Math.min(25, speed * 2));
        for (let s = 0; s < subSteps; s++) {
          const dt = computeStableTimeStep(currentMesh, currentFlow, 0.55, 0.25);
          step2DShallowWater(
            currentMesh,
            currentFlow,
            currentStructs,
            currentBounds,
            dt,
            currentFlow.timeSec
          );
        }

        // Trigger React state refresh
        setFlowState({
          ...currentFlow,
          stepCount: currentFlow.stepCount,
          timeSec: currentFlow.timeSec,
        });
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Run initial simulation on mount
  useEffect(() => {
    try {
      const initialRun = run2DSimulation(
        currentDemo.mesh,
        currentDemo.structures,
        currentDemo.boundaries,
        30,
        10,
        currentDemo.gauges,
        currentDemo.swotObservation
      );
      setFlowState(initialRun.finalState);
      setSummary(initialRun.summary);
    } catch (err) {
      console.error('Initial river 2D CFD error:', err);
    }
  }, []);

  // Toggle Live Simulation Play / Pause
  const handleToggleSimulation = () => {
    setIsSimulating((prev) => !prev);
  };

  // Reset Flow Field to Initial Depth
  const handleResetSimulation = () => {
    setIsSimulating(false);
    const fresh = initializeFlowState(mesh, boundaries);
    setFlowState(fresh);
    flowStateRef.current = fresh;
  };

  // Sample Real Earth DEM Elevations for All Mesh Cells
  const handleSampleElevation = async () => {
    setIsSamplingElevation(true);
    try {
      const result = await sampleRiverMeshElevations(mesh, true, 2.5);
      setMesh(result.updatedMesh);
      // Re-initialize flow state to respect new bed elevations
      const refreshedState = initializeFlowState(result.updatedMesh, boundaries);
      setFlowState(refreshedState);
      flowStateRef.current = refreshedState;
    } catch (err) {
      console.error('Error sampling river mesh elevations:', err);
    } finally {
      setIsSamplingElevation(false);
    }
  };

  // Cycle Through Pre-loaded Demo Reaches (500m Benchmark / Danube / Alpine)
  const handleCycleDemo = () => {
    const nextIdx = (demoIndex + 1) % ARBITRARY_RIVER_DEMOS.length;
    setDemoIndex(nextIdx);
    const demo = ARBITRARY_RIVER_DEMOS[nextIdx];

    setMesh(demo.mesh);
    setStructures(demo.structures);
    setBoundaries(demo.boundaries);
    setGauges(demo.gauges);
    setSwotObs(demo.swotObservation);
    setSelectedCell(null);

    const fresh = initializeFlowState(demo.mesh, demo.boundaries);
    setFlowState(fresh);
    flowStateRef.current = fresh;

    // Run quick 20s simulation to establish initial backwater profile
    const runResult = run2DSimulation(
      demo.mesh,
      demo.structures,
      demo.boundaries,
      25,
      10,
      demo.gauges,
      demo.swotObservation
    );
    setFlowState(runResult.finalState);
    setSummary(runResult.summary);
  };

  // Load a HydroRIVERS Selected Reach
  const handleLoadHydroRiverReach = (
    newMesh: RiverMesh,
    newBoundaries: RiverBoundaryConditions,
    newSwot?: SwotObservation
  ) => {
    setMesh(newMesh);
    setStructures([]);
    setBoundaries(newBoundaries);
    setGauges([
      {
        id: 'G-UP',
        name: 'Upstream Inflow Gauge',
        lat: newMesh.centerline[0].lat,
        lng: newMesh.centerline[0].lng,
        cellIndex: 0,
        stationChainageM: 10,
      },
      {
        id: 'G-DN',
        name: 'Downstream Outflow Gauge',
        lat: newMesh.centerline[newMesh.centerline.length - 1].lat,
        lng: newMesh.centerline[newMesh.centerline.length - 1].lng,
        cellIndex: newMesh.cells.length - 1,
        stationChainageM: newMesh.reachLengthM - 10,
      },
    ]);
    setSwotObs(newSwot);
    setSelectedCell(null);

    const fresh = initializeFlowState(newMesh, newBoundaries);
    setFlowState(fresh);
    flowStateRef.current = fresh;

    // Run initial 20s simulation
    const runResult = run2DSimulation(
      newMesh,
      [],
      newBoundaries,
      20,
      10,
      [],
      newSwot
    );
    setFlowState(runResult.finalState);
    setSummary(runResult.summary);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-[#0a0a0a]">
      {/* Top Specialized Toolbar */}
      <RiverToolbar
        thematicDisplay={thematicDisplay}
        onSelectThematic={setThematicDisplay}
        isSimulating={isSimulating}
        onToggleSimulation={handleToggleSimulation}
        onResetSimulation={handleResetSimulation}
        simSpeed={simSpeed}
        onChangeSimSpeed={setSimSpeed}
        onOpenBoundaries={() => setIsBoundariesModalOpen(true)}
        onOpenStructures={() => setIsStructuresModalOpen(true)}
        onOpenCrossSection={() => setIsCrossSectionModalOpen(true)}
        onOpenBathymetry={() => setIsBathymetryModalOpen(true)}
        onOpenHydroRivers={() => setIsHydroRiversModalOpen(true)}
        onOpenResults={() => setIsResultsModalOpen(true)}
        onSampleElevation={handleSampleElevation}
        isSamplingElevation={isSamplingElevation}
        onCycleDemo={handleCycleDemo}
        demoReachName={mesh.name}
      />

      {/* Main Map Viewport with 2D Canvas Overlay */}
      <div className="flex-1 relative overflow-hidden">
        <RiverMapViewport
          mesh={mesh}
          state={flowState}
          structures={structures}
          gauges={gauges}
          thematicDisplay={thematicDisplay}
          selectedCell={selectedCell}
          onSelectCell={setSelectedCell}
          isSimulating={isSimulating}
        />
      </div>

      {/* Hydraulic Structures Manager Modal */}
      {isStructuresModalOpen && (
        <RiverStructureEditorModal
          structures={structures}
          mesh={mesh}
          onUpdateStructures={setStructures}
          onClose={() => setIsStructuresModalOpen(false)}
        />
      )}

      {/* Boundary Conditions Modal */}
      {isBoundariesModalOpen && (
        <RiverBoundaryModal
          boundaries={boundaries}
          onUpdateBoundaries={setBoundaries}
          onClose={() => setIsBoundariesModalOpen(false)}
        />
      )}

      {/* Longitudinal & Cross-Section Profile Modal */}
      {isCrossSectionModalOpen && (
        <RiverCrossSectionViewer
          mesh={mesh}
          state={flowState}
          structures={structures}
          onClose={() => setIsCrossSectionModalOpen(false)}
        />
      )}

      {/* Surveyed Bathymetry Soundings Import Modal */}
      {isBathymetryModalOpen && (
        <RiverBathymetryImportModal
          mesh={mesh}
          onUpdateMesh={setMesh}
          onClose={() => setIsBathymetryModalOpen(false)}
        />
      )}

      {/* Global HydroRIVERS & NASA SWOT Modal */}
      {isHydroRiversModalOpen && (
        <RiverHydroRiversModal
          onLoadHydroRiverReach={handleLoadHydroRiverReach}
          onClose={() => setIsHydroRiversModalOpen(false)}
        />
      )}

      {/* 2D CFD Results & Data Export Modal */}
      {isResultsModalOpen && (
        <RiverResultsSummaryModal
          mesh={mesh}
          state={flowState}
          summary={summary}
          structures={structures}
          gauges={gauges}
          boundaries={boundaries}
          swotObs={swotObs}
          onClose={() => setIsResultsModalOpen(false)}
        />
      )}
    </div>
  );
};
