/**
 * Wastewater Collection & Sewer Network Modelling Workspace
 *
 * Provides a comprehensive sanitary sewer engineering environment
 * running on real-world global Digital Elevation Models (DEMs).
 *
 * Capabilities:
 * - Real terrain elevation auto-sampling via Copernicus GLO-30 / SRTM / Open-Meteo
 * - Interactive CAD network modeling (Manholes, Gravity Conduits, Wet Wells, Pumps, Force Mains, Outfalls)
 * - Exact circular pipe Manning's equation & backwater HGL solver
 * - Diurnal sanitary peaking factors (Harmon, Babbitt, Ten-States)
 * - Self-cleansing and scour velocity checks
 * - Sewer FlexTables tabular data editor with live inline modification & CSV export
 * - Longitudinal Sewer Hydraulic Grade Line (HGL) terrain profile viewer
 * - Two-way EPA SWMM standard (.inp) file import & export
 * - Automated detailed multi-sheet Excel calculation workbook export (.xlsx)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  ActiveWastewaterTool,
  WastewaterThematicDisplay,
  WastewaterNetworkElement,
  WastewaterSimulationSummary,
  WastewaterNetwork,
  WastewaterManhole,
  WastewaterConduit,
  WastewaterWetWell,
  WastewaterPump,
  WastewaterForceMain,
  WastewaterOutfall,
} from '../types/wastewater';
import { createMunicipalWastewaterNetwork } from '../data/sampleWastewaterNetworks';
import { simulateWastewaterNetwork } from '../utils/wastewaterHydraulicsEngine';
import { downloadWastewaterExcel } from '../utils/wastewaterExcelExport';
import {
  sampleWastewaterGroundElevation,
  sampleAllWastewaterElevations,
  calculateWastewaterDistanceM,
} from '../utils/wastewaterTerrainService';
import { exportToSwmmInp, parseSwmmInp } from '../utils/swmmParser';

import { WastewaterToolbar } from './wastewater/WastewaterToolbar';
import { WastewaterMapViewport } from './wastewater/WastewaterMapViewport';
import { WastewaterPropertyInspector } from './wastewater/WastewaterPropertyInspector';
import { WastewaterFlexTables } from './wastewater/WastewaterFlexTables';
import { WastewaterProfileViewer } from './wastewater/WastewaterProfileViewer';
import { WastewaterSimulationResultsModal } from './wastewater/WastewaterSimulationResultsModal';

export const WastewaterModelling: React.FC = () => {
  // Network Model State
  const [network, setNetwork] = useState<WastewaterNetwork>(() =>
    createMunicipalWastewaterNetwork()
  );

  // Active Tool & Mode State
  const [activeTool, setActiveTool] = useState<ActiveWastewaterTool>('select');
  const [thematicDisplay, setThematicDisplay] = useState<WastewaterThematicDisplay>('capacity');
  const [selectedElement, setSelectedElement] = useState<WastewaterNetworkElement | null>(null);

  // UI Panels State
  const [isFlexTablesOpen, setIsFlexTablesOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);

  // Simulation State
  const [simulationSummary, setSimulationSummary] = useState<WastewaterSimulationSummary | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSamplingElevation, setIsSamplingElevation] = useState(false);

  // Profile Route Selection
  const [profileRouteNodeIds, setProfileRouteNodeIds] = useState<string[]>([
    'MH-1',
    'MH-2',
    'MH-3',
    'MH-5',
    'MH-6',
    'WW-1',
    'OUT-1',
  ]);

  // Run initial simulation on demo network mount
  useEffect(() => {
    try {
      const { updatedNetwork, summary } = simulateWastewaterNetwork(network);
      setNetwork(updatedNetwork);
      setSimulationSummary(summary);
    } catch (err) {
      console.error('Initial wastewater simulation error:', err);
    }
  }, []);

  // Compute Hydraulics & Automatically Export Detailed Calculation (.xlsx)
  const handleRunSimulation = useCallback(async () => {
    setIsSimulating(true);
    try {
      const { updatedNetwork, summary } = simulateWastewaterNetwork(network);
      setNetwork(updatedNetwork);
      setSimulationSummary(summary);
      setIsSummaryModalOpen(true);

      // Automatically export every calculation result to detailed Excel workbook
      await downloadWastewaterExcel(updatedNetwork, summary);
    } catch (err) {
      console.error('Wastewater simulation error:', err);
    } finally {
      setIsSimulating(false);
    }
  }, [network]);

  const handleExportExcel = useCallback(async () => {
    if (!simulationSummary) return;
    await downloadWastewaterExcel(network, simulationSummary);
  }, [network, simulationSummary]);

  // Bulk DEM Elevation Sampling
  const handleSampleAllElevations = useCallback(async () => {
    setIsSamplingElevation(true);
    try {
      const res = await sampleAllWastewaterElevations(network);
      setNetwork(res.updatedNetwork);
      // Auto re-run simulation with fresh real terrain elevations
      const { updatedNetwork: simulated, summary } = simulateWastewaterNetwork(res.updatedNetwork);
      setNetwork(simulated);
      setSimulationSummary(summary);
    } catch (err) {
      console.error('Wastewater DEM sampling error:', err);
    } finally {
      setIsSamplingElevation(false);
    }
  }, [network]);

  // Element CRUD Operations (identical structure to Water Distribution Modelling)
  const handleAddManhole = useCallback(
    async (lat: number, lng: number) => {
      const newId = `MH-${network.manholes.length + 1}`;
      const defaultDepth = 2.5;
      const initialRim = 171.0;

      const newManhole: WastewaterManhole = {
        id: newId,
        label: `Manhole ${newId}`,
        type: 'manhole',
        lat,
        lng,
        rimElevation: initialRim,
        invertElevation: initialRim - defaultDepth,
        depth: defaultDepth,
        diameterMm: 1000,
        population: 800,
        unitLoadingLpcd: 135,
        peakingFormula: 'harmon',
        baseDryWeatherFlowLs: 0.5,
        inflowInfiltrationLs: 0.5,
      };

      const updated = {
        ...network,
        manholes: [...network.manholes, newManhole],
      };
      setNetwork(updated);
      setSelectedElement(newManhole);

      // Async sample true elevation from Open-Meteo / Copernicus DEM
      try {
        const elev = await sampleWastewaterGroundElevation(lat, lng);
        if (elev !== null) {
          const roundedRim = Math.round(elev * 10) / 10;
          setNetwork((prev) => ({
            ...prev,
            manholes: prev.manholes.map((m) =>
              m.id === newId
                ? {
                    ...m,
                    rimElevation: roundedRim,
                    invertElevation: Math.round((roundedRim - m.depth) * 10) / 10,
                  }
                : m
            ),
          }));
        }
      } catch (err) {
        console.error('Failed to sample elevation:', err);
      }
    },
    [network]
  );

  const handleAddConduit = useCallback(
    (startNodeId: string, endNodeId: string) => {
      const allNodes = [
        ...network.manholes,
        ...network.wetWells,
        ...network.outfalls,
      ];
      const start = allNodes.find((n) => n.id === startNodeId);
      const end = allNodes.find((n) => n.id === endNodeId);

      const length =
        start && end
          ? Math.max(5, calculateWastewaterDistanceM(start.lat, start.lng, end.lat, end.lng))
          : 60;

      const upInv = start && 'invertElevation' in start ? start.invertElevation : 168.0;
      const dnInv =
        end && 'invertElevation' in end
          ? end.invertElevation
          : end && 'floorElevation' in end
          ? (end as any).floorElevation
          : 167.5;
      const slope = Math.round(((upInv - dnInv) / Math.max(1, length)) * 10000) / 10000;

      const newId = `CO-${network.conduits.length + 1}`;
      const newConduit: WastewaterConduit = {
        id: newId,
        label: `Conduit ${newId}`,
        type: 'conduit',
        startNodeId,
        endNodeId,
        diameterMm: 250,
        material: 'PVC',
        manningN: 0.010,
        upstreamInvertM: upInv,
        downstreamInvertM: dnInv,
        lengthM: Math.round(length * 10) / 10,
        slopeMPerM: slope,
      };

      setNetwork((prev) => ({
        ...prev,
        conduits: [...prev.conduits, newConduit],
      }));
      setSelectedElement(newConduit);
    },
    [network]
  );

  const handleAddWetWell = useCallback(
    async (lat: number, lng: number) => {
      const newId = `WW-${network.wetWells.length + 1}`;
      const newWetWell: WastewaterWetWell = {
        id: newId,
        label: `Wet Well ${newId}`,
        type: 'wet-well',
        lat,
        lng,
        rimElevation: 171.0,
        floorElevation: 165.0,
        diameterM: 3.5,
        minWaterLevelM: 165.8,
        maxWaterLevelM: 167.5,
        alarmLevelM: 168.2,
        storageVolumeM3: 30.0,
      };

      setNetwork((prev) => ({
        ...prev,
        wetWells: [...prev.wetWells, newWetWell],
      }));
      setSelectedElement(newWetWell);

      try {
        const elev = await sampleWastewaterGroundElevation(lat, lng);
        if (elev !== null) {
          const roundedRim = Math.round(elev * 10) / 10;
          setNetwork((prev) => ({
            ...prev,
            wetWells: prev.wetWells.map((w) =>
              w.id === newId
                ? {
                    ...w,
                    rimElevation: roundedRim,
                    floorElevation: Math.round((roundedRim - 6.0) * 10) / 10,
                    minWaterLevelM: Math.round((roundedRim - 5.2) * 10) / 10,
                    maxWaterLevelM: Math.round((roundedRim - 3.5) * 10) / 10,
                    alarmLevelM: Math.round((roundedRim - 2.8) * 10) / 10,
                  }
                : w
            ),
          }));
        }
      } catch (err) {
        console.error('Error sampling wet well elevation:', err);
      }
    },
    [network]
  );

  const handleAddPump = useCallback(
    (startNodeId: string, endNodeId: string) => {
      const newId = `PMP-${network.pumps.length + 1}`;
      const newPump: WastewaterPump = {
        id: newId,
        label: `Sewage Pump ${newId}`,
        type: 'pump',
        startNodeId,
        endNodeId,
        status: 'ON',
        ratedDischargeLs: 45.0,
        dynamicHeadM: 18.0,
        efficiencyPercent: 75,
        powerKw: 10.6,
      };

      setNetwork((prev) => ({
        ...prev,
        pumps: [...prev.pumps, newPump],
      }));
      setSelectedElement(newPump);
    },
    [network]
  );

  const handleAddForceMain = useCallback(
    (startNodeId: string, endNodeId: string) => {
      const allNodes = [
        ...network.wetWells,
        ...network.outfalls,
        ...network.manholes,
      ];
      const start = allNodes.find((n) => n.id === startNodeId);
      const end = allNodes.find((n) => n.id === endNodeId);
      const length =
        start && end
          ? Math.max(5, calculateWastewaterDistanceM(start.lat, start.lng, end.lat, end.lng))
          : 150;

      const newId = `FM-${network.forceMains.length + 1}`;
      const newFm: WastewaterForceMain = {
        id: newId,
        label: `Force Main ${newId}`,
        type: 'force-main',
        startNodeId,
        endNodeId,
        diameterMm: 200,
        material: 'DI',
        lengthM: Math.round(length * 10) / 10,
        cFactor: 120,
      };

      setNetwork((prev) => ({
        ...prev,
        forceMains: [...prev.forceMains, newFm],
      }));
      setSelectedElement(newFm);
    },
    [network]
  );

  const handleAddOutfall = useCallback(
    async (lat: number, lng: number) => {
      const newId = `OUT-${network.outfalls.length + 1}`;
      const newOutfall: WastewaterOutfall = {
        id: newId,
        label: `Outfall ${newId}`,
        type: 'outfall',
        lat,
        lng,
        invertElevation: 168.0,
        receivingWaterElevation: 168.5,
      };

      setNetwork((prev) => ({
        ...prev,
        outfalls: [...prev.outfalls, newOutfall],
      }));
      setSelectedElement(newOutfall);

      try {
        const elev = await sampleWastewaterGroundElevation(lat, lng);
        if (elev !== null) {
          const inv = Math.round((elev - 1.0) * 10) / 10;
          setNetwork((prev) => ({
            ...prev,
            outfalls: prev.outfalls.map((o) =>
              o.id === newId
                ? {
                    ...o,
                    invertElevation: inv,
                    receivingWaterElevation: Math.round((inv + 0.5) * 10) / 10,
                  }
                : o
            ),
          }));
        }
      } catch (err) {
        console.error('Error sampling outfall elevation:', err);
      }
    },
    [network]
  );

  const handleUpdateElement = useCallback((updated: WastewaterNetworkElement) => {
    setNetwork((prev) => {
      if (updated.type === 'manhole') {
        return {
          ...prev,
          manholes: prev.manholes.map((m) => (m.id === updated.id ? (updated as WastewaterManhole) : m)),
        };
      }
      if (updated.type === 'conduit') {
        return {
          ...prev,
          conduits: prev.conduits.map((c) => (c.id === updated.id ? (updated as WastewaterConduit) : c)),
        };
      }
      if (updated.type === 'wet-well') {
        return {
          ...prev,
          wetWells: prev.wetWells.map((w) => (w.id === updated.id ? (updated as WastewaterWetWell) : w)),
        };
      }
      if (updated.type === 'pump') {
        return {
          ...prev,
          pumps: prev.pumps.map((p) => (p.id === updated.id ? (updated as WastewaterPump) : p)),
        };
      }
      if (updated.type === 'force-main') {
        return {
          ...prev,
          forceMains: prev.forceMains.map((f) => (f.id === updated.id ? (updated as WastewaterForceMain) : f)),
        };
      }
      if (updated.type === 'outfall') {
        return {
          ...prev,
          outfalls: prev.outfalls.map((o) => (o.id === updated.id ? (updated as WastewaterOutfall) : o)),
        };
      }
      return prev;
    });
    setSelectedElement(updated);
  }, []);

  const handleDeleteElement = useCallback(
    (id: string, type: WastewaterNetworkElement['type']) => {
      setNetwork((prev) => {
        if (type === 'manhole') {
          return {
            ...prev,
            manholes: prev.manholes.filter((m) => m.id !== id),
            conduits: prev.conduits.filter((c) => c.startNodeId !== id && c.endNodeId !== id),
          };
        }
        if (type === 'conduit') {
          return { ...prev, conduits: prev.conduits.filter((c) => c.id !== id) };
        }
        if (type === 'wet-well') {
          return {
            ...prev,
            wetWells: prev.wetWells.filter((w) => w.id !== id),
            conduits: prev.conduits.filter((c) => c.startNodeId !== id && c.endNodeId !== id),
            pumps: prev.pumps.filter((p) => p.startNodeId !== id && p.endNodeId !== id),
          };
        }
        if (type === 'pump') {
          return { ...prev, pumps: prev.pumps.filter((p) => p.id !== id) };
        }
        if (type === 'force-main') {
          return { ...prev, forceMains: prev.forceMains.filter((f) => f.id !== id) };
        }
        if (type === 'outfall') {
          return {
            ...prev,
            outfalls: prev.outfalls.filter((o) => o.id !== id),
            conduits: prev.conduits.filter((c) => c.startNodeId !== id && c.endNodeId !== id),
            forceMains: prev.forceMains.filter((f) => f.startNodeId !== id && f.endNodeId !== id),
          };
        }
        return prev;
      });

      if (selectedElement?.id === id) {
        setSelectedElement(null);
      }
    },
    [selectedElement]
  );

  // EPA SWMM / Sewer INP Export
  const handleExportInp = useCallback(() => {
    const text = exportToSwmmInp(network);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${network.name.replace(/\s+/g, '_')}.inp`;
    a.click();
    URL.revokeObjectURL(url);
  }, [network]);

  // EPA SWMM / Sewer INP Import
  const handleImportInp = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';

      try {
        const text = await file.text();
        const parsed = parseSwmmInp(text, file.name);
        setNetwork(parsed);
        const { updatedNetwork, summary } = simulateWastewaterNetwork(parsed);
        setNetwork(updatedNetwork);
        setSimulationSummary(summary);
      } catch (err) {
        console.error('Error importing SWMM INP file:', err);
      }
    },
    []
  );

  // Load Demo Model
  const handleLoadDemo = useCallback(() => {
    const demo = createMunicipalWastewaterNetwork();
    const { updatedNetwork, summary } = simulateWastewaterNetwork(demo);
    setNetwork(updatedNetwork);
    setSimulationSummary(summary);
    setProfileRouteNodeIds(['MH-1', 'MH-2', 'MH-3', 'MH-5', 'MH-6', 'WW-1', 'OUT-1']);
  }, []);

  // Clear Network
  const handleClear = useCallback(() => {
    setNetwork({
      name: 'New Wastewater Network',
      units: 'SI',
      manholes: [],
      conduits: [],
      wetWells: [],
      pumps: [],
      forceMains: [],
      outfalls: [],
    });
    setSelectedElement(null);
    setSimulationSummary(null);
  }, []);

  const elementCounts = {
    manholes: network.manholes.length,
    conduits: network.conduits.length,
    wetWells: network.wetWells.length,
    pumps: network.pumps.length,
    outfalls: network.outfalls.length,
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-[#0a0a0a] text-[#e5e7eb] overflow-hidden select-none relative">
      {/* 1. Wastewater Toolbar */}
      <WastewaterToolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        thematicDisplay={thematicDisplay}
        onSelectThematic={setThematicDisplay}
        onRunSimulation={handleRunSimulation}
        onSampleElevations={handleSampleAllElevations}
        onToggleFlexTables={() => setIsFlexTablesOpen((prev) => !prev)}
        onToggleProfile={() => setIsProfileOpen((prev) => !prev)}
        onExportExcel={handleExportExcel}
        onExportInp={handleExportInp}
        onImportInp={handleImportInp}
        onLoadDemo={handleLoadDemo}
        onClear={handleClear}
        simulationSummary={simulationSummary}
        isSimulating={isSimulating}
        isSamplingElevation={isSamplingElevation}
        isFlexTablesOpen={isFlexTablesOpen}
        isProfileOpen={isProfileOpen}
        elementCounts={elementCounts}
      />

      {/* 2. Middle Main Area: Map Viewport + Property Inspector */}
      <div className="flex-1 flex overflow-hidden relative">
        <WastewaterMapViewport
          network={network}
          activeTool={activeTool}
          thematicDisplay={thematicDisplay}
          selectedElement={selectedElement}
          onSelectElement={setSelectedElement}
          onAddManhole={handleAddManhole}
          onAddConduit={handleAddConduit}
          onAddWetWell={handleAddWetWell}
          onAddPump={handleAddPump}
          onAddForceMain={handleAddForceMain}
          onAddOutfall={handleAddOutfall}
          onDeleteElement={handleDeleteElement}
          onProfileRouteSelected={(nodes) => {
            setProfileRouteNodeIds(nodes);
            setIsProfileOpen(true);
          }}
        />

        {selectedElement && (
          <WastewaterPropertyInspector
            element={selectedElement}
            onClose={() => setSelectedElement(null)}
            onUpdateElement={handleUpdateElement}
            onDeleteElement={handleDeleteElement}
          />
        )}
      </div>

      {/* 3. Bottom Panels: FlexTables & Profile Viewer */}
      {isFlexTablesOpen && (
        <WastewaterFlexTables
          network={network}
          onUpdateElement={handleUpdateElement}
          onSelectElement={setSelectedElement}
          onDeleteElement={handleDeleteElement}
          onExportExcel={handleExportExcel}
          onClose={() => setIsFlexTablesOpen(false)}
        />
      )}

      {isProfileOpen && (
        <WastewaterProfileViewer
          network={network}
          selectedRouteNodeIds={profileRouteNodeIds}
          onClose={() => setIsProfileOpen(false)}
        />
      )}

      {/* 4. Calculation Results Summary Modal */}
      {isSummaryModalOpen && (
        <WastewaterSimulationResultsModal
          summary={simulationSummary}
          onClose={() => setIsSummaryModalOpen(false)}
          onExportExcel={handleExportExcel}
        />
      )}
    </div>
  );
};
