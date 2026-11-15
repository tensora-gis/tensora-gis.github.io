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
  WastewaterOutfall,
  WastewaterForceMain,
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
  lines.push('INERTIAL_DAMPING     PARTIAL');
  lines.push('NORMAL_FLOW_LIMITED  BOTH');
  lines.push('SURCHARGE_METHOD     SLOT');
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
  const nodeInvertMap = new Map<string, number>();
  for (const m of network.manholes) nodeInvertMap.set(m.id, m.invertElevation);
  for (const o of network.outfalls) nodeInvertMap.set(o.id, o.invertElevation);
  for (const w of network.wetWells) nodeInvertMap.set(w.id, w.floorElevation);

  lines.push('[CONDUITS]');
  lines.push(';;Name           From Node        To Node          Length     Roughness  InOffset   OutOffset  InitFlow   MaxFlow   ');
  for (const c of network.conduits) {
    const id = c.id.padEnd(16);
    const from = c.startNodeId.padEnd(16);
    const to = c.endNodeId.padEnd(16);
    const len = c.lengthM.toFixed(1).padStart(10);
    const n = c.manningN.toFixed(4).padStart(10);
    const upNodeInv = nodeInvertMap.get(c.startNodeId);
    const dnNodeInv = nodeInvertMap.get(c.endNodeId);
    const inOffsetVal = upNodeInv !== undefined ? Math.max(0, c.upstreamInvertM - upNodeInv) : 0.0;
    const outOffsetVal = dnNodeInv !== undefined ? Math.max(0, c.downstreamInvertM - dnNodeInv) : 0.0;
    const inOffset = inOffsetVal.toFixed(2).padStart(10);
    const outOffset = outOffsetVal.toFixed(2).padStart(10);
    lines.push(`${id} ${from} ${to} ${len} ${n} ${inOffset} ${outOffset} 0.0        0.0        ; ${c.label}`);
  }
  for (const fm of network.forceMains || []) {
    const id = fm.id.padEnd(16);
    const from = fm.startNodeId.padEnd(16);
    const to = fm.endNodeId.padEnd(16);
    const len = fm.lengthM.toFixed(1).padStart(10);
    const roughness = (fm.cFactor || 130).toFixed(1).padStart(10);
    lines.push(`${id} ${from} ${to} ${len} ${roughness} 0.00       0.00       0.0        0.0        ; ${fm.label}`);
  }
  lines.push('');

  // 5. Cross Sections for Conduits & Force Mains
  lines.push('[XSECTIONS]');
  lines.push(';;Link           Shape        Geom1      Geom2      Geom3      Geom4      Barrels    Culvert   ');
  for (const c of network.conduits) {
    const id = c.id.padEnd(16);
    const diaM = (c.diameterMm / 1000).toFixed(3).padStart(10);
    lines.push(`${id} CIRCULAR   ${diaM} 0.0        0.0        0.0        1          `);
  }
  for (const fm of network.forceMains || []) {
    const id = fm.id.padEnd(16);
    const diaM = (fm.diameterMm / 1000).toFixed(3).padStart(10);
    const cFact = (fm.cFactor || 130).toFixed(1).padStart(10);
    lines.push(`${id} FORCE_MAIN ${diaM} ${cFact}   0.0        0.0        1          `);
  }
  lines.push('');

  // 6. Pumps
  lines.push('[PUMPS]');
  lines.push(';;Name           From Node        To Node          Pump Curve       Status   Startup  Shutoff ');
  for (const p of network.pumps) {
    const id = p.id.padEnd(16);
    const from = p.startNodeId.padEnd(16);
    const to = p.endNodeId.padEnd(16);
    const curveName = `CURVE_${p.id}`.padEnd(16);
    lines.push(`${id} ${from} ${to} ${curveName} ${p.status}     0.0      0.0     ; ${p.label}`);
  }
  lines.push('');

  // 6b. Pump Head-Discharge Curves
  lines.push('[CURVES]');
  lines.push(';;Name           Type       X-Value (Head)   Y-Value (Flow)');
  for (const p of network.pumps) {
    const curveName = `CURVE_${p.id}`.padEnd(16);
    const h0 = p.shutoffHeadM || (p.dynamicHeadM ? p.dynamicHeadM * 1.33 : 33);
    const hRated = p.dynamicHeadM || 25;
    const qRated = p.ratedDischargeLs || 30;
    const qMax = p.maxFlowLs || qRated * 1.45;
    lines.push(`${curveName} Pump1      ${h0.toFixed(2).padEnd(16)} 0.00`);
    lines.push(`${curveName}            ${hRated.toFixed(2).padEnd(16)} ${qRated.toFixed(2)}`);
    lines.push(`${curveName}            ${(hRated * 0.5).toFixed(2).padEnd(16)} ${qMax.toFixed(2)}`);
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
  const rawConduits: Array<{
    id: string;
    label: string;
    startNodeId: string;
    endNodeId: string;
    lengthM: number;
    roughness: number;
    inOffset: number;
    outOffset: number;
  }> = [];
  const rawPumps: Array<{
    id: string;
    label: string;
    startNodeId: string;
    endNodeId: string;
    status: 'ON' | 'OFF';
    curveName?: string;
  }> = [];

  const coords = new Map<string, { lat: number; lng: number }>();
  const xsections = new Map<string, { shape: string; geom1: number; geom2: number }>();
  const patternMap = new Map<string, number[]>();
  const curves = new Map<string, Array<{ x: number; y: number }>>();

  let currentSection = '';
  let routingMethod: 'DYNAMICWAVE' | 'KINEMATIC' | 'STEADY' = 'DYNAMICWAVE';

  for (const rawLine of lines) {
    let comment = '';
    const commentIdx = rawLine.indexOf(';');
    let lineWithoutComment = rawLine;
    if (commentIdx >= 0) {
      comment = rawLine.slice(commentIdx + 1).replace(/^;+/, '').trim();
      lineWithoutComment = rawLine.slice(0, commentIdx);
    }
    const line = lineWithoutComment.trim();
    if (!line) continue;

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
      const shape = tokens[1].toUpperCase();
      const geom1 = parseFloat(tokens[2]) || 0;
      const geom2 = parseFloat(tokens[3]) || 0;
      xsections.set(conduitId, { shape, geom1, geom2 });
    } else if (currentSection === '[JUNCTIONS]') {
      const id = tokens[0];
      const invert = parseFloat(tokens[1]) || 170.0;
      const depth = parseFloat(tokens[2]) || 2.0;
      manholes.push({
        id,
        label: comment || `Manhole ${id}`,
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
        label: comment || `Outfall ${id}`,
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
        label: comment || `Wet Well ${id}`,
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
      const roughness = parseFloat(tokens[4]) || 0.012;
      const inOffset = parseFloat(tokens[5]) || 0.0;
      const outOffset = parseFloat(tokens[6]) || 0.0;
      rawConduits.push({
        id,
        label: comment || (id.startsWith('FM-') ? `Force Main ${id}` : `Conduit ${id}`),
        startNodeId,
        endNodeId,
        lengthM,
        roughness,
        inOffset,
        outOffset,
      });
    } else if (currentSection === '[PUMPS]') {
      const id = tokens[0];
      const startNodeId = tokens[1];
      const endNodeId = tokens[2];
      const curveName = tokens[3];
      const status = tokens[4]?.toUpperCase() === 'OFF' ? 'OFF' : 'ON';
      rawPumps.push({
        id,
        label: comment || `Pump ${id}`,
        startNodeId,
        endNodeId,
        status,
        curveName,
      });
    } else if (currentSection === '[CURVES]') {
      const name = tokens[0];
      let x = 0;
      let y = 0;
      if (tokens.length >= 4 && isNaN(Number(tokens[1]))) {
        x = parseFloat(tokens[2]);
        y = parseFloat(tokens[3]);
      } else if (tokens.length >= 3) {
        x = parseFloat(tokens[1]);
        y = parseFloat(tokens[2]);
      }
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (!curves.has(name)) curves.set(name, []);
        curves.get(name)!.push({ x, y });
      }
    } else if (currentSection === '[DWF]') {
      const id = tokens[0];
      const baseline = parseFloat(tokens[2]);
      if (Number.isFinite(baseline)) {
        const mh = manholes.find((m) => m.id === id);
        if (mh) {
          mh.baseDryWeatherFlowLs = baseline;
        }
      }
    } else if (currentSection === '[PATTERNS]') {
      const name = tokens[0];
      const startIndex = tokens[1]?.toUpperCase() === 'HOURLY' ? 2 : 1;
      const mults = tokens.slice(startIndex).map(Number).filter((n) => !isNaN(n));
      if (mults.length > 0) {
        const existing = patternMap.get(name);
        if (existing) {
          existing.push(...mults);
        } else {
          patternMap.set(name, [...mults]);
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

  // Reconstruct pumps with attributes from curves
  const pumps: WastewaterPump[] = rawPumps.map((rp) => {
    let ratedDischargeLs = 35.0;
    let dynamicHeadM = 22.0;
    let shutoffHeadM = 33.0;
    let maxFlowLs = 50.0;

    const curvePts = rp.curveName ? curves.get(rp.curveName) : undefined;
    if (curvePts && curvePts.length > 0) {
      const shutoffPt = curvePts.find((p) => p.y === 0) || curvePts[0];
      shutoffHeadM = shutoffPt.x || shutoffPt.y || 33.0;

      const flowPts = curvePts.filter((p) => p.y > 0);
      if (flowPts.length > 0) {
        const ratedPt = flowPts[0];
        dynamicHeadM = ratedPt.x;
        ratedDischargeLs = ratedPt.y;
        if (flowPts.length > 1) {
          maxFlowLs = flowPts[flowPts.length - 1].y;
        }
      }
    }

    const powerKw = Math.round(((9.81 * (ratedDischargeLs / 1000) * dynamicHeadM) / 0.75) * 10) / 10;

    return {
      id: rp.id,
      label: rp.label,
      type: 'pump',
      startNodeId: rp.startNodeId,
      endNodeId: rp.endNodeId,
      status: rp.status,
      ratedDischargeLs,
      dynamicHeadM,
      shutoffHeadM,
      maxFlowLs,
      efficiencyPercent: 75,
      powerKw,
    };
  });

  // Resolve node inverts
  const nodeInverts = new Map<string, number>();
  manholes.forEach((m) => nodeInverts.set(m.id, m.invertElevation));
  outfalls.forEach((o) => nodeInverts.set(o.id, o.invertElevation));
  wetWells.forEach((w) => nodeInverts.set(w.id, w.floorElevation));

  // Separate gravity conduits and force mains
  const conduits: WastewaterConduit[] = [];
  const forceMains: WastewaterForceMain[] = [];

  for (const rc of rawConduits) {
    const xs = xsections.get(rc.id);
    const isForceMain =
      xs?.shape === 'FORCE_MAIN' ||
      rc.id.startsWith('FM-') ||
      rc.roughness > 2.0;

    const diaMm = xs ? Math.round(xs.geom1 * 1000) : 250;

    if (isForceMain) {
      forceMains.push({
        id: rc.id,
        label: rc.label,
        type: 'force-main',
        startNodeId: rc.startNodeId,
        endNodeId: rc.endNodeId,
        diameterMm: diaMm || 200,
        material: 'DI',
        lengthM: rc.lengthM,
        cFactor: xs?.geom2 || (rc.roughness > 2.0 ? rc.roughness : 130),
      });
    } else {
      const upNodeInv = nodeInverts.get(rc.startNodeId) ?? 170.0;
      const dnNodeInv = nodeInverts.get(rc.endNodeId) ?? upNodeInv - 0.5;
      const upInvert = Math.round((upNodeInv + rc.inOffset) * 1000) / 1000;
      const dnInvert = Math.round((dnNodeInv + rc.outOffset) * 1000) / 1000;
      const drop = upInvert - dnInvert;
      const slope = rc.lengthM > 0 ? (drop > 0 ? drop / rc.lengthM : 0.001) : 0.001;

      conduits.push({
        id: rc.id,
        label: rc.label,
        type: 'conduit',
        startNodeId: rc.startNodeId,
        endNodeId: rc.endNodeId,
        diameterMm: diaMm,
        material: 'PVC',
        manningN: rc.roughness <= 2.0 ? rc.roughness : 0.012,
        upstreamInvertM: upInvert,
        downstreamInvertM: dnInvert,
        lengthM: rc.lengthM,
        slopeMPerM: slope,
      });
    }
  }

  const patterns = Array.from(patternMap.entries()).map(([name, multipliers]) => ({ name, multipliers }));

  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    units: 'SI',
    routingMethod,
    manholes,
    conduits,
    wetWells,
    pumps,
    forceMains,
    outfalls,
    patterns: patterns.length > 0 ? patterns : undefined,
  };
}
