/**
 * EPA SWMM & Sewer .INP File Parser and Exporter
 *
 * Implements two-way compatibility with standard EPA SWMM 5.2 and modern
 * wastewater engineering sewer network models.
 */

import {
  WastewaterNetwork,
  WastewaterManhole,
  WastewaterConduit,
  WastewaterWetWell,
  WastewaterPump,
  WastewaterForceMain,
  WastewaterOutfall,
} from '../types/wastewater';

/**
 * Serializes a WastewaterNetwork into standard EPA SWMM .INP text.
 */
export function exportToSwmmInp(network: WastewaterNetwork): string {
  const lines: string[] = [];

  lines.push('[TITLE]');
  lines.push(`;;Project: ${network.name}`);
  lines.push(`;;Description: Real Earth DEM Referenced Wastewater Collection Network`);
  lines.push('');

  lines.push('[OPTIONS]');
  lines.push('FLOW_UNITS           LPS');
  lines.push('INFILTRATION         CURVE_NUMBER');
  lines.push(`FLOW_ROUTING         ${network.routingMethod || 'DYNAMICWAVE'}`);
  lines.push('START_DATE           01/01/2026');
  lines.push('START_TIME           00:00:00');
  lines.push('REPORT_START_DATE    01/01/2026');
  lines.push('REPORT_START_TIME    00:00:00');
  lines.push('END_DATE             01/02/2026');
  lines.push('END_TIME             00:00:00');
  lines.push('WET_STEP             00:05:00');
  lines.push('DRY_STEP             01:00:00');
  lines.push('ROUTING_STEP         00:00:15');
  lines.push('');

  // 1. Manholes as Junctions
  lines.push('[JUNCTIONS]');
  lines.push(';;Name           Elevation  MaxDepth   InitDepth  SurDepth   Aponded   ');
  for (const m of network.manholes) {
    const id = m.id.padEnd(16);
    const inv = m.invertElevation.toFixed(2).padStart(10);
    const maxD = m.depth.toFixed(2).padStart(10);
    lines.push(`${id} ${inv} ${maxD} 0.0        0.0        0.0        ; ${m.label}`);
  }
  lines.push('');

  // 2. Outfalls
  lines.push('[OUTFALLS]');
  lines.push(';;Name           Elevation  Type       Stage Data       Gated    Route To');
  for (const o of network.outfalls) {
    const id = o.id.padEnd(16);
    const inv = o.invertElevation.toFixed(2).padStart(10);
    lines.push(`${id} ${inv} FREE                        NO       ; ${o.label}`);
  }
  lines.push('');

  // 3. Storage Units (Wet Wells)
  lines.push('[STORAGE]');
  lines.push(';;Name           Elevation  MaxDepth   InitDepth  Shape      Curve Name/Params');
  for (const w of network.wetWells) {
    const id = w.id.padEnd(16);
    const inv = w.floorElevation.toFixed(2).padStart(10);
    const depth = (w.rimElevation - w.floorElevation).toFixed(2).padStart(10);
    lines.push(`${id} ${inv} ${depth} 1.0        FUNCTIONAL 1000 0 0 ; ${w.label}`);
  }
  lines.push('');

  // 4. Gravity Conduits
  lines.push('[CONDUITS]');
  lines.push(';;Name           From Node        To Node          Length     Roughness  InOffset   OutOffset  InitFlow   MaxFlow   ');
  for (const c of network.conduits) {
    const id = c.id.padEnd(16);
    const from = c.startNodeId.padEnd(16);
    const to = c.endNodeId.padEnd(16);
    const len = c.lengthM.toFixed(1).padStart(10);
    const n = c.manningN.toFixed(4).padStart(10);
    lines.push(`${id} ${from} ${to} ${len} ${n} 0.0        0.0        0.0        0.0        ; ${c.label}`);
  }
  lines.push('');

  // 5. Cross Sections for Conduits
  lines.push('[XSECTIONS]');
  lines.push(';;Link           Shape        Geom1      Geom2      Geom3      Geom4      Barrels    Culvert   ');
  for (const c of network.conduits) {
    const id = c.id.padEnd(16);
    const diaM = (c.diameterMm / 1000).toFixed(3).padStart(10);
    lines.push(`${id} CIRCULAR   ${diaM} 0.0        0.0        0.0        1          `);
  }
  lines.push('');

  // 6. Pumps
  lines.push('[PUMPS]');
  lines.push(';;Name           From Node        To Node          Pump Curve       Status   Startup  Shutoff ');
  for (const p of network.pumps) {
    const id = p.id.padEnd(16);
    const from = p.startNodeId.padEnd(16);
    const to = p.endNodeId.padEnd(16);
    lines.push(`${id} ${from} ${to} PUMP_CURVE_1    ${p.status}     0.0      0.0     `);
  }
  lines.push('');

  // 6b. Pump Head-Discharge Curves
  lines.push('[CURVES]');
  lines.push(';;Name           Type       X-Value (Head)   Y-Value (Flow)');
  for (const p of network.pumps) {
    const h0 = p.shutoffHeadM || (p.dynamicHeadM ? p.dynamicHeadM * 1.33 : 33);
    const hRated = p.dynamicHeadM || 25;
    const qRated = p.ratedDischargeLs || 30;
    const qMax = p.maxFlowLs || qRated * 1.45;
    lines.push(`PUMP_CURVE_1     Pump1      ${h0.toFixed(2).padEnd(16)} 0.00`);
    lines.push(`PUMP_CURVE_1                ${hRated.toFixed(2).padEnd(16)} ${qRated.toFixed(2)}`);
    lines.push(`PUMP_CURVE_1                ${(hRated * 0.5).toFixed(2).padEnd(16)} ${qMax.toFixed(2)}`);
    break; // Define standard curve
  }
  lines.push('');

  // 7. Dry Weather Sanitary Flows
  lines.push('[DWF]');
  lines.push(';;Node           Constituent      Baseline   Patterns');
  for (const m of network.manholes) {
    const id = m.id.padEnd(16);
    const baseFlow = (m.averageSanitaryFlowLs || (m.population * 135) / 86400).toFixed(2).padStart(10);
    lines.push(`${id} FLOW             ${baseFlow} DIURNAL_SANITARY`);
  }
  lines.push('');

  // 8. Diurnal Time Patterns
  lines.push('[PATTERNS]');
  lines.push(';;Name           Type       Multipliers');
  lines.push('DIURNAL_SANITARY HOURLY     0.50 0.40 0.35 0.35 0.45 0.65');
  lines.push('DIURNAL_SANITARY            0.95 1.45 1.80 1.60 1.35 1.15');
  lines.push('DIURNAL_SANITARY            1.20 1.10 1.05 1.00 1.05 1.25');
  lines.push('DIURNAL_SANITARY            1.55 1.75 1.50 1.25 0.95 0.70');
  lines.push('');

  // 9. Coordinates
  lines.push('[COORDINATES]');
  lines.push(';;Node           X-Coord (Lng)    Y-Coord (Lat)   ');
  for (const m of network.manholes) {
    lines.push(`${m.id.padEnd(16)} ${m.lng.toFixed(6).padEnd(16)} ${m.lat.toFixed(6)}`);
  }
  for (const o of network.outfalls) {
    lines.push(`${o.id.padEnd(16)} ${o.lng.toFixed(6).padEnd(16)} ${o.lat.toFixed(6)}`);
  }
  for (const w of network.wetWells) {
    lines.push(`${w.id.padEnd(16)} ${w.lng.toFixed(6).padEnd(16)} ${w.lat.toFixed(6)}`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Parses EPA SWMM / Sewer .INP file into a WastewaterNetwork.
 */
export function parseSwmmInp(text: string, filename = 'Imported_Sewer_Model.inp'): WastewaterNetwork {
  const lines = text.split(/\r?\n/);

  const manholes: WastewaterManhole[] = [];
  const outfalls: WastewaterOutfall[] = [];
  const wetWells: WastewaterWetWell[] = [];
  const conduits: WastewaterConduit[] = [];
  const pumps: WastewaterPump[] = [];
  const coords = new Map<string, { lat: number; lng: number }>();
  const xsections = new Map<string, number>(); // conduitId -> diameterMm

  let currentSection = '';
  let routingMethod: 'DYNAMICWAVE' | 'KINEMATIC' | 'STEADY' = 'DYNAMICWAVE';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';;')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.toUpperCase();
      continue;
    }

    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;

    if (currentSection === '[OPTIONS]') {
      if (tokens[0].toUpperCase() === 'FLOW_ROUTING') {
        const method = tokens[1].toUpperCase();
        if (method.includes('KINEMATIC')) routingMethod = 'KINEMATIC';
        else if (method.includes('STEADY')) routingMethod = 'STEADY';
        else routingMethod = 'DYNAMICWAVE';
      }
    } else if (currentSection === '[COORDINATES]') {
      const id = tokens[0];
      const lng = parseFloat(tokens[1]);
      const lat = parseFloat(tokens[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        coords.set(id, { lat, lng });
      }
    } else if (currentSection === '[XSECTIONS]') {
      const conduitId = tokens[0];
      const diaM = parseFloat(tokens[2]);
      if (Number.isFinite(diaM)) {
        xsections.set(conduitId, Math.round(diaM * 1000));
      }
    } else if (currentSection === '[JUNCTIONS]') {
      const id = tokens[0];
      const invert = parseFloat(tokens[1]) || 170.0;
      const depth = parseFloat(tokens[2]) || 2.0;
      manholes.push({
        id,
        label: `Manhole ${id}`,
        type: 'manhole',
        lat: 27.244,
        lng: 77.825,
        rimElevation: Math.round((invert + depth) * 10) / 10,
        invertElevation: invert,
        depth,
        diameterMm: 1000,
        population: 500,
        unitLoadingLpcd: 135,
        peakingFormula: 'harmon',
        baseDryWeatherFlowLs: 0,
        inflowInfiltrationLs: 0.5,
      });
    } else if (currentSection === '[OUTFALLS]') {
      const id = tokens[0];
      const invert = parseFloat(tokens[1]) || 165.0;
      outfalls.push({
        id,
        label: `Outfall ${id}`,
        type: 'outfall',
        lat: 27.240,
        lng: 77.820,
        invertElevation: invert,
        receivingWaterElevation: Math.round((invert + 0.5) * 10) / 10,
      });
    } else if (currentSection === '[STORAGE]') {
      const id = tokens[0];
      const floor = parseFloat(tokens[1]) || 165.0;
      const depth = parseFloat(tokens[2]) || 4.0;
      wetWells.push({
        id,
        label: `Wet Well ${id}`,
        type: 'wet-well',
        lat: 27.242,
        lng: 77.822,
        rimElevation: Math.round((floor + depth) * 10) / 10,
        floorElevation: floor,
        diameterM: 3.5,
        minWaterLevelM: floor + 0.8,
        maxWaterLevelM: floor + 2.5,
        alarmLevelM: floor + 3.2,
        storageVolumeM3: 35.0,
      });
    } else if (currentSection === '[CONDUITS]') {
      const id = tokens[0];
      const startNodeId = tokens[1];
      const endNodeId = tokens[2];
      const lengthM = parseFloat(tokens[3]) || 60.0;
      const manningN = parseFloat(tokens[4]) || 0.012;
      conduits.push({
        id,
        label: `Conduit ${id}`,
        type: 'conduit',
        startNodeId,
        endNodeId,
        diameterMm: 250,
        material: 'PVC',
        manningN,
        upstreamInvertM: 170.0,
        downstreamInvertM: 169.5,
        lengthM,
        slopeMPerM: 0.005,
      });
    } else if (currentSection === '[PUMPS]') {
      const id = tokens[0];
      const startNodeId = tokens[1];
      const endNodeId = tokens[2];
      const status = tokens[4]?.toUpperCase() === 'OFF' ? 'OFF' : 'ON';
      pumps.push({
        id,
        label: `Pump ${id}`,
        type: 'pump',
        startNodeId,
        endNodeId,
        status,
        ratedDischargeLs: 35.0,
        dynamicHeadM: 22.0,
        efficiencyPercent: 75,
      });
    } else if (currentSection === '[DWF]') {
      const id = tokens[0];
      const baseline = parseFloat(tokens[2]);
      if (Number.isFinite(baseline)) {
        const mh = manholes.find((m) => m.id === id);
        if (mh) {
          mh.baseDryWeatherFlowLs = baseline;
        }
      }
    }
  }

  // Bind coordinates
  manholes.forEach((m) => {
    const c = coords.get(m.id);
    if (c) {
      m.lat = c.lat;
      m.lng = c.lng;
    }
  });
  outfalls.forEach((o) => {
    const c = coords.get(o.id);
    if (c) {
      o.lat = c.lat;
      o.lng = c.lng;
    }
  });
  wetWells.forEach((w) => {
    const c = coords.get(w.id);
    if (c) {
      w.lat = c.lat;
      w.lng = c.lng;
    }
  });

  // Bind diameters from XSECTIONS
  conduits.forEach((c) => {
    const dia = xsections.get(c.id);
    if (dia) c.diameterMm = dia;
  });

  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    units: 'SI',
    routingMethod,
    manholes,
    conduits,
    wetWells,
    pumps,
    forceMains: [],
    outfalls,
  };
}
