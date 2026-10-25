/**
 * Water Distribution Modelling Workspace (Real Ground Terrain Hydraulics)
 *
 * Provides a professional hydraulic network modeling environment
 * running on real-world global Digital Elevation Models (DEMs).
 *
 * Capabilities:
 * - Real terrain elevation auto-sampling via Copernicus GLO-30 / SRTM / Open-Meteo
 * - Interactive CAD network modeling (Junctions, Pipes, Reservoirs, Tanks, Pumps, Valves)
 * - EPANET-standard Global Gradient Algorithm (GGA) hydraulic simulation engine
 * - Hydraulic FlexTables tabular data editor with live inline modification & CSV export
 * - Longitudinal Hydraulic Grade Line (HGL) terrain profile viewer
 * - Thematic color-coding by Pressure (Nodes) and Velocity / Diameter / Flow (Pipes)
 * - Two-way EPANET standard (.inp) file import & export
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  ActiveTool,
  MapThematicDisplay,
  NetworkElement,
  SimulationSummary,
  WaterDistributionNetwork,
  WaterJunction,
  WaterPipe,
  WaterPump,
  WaterReservoir,
  WaterTank,
  WaterValve,
} from '../types/waterDistribution';
import { createHighlandMunicipalNetwork } from '../data/sampleWaterNetworks';
import { simulateWaterNetwork, applyWaterPipeOptimization } from '../utils/waterHydraulicsEngine';
import {
  sampleAllNetworkElevations,
  sampleGroundElevation,
  calculateGeodesicDistanceM,
} from '../utils/waterTerrainService';
import { exportToEpanetInp, parseEpanetInp } from '../utils/epanetParser';
import { downloadWaterHydraulicExcel } from '../utils/waterExcelExport';
import { WaterToolbar } from './water/WaterToolbar';
import { WaterMapViewport } from './water/WaterMapViewport';
import { WaterPropertyInspector } from './water/WaterPropertyInspector';
import { WaterFlexTables } from './water/WaterFlexTables';
import { WaterProfileViewer } from './water/WaterProfileViewer';
import { WaterSimulationResultsModal } from './water/WaterSimulationResultsModal';

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

export const WaterDistributionModelling: React.FC = () => {
  // Network Model State
  const [network, setNetwork] = useState<WaterDistributionNetwork>(() =>
    createHighlandMunicipalNetwork()
  );

  // Active Tool & Mode State
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [thematicDisplay, setThematicDisplay] = useState<MapThematicDisplay>('pressure');
  const [selectedElement, setSelectedElement] = useState<NetworkElement | null>(null);

  // UI Panels State
  const [isFlexTablesOpen, setIsFlexTablesOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);

  // Simulation State
  const [simulationSummary, setSimulationSummary] = useState<SimulationSummary | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSamplingElevation, setIsSamplingElevation] = useState(false);
  const [epsHour, setEpsHour] = useState<number>(12);

  // Profile Route Selection
  const [profileRouteNodeIds, setProfileRouteNodeIds] = useState<string[]>([
    'R-1',
    'J-1',
    'J-2',
    'J-3',
    'J-4',
    'J-6',
    'J-7',
    'T-1',
  ]);

  // Run initial simulation on demo network mount
  useEffect(() => {
    try {
      const { updatedNetwork, summary } = simulateWaterNetwork(network);
      setNetwork(updatedNetwork);
      setSimulationSummary(summary);
    } catch (err) {
      console.error('Initial water simulation error:', err);
    }
  }, []);

  // Compute Hydraulics & Update Network State
  const handleRunSimulation = useCallback(async () => {
    setIsSimulating(true);
    try {
      const { updatedNetwork, summary } = simulateWaterNetwork(network);
      setNetwork(updatedNetwork);
      setSimulationSummary(summary);
      setIsSummaryModalOpen(true);

      if (selectedElement) {
        const refreshed = [
          ...updatedNetwork.junctions,
          ...updatedNetwork.pipes,
          ...updatedNetwork.pumps,
          ...(updatedNetwork.valves || []),
          ...updatedNetwork.reservoirs,
          ...updatedNetwork.tanks,
        ].find((el) => el.id === selectedElement.id);
        if (refreshed) {
          setSelectedElement(refreshed);
        }
      }
    } catch (err) {
      console.error('Hydraulic simulation error:', err);
    } finally {
      setIsSimulating(false);
    }
  }, [network, selectedElement]);

  const handleExportExcel = useCallback(async () => {
    if (!simulationSummary) return;
    await downloadWaterHydraulicExcel(network, simulationSummary);
  }, [network, simulationSummary]);

  // Apply Darwin auto-designed pipe diameters to network
  const handleApplyAutoDesign = useCallback(() => {
    if (!simulationSummary?.autoDesignRecommendations?.length) return;
    const optimized = applyWaterPipeOptimization(
      network,
      simulationSummary.autoDesignRecommendations
    );
    const { updatedNetwork, summary } = simulateWaterNetwork(optimized);
    setNetwork(updatedNetwork);
    setSimulationSummary(summary);
    if (selectedElement) {
      const refreshed = [
        ...updatedNetwork.junctions,
        ...updatedNetwork.pipes,
        ...updatedNetwork.pumps,
        ...(updatedNetwork.valves || []),
        ...updatedNetwork.reservoirs,
        ...updatedNetwork.tanks,
      ].find((el) => el.id === selectedElement.id);
      if (refreshed) {
        setSelectedElement(refreshed);
      }
    }
  }, [network, simulationSummary, selectedElement]);

  // Bulk DEM Elevation Sampling
  const handleSampleAllElevations = useCallback(async () => {
    setIsSamplingElevation(true);
    try {
      const res = await sampleAllNetworkElevations(network);
      setNetwork(res.updatedNetwork);
      // Auto re-run simulation with fresh real terrain elevations
      const { updatedNetwork: simulated, summary } = simulateWaterNetwork(res.updatedNetwork);
      setNetwork(simulated);
      setSimulationSummary(summary);
    } catch (err) {
      console.error('DEM sampling error:', err);
    } finally {
      setIsSamplingElevation(false);
    }
  }, [network]);

  // Element CRUD Operations
  const handleAddJunction = useCallback(
    async (lat: number, lng: number) => {
      const newId = getNextId('J-', network.junctions.map((j) => j.id));
      const newJunction: WaterJunction = {
        id: newId,
        label: `Junction ${newId}`,
        type: 'junction',
        lat,
        lng,
        elevation: 170.0,
        baseDemand: 5.0,
      };

      // Add immediately with temporary elevation
      const updated = {
        ...network,
        junctions: [...network.junctions, newJunction],
      };
      setNetwork(updated);
      setSelectedElement(newJunction);

      // Asynchronously fetch real ground elevation from DEM
      try {
        const elev = await sampleGroundElevation(lat, lng);
        if (elev !== null) {
          setNetwork((prev) => ({
            ...prev,
            junctions: prev.junctions.map((j) =>
              j.id === newId ? { ...j, elevation: Math.round(elev * 10) / 10 } : j
            ),
          }));
        }
      } catch (err) {
        console.error('Failed to sample elevation for new junction:', err);
      }
    },
    [network]
  );

  const handleAddPipe = useCallback(
    (startNodeId: string, endNodeId: string) => {
      // Find start and end nodes to compute real geodesic ground distance
      const allNodes = [
        ...network.junctions,
        ...network.reservoirs,
        ...network.tanks,
      ];
      const start = allNodes.find((n) => n.id === startNodeId);
      const end = allNodes.find((n) => n.id === endNodeId);

      let length = 150;
      if (start && end) {
        length = calculateGeodesicDistanceM(start.lat, start.lng, end.lat, end.lng);
      }

      const newId = getNextId('P-', network.pipes.map((p) => p.id));
      const newPipe: WaterPipe = {
        id: newId,
        label: `Pipe ${newId}`,
        type: 'pipe',
        startNodeId,
        endNodeId,
        length: Math.max(10, length),
        diameter: 150,
        roughness: 130,
        minorLossCoeff: 0.2,
        status: 'OPEN',
      };

      setNetwork((prev) => ({
        ...prev,
        pipes: [...prev.pipes, newPipe],
      }));
      setSelectedElement(newPipe);
    },
    [network]
  );

  const handleAddReservoir = useCallback(
    async (lat: number, lng: number) => {
      const newId = getNextId('R-', network.reservoirs.map((r) => r.id));
      const newRes: WaterReservoir = {
        id: newId,
        label: `Reservoir ${newId}`,
        type: 'reservoir',
        lat,
        lng,
        elevation: 160.0,
        totalHead: 175.0,
      };

      setNetwork((prev) => ({
        ...prev,
        reservoirs: [...prev.reservoirs, newRes],
      }));
      setSelectedElement(newRes);

      try {
        const elev = await sampleGroundElevation(lat, lng);
        if (elev !== null) {
          const rounded = Math.round(elev * 10) / 10;
          setNetwork((prev) => ({
            ...prev,
            reservoirs: prev.reservoirs.map((r) =>
              r.id === newId
                ? { ...r, elevation: rounded, totalHead: Math.round((rounded + 15) * 10) / 10 }
                : r
            ),
          }));
        }
      } catch (err) {
        console.error('Error sampling reservoir elevation:', err);
      }
    },
    [network]
  );

  const handleAddTank = useCallback(
    async (lat: number, lng: number) => {
      const newId = getNextId('T-', network.tanks.map((t) => t.id));
      const newTank: WaterTank = {
        id: newId,
        label: `Tank ${newId}`,
        type: 'tank',
        lat,
        lng,
        elevation: 180.0,
        initialLevel: 4.0,
        minLevel: 1.0,
        maxLevel: 6.0,
        diameter: 10.0,
      };

      setNetwork((prev) => ({
        ...prev,
        tanks: [...prev.tanks, newTank],
      }));
      setSelectedElement(newTank);

      try {
        const elev = await sampleGroundElevation(lat, lng);
        if (elev !== null) {
          setNetwork((prev) => ({
            ...prev,
            tanks: prev.tanks.map((t) =>
              t.id === newId ? { ...t, elevation: Math.round(elev * 10) / 10 } : t
            ),
          }));
        }
      } catch (err) {
        console.error('Error sampling tank elevation:', err);
      }
    },
    [network]
  );

  const handleAddPump = useCallback(
    (startNodeId: string, endNodeId: string) => {
      const newId = getNextId('PMP-', network.pumps.map((p) => p.id));
      const newPump: WaterPump = {
        id: newId,
        label: `Booster Pump ${newId}`,
        type: 'pump',
        startNodeId,
        endNodeId,
        status: 'OPEN',
        curveType: '1-POINT',
        designFlow: 50.0,
        designHead: 40.0,
        shutoffHead: 53.0,
        maxFlow: 100.0,
        powerKw: 30.0,
        speed: 1.0,
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
      // Create suction junction and discharge junction ~85 meters apart to avoid overlapping
      const deltaLat = 0.00075;
      const inId = getNextId('J-', network.junctions.map((j) => j.id));
      const outId = getNextId('J-', [...network.junctions.map((j) => j.id), inId]);
      const pumpId = getNextId('PMP-', network.pumps.map((p) => p.id));

      const jIn: WaterJunction = {
        id: inId,
        label: `Suction ${inId}`,
        type: 'junction',
        lat: lat - deltaLat,
        lng,
        elevation: 170.0,
        baseDemand: 0,
      };

      const jOut: WaterJunction = {
        id: outId,
        label: `Discharge ${outId}`,
        type: 'junction',
        lat: lat + deltaLat,
        lng,
        elevation: 170.0,
        baseDemand: 10.0,
      };

      const newPump: WaterPump = {
        id: pumpId,
        label: `Booster Pump ${pumpId}`,
        type: 'pump',
        startNodeId: inId,
        endNodeId: outId,
        status: 'OPEN',
        curveType: '1-POINT',
        designFlow: 50.0,
        designHead: 40.0,
        shutoffHead: 53.0,
        maxFlow: 100.0,
        powerKw: 30.0,
        speed: 1.0,
      };

      setNetwork((prev) => ({
        ...prev,
        junctions: [...prev.junctions, jIn, jOut],
        pumps: [...prev.pumps, newPump],
      }));
      setSelectedElement(newPump);

      try {
        const elev = await sampleGroundElevation(lat, lng);
        if (elev !== null) {
          const rounded = Math.round(elev * 10) / 10;
          setNetwork((prev) => ({
            ...prev,
            junctions: prev.junctions.map((j) =>
              j.id === inId || j.id === outId ? { ...j, elevation: rounded } : j
            ),
          }));
        }
      } catch (err) {
        console.error('Error sampling ground elevation for pump station:', err);
      }
    },
    [network]
  );

  const handleAddValve = useCallback(
    (startNodeId: string, endNodeId: string) => {
      const newId = getNextId('VLV-', (network.valves || []).map((v) => v.id));
      const newValve: WaterValve = {
        id: newId,
        label: `PRV ${newId}`,
        type: 'valve',
        startNodeId,
        endNodeId,
        valveType: 'PRV',
        setting: 30.0,
        diameter: 150,
        status: 'ACTIVE',
      };

      setNetwork((prev) => ({
        ...prev,
        valves: [...(prev.valves || []), newValve],
      }));
      setSelectedElement(newValve);
    },
    [network]
  );

  const handleAddValveOnGround = useCallback(
    async (lat: number, lng: number) => {
      const deltaLat = 0.00075;
      const inId = getNextId('J-', network.junctions.map((j) => j.id));
      const outId = getNextId('J-', [...network.junctions.map((j) => j.id), inId]);
      const valveId = getNextId('VLV-', (network.valves || []).map((v) => v.id));

      const jIn: WaterJunction = {
        id: inId,
        label: `Inlet ${inId}`,
        type: 'junction',
        lat: lat - deltaLat,
        lng,
        elevation: 170.0,
        baseDemand: 0,
      };

      const jOut: WaterJunction = {
        id: outId,
        label: `Regulated ${outId}`,
        type: 'junction',
        lat: lat + deltaLat,
        lng,
        elevation: 170.0,
        baseDemand: 5.0,
      };

      const newValve: WaterValve = {
        id: valveId,
        label: `Pressure Reducing Valve ${valveId}`,
        type: 'valve',
        startNodeId: inId,
        endNodeId: outId,
        valveType: 'PRV',
        setting: 25.0,
        diameter: 150,
        status: 'ACTIVE',
      };

      setNetwork((prev) => ({
        ...prev,
        junctions: [...prev.junctions, jIn, jOut],
        valves: [...(prev.valves || []), newValve],
      }));
      setSelectedElement(newValve);

      try {
        const elev = await sampleGroundElevation(lat, lng);
        if (elev !== null) {
          const rounded = Math.round(elev * 10) / 10;
          setNetwork((prev) => ({
            ...prev,
            junctions: prev.junctions.map((j) =>
              j.id === inId || j.id === outId ? { ...j, elevation: rounded } : j
            ),
          }));
        }
      } catch (err) {
        console.error('Error sampling ground elevation for valve station:', err);
      }
    },
    [network]
  );

  const handleUpdateElement = useCallback((updated: NetworkElement) => {
    setNetwork((prev) => {
      let next = prev;
      if (updated.type === 'junction') {
        const uj = updated as WaterJunction;
        next = {
          ...prev,
          junctions: prev.junctions.map((j) => (j.id === updated.id ? uj : j)),
          pipes: prev.pipes.map((p) => {
            if (p.startNodeId === updated.id || p.endNodeId === updated.id) {
              const startCoords = p.startNodeId === updated.id ? uj : prev.junctions.find((j) => j.id === p.startNodeId) || prev.reservoirs.find((r) => r.id === p.startNodeId) || prev.tanks.find((t) => t.id === p.startNodeId);
              const endCoords = p.endNodeId === updated.id ? uj : prev.junctions.find((j) => j.id === p.endNodeId) || prev.reservoirs.find((r) => r.id === p.endNodeId) || prev.tanks.find((t) => t.id === p.endNodeId);
              if (startCoords && endCoords) {
                const newLen = Math.round(calculateGeodesicDistanceM(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng));
                return { ...p, length: Math.max(5, newLen) };
              }
            }
            return p;
          }),
        };
      } else if (updated.type === 'pipe') {
        next = {
          ...prev,
          pipes: prev.pipes.map((p) => (p.id === updated.id ? (updated as WaterPipe) : p)),
        };
      } else if (updated.type === 'pump') {
        next = {
          ...prev,
          pumps: prev.pumps.map((p) => (p.id === updated.id ? (updated as WaterPump) : p)),
        };
      } else if (updated.type === 'tank') {
        const ut = updated as WaterTank;
        next = {
          ...prev,
          tanks: prev.tanks.map((t) => (t.id === updated.id ? ut : t)),
          pipes: prev.pipes.map((p) => {
            if (p.startNodeId === updated.id || p.endNodeId === updated.id) {
              const startCoords = p.startNodeId === updated.id ? ut : prev.junctions.find((j) => j.id === p.startNodeId) || prev.reservoirs.find((r) => r.id === p.startNodeId) || prev.tanks.find((t) => t.id === p.startNodeId);
              const endCoords = p.endNodeId === updated.id ? ut : prev.junctions.find((j) => j.id === p.endNodeId) || prev.reservoirs.find((r) => r.id === p.endNodeId) || prev.tanks.find((t) => t.id === p.endNodeId);
              if (startCoords && endCoords) {
                const newLen = Math.round(calculateGeodesicDistanceM(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng));
                return { ...p, length: Math.max(5, newLen) };
              }
            }
            return p;
          }),
        };
      } else if (updated.type === 'reservoir') {
        const ur = updated as WaterReservoir;
        next = {
          ...prev,
          reservoirs: prev.reservoirs.map((r) => (r.id === updated.id ? ur : r)),
          pipes: prev.pipes.map((p) => {
            if (p.startNodeId === updated.id || p.endNodeId === updated.id) {
              const startCoords = p.startNodeId === updated.id ? ur : prev.junctions.find((j) => j.id === p.startNodeId) || prev.reservoirs.find((r) => r.id === p.startNodeId) || prev.tanks.find((t) => t.id === p.startNodeId);
              const endCoords = p.endNodeId === updated.id ? ur : prev.junctions.find((j) => j.id === p.endNodeId) || prev.reservoirs.find((r) => r.id === p.endNodeId) || prev.tanks.find((t) => t.id === p.endNodeId);
              if (startCoords && endCoords) {
                const newLen = Math.round(calculateGeodesicDistanceM(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng));
                return { ...p, length: Math.max(5, newLen) };
              }
            }
            return p;
          }),
        };
      } else if (updated.type === 'valve') {
        next = {
          ...prev,
          valves: (prev.valves || []).map((v) =>
            v.id === updated.id ? (updated as WaterValve) : v
          ),
        };
      }

      if (simulationSummary) {
        const { updatedNetwork, summary } = simulateWaterNetwork(next);
        queueMicrotask(() => {
          setSimulationSummary(summary);
          const updatedSelected = [
            ...updatedNetwork.junctions,
            ...updatedNetwork.pipes,
            ...updatedNetwork.pumps,
            ...(updatedNetwork.valves || []),
            ...updatedNetwork.reservoirs,
            ...updatedNetwork.tanks,
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
    (id: string, type: NetworkElement['type']) => {
      setNetwork((prev) => {
        let next: WaterDistributionNetwork = prev;
        if (type === 'junction') {
          next = {
            ...prev,
            junctions: prev.junctions.filter((j) => j.id !== id),
            pipes: prev.pipes.filter((p) => p.startNodeId !== id && p.endNodeId !== id),
            pumps: prev.pumps.filter((p) => p.startNodeId !== id && p.endNodeId !== id),
            valves: (prev.valves || []).filter((v) => v.startNodeId !== id && v.endNodeId !== id),
          };
        } else if (type === 'pipe') {
          next = { ...prev, pipes: prev.pipes.filter((p) => p.id !== id) };
        } else if (type === 'pump') {
          next = { ...prev, pumps: prev.pumps.filter((p) => p.id !== id) };
        } else if (type === 'valve') {
          next = { ...prev, valves: (prev.valves || []).filter((v) => v.id !== id) };
        } else if (type === 'tank') {
          next = {
            ...prev,
            tanks: prev.tanks.filter((t) => t.id !== id),
            pipes: prev.pipes.filter((p) => p.startNodeId !== id && p.endNodeId !== id),
            pumps: prev.pumps.filter((p) => p.startNodeId !== id && p.endNodeId !== id),
            valves: (prev.valves || []).filter((v) => v.startNodeId !== id && v.endNodeId !== id),
          };
        } else if (type === 'reservoir') {
          next = {
            ...prev,
            reservoirs: prev.reservoirs.filter((r) => r.id !== id),
            pipes: prev.pipes.filter((p) => p.startNodeId !== id && p.endNodeId !== id),
            pumps: prev.pumps.filter((p) => p.startNodeId !== id && p.endNodeId !== id),
            valves: (prev.valves || []).filter((v) => v.startNodeId !== id && v.endNodeId !== id),
          };
        }

        const totalNodes = next.junctions.length + next.reservoirs.length + next.tanks.length;
        if (totalNodes > 0 && simulationSummary) {
          const { updatedNetwork, summary } = simulateWaterNetwork(next);
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

  // EPANET INP Export
  const handleExportInp = useCallback(() => {
    const text = exportToEpanetInp(network);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${network.name.replace(/\s+/g, '_')}.inp`;
    a.click();
    URL.revokeObjectURL(url);
  }, [network]);

  // EPANET INP Import
  const handleImportInp = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';

      try {
        const text = await file.text();
        const parsed = parseEpanetInp(text, file.name);
        setNetwork(parsed);
        // Automatically compute simulation on imported model
        const { updatedNetwork, summary } = simulateWaterNetwork(parsed);
        setNetwork(updatedNetwork);
        setSimulationSummary(summary);
      } catch (err) {
        console.error('Error importing INP file:', err);
      }
    },
    []
  );

  // Load Demo Model
  const handleLoadDemo = useCallback(() => {
    const demo = createHighlandMunicipalNetwork();
    const { updatedNetwork, summary } = simulateWaterNetwork(demo);
    setNetwork(updatedNetwork);
    setSimulationSummary(summary);
    setProfileRouteNodeIds(['R-1', 'J-1', 'J-2', 'J-3', 'J-4', 'J-6', 'J-7', 'T-1']);
  }, []);

  // Clear Network
  const handleClear = useCallback(() => {
    setNetwork({
      name: 'New Distribution Network',
      units: 'SI',
      headlossFormula: 'H-W',
      junctions: [],
      reservoirs: [],
      tanks: [],
      pipes: [],
      pumps: [],
      valves: [],
    });
    setSelectedElement(null);
    setSimulationSummary(null);
    setProfileRouteNodeIds([]);
  }, []);

  const elementCounts = {
    junctions: network.junctions.length,
    pipes: network.pipes.length,
    tanks: network.tanks.length,
    reservoirs: network.reservoirs.length,
    pumps: network.pumps.length,
    valves: (network.valves || []).length,
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-[#0a0a0a] text-[#e5e7eb] overflow-hidden select-none relative">
      {/* 1. Network CAD Toolbar */}
      <WaterToolbar
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
        onOpenReport={() => setIsSummaryModalOpen(true)}
        onApplyAutoDesign={
          simulationSummary?.autoDesignRecommendations?.length
            ? handleApplyAutoDesign
            : undefined
        }
        epsHour={epsHour}
        onSelectEpsHour={setEpsHour}
        simulationSummary={simulationSummary}
        isSimulating={isSimulating}
        isSamplingElevation={isSamplingElevation}
        isFlexTablesOpen={isFlexTablesOpen}
        isProfileOpen={isProfileOpen}
        elementCounts={elementCounts}
      />

      {/* 2. Middle Main Area: Map Viewport + Property Inspector */}
      <div className="flex-1 flex overflow-hidden relative">
        <WaterMapViewport
          network={network}
          activeTool={activeTool}
          thematicDisplay={thematicDisplay}
          selectedElement={selectedElement}
          onSelectElement={setSelectedElement}
          onUpdateElement={handleUpdateElement}
          onAddJunction={handleAddJunction}
          onAddPipe={handleAddPipe}
          onAddReservoir={handleAddReservoir}
          onAddTank={handleAddTank}
          onAddPump={handleAddPump}
          onAddPumpOnGround={handleAddPumpOnGround}
          onAddValve={handleAddValve}
          onAddValveOnGround={handleAddValveOnGround}
          onDeleteElement={handleDeleteElement}
          onProfileRouteSelected={(nodes) => {
            setProfileRouteNodeIds(nodes);
            setIsProfileOpen(true);
          }}
        />

        {selectedElement && (
          <WaterPropertyInspector
            element={selectedElement}
            onClose={() => setSelectedElement(null)}
            onUpdateElement={handleUpdateElement}
            onDeleteElement={handleDeleteElement}
          />
        )}
      </div>

      {/* 3. Bottom Panels: FlexTables & Profile Viewer */}
      {isFlexTablesOpen && (
        <WaterFlexTables
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
        <WaterProfileViewer
          network={network}
          selectedRouteNodeIds={profileRouteNodeIds}
          onClose={() => setIsProfileOpen(false)}
        />
      )}

      {/* 4. Calculation Results Summary Modal */}
      {isSummaryModalOpen && (
        <WaterSimulationResultsModal
          network={network}
          summary={simulationSummary}
          onClose={() => setIsSummaryModalOpen(false)}
          onExportExcel={handleExportExcel}
          onExportInp={handleExportInp}
          onApplyAutoDesign={
            simulationSummary?.autoDesignRecommendations?.length
              ? handleApplyAutoDesign
              : undefined
          }
        />
      )}
    </div>
  );
};
