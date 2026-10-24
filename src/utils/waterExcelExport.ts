/**
 * Comprehensive Water Distribution Hydraulic Calculation Excel Exporter
 *
 * Generates an engineering-grade, multi-worksheet calculation workbook (.xlsx)
 * documenting network topology, nodal mass balance, pipe friction hydraulics,
 * pumping energy, and terrain elevation compliance.
 */

import type ExcelJS from 'exceljs';
import {
  WaterDistributionNetwork,
  SimulationSummary,
  WaterJunction,
  WaterPipe,
  WaterPump,
  WaterReservoir,
  WaterTank,
} from '../types/waterDistribution';

export async function generateWaterHydraulicExcel(
  network: WaterDistributionNetwork,
  summary: SimulationSummary
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tensora GIS - Water Distribution Hydraulic Engine';
  workbook.lastModifiedBy = 'Tensora GIS';
  workbook.created = new Date();
  workbook.modified = new Date();

  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Slate 800
  };

  const headerFont: Partial<ExcelJS.Font> = {
    name: 'Segoe UI',
    size: 10,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };

  const regularFont: Partial<ExcelJS.Font> = {
    name: 'Segoe UI',
    size: 10,
  };

  const boldFont: Partial<ExcelJS.Font> = {
    name: 'Segoe UI',
    size: 10,
    bold: true,
  };

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  };

  // ==========================================
  // SHEET 1: EXECUTIVE CALCULATION SUMMARY
  // ==========================================
  const sumSheet = workbook.addWorksheet('Executive_Summary', {
    views: [{ showGridLines: true }],
  });
  sumSheet.columns = [
    { width: 34 },
    { width: 28 },
    { width: 18 },
    { width: 36 },
  ];

  // Title Block
  sumSheet.mergeCells('A1:D1');
  const titleCell = sumSheet.getCell('A1');
  titleCell.value = 'HYDRAULIC NETWORK CALCULATION REPORT';
  titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle' };
  sumSheet.getRow(1).height = 28;

  sumSheet.mergeCells('A2:D2');
  const subCell = sumSheet.getCell('A2');
  subCell.value = `Project Network: ${network.name} | Standard Hazen-Williams Formulation | Metric (SI) Units`;
  subCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF64748B' } };

  sumSheet.addRow([]);

  // Section 1: Computation Parameters
  sumSheet.addRow(['COMPUTATION PARAMETERS', '', 'MASS BALANCE', '']);
  sumSheet.getRow(4).font = boldFont;
  sumSheet.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sumSheet.getCell('B4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sumSheet.getCell('C4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sumSheet.getCell('D4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  sumSheet.addRow(['Hydraulic Engine:', 'EPANET 2.2 / GGA Solver', 'Total System Demand:', `${summary.totalDemandLs} L/s (${(summary.totalDemandLs * 3.6).toFixed(1)} m³/h)`]);
  sumSheet.addRow(['Friction Loss Formulation:', 'Hazen-Williams (n = 1.852)', 'Total Supply Inflow:', `${summary.totalSupplyLs} L/s (${(summary.totalSupplyLs * 3.6).toFixed(1)} m³/h)`]);
  sumSheet.addRow(['Algorithm Convergence:', summary.converged ? 'Converged' : 'Exceeded Max Iterations', 'Mass Imbalance:', `${summary.flowImbalanceLs} L/s`]);
  sumSheet.addRow(['Convergence Iterations:', summary.iterations, 'Relative Flow Residual:', `${summary.relativeFlowError} L/s`]);
  sumSheet.addRow(['Elevation Datum Source:', 'Copernicus GLO-30 / SRTM 30m DEM', 'Calculation Timestamp:', summary.runTimestamp]);

  sumSheet.addRow([]);

  // Section 2: Extreme Values & Critical Thresholds
  sumSheet.addRow(['SYSTEM HYDRAULIC EXTREMES', '', 'NETWORK COMPONENT INVENTORY', '']);
  sumSheet.getRow(11).font = boldFont;
  sumSheet.getCell('A11').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sumSheet.getCell('B11').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sumSheet.getCell('C11').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sumSheet.getCell('D11').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  sumSheet.addRow(['Minimum Service Pressure:', `${summary.minPressureM} m H2O (${(summary.minPressureM * 1.42).toFixed(1)} psi)`, 'Total Junction Nodes:', network.junctions.length]);
  sumSheet.addRow(['Minimum Pressure Location:', `Node ${summary.minPressureNodeId || 'N/A'}`, 'Total Pipe Links:', network.pipes.length]);
  sumSheet.addRow(['Maximum Service Pressure:', `${summary.maxPressureM} m H2O (${(summary.maxPressureM * 1.42).toFixed(1)} psi)`, 'Storage Tanks:', network.tanks.length]);
  sumSheet.addRow(['Maximum Pressure Location:', `Node ${summary.maxPressureNodeId || 'N/A'}`, 'Intake Reservoirs:', network.reservoirs.length]);
  sumSheet.addRow(['Maximum Pipe Velocity:', `${summary.maxVelocityMs} m/s`, 'Booster Pump Stations:', network.pumps.length]);
  sumSheet.addRow(['Maximum Velocity Location:', `Pipe ${summary.maxVelocityPipeId || 'N/A'}`, 'Total Pumping Power:', `${summary.totalPumpPowerKw} kW`]);

  sumSheet.addRow([]);

  // Section 3: Engineering Compliance & Warning Log
  sumSheet.addRow(['ENGINEERING COMPLIANCE REGISTER', '', '', '']);
  sumSheet.getRow(19).font = boldFont;
  sumSheet.getCell('A19').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sumSheet.getCell('B19').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sumSheet.getCell('C19').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sumSheet.getCell('D19').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  const negCount = summary.negativePressureNodes.length;
  sumSheet.addRow([
    'Negative Pressure Nodes (< 0 m):',
    negCount === 0 ? 'Compliant (None)' : `${negCount} node(s) with vacuum condition`,
    'Status:',
    negCount === 0 ? 'PASS' : 'WARNING',
  ]);

  const lowCount = summary.lowPressureNodes.length;
  sumSheet.addRow([
    'Low Pressure Nodes (< 15 m):',
    lowCount === 0 ? 'Compliant (None)' : `${lowCount} node(s) below standard residual pressure`,
    'Status:',
    lowCount === 0 ? 'PASS' : 'ADVISORY',
  ]);

  const highVelCount = summary.highVelocityPipes.length;
  sumSheet.addRow([
    'Scouring Velocities (> 2.0 m/s):',
    highVelCount === 0 ? 'Compliant (None)' : `${highVelCount} pipe(s) exceed velocity threshold`,
    'Status:',
    highVelCount === 0 ? 'PASS' : 'ADVISORY',
  ]);

  // Format all cells in summary sheet
  sumSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 3) {
      row.eachCell((cell) => {
        if (!cell.font) cell.font = regularFont;
        cell.border = thinBorder;
      });
    }
  });

  // ==========================================
  // SHEET 2: JUNCTION ANALYSIS
  // ==========================================
  const juncSheet = workbook.addWorksheet('Junction_Calculations', {
    views: [{ showGridLines: true }],
  });

  juncSheet.columns = [
    { header: 'Node ID', key: 'id', width: 14 },
    { header: 'Description / Tag', key: 'label', width: 26 },
    { header: 'Latitude (°N)', key: 'lat', width: 16 },
    { header: 'Longitude (°E)', key: 'lng', width: 16 },
    { header: 'Ground Elevation (m MSL)', key: 'elevation', width: 22 },
    { header: 'Base Demand (L/s)', key: 'demandLs', width: 18 },
    { header: 'Demand (m³/h)', key: 'demandM3h', width: 16 },
    { header: 'Hydraulic Head (m MSL)', key: 'head', width: 22 },
    { header: 'Pressure Head (m H2O)', key: 'pressureM', width: 22 },
    { header: 'Pressure (bar)', key: 'pressureBar', width: 16 },
    { header: 'Pressure (psi)', key: 'pressurePsi', width: 16 },
    { header: 'Status Flag', key: 'status', width: 20 },
  ];

  const juncHeaderRow = juncSheet.getRow(1);
  juncHeaderRow.height = 24;
  juncHeaderRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  network.junctions.forEach((j) => {
    const head = j.head ?? j.elevation;
    const pM = j.pressure ?? 0;
    const pBar = pM * 0.0980665;
    const pPsi = pM * 1.42233;

    let statusText = 'NORMAL';
    if (pM < 0) statusText = 'NEGATIVE PRESSURE';
    else if (pM < 15) statusText = 'LOW PRESSURE';
    else if (pM > 75) statusText = 'HIGH PRESSURE';

    const row = juncSheet.addRow({
      id: j.id,
      label: j.label || j.id,
      lat: Math.round(j.lat * 1e6) / 1e6,
      lng: Math.round(j.lng * 1e6) / 1e6,
      elevation: j.elevation,
      demandLs: j.baseDemand,
      demandM3h: Math.round(j.baseDemand * 3.6 * 100) / 100,
      head: Math.round(head * 100) / 100,
      pressureM: Math.round(pM * 100) / 100,
      pressureBar: Math.round(pBar * 100) / 100,
      pressurePsi: Math.round(pPsi * 10) / 10,
      status: statusText,
    });

    row.eachCell((cell, colNum) => {
      cell.font = regularFont;
      cell.border = thinBorder;
      if (colNum >= 3 && colNum <= 11) {
        cell.alignment = { horizontal: 'right' };
      }
      if (colNum === 12) {
        cell.alignment = { horizontal: 'center' };
        if (statusText === 'NEGATIVE PRESSURE') {
          cell.font = { ...regularFont, color: { argb: 'FFDC2626' }, bold: true };
        } else if (statusText === 'LOW PRESSURE') {
          cell.font = { ...regularFont, color: { argb: 'FFD97706' }, bold: true };
        }
      }
    });
  });

  // ==========================================
  // SHEET 3: PIPE HYDRAULIC CALCULATIONS
  // ==========================================
  const pipeSheet = workbook.addWorksheet('Pipe_Calculations', {
    views: [{ showGridLines: true }],
  });

  pipeSheet.columns = [
    { header: 'Pipe ID', key: 'id', width: 14 },
    { header: 'Description / Tag', key: 'label', width: 26 },
    { header: 'Start Node', key: 'start', width: 14 },
    { header: 'End Node', key: 'end', width: 14 },
    { header: 'Length (m)', key: 'length', width: 14 },
    { header: 'Diameter (mm)', key: 'diameter', width: 16 },
    { header: 'Roughness (C)', key: 'roughness', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Flow Rate (L/s)', key: 'flowLs', width: 16 },
    { header: 'Flow Rate (m³/h)', key: 'flowM3h', width: 16 },
    { header: 'Velocity (m/s)', key: 'velocity', width: 16 },
    { header: 'Headloss (m/km)', key: 'unitLoss', width: 16 },
    { header: 'Total Loss (m)', key: 'totalLoss', width: 16 },
    { header: 'Velocity Regime', key: 'regime', width: 18 },
  ];

  const pipeHeaderRow = pipeSheet.getRow(1);
  pipeHeaderRow.height = 24;
  pipeHeaderRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  network.pipes.forEach((p) => {
    const flow = p.flow ?? 0;
    const v = p.velocity ?? 0;
    const unitLoss = p.unitHeadloss ?? 0;
    const totalLoss = p.totalHeadloss ?? 0;

    let regime = 'OPTIMAL (0.6 - 1.5 m/s)';
    if (v < 0.6) regime = 'LOW (< 0.6 m/s)';
    else if (v > 2.0) regime = 'HIGH VELOCITY (> 2.0 m/s)';

    const row = pipeSheet.addRow({
      id: p.id,
      label: p.label || p.id,
      start: p.startNodeId,
      end: p.endNodeId,
      length: p.length,
      diameter: p.diameter,
      roughness: p.roughness,
      status: p.status,
      flowLs: flow,
      flowM3h: Math.round(flow * 3.6 * 100) / 100,
      velocity: v,
      unitLoss: unitLoss,
      totalLoss: totalLoss,
      regime,
    });

    row.eachCell((cell, colNum) => {
      cell.font = regularFont;
      cell.border = thinBorder;
      if (colNum >= 5 && colNum <= 13) {
        cell.alignment = { horizontal: 'right' };
      }
      if (colNum === 14) {
        cell.alignment = { horizontal: 'center' };
      }
    });
  });

  // ==========================================
  // SHEET 4: PUMPS & VALVES
  // ==========================================
  const pumpSheet = workbook.addWorksheet('Pumps_and_Valves', {
    views: [{ showGridLines: true }],
  });

  pumpSheet.columns = [
    { header: 'Element ID', key: 'id', width: 14 },
    { header: 'Description', key: 'label', width: 26 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Suction Node', key: 'start', width: 16 },
    { header: 'Discharge Node', key: 'end', width: 16 },
    { header: 'Design Flow (L/s)', key: 'desFlow', width: 18 },
    { header: 'Design Head (m)', key: 'desHead', width: 18 },
    { header: 'Operating Flow (L/s)', key: 'opFlow', width: 20 },
    { header: 'Operating Head (m)', key: 'opHead', width: 20 },
    { header: 'Motor Power (kW)', key: 'powerKw', width: 18 },
    { header: 'Operating Status', key: 'status', width: 18 },
  ];

  const pumpHeaderRow = pumpSheet.getRow(1);
  pumpHeaderRow.height = 24;
  pumpHeaderRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  network.pumps.forEach((pmp) => {
    const row = pumpSheet.addRow({
      id: pmp.id,
      label: pmp.label || pmp.id,
      type: 'BOOSTER PUMP',
      start: pmp.startNodeId,
      end: pmp.endNodeId,
      desFlow: pmp.designFlow,
      desHead: pmp.designHead,
      opFlow: pmp.operatingFlow ?? '—',
      opHead: pmp.operatingHead ?? '—',
      powerKw: pmp.powerKw,
      status: pmp.status,
    });
    row.eachCell((cell) => {
      cell.font = regularFont;
      cell.border = thinBorder;
    });
  });

  // ==========================================
  // SHEET 5: STORAGE TANKS & RESERVOIRS
  // ==========================================
  const srcSheet = workbook.addWorksheet('Sources_and_Storage', {
    views: [{ showGridLines: true }],
  });

  srcSheet.columns = [
    { header: 'Element ID', key: 'id', width: 14 },
    { header: 'Source Type', key: 'type', width: 18 },
    { header: 'Description', key: 'label', width: 26 },
    { header: 'Latitude (°N)', key: 'lat', width: 16 },
    { header: 'Longitude (°E)', key: 'lng', width: 16 },
    { header: 'Ground Elevation (m MSL)', key: 'elevation', width: 24 },
    { header: 'Water Surface Head (m MSL)', key: 'head', width: 26 },
    { header: 'Water Depth (m)', key: 'depth', width: 16 },
    { header: 'Net Discharge Flow (L/s)', key: 'flow', width: 24 },
  ];

  const srcHeaderRow = srcSheet.getRow(1);
  srcHeaderRow.height = 24;
  srcHeaderRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  network.reservoirs.forEach((r) => {
    const row = srcSheet.addRow({
      id: r.id,
      type: 'INTAKE RESERVOIR',
      label: r.label || r.id,
      lat: Math.round(r.lat * 1e6) / 1e6,
      lng: Math.round(r.lng * 1e6) / 1e6,
      elevation: r.elevation,
      head: r.totalHead,
      depth: (r.totalHead - r.elevation).toFixed(1),
      flow: r.netFlow ?? '—',
    });
    row.eachCell((cell) => {
      cell.font = regularFont;
      cell.border = thinBorder;
    });
  });

  network.tanks.forEach((t) => {
    const row = srcSheet.addRow({
      id: t.id,
      type: 'ELEVATED STORAGE TANK',
      label: t.label || t.id,
      lat: Math.round(t.lat * 1e6) / 1e6,
      lng: Math.round(t.lng * 1e6) / 1e6,
      elevation: t.elevation,
      head: (t.elevation + t.initialLevel).toFixed(2),
      depth: t.initialLevel,
      flow: t.netFlow ?? '—',
    });
    row.eachCell((cell) => {
      cell.font = regularFont;
      cell.border = thinBorder;
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Initiates browser download of the generated calculation report workbook.
 */
export async function downloadWaterHydraulicExcel(
  network: WaterDistributionNetwork,
  summary: SimulationSummary
): Promise<void> {
  const blob = await generateWaterHydraulicExcel(network, summary);
  const cleanName = network.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `Hydraulic_Calculation_Report_${cleanName}_${timestamp}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
