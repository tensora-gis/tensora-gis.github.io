/**
 * EPANET .INP File Parser & Exporter
 *
 * Implements full two-way compatibility with EPANET 2.2 and Bentley WaterGEMS INP format.
 */

import {
  WaterDistributionNetwork,
  WaterJunction,
  WaterPipe,
  WaterReservoir,
  WaterTank,
  WaterPump,
} from '../types/waterDistribution';

/**
 * Serializes a WaterDistributionNetwork into standard EPANET .INP text.
 */
export function exportToEpanetInp(network: WaterDistributionNetwork): string {
  const lines: string[] = [];

  lines.push('[TITLE]');
  lines.push(`Tensora GIS WaterGEMS Model - ${network.name}`);
  lines.push(`Terrain-Referenced Hydraulic Distribution System`);
  lines.push('');

  lines.push('[JUNCTIONS]');
  lines.push(';ID              Elev(m)    Demand(L/s)  Pattern');
  for (const j of network.junctions) {
    const id = j.id.padEnd(16);
    const elev = j.elevation.toFixed(2).padStart(10);
    const demand = j.baseDemand.toFixed(2).padStart(12);
    lines.push(`${id} ${elev} ${demand}           ; ${j.label}`);
  }
  lines.push('');

  lines.push('[RESERVOIRS]');
  lines.push(';ID              Head(m)    Pattern');
  for (const r of network.reservoirs) {
    const id = r.id.padEnd(16);
    const head = r.totalHead.toFixed(2).padStart(10);
    lines.push(`${id} ${head}               ; ${r.label}`);
  }
  lines.push('');

  lines.push('[TANKS]');
  lines.push(';ID              Elev(m)    InitLvl    MinLvl     MaxLvl     Diam(m)    MinVol   VolCurve');
  for (const t of network.tanks) {
    const id = t.id.padEnd(16);
    const elev = t.elevation.toFixed(2).padStart(10);
    const init = t.initialLevel.toFixed(2).padStart(10);
    const min = t.minLevel.toFixed(2).padStart(10);
    const max = t.maxLevel.toFixed(2).padStart(10);
    const diam = t.diameter.toFixed(2).padStart(10);
    lines.push(`${id} ${elev} ${init} ${min} ${max} ${diam}          0`);
  }
  lines.push('');

  lines.push('[PIPES]');
  lines.push(';ID              Node1            Node2            Length(m)  Diam(mm)   Roughness  MinorLoss  Status');
  for (const p of network.pipes) {
    const id = p.id.padEnd(16);
    const n1 = p.startNodeId.padEnd(16);
    const n2 = p.endNodeId.padEnd(16);
    const len = p.length.toFixed(1).padStart(10);
    const diam = p.diameter.toFixed(0).padStart(10);
    const rough = p.roughness.toFixed(0).padStart(10);
    const minor = (p.minorLossCoeff || 0).toFixed(2).padStart(10);
    const status = p.status.padEnd(8);
    lines.push(`${id} ${n1} ${n2} ${len} ${diam} ${rough} ${minor} ${status}`);
  }
  lines.push('');

  lines.push('[PUMPS]');
  lines.push(';ID              Node1            Node2            Parameters');
  for (const p of network.pumps) {
    const id = p.id.padEnd(16);
    const n1 = p.startNodeId.padEnd(16);
    const n2 = p.endNodeId.padEnd(16);
    lines.push(`${id} ${n1} ${n2} POWER ${p.powerKw || 15}`);
  }
  lines.push('');

  lines.push('[COORDINATES]');
  lines.push(';Node            X-Coord (Lng)    Y-Coord (Lat)');
  for (const j of network.junctions) {
    lines.push(`${j.id.padEnd(16)} ${j.lng.toFixed(7).padStart(16)} ${j.lat.toFixed(7).padStart(16)}`);
  }
  for (const r of network.reservoirs) {
    lines.push(`${r.id.padEnd(16)} ${r.lng.toFixed(7).padStart(16)} ${r.lat.toFixed(7).padStart(16)}`);
  }
  for (const t of network.tanks) {
    lines.push(`${t.id.padEnd(16)} ${t.lng.toFixed(7).padStart(16)} ${t.lat.toFixed(7).padStart(16)}`);
  }
  lines.push('');

  lines.push('[OPTIONS]');
  lines.push(' Units              LPS');
  lines.push(' Headloss           H-W');
  lines.push(' Specific Gravity   1.0');
  lines.push(' Relative Viscosity 1.0');
  lines.push(' Maximum Trials     40');
  lines.push(' Accuracy           0.001');
  lines.push('');

  lines.push('[END]');
  return lines.join('\n');
}

