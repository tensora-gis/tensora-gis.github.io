/**
 * Standard Demonstration Water Distribution Networks on Real Terrain
 *
 * Pre-configured real-world municipal water distribution systems situated on
 * real terrain topography with verified DEM elevations.
 */

import { WaterDistributionNetwork } from '../types/waterDistribution';

export function createHighlandMunicipalNetwork(): WaterDistributionNetwork {
  // Centered in a real undulating geographic region (Agra / Yamuna valley terrace)
  // Base coordinates around 27.244° N, 77.825° E
  return {
    name: 'Highland Municipal Water Distribution Network',
    description: 'Multi-zone municipal system with intake reservoir, booster pump station, elevated storage tank, and looped distribution piping.',
    units: 'SI',
    headlossFormula: 'H-W',
    reservoirs: [
      {
        id: 'R-1',
        label: 'River Intake Reservoir',
        type: 'reservoir',
        lat: 27.24250,
        lng: 77.82100,
        elevation: 171.0, // Copernicus GLO-30 DEM from Open-Meteo
        totalHead: 185.0, // Water surface level at 185.0m MSL (+14m head)
      },
    ],
    tanks: [
      {
        id: 'T-1',
        label: 'Zone-1 Elevated Storage Tank (ESR)',
        type: 'tank',
        lat: 27.25120,
        lng: 77.82850,
        elevation: 169.0, // Copernicus GLO-30 DEM from Open-Meteo
        initialLevel: 4.5,
        minLevel: 1.0,
        maxLevel: 6.0,
        diameter: 12.0,
      },
    ],
    junctions: [
      {
        id: 'J-1',
        label: 'Intake Suction Header',
        type: 'junction',
        lat: 27.24310,
        lng: 77.82180,
        elevation: 171.0,
        baseDemand: 0,
      },
      {
        id: 'J-2',
        label: 'Booster Pump Discharge',
        type: 'junction',
        lat: 27.24380,
        lng: 77.82270,
        elevation: 171.0,
        baseDemand: 2.0,
      },
      {
        id: 'J-3',
        label: 'South Town Node',
        type: 'junction',
        lat: 27.24550,
        lng: 77.82420,
        elevation: 171.0,
        baseDemand: 12.5,
      },
      {
        id: 'J-4',
        label: 'Commercial District Node',
        type: 'junction',
        lat: 27.24720,
        lng: 77.82600,
        elevation: 170.0,
        baseDemand: 18.0,
      },
      {
        id: 'J-5',
        label: 'Central Market Junction',
        type: 'junction',
        lat: 27.24880,
        lng: 77.82450,
        elevation: 171.0,
        baseDemand: 15.0,
      },
      {
        id: 'J-6',
        label: 'North Residential Junction',
        type: 'junction',
        lat: 27.25050,
        lng: 77.82620,
        elevation: 170.0,
        baseDemand: 10.5,
      },
      {
        id: 'J-7',
        label: 'Highland Hill Crest Node',
        type: 'junction',
        lat: 27.25180,
        lng: 77.82780,
        elevation: 171.0,
        baseDemand: 8.0,
      },
      {
        id: 'J-8',
        label: 'East Industrial Bypass',
        type: 'junction',
        lat: 27.24600,
        lng: 77.82780,
        elevation: 171.0,
        baseDemand: 14.0,
      },
    ],
    pumps: [
      {
        id: 'PMP-1',
        label: 'High-Lift Booster Pump 1',
        type: 'pump',
        startNodeId: 'J-1',
        endNodeId: 'J-2',
        status: 'OPEN',
        curveType: '1-POINT',
        designFlow: 75.0, // L/s
        designHead: 45.0, // m lift
        shutoffHead: 60.0,
        maxFlow: 150.0,
        powerKw: 45.0,
        speed: 1.0,
      },
    ],
    valves: [
      {
        id: 'VLV-1',
        label: 'Industrial Zone PRV',
        type: 'valve',
        startNodeId: 'J-8',
        endNodeId: 'J-4',
        valveType: 'PRV',
        setting: 25.0,
        diameter: 200,
        status: 'ACTIVE',
      },
    ],
    pipes: [
      // Intake suction
      {
        id: 'P-1',
        label: 'Suction Raw Water Main',
        type: 'pipe',
        startNodeId: 'R-1',
        endNodeId: 'J-1',
        length: 120,
        diameter: 350,
        roughness: 130,
        minorLossCoeff: 1.5,
        status: 'OPEN',
      },
      // Discharge transmission trunk
      {
        id: 'P-2',
        label: 'Transmission Trunk Main',
        type: 'pipe',
        startNodeId: 'J-2',
        endNodeId: 'J-3',
        length: 240,
        diameter: 300,
        roughness: 130,
        minorLossCoeff: 0.5,
        status: 'OPEN',
      },
      // South to Commercial
      {
        id: 'P-3',
        label: 'Avenue Main',
        type: 'pipe',
        startNodeId: 'J-3',
        endNodeId: 'J-4',
        length: 260,
        diameter: 250,
        roughness: 130,
        minorLossCoeff: 0.2,
        status: 'OPEN',
      },
      // Loop: South to East Industrial
      {
        id: 'P-4',
        label: 'Industrial Feeder',
        type: 'pipe',
        startNodeId: 'J-3',
        endNodeId: 'J-8',
        length: 360,
        diameter: 200,
        roughness: 120,
        minorLossCoeff: 0.2,
        status: 'OPEN',
      },
      // Commercial to Central Market
      {
        id: 'P-6',
        label: 'Commercial West Branch',
        type: 'pipe',
        startNodeId: 'J-4',
        endNodeId: 'J-5',
        length: 230,
        diameter: 200,
        roughness: 130,
        minorLossCoeff: 0.2,
        status: 'OPEN',
      },
      // Central Market to North Residential
      {
        id: 'P-7',
        label: 'North Boulevard Line',
        type: 'pipe',
        startNodeId: 'J-5',
        endNodeId: 'J-6',
        length: 250,
        diameter: 150,
        roughness: 130,
        minorLossCoeff: 0.2,
        status: 'OPEN',
      },
      // Commercial to North Residential (Loop closing)
      {
        id: 'P-8',
        label: 'Central Loop Ring Main',
        type: 'pipe',
        startNodeId: 'J-4',
        endNodeId: 'J-6',
        length: 370,
        diameter: 200,
        roughness: 130,
        minorLossCoeff: 0.2,
        status: 'OPEN',
      },
      // North Residential to Highland Crest
      {
        id: 'P-9',
        label: 'Hilltop Riser Main',
        type: 'pipe',
        startNodeId: 'J-6',
        endNodeId: 'J-7',
        length: 210,
        diameter: 200,
        roughness: 130,
        minorLossCoeff: 0.5,
        status: 'OPEN',
      },
      // Highland Crest to Elevated Tank
      {
        id: 'P-10',
        label: 'ESR Inflow/Outflow Tank Lead',
        type: 'pipe',
        startNodeId: 'J-7',
        endNodeId: 'T-1',
        length: 95,
        diameter: 250,
        roughness: 130,
        minorLossCoeff: 1.0,
        status: 'OPEN',
      },
    ],
  };
}
