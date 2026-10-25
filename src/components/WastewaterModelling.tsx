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
import {
  createMunicipalWastewaterNetwork,
  ARBITRARY_WASTEWATER_DEMOS,
} from '../data/sampleWastewaterNetworks';
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

// Helper to generate guaranteed non-colliding sequential IDs even across delete/add operations
function getNextId(prefix: string, existingIds: string[]): string {
  let maxNum = 0;
  for (const id of existingIds) {
    if (id.startsWith(prefix)) {
      const numStr = id.slice(prefix.length);
      const n = parseInt(numStr, 10);
      if (!isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
  }
  return `${prefix}${maxNum + 1}`;
}

export const WastewaterModelling: React.FC = () => {
  // Demo Model Cycle Index
  const [demoIndex, setDemoIndex] = useState(0);

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

  // Compute Hydraulics & Update Network State
  const handleRunSimulation = useCallback(async () => {
    setIsSimulating(true);
    try {
      const { updatedNetwork, summary } = simulateWastewaterNetwork(network);
      setNetwork(updatedNetwork);
      setSimulationSummary(summary);
      setIsSummaryModalOpen(true);

      if (selectedElement) {
        const refreshed = [
          ...updatedNetwork.manholes,
          ...updatedNetwork.conduits,
          ...updatedNetwork.wetWells,
          ...updatedNetwork.pumps,
          ...updatedNetwork.forceMains,
          ...updatedNetwork.outfalls,
        ].find((el) => el.id === selectedElement.id);
        if (refreshed) {
          setSelectedElement(refreshed);
        }
      }
    } catch (err) {
      console.error('Wastewater simulation error:', err);
    } finally {
      setIsSimulating(false);
    }
  }, [network, selectedElement]);

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
      const newId = getNextId('MH-', network.manholes.map((m) => m.id));
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

      const newId = getNextId('CO-', network.conduits.map((c) => c.id));
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
      const newId = getNextId('WW-', network.wetWells.map((w) => w.id));
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
      const newId = getNextId('PMP-', network.pumps.map((p) => p.id));
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

  const handleAddPumpOnGround = useCallback(
    async (lat: number, lng: number) => {
      // Create wet well and discharge outfall ~95 meters apart to avoid overlapping
      const deltaLat = 0.00085;
      const wwId = getNextId('WW-', network.wetWells.map((w) => w.id));
      const outId = getNextId('OUT-', network.outfalls.map((o) => o.id));
      const pumpId = getNextId('PMP-', network.pumps.map((p) => p.id));
      const fmId = getNextId('FM-', network.forceMains.map((f) => f.id));

      const ww: WastewaterWetWell = {
        id: wwId,
        label: `Lift Station ${wwId}`,
        type: 'wet-well',
        lat: lat - deltaLat,
        lng,
        rimElevation: 171.0,
        floorElevation: 165.0,
        diameterM: 3.5,
        minWaterLevelM: 165.8,
        maxWaterLevelM: 167.5,
        alarmLevelM: 168.2,
        storageVolumeM3: 30.0,
      };

      const outfall: WastewaterOutfall = {
        id: outId,
        label: `Discharge Point ${outId}`,
        type: 'outfall',
        lat: lat + deltaLat,
        lng,
        invertElevation: 167.0,
        receivingWaterElevation: 167.5,
      };

      const newPump: WastewaterPump = {
        id: pumpId,
        label: `Sewage Pump ${pumpId}`,
        type: 'pump',
        startNodeId: wwId,
        endNodeId: outId,
        status: 'ON',
        ratedDischargeLs: 45.0,
        dynamicHeadM: 18.0,
        efficiencyPercent: 75,
        powerKw: 10.6,
      };

      const newFm: WastewaterForceMain = {
        id: fmId,
        label: `Force Main ${fmId}`,
        type: 'force-main',
        startNodeId: wwId,
        endNodeId: outId,
        diameterMm: 200,
        material: 'DI',
        lengthM: 35.0,
        cFactor: 120,
      };

      setNetwork((prev) => ({
        ...prev,
        wetWells: [...prev.wetWells, ww],
        outfalls: [...prev.outfalls, outfall],
        pumps: [...prev.pumps, newPump],
        forceMains: [...prev.forceMains, newFm],
      }));
      setSelectedElement(newPump);

      try {
        const elev = await sampleWastewaterGroundElevation(lat, lng);
        if (elev !== null) {
          const roundedRim = Math.round(elev * 10) / 10;
          setNetwork((prev) => ({
            ...prev,
            wetWells: prev.wetWells.map((w) =>
              w.id === wwId
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
            outfalls: prev.outfalls.map((o) =>
              o.id === outId
                ? {
                    ...o,
                    invertElevation: Math.round((roundedRim - 3.0) * 10) / 10,
                    receivingWaterElevation: Math.round((roundedRim - 2.5) * 10) / 10,
                  }
                : o
            ),
          }));
        }
      } catch (err) {
        console.error('Error sampling ground elevation for pump station:', err);
      }
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

      const newId = getNextId('FM-', network.forceMains.map((f) => f.id));
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
      const newId = getNextId('OUT-', network.outfalls.map((o) => o.id));
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
      let next = prev;
      if (updated.type === 'manhole') {
        const um = updated as WastewaterManhole;
        next = {
          ...prev,
          manholes: prev.manholes.map((m) => (m.id === updated.id ? um : m)),
          conduits: prev.conduits.map((c) => {
            if (c.startNodeId === updated.id || c.endNodeId === updated.id) {
              const startCoords = c.startNodeId === updated.id ? um : prev.manholes.find((m) => m.id === c.startNodeId) || prev.wetWells.find((w) => w.id === c.startNodeId) || prev.outfalls.find((o) => o.id === c.startNodeId);
              const endCoords = c.endNodeId === updated.id ? um : prev.manholes.find((m) => m.id === c.endNodeId) || prev.wetWells.find((w) => w.id === c.endNodeId) || prev.outfalls.find((o) => o.id === c.endNodeId);
              if (startCoords && endCoords) {
                const newLen = Math.round(calculateWastewaterDistanceM(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng) * 10) / 10;
                return { ...c, lengthM: Math.max(5, newLen) };
              }
            }
            return c;
          }),
          forceMains: prev.forceMains.map((f) => {
            if (f.startNodeId === updated.id || f.endNodeId === updated.id) {
              const startCoords = f.startNodeId === updated.id ? um : prev.manholes.find((m) => m.id === f.startNodeId) || prev.wetWells.find((w) => w.id === f.startNodeId) || prev.outfalls.find((o) => o.id === f.startNodeId);
              const endCoords = f.endNodeId === updated.id ? um : prev.manholes.find((m) => m.id === f.endNodeId) || prev.wetWells.find((w) => w.id === f.endNodeId) || prev.outfalls.find((o) => o.id === f.endNodeId);
              if (startCoords && endCoords) {
                const newLen = Math.round(calculateWastewaterDistanceM(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng) * 10) / 10;
                return { ...f, lengthM: Math.max(5, newLen) };
              }
            }
            return f;
          }),
        };
      } else if (updated.type === 'conduit') {
        next = {
          ...prev,
          conduits: prev.conduits.map((c) => (c.id === updated.id ? (updated as WastewaterConduit) : c)),
        };
      } else if (updated.type === 'wet-well') {
        const uw = updated as WastewaterWetWell;
        next = {
          ...prev,
          wetWells: prev.wetWells.map((w) => (w.id === updated.id ? uw : w)),
          conduits: prev.conduits.map((c) => {
            if (c.startNodeId === updated.id || c.endNodeId === updated.id) {
              const startCoords = c.startNodeId === updated.id ? uw : prev.manholes.find((m) => m.id === c.startNodeId) || prev.wetWells.find((w) => w.id === c.startNodeId) || prev.outfalls.find((o) => o.id === c.startNodeId);
              const endCoords = c.endNodeId === updated.id ? uw : prev.manholes.find((m) => m.id === c.endNodeId) || prev.wetWells.find((w) => w.id === c.endNodeId) || prev.outfalls.find((o) => o.id === c.endNodeId);
              if (startCoords && endCoords) {
                const newLen = Math.round(calculateWastewaterDistanceM(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng) * 10) / 10;
                return { ...c, lengthM: Math.max(5, newLen) };
              }
            }
            return c;
          }),
          forceMains: prev.forceMains.map((f) => {
            if (f.startNodeId === updated.id || f.endNodeId === updated.id) {
              const startCoords = f.startNodeId === updated.id ? uw : prev.manholes.find((m) => m.id === f.startNodeId) || prev.wetWells.find((w) => w.id === f.startNodeId) || prev.outfalls.find((o) => o.id === f.startNodeId);
              const endCoords = f.endNodeId === updated.id ? uw : prev.manholes.find((m) => m.id === f.endNodeId) || prev.wetWells.find((w) => w.id === f.endNodeId) || prev.outfalls.find((o) => o.id === f.endNodeId);
              if (startCoords && endCoords) {
                const newLen = Math.round(calculateWastewaterDistanceM(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng) * 10) / 10;
                return { ...f, lengthM: Math.max(5, newLen) };
              }
            }
            return f;
          }),
        };
      } else if (updated.type === 'pump') {
        next = {
          ...prev,
          pumps: prev.pumps.map((p) => (p.id === updated.id ? (updated as WastewaterPump) : p)),
        };
      } else if (updated.type === 'force-main') {
        next = {
          ...prev,
          forceMains: prev.forceMains.map((f) => (f.id === updated.id ? (updated as WastewaterForceMain) : f)),
        };
      } else if (updated.type === 'outfall') {
        const uo = updated as WastewaterOutfall;
        next = {
          ...prev,
          outfalls: prev.outfalls.map((o) => (o.id === updated.id ? uo : o)),
          conduits: prev.conduits.map((c) => {
            if (c.startNodeId === updated.id || c.endNodeId === updated.id) {
              const startCoords = c.startNodeId === updated.id ? uo : prev.manholes.find((m) => m.id === c.startNodeId) || prev.wetWells.find((w) => w.id === c.startNodeId) || prev.outfalls.find((o) => o.id === c.startNodeId);
              const endCoords = c.endNodeId === updated.id ? uo : prev.manholes.find((m) => m.id === c.endNodeId) || prev.wetWells.find((w) => w.id === c.endNodeId) || prev.outfalls.find((o) => o.id === c.endNodeId);
              if (startCoords && endCoords) {
                const newLen = Math.round(calculateWastewaterDistanceM(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng) * 10) / 10;
                return { ...c, lengthM: Math.max(5, newLen) };
              }
            }
            return c;
          }),
          forceMains: prev.forceMains.map((f) => {
            if (f.startNodeId === updated.id || f.endNodeId === updated.id) {
              const startCoords = f.startNodeId === updated.id ? uo : prev.manholes.find((m) => m.id === f.startNodeId) || prev.wetWells.find((w) => w.id === f.startNodeId) || prev.outfalls.find((o) => o.id === f.startNodeId);
              const endCoords = f.endNodeId === updated.id ? uo : prev.manholes.find((m) => m.id === f.endNodeId) || prev.wetWells.find((w) => w.id === f.endNodeId) || prev.outfalls.find((o) => o.id === f.endNodeId);
              if (startCoords && endCoords) {
                const newLen = Math.round(calculateWastewaterDistanceM(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng) * 10) / 10;
                return { ...f, lengthM: Math.max(5, newLen) };
              }
            }
            return f;
          }),
        };
      }

      if (simulationSummary) {
        const { updatedNetwork, summary } = simulateWastewaterNetwork(next);
        queueMicrotask(() => {
          setSimulationSummary(summary);
          const updatedSelected = [
            ...updatedNetwork.manholes,
            ...updatedNetwork.conduits,
            ...updatedNetwork.wetWells,
            ...updatedNetwork.pumps,
            ...updatedNetwork.forceMains,
            ...updatedNetwork.outfalls,
          ].find((el) => el.id === updated.id);
          if (updatedSelected) {
            setSelectedElement(updatedSelected);
          }
        });
        return updatedNetwork;
      }

      return next;
    });

    if (!simulationSummary) {
      setSelectedElement(updated);
    }
  }, [simulationSummary]);

  const handleDeleteElement = useCallback(
    (id: string, type: WastewaterNetworkElement['type']) => {
      setNetwork((prev) => {
        let next: WastewaterNetwork = prev;
        if (type === 'manhole') {
          next = {
            ...prev,
            manholes: prev.manholes.filter((m) => m.id !== id),
            conduits: prev.conduits.filter((c) => c.startNodeId !== id && c.endNodeId !== id),
            pumps: prev.pumps.filter((p) => p.startNodeId !== id && p.endNodeId !== id),
            forceMains: prev.forceMains.filter((f) => f.startNodeId !== id && f.endNodeId !== id),
          };
        } else if (type === 'conduit') {
          next = { ...prev, conduits: prev.conduits.filter((c) => c.id !== id) };
        } else if (type === 'wet-well') {
          next = {
            ...prev,
            wetWells: prev.wetWells.filter((w) => w.id !== id),
            conduits: prev.conduits.filter((c) => c.startNodeId !== id && c.endNodeId !== id),
            pumps: prev.pumps.filter((p) => p.startNodeId !== id && p.endNodeId !== id),
            forceMains: prev.forceMains.filter((f) => f.startNodeId !== id && f.endNodeId !== id),
          };
        } else if (type === 'pump') {
          next = { ...prev, pumps: prev.pumps.filter((p) => p.id !== id) };
        } else if (type === 'force-main') {
          next = { ...prev, forceMains: prev.forceMains.filter((f) => f.id !== id) };
        } else if (type === 'outfall') {
          next = {
            ...prev,
            outfalls: prev.outfalls.filter((o) => o.id !== id),
            conduits: prev.conduits.filter((c) => c.startNodeId !== id && c.endNodeId !== id),
            pumps: prev.pumps.filter((p) => p.startNodeId !== id && p.endNodeId !== id),
            forceMains: prev.forceMains.filter((f) => f.startNodeId !== id && f.endNodeId !== id),
          };
        }

        const totalNodes = next.manholes.length + next.wetWells.length + next.outfalls.length;
        if (totalNodes > 0 && simulationSummary) {
          const { updatedNetwork, summary } = simulateWastewaterNetwork(next);
          queueMicrotask(() => {
            setSimulationSummary(summary);
          });
          return updatedNetwork;
        } else if (totalNodes === 0) {
          queueMicrotask(() => {
            setSimulationSummary(null);
          });
        }
        return next;
      });

      setProfileRouteNodeIds((prev) => prev.filter((nodeId) => nodeId !== id));

      if (selectedElement?.id === id) {
        setSelectedElement(null);
      }
    },
    [selectedElement, simulationSummary]
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
        setSelectedElement(null);
        setProfileRouteNodeIds([]);
      } catch (err) {
        console.error('Error importing SWMM INP file:', err);
      }
    },
    []
  );

  // Load Arbitrary Demo Model (Cycles through 4 engineering configurations)
  const handleLoadDemo = useCallback(() => {
    const demoDef = ARBITRARY_WASTEWATER_DEMOS[demoIndex % ARBITRARY_WASTEWATER_DEMOS.length];
    setDemoIndex((prev) => prev + 1);
    const demo = demoDef.createNetwork();
    const { updatedNetwork, summary } = simulateWastewaterNetwork(demo);
    setNetwork(updatedNetwork);
    setSimulationSummary(summary);
    setProfileRouteNodeIds(demoDef.defaultProfileRoute);
    setSelectedElement(null);
  }, [demoIndex]);

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
    setProfileRouteNodeIds([]);
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
        demoIndex={demoIndex}
        elementCounts={elementCounts}
      />

      {/* 2. Middle Main Area: Map Viewport + Property Inspector */}
      <div className="flex-1 flex overflow-hidden relative">
        <WastewaterMapViewport
          network={network}
          summary={simulationSummary}
          activeTool={activeTool}
          thematicDisplay={thematicDisplay}
          selectedElement={selectedElement}
          onSelectElement={setSelectedElement}
          onUpdateElement={handleUpdateElement}
          onAddManhole={handleAddManhole}
          onAddConduit={handleAddConduit}
          onAddWetWell={handleAddWetWell}
          onAddPump={handleAddPump}
          onAddPumpOnGround={handleAddPumpOnGround}
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
            summary={simulationSummary}
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
          summary={simulationSummary}
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