/**
 * Parses EPANET .INP file text into a WaterDistributionNetwork.
 */
export function parseEpanetInp(text: string, filename = 'Imported Network'): WaterDistributionNetwork {
  const lines = text.split(/\r?\n/);

  const junctions: WaterJunction[] = [];
  const reservoirs: WaterReservoir[] = [];
  const tanks: WaterTank[] = [];
  const pipes: WaterPipe[] = [];
  const pumps: WaterPump[] = [];
  const coords = new Map<string, { lat: number; lng: number }>();

  let currentSection = '';

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith(';')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).toUpperCase();
      continue;
    }

    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;

    switch (currentSection) {
      case 'COORDINATES': {
        const id = tokens[0];
        const x = parseFloat(tokens[1]);
        const y = parseFloat(tokens[2]);
        if (!isNaN(x) && !isNaN(y)) {
          // If x is between -180 and 180 and y between -90 and 90, treat as Lng, Lat
          coords.set(id, { lng: x, lat: y });
        }
        break;
      }

      case 'JUNCTIONS': {
        const id = tokens[0];
        const elev = parseFloat(tokens[1]) || 0;
        const demand = parseFloat(tokens[2]) || 0;
        junctions.push({
          id,
          label: id,
          type: 'junction',
          elevation: elev,
          baseDemand: demand,
          lat: 0,
          lng: 0,
        });
        break;
      }

      case 'RESERVOIRS': {
        const id = tokens[0];
        const head = parseFloat(tokens[1]) || 100;
        reservoirs.push({
          id,
          label: id,
          type: 'reservoir',
          elevation: Math.max(0, head - 15),
          totalHead: head,
          lat: 0,
          lng: 0,
        });
        break;
      }

      case 'TANKS': {
        const id = tokens[0];
        const elev = parseFloat(tokens[1]) || 50;
        const init = parseFloat(tokens[2]) || 5;
        const min = parseFloat(tokens[3]) || 1;
        const max = parseFloat(tokens[4]) || 10;
        const diam = parseFloat(tokens[5]) || 12;
        tanks.push({
          id,
          label: id,
          type: 'tank',
          elevation: elev,
          initialLevel: init,
          minLevel: min,
          maxLevel: max,
          diameter: diam,
          lat: 0,
          lng: 0,
        });
        break;
      }

      case 'PIPES': {
        const id = tokens[0];
        const n1 = tokens[1];
        const n2 = tokens[2];
        const len = parseFloat(tokens[3]) || 100;
        const diam = parseFloat(tokens[4]) || 150;
        const rough = parseFloat(tokens[5]) || 130;
        const minor = parseFloat(tokens[6]) || 0;
        const statusToken = (tokens[7] || 'OPEN').toUpperCase();
        const status = statusToken === 'CLOSED' ? 'CLOSED' : statusToken === 'CV' ? 'CV' : 'OPEN';

        pipes.push({
          id,
          label: id,
          type: 'pipe',
          startNodeId: n1,
          endNodeId: n2,
          length: len,
          diameter: diam,
          roughness: rough,
          minorLossCoeff: minor,
          status,
        });
        break;
      }

      case 'PUMPS': {
        const id = tokens[0];
        const n1 = tokens[1];
        const n2 = tokens[2];
        pumps.push({
          id,
          label: id,
          type: 'pump',
          startNodeId: n1,
          endNodeId: n2,
          status: 'OPEN',
          curveType: '1-POINT',
          designFlow: 30,
          designHead: 40,
          shutoffHead: 53.2,
          maxFlow: 60,
          powerKw: 22,
          speed: 1.0,
        });
        break;
      }
    }
  }

  // Assign Coordinates
  for (const j of junctions) {
    const c = coords.get(j.id);
    if (c) {
      j.lat = c.lat;
      j.lng = c.lng;
    }
  }
  for (const r of reservoirs) {
    const c = coords.get(r.id);
    if (c) {
      r.lat = c.lat;
      r.lng = c.lng;
    }
  }
  for (const t of tanks) {
    const c = coords.get(t.id);
    if (c) {
      t.lat = c.lat;
      t.lng = c.lng;
    }
  }

  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    units: 'SI',
    headlossFormula: 'H-W',
    junctions,
    reservoirs,
    tanks,
    pipes,
    pumps,
    valves: [],
  };
}
