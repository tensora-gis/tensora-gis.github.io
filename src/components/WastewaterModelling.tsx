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

  // Element CRUD Operations
  const handleAddManhole = useCallback(
    async (lat: number, lng: number): Promise<string> => {
      // Find highest existing numeric ID to avoid duplicate keys
      const maxNum = Math.max(
        0,
        ...network.manholes.map((m) => {
          const match = m.id.match(/\d+/);
          return match ? parseInt(match[0], 10) : 0;
        })
      );
      const newId = `MH-${maxNum + 1}`;
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
      const { updatedNetwork: simulated, summary } = simulateWastewaterNetwork(updated);
      setNetwork(simulated);
      setSimulationSummary(summary);
      setSelectedElement(newManhole);

      // Asynchronously fetch real ground elevation from Open-Meteo / Copernicus DEM
      try {
        const elev = await sampleWastewaterGroundElevation(lat, lng);
        if (elev !== null) {
          const roundedRim = Math.round(elev * 10) / 10;
          setNetwork((prev) => {
            const nextNet = {
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
            };
            const { updatedNetwork: simUpdated, summary: simSum } = simulateWastewaterNetwork(nextNet);
            setSimulationSummary(simSum);
            return simUpdated;
          });
        }
      } catch (err) {
        console.error('Failed to sample elevation for new manhole:', err);
      }

      return newId;
    },
    [network]
  );

  const handleAddConduit = useCallback(
    (startNodeId: string, endNodeId: string): string | null => {
      if (!startNodeId || !endNodeId || startNodeId === endNodeId) {
        return null;
      }

      // Check if conduit already exists in either direction
      const existing = network.conduits.find(
        (c) =>
          (c.startNodeId === startNodeId && c.endNodeId === endNodeId) ||
          (c.startNodeId === endNodeId && c.endNodeId === startNodeId)
      );
      if (existing) {
        setSelectedElement(existing);
        return existing.id;
      }

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

      const maxNum = Math.max(
        0,
        ...network.conduits.map((c) => {
          const match = c.id.match(/\d+/);
          return match ? parseInt(match[0], 10) : 0;
        })
      );
      const newId = `CO-${maxNum + 1}`;

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

      const nextNet: WastewaterNetwork = {
        ...network,
        conduits: [...network.conduits, newConduit],
      };
      const { updatedNetwork: simulated, summary } = simulateWastewaterNetwork(nextNet);
      setNetwork(simulated);
      setSimulationSummary(summary);
      setSelectedElement(newConduit);
      return newId;
    },
    [network]
  );

  // Continuous pipe alignment layout: creates new manhole and connects conduit to it in one action
  const handleAddManholeAndConnect = useCallback(
    async (fromNodeId: string, lat: number, lng: number): Promise<string> => {
      // 1. Create new manhole
      const maxMhNum = Math.max(
        0,
        ...network.manholes.map((m) => {
          const match = m.id.match(/\d+/);
          return match ? parseInt(match[0], 10) : 0;
        })
      );
      const newMhId = `MH-${maxMhNum + 1}`;
      const defaultDepth = 2.5;

      // Find fromNode to inherit baseline ground level
      const allNodes = [...network.manholes, ...network.wetWells, ...network.outfalls];
      const fromNode = allNodes.find((n) => n.id === fromNodeId);
      const baseRim = fromNode && 'rimElevation' in fromNode ? fromNode.rimElevation : 171.0;

      const newManhole: WastewaterManhole = {
        id: newMhId,
        label: `Manhole ${newMhId}`,
        type: 'manhole',
        lat,
        lng,
        rimElevation: baseRim,
        invertElevation: baseRim - defaultDepth,
        depth: defaultDepth,
        diameterMm: 1000,
        population: 600,
        unitLoadingLpcd: 135,
        peakingFormula: 'harmon',
        baseDryWeatherFlowLs: 0.4,
        inflowInfiltrationLs: 0.4,
      };

      // 2. Calculate conduit distance and slope
      const length = fromNode
        ? Math.max(5, calculateWastewaterDistanceM(fromNode.lat, fromNode.lng, lat, lng))
        : 50;

      const upInv = fromNode && 'invertElevation' in fromNode ? fromNode.invertElevation : baseRim - defaultDepth;
      // Provide positive gravity slope (~0.3% - 0.5% grade)
      const targetDrop = Math.max(0.05, length * 0.004);
      const dnInv = Math.round((upInv - targetDrop) * 100) / 100;
      newManhole.invertElevation = dnInv;
      newManhole.depth = Math.round((newManhole.rimElevation - dnInv) * 10) / 10;

      const maxCoNum = Math.max(
        0,
        ...network.conduits.map((c) => {
          const match = c.id.match(/\d+/);
          return match ? parseInt(match[0], 10) : 0;
        })
      );
      const newCoId = `CO-${maxCoNum + 1}`;

      const newConduit: WastewaterConduit = {
        id: newCoId,
        label: `Conduit ${newCoId}`,
        type: 'conduit',
        startNodeId: fromNodeId,
        endNodeId: newMhId,
        diameterMm: 250,
        material: 'PVC',
        manningN: 0.010,
        upstreamInvertM: upInv,
        downstreamInvertM: dnInv,
        lengthM: Math.round(length * 10) / 10,
        slopeMPerM: Math.round(((upInv - dnInv) / length) * 10000) / 10000,
      };

      const nextNet: WastewaterNetwork = {
        ...network,
        manholes: [...network.manholes, newManhole],
        conduits: [...network.conduits, newConduit],
      };

      const { updatedNetwork: simulated, summary } = simulateWastewaterNetwork(nextNet);
      setNetwork(simulated);
      setSimulationSummary(summary);
      setSelectedElement(newManhole);

      // Async DEM elevation sampling for the newly placed manhole
      try {
        const elev = await sampleWastewaterGroundElevation(lat, lng);
        if (elev !== null) {
          const roundedRim = Math.round(elev * 10) / 10;
          setNetwork((prev) => {
            const nextManholes = prev.manholes.map((m) =>
              m.id === newMhId
                ? {
                    ...m,
                    rimElevation: roundedRim,
                    invertElevation: Math.round((roundedRim - m.depth) * 10) / 10,
                  }
                : m
            );
            const updatedM = nextManholes.find((m) => m.id === newMhId);
            const nextConduits = prev.conduits.map((c) => {
              if (c.id === newCoId && updatedM) {
                const slope = Math.round(((c.upstreamInvertM - updatedM.invertElevation) / Math.max(1, c.lengthM)) * 10000) / 10000;
                return { ...c, downstreamInvertM: updatedM.invertElevation, slopeMPerM: slope };
              }
              return c;
            });

            const updatedAll = {
              ...prev,
              manholes: nextManholes,
              conduits: nextConduits,
            };
            const { updatedNetwork: simUpdated, summary: simSum } = simulateWastewaterNetwork(updatedAll);
            setSimulationSummary(simSum);
            return simUpdated;
          });
        }
      } catch (err) {
        console.error('Failed to sample elevation during layout:', err);
      }

      return newMhId;
    },
    [network]
  );

  // Moving a node on map updates connected pipe lengths, slopes and recalculates hydraulics
  const handleMoveNode = useCallback(
    (id: string, lat: number, lng: number) => {
      setNetwork((prev) => {
        const nextManholes = prev.manholes.map((m) => (m.id === id ? { ...m, lat, lng } : m));
        const nextWetWells = prev.wetWells.map((w) => (w.id === id ? { ...w, lat, lng } : w));
        const nextOutfalls = prev.outfalls.map((o) => (o.id === id ? { ...o, lat, lng } : o));

        const coords = new Map<string, { lat: number; lng: number }>();
        nextManholes.forEach((m) => coords.set(m.id, { lat: m.lat, lng: m.lng }));
        nextWetWells.forEach((w) => coords.set(w.id, { lat: w.lat, lng: w.lng }));
        nextOutfalls.forEach((o) => coords.set(o.id, { lat: o.lat, lng: o.lng }));

        const nextConduits = prev.conduits.map((c) => {
          if (c.startNodeId === id || c.endNodeId === id) {
            const s = coords.get(c.startNodeId);
            const e = coords.get(c.endNodeId);
            if (s && e) {
              const lengthM = Math.max(5, calculateWastewaterDistanceM(s.lat, s.lng, e.lat, e.lng));
              const slope = Math.round(((c.upstreamInvertM - c.downstreamInvertM) / lengthM) * 10000) / 10000;
              return { ...c, lengthM: Math.round(lengthM * 10) / 10, slopeMPerM: slope };
            }
          }
          return c;
        });

        const nextForceMains = prev.forceMains.map((f) => {
          if (f.startNodeId === id || f.endNodeId === id) {
            const s = coords.get(f.startNodeId);
            const e = coords.get(f.endNodeId);
            if (s && e) {
              const lengthM = Math.max(5, calculateWastewaterDistanceM(s.lat, s.lng, e.lat, e.lng));
              return { ...f, lengthM: Math.round(lengthM * 10) / 10 };
            }
          }
          return f;
        });

        const nextNet: WastewaterNetwork = {
          ...prev,
          manholes: nextManholes,
          wetWells: nextWetWells,
          outfalls: nextOutfalls,
          conduits: nextConduits,
          forceMains: nextForceMains,
        };

        const { updatedNetwork: simulated, summary } = simulateWastewaterNetwork(nextNet);
        setSimulationSummary(summary);
        return simulated;
      });

      // Sample real Earth DEM at new location in background
      sampleWastewaterGroundElevation(lat, lng)
        .then((elev) => {
          if (elev !== null) {
            const roundedRim = Math.round(elev * 10) / 10;
            setNetwork((prev) => {
              const nextMhs = prev.manholes.map((m) =>
                m.id === id
                  ? {
                      ...m,
                      rimElevation: roundedRim,
                      invertElevation: Math.round((roundedRim - m.depth) * 10) / 10,
                    }
                  : m
              );
              const nextNet = { ...prev, manholes: nextMhs };
              const { updatedNetwork: simulated, summary } = simulateWastewaterNetwork(nextNet);
              setSimulationSummary(summary);
              return simulated;
            });
          }
        })
        .catch(() => {});
    },
    []
  );

  const handleAddWetWell = useCallback(
    async (lat: number, lng: number) => {
      const maxNum = Math.max(
        0,
        ...network.wetWells.map((w) => {
          const match = w.id.match(/\d+/);
          return match ? parseInt(match[0], 10) : 0;
        })
      );
      const newId = `WW-${maxNum + 1}`;
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
      if (!startNodeId || !endNodeId || startNodeId === endNodeId) return;

      const maxNum = Math.max(
        0,
        ...network.pumps.map((p) => {
          const match = p.id.match(/\d+/);
          return match ? parseInt(match[0], 10) : 0;
        })
      );
      const newId = `PMP-${maxNum + 1}`;
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

      const nextNet = {
        ...network,
        pumps: [...network.pumps, newPump],
      };
      const { updatedNetwork: simulated, summary } = simulateWastewaterNetwork(nextNet);
      setNetwork(simulated);
      setSimulationSummary(summary);
      setSelectedElement(newPump);
    },
    [network]
  );

  const handleAddForceMain = useCallback(
    (startNodeId: string, endNodeId: string) => {
      if (!startNodeId || !endNodeId || startNodeId === endNodeId) return;

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

      const maxNum = Math.max(
        0,
        ...network.forceMains.map((f) => {
          const match = f.id.match(/\d+/);
          return match ? parseInt(match[0], 10) : 0;
        })
      );
      const newId = `FM-${maxNum + 1}`;
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

      const nextNet = {
        ...network,
        forceMains: [...network.forceMains, newFm],
      };
      const { updatedNetwork: simulated, summary } = simulateWastewaterNetwork(nextNet);
      setNetwork(simulated);
      setSimulationSummary(summary);
      setSelectedElement(newFm);
    },
    [network]
  );

  const handleAddOutfall = useCallback(
    async (lat: number, lng: number) => {
      const maxNum = Math.max(
        0,
        ...network.outfalls.map((o) => {
          const match = o.id.match(/\d+/);
          return match ? parseInt(match[0], 10) : 0;
        })
      );
      const newId = `OUT-${maxNum + 1}`;
      const newOutfall: WastewaterOutfall = {
        id: newId,
        label: `Outfall ${newId}`,
        type: 'outfall',
        lat,
        lng,
        invertElevation: 168.0,
        receivingWaterElevation: 168.5,
      };

      const nextNet = {
        ...network,
        outfalls: [...network.outfalls, newOutfall],
      };
      const { updatedNetwork: simulated, summary } = simulateWastewaterNetwork(nextNet);
      setNetwork(simulated);
      setSimulationSummary(summary);
      setSelectedElement(newOutfall);

      try {
        const elev = await sampleWastewaterGroundElevation(lat, lng);
        if (elev !== null) {
          const inv = Math.round((elev - 1.0) * 10) / 10;
          setNetwork((prev) => {
            const updated = {
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
            };
            const { updatedNetwork: simUpdated, summary: simSum } = simulateWastewaterNetwork(updated);
            setSimulationSummary(simSum);
            return simUpdated;
          });
        }
      } catch (err) {
        console.error('Error sampling outfall elevation:', err);
      }
    },
    [network]
  );

  const handleUpdateElement = useCallback((updated: WastewaterNetworkElement) => {
    setNetwork((prev) => {
      let nextManholes = prev.manholes;
      let nextConduits = prev.conduits;
      let nextWetWells = prev.wetWells;
      let nextPumps = prev.pumps;
      let nextForceMains = prev.forceMains;
      let nextOutfalls = prev.outfalls;

      if (updated.type === 'manhole') {
        const m = updated as WastewaterManhole;
        nextManholes = prev.manholes.map((old) => (old.id === m.id ? m : old));
        // Sync inverts with connected conduits if invert changed
        nextConduits = prev.conduits.map((c) => {
          if (c.startNodeId === m.id) {
            const slope = Math.round(((m.invertElevation - c.downstreamInvertM) / Math.max(1, c.lengthM)) * 10000) / 10000;
            return { ...c, upstreamInvertM: m.invertElevation, slopeMPerM: slope };
          }
          if (c.endNodeId === m.id) {
            const slope = Math.round(((c.upstreamInvertM - m.invertElevation) / Math.max(1, c.lengthM)) * 10000) / 10000;
            return { ...c, downstreamInvertM: m.invertElevation, slopeMPerM: slope };
          }
          return c;
        });
      } else if (updated.type === 'conduit') {
        nextConduits = prev.conduits.map((c) => (c.id === updated.id ? (updated as WastewaterConduit) : c));
      } else if (updated.type === 'wet-well') {
        nextWetWells = prev.wetWells.map((w) => (w.id === updated.id ? (updated as WastewaterWetWell) : w));
      } else if (updated.type === 'pump') {
        nextPumps = prev.pumps.map((p) => (p.id === updated.id ? (updated as WastewaterPump) : p));
      } else if (updated.type === 'force-main') {
        nextForceMains = prev.forceMains.map((f) => (f.id === updated.id ? (updated as WastewaterForceMain) : f));
      } else if (updated.type === 'outfall') {
        nextOutfalls = prev.outfalls.map((o) => (o.id === updated.id ? (updated as WastewaterOutfall) : o));
      }

      const nextNet: WastewaterNetwork = {
        ...prev,
        manholes: nextManholes,
        conduits: nextConduits,
        wetWells: nextWetWells,
        pumps: nextPumps,
        forceMains: nextForceMains,
        outfalls: nextOutfalls,
      };

      const { updatedNetwork: simulated, summary } = simulateWastewaterNetwork(nextNet);
      setSimulationSummary(summary);

      // Keep selected element fresh with computed values
      const freshElem =
        simulated.manholes.find((el) => el.id === updated.id) ||
        simulated.conduits.find((el) => el.id === updated.id) ||
        simulated.wetWells.find((el) => el.id === updated.id) ||
        simulated.pumps.find((el) => el.id === updated.id) ||
        simulated.forceMains.find((el) => el.id === updated.id) ||
        simulated.outfalls.find((el) => el.id === updated.id) ||
        updated;
      setSelectedElement(freshElem);

      return simulated;
    });
  }, []);

  const handleDeleteElement = useCallback(
    (id: string, type: WastewaterNetworkElement['type']) => {
      setNetwork((prev) => {
        let cleaned: WastewaterNetwork;
        if (type === 'manhole') {
          cleaned = {
            ...prev,
            manholes: prev.manholes.filter((m) => m.id !== id),
            conduits: prev.conduits.filter((c) => c.startNodeId !== id && c.endNodeId !== id),
          };
        } else if (type === 'conduit') {
          cleaned = { ...prev, conduits: prev.conduits.filter((c) => c.id !== id) };
        } else if (type === 'wet-well') {
          cleaned = {
            ...prev,
            wetWells: prev.wetWells.filter((w) => w.id !== id),
            conduits: prev.conduits.filter((c) => c.startNodeId !== id && c.endNodeId !== id),
            pumps: prev.pumps.filter((p) => p.startNodeId !== id && p.endNodeId !== id),
          };
        } else if (type === 'pump') {
          cleaned = { ...prev, pumps: prev.pumps.filter((p) => p.id !== id) };
        } else if (type === 'force-main') {
          cleaned = { ...prev, forceMains: prev.forceMains.filter((f) => f.id !== id) };
        } else if (type === 'outfall') {
          cleaned = {
            ...prev,
            outfalls: prev.outfalls.filter((o) => o.id !== id),
            conduits: prev.conduits.filter((c) => c.startNodeId !== id && c.endNodeId !== id),
            forceMains: prev.forceMains.filter((f) => f.startNodeId !== id && f.endNodeId !== id),
          };
        } else {
          cleaned = prev;
        }

        const { updatedNetwork: simulated, summary } = simulateWastewaterNetwork(cleaned);
        setSimulationSummary(summary);
        return simulated;
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
          onSelectTool={setActiveTool}
          onSelectElement={setSelectedElement}
          onAddManhole={handleAddManhole}
          onAddConduit={handleAddConduit}
          onAddManholeAndConnect={handleAddManholeAndConnect}
          onMoveNode={handleMoveNode}
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
