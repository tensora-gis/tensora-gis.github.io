/**
 * Comprehensive Wastewater & Sanitary Sewer Calculation Excel Exporter
 *
 * Generates an engineering-grade, multi-worksheet calculation workbook (.xlsx)
 * documenting network topology, nodal sanitary flow generation, gravity pipe
 * Manning hydraulics, self-cleansing checks, surcharge states, and lift stations.
 */

import type ExcelJS from 'exceljs';
import {
  WastewaterNetwork,
  WastewaterSimulationSummary,
  WastewaterManhole,
  WastewaterConduit,
  WastewaterWetWell,
  WastewaterPump,
  WastewaterForceMain,
  WastewaterOutfall,
} from '../types/wastewater';

export async function generateWastewaterExcel(
  network: WastewaterNetwork,
  summary: WastewaterSimulationSummary
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tensora GIS - Wastewater Hydraulic Engine';
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

  const boldFont: Partial<ExcelJS.Font> = {
    name: 'Segoe UI',
    size: 10,
    bold: true,
  };

  const regularFont: Partial<ExcelJS.Font> = {
    name: 'Segoe UI',
    size: 10,
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
    { width: 30 },
    { width: 22 },
    { width: 36 },
  ];

  // Title Block
  sumSheet.mergeCells('A1:D1');
  const titleCell = sumSheet.getCell('A1');
  titleCell.value = 'WASTEWATER SEWER SYSTEM HYDRAULIC CALCULATION REPORT';
  titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle' };
  sumSheet.getRow(1).height = 28;

  sumSheet.mergeCells('A2:D2');
  const subCell = sumSheet.getCell('A2');
  subCell.value = `Project Network: ${network.name} | Manning Open-Channel Hydraulics & Diurnal Peaking | Metric (SI) Units`;
  subCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF64748B' } };

  sumSheet.addRow([]);

  // Section 1: Parameters & Flow Continuity
  sumSheet.addRow(['SYSTEM FLOW SUMMARY', '', 'NETWORK COMPONENT INVENTORY', '']);
  sumSheet.getRow(4).font = boldFont;
  ['A4', 'B4', 'C4', 'D4'].forEach((cell) => {
    sumSheet.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  sumSheet.addRow(['Total Contributing Population:', `${summary.totalPopulation.toLocaleString()} Capita`, 'Total Manhole Chambers:', network.manholes.length]);
  sumSheet.addRow(['Total Dry Weather Flow (ADWF):', `${summary.totalDryWeatherFlowLs} L/s (${(summary.totalDryWeatherFlowLs * 3.6).toFixed(1)} m³/h)`, 'Gravity Sewer Conduits:', network.conduits.length]);
  sumSheet.addRow(['Total Peak Sanitary Inflow:', `${summary.totalPeakSanitaryFlowLs} L/s (${(summary.totalPeakSanitaryFlowLs * 3.6).toFixed(1)} m³/h)`, 'Terminal Outfall Structures:', network.outfalls.length]);
  sumSheet.addRow(['Total Inflow & Infiltration (I&I):', `${summary.totalInflowInfiltrationLs} L/s`, 'Lift Stations & Wet Wells:', network.wetWells.length]);
  sumSheet.addRow(['Total Effluent Outfall Discharge:', `${summary.totalOutfallDischargeLs} L/s`, 'Sewage Pumps Installed:', network.pumps.length]);
  sumSheet.addRow(['Mass Continuity Imbalance:', `${summary.flowImbalanceLs} L/s`, 'Pressurized Force Mains:', network.forceMains.length]);
  sumSheet.addRow(['Elevation Datum Source:', 'Copernicus GLO-30 / SRTM 30m DEM (Open-Meteo)', 'Total Sewer System Length:', `${summary.totalGravityConduitLengthM} m`]);
  sumSheet.addRow(['Hydraulic Calculation Engine:', "Manning's Equation & Energy Grade Solver", 'Calculation Timestamp:', summary.runTimestamp]);

  sumSheet.addRow([]);

  // Section 2: Critical Hydraulic Extremes
  sumSheet.addRow(['HYDRAULIC PERFORMANCE & COMPLIANCE', '', 'CRITICAL THRESHOLD CHECKS', '']);
  sumSheet.getRow(14).font = boldFont;
  ['A14', 'B14', 'C14', 'D14'].forEach((cell) => {
    sumSheet.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  sumSheet.addRow(['Maximum Fullness Ratio (d/D):', `${summary.maxCapacityUtilizationRatio}`, 'Capacity Warning (d/D > 0.75):', summary.maxCapacityUtilizationRatio > 0.75 ? 'Exceeded' : 'Satisfactory']);
  sumSheet.addRow(['Critical Conduit Location:', `Conduit ${summary.criticalConduitId || 'N/A'}`, 'Surcharged Conduits Count:', `${summary.surchargedConduitIds.length} conduits`]);
  sumSheet.addRow(['Minimum Flow Velocity:', `${summary.minVelocityMs} m/s`, 'Self-Cleansing Check (V ≥ 0.6 m/s):', summary.subCleansingConduitIds.length === 0 ? 'Compliant' : `${summary.subCleansingConduitIds.length} sub-cleansing`]);
  sumSheet.addRow(['Minimum Velocity Location:', `Conduit ${summary.minVelocityConduitId || 'N/A'}`, 'Scour Velocity Check (V ≤ 3.0 m/s):', summary.scourWarningConduitIds.length === 0 ? 'Compliant' : `${summary.scourWarningConduitIds.length} scouring risks`]);
  sumSheet.addRow(['Maximum Flow Velocity:', `${summary.maxVelocityMs} m/s`, 'Reverse / Flat Slope Warnings:', `${summary.reverseSlopeConduitIds.length} conduits`]);
  sumSheet.addRow(['Maximum Velocity Location:', `Conduit ${summary.maxVelocityConduitId || 'N/A'}`, 'Surface Flooding Manholes:', `${summary.floodedManholeIds.length} manholes`]);
  sumSheet.addRow(['Total Lift Pumping Power:', `${summary.totalPumpingPowerKw} kW`, 'Force Main Piping Length:', `${summary.totalForceMainLengthM} m`]);

  for (let r = 5; r <= 12; r++) {
    for (let c = 1; c <= 4; c++) {
      const cell = sumSheet.getRow(r).getCell(c);
      cell.font = regularFont;
      cell.border = thinBorder;
    }
  }
  for (let r = 15; r <= 21; r++) {
    for (let c = 1; c <= 4; c++) {
      const cell = sumSheet.getRow(r).getCell(c);
      cell.font = regularFont;
      cell.border = thinBorder;
    }
  }

  // ==========================================
  // SHEET 2: MANHOLE SCHEDULE & SANITARY LOADS
  // ==========================================
  const mhSheet = workbook.addWorksheet('Manhole_Schedule', {
    views: [{ showGridLines: true }],
  });

  mhSheet.columns = [
    { header: 'Manhole ID', key: 'id', width: 14 },
    { header: 'Label', key: 'label', width: 22 },
    { header: 'Latitude (°N)', key: 'lat', width: 14 },
    { header: 'Longitude (°E)', key: 'lng', width: 14 },
    { header: 'Rim Elev (m MSL)', key: 'rim', width: 16 },
    { header: 'Invert Elev (m MSL)', key: 'invert', width: 18 },
    { header: 'Chamber Depth (m)', key: 'depth', width: 18 },
    { header: 'Diameter (mm)', key: 'dia', width: 15 },
    { header: 'Population (Cap)', key: 'pop', width: 16 },
    { header: 'Peaking Formula', key: 'formula', width: 16 },
    { header: 'Avg Flow (L/s)', key: 'avgFlow', width: 14 },
    { header: 'Peak Flow (L/s)', key: 'peakFlow', width: 15 },
    { header: 'Total Inflow (L/s)', key: 'inflow', width: 16 },
    { header: 'Water Elev (m MSL)', key: 'hgl', width: 18 },
    { header: 'Water Depth (m)', key: 'wDepth', width: 16 },
    { header: 'Surcharge Status', key: 'status', width: 18 },
  ];

  const mhHRow = mhSheet.getRow(1);
  mhHRow.font = headerFont;
  mhHRow.height = 24;
  mhHRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  network.manholes.forEach((m) => {
    const isSurcharged = m.isSurcharged || false;
    const isFlooding = m.isFlooding || false;
    const statusText = isFlooding
      ? 'SURFACE FLOODING'
      : isSurcharged
      ? `SURCHARGED (+${m.surchargeDepthM?.toFixed(2)}m)`
      : 'Gravity Free-Flow';

    const row = mhSheet.addRow({
      id: m.id,
      label: m.label,
      lat: Number(m.lat.toFixed(6)),
      lng: Number(m.lng.toFixed(6)),
      rim: Number(m.rimElevation.toFixed(2)),
      invert: Number(m.invertElevation.toFixed(2)),
      depth: Number(m.depth.toFixed(2)),
      dia: m.diameterMm,
      pop: m.population,
      formula: m.peakingFormula.toUpperCase(),
      avgFlow: m.averageSanitaryFlowLs ?? 0,
      peakFlow: m.peakSanitaryFlowLs ?? 0,
      inflow: m.totalInflowLs ?? 0,
      hgl: m.waterElevationM ?? m.invertElevation,
      wDepth: m.waterDepthM ?? 0,
      status: statusText,
    });

    row.font = regularFont;
    row.eachCell((cell, colNumber) => {
      cell.border = thinBorder;
      if (colNumber === 16) {
        if (isFlooding) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF991B1B' } };
        } else if (isSurcharged) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF92400E' } };
        } else {
          cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF065F46' } };
        }
      }
    });
  });

  // ==========================================
  // SHEET 3: GRAVITY CONDUIT HYDRAULICS
  // ==========================================
  const pipeSheet = workbook.addWorksheet('Gravity_Conduit_Hydraulics', {
    views: [{ showGridLines: true }],
  });

  pipeSheet.columns = [
    { header: 'Conduit ID', key: 'id', width: 14 },
    { header: 'Label', key: 'label', width: 22 },
    { header: 'From Node', key: 'from', width: 14 },
    { header: 'To Node', key: 'to', width: 14 },
    { header: 'Length (m)', key: 'len', width: 13 },
    { header: 'Diameter (mm)', key: 'dia', width: 15 },
    { header: 'Material', key: 'mat', width: 12 },
    { header: 'Manning n', key: 'n', width: 12 },
    { header: 'Up Invert (m)', key: 'upInv', width: 15 },
    { header: 'Dn Invert (m)', key: 'dnInv', width: 15 },
    { header: 'Slope (%)', key: 'slope', width: 12 },
    { header: 'Full Cap Qfull (L/s)', key: 'qFull', width: 18 },
    { header: 'Design Q (L/s)', key: 'qActual', width: 15 },
    { header: 'Fullness (d/D)', key: 'ratio', width: 15 },
    { header: 'Depth yn (m)', key: 'depth', width: 14 },
    { header: 'Velocity (m/s)', key: 'vel', width: 14 },
    { header: 'Full Vel (m/s)', key: 'vFull', width: 14 },
    { header: 'Froude No.', key: 'fr', width: 12 },
    { header: 'Self-Cleansing (≥0.6)', key: 'cleansing', width: 18 },
    { header: 'Scour Check (≤3.0)', key: 'scour', width: 18 },
    { header: 'Hydraulic Status', key: 'status', width: 18 },
  ];

  const pipeHRow = pipeSheet.getRow(1);
  pipeHRow.font = headerFont;
  pipeHRow.height = 24;
  pipeHRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  network.conduits.forEach((c) => {
    const dOverD = c.flowDepthRatio ?? 0;
    const isSurcharged = dOverD > 1.0;
    const isSubCleansing = (c.actualVelocityMs ?? 0) < 0.6 && (c.designFlowLs ?? 0) > 0.5;
    const isScouring = (c.actualVelocityMs ?? 0) > 3.0;

    let statusText = 'Normal Free-Flow';
    if (c.isReverseSlope) statusText = 'REVERSE SLOPE';
    else if (isSurcharged) statusText = 'SURCHARGED';
    else if (dOverD > 0.75) statusText = 'HIGH CAPACITY';

    const row = pipeSheet.addRow({
      id: c.id,
      label: c.label,
      from: c.startNodeId,
      to: c.endNodeId,
      len: c.lengthM,
      dia: c.diameterMm,
      mat: c.material,
      n: c.manningN,
      upInv: Number(c.upstreamInvertM.toFixed(2)),
      dnInv: Number(c.downstreamInvertM.toFixed(2)),
      slope: Number((c.slopeMPerM * 100).toFixed(3)),
      qFull: c.fullCapacityLs ?? 0,
      qActual: c.designFlowLs ?? 0,
      ratio: Number(dOverD.toFixed(2)),
      depth: c.flowDepthM ?? 0,
      vel: c.actualVelocityMs ?? 0,
      vFull: c.fullVelocityMs ?? 0,
      fr: c.froudeNumber ?? 0,
      cleansing: isSubCleansing ? 'SUB-CLEANSING (<0.6)' : 'OK (≥ 0.6 m/s)',
      scour: isScouring ? 'SCOUR RISK (>3.0)' : 'OK (≤ 3.0 m/s)',
      status: statusText,
    });

    row.font = regularFont;
    row.eachCell((cell, colNumber) => {
      cell.border = thinBorder;
      // Color-code capacity column
      if (colNumber === 14) {
        if (isSurcharged) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF991B1B' } };
        } else if (dOverD > 0.75) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF92400E' } };
        }
      }
      // Self-cleansing column
      if (colNumber === 19 && isSubCleansing) {
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFD97706' } };
      }
    });
  });

  // ==========================================
  // SHEET 4: LIFT STATIONS, PUMPS & FORCE MAINS
  // ==========================================
  const pumpSheet = workbook.addWorksheet('Lift_Stations_And_Pumps', {
    views: [{ showGridLines: true }],
  });

  pumpSheet.columns = [
    { header: 'Structure ID', key: 'id', width: 16 },
    { header: 'Structure Type', key: 'type', width: 18 },
    { header: 'Label', key: 'label', width: 24 },
    { header: 'Rim Elev (m MSL)', key: 'rim', width: 18 },
    { header: 'Floor Elev (m MSL)', key: 'floor', width: 18 },
    { header: 'Diameter / Vol', key: 'dim', width: 18 },
    { header: 'Design Flow (L/s)', key: 'flow', width: 16 },
    { header: 'Head TDH (m)', key: 'head', width: 14 },
    { header: 'Motor Power (kW)', key: 'power', width: 16 },
    { header: 'Operating Status', key: 'status', width: 16 },
  ];

  const pumpHRow = pumpSheet.getRow(1);
  pumpHRow.font = headerFont;
  pumpHRow.height = 24;
  pumpHRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  network.wetWells.forEach((w) => {
    const row = pumpSheet.addRow({
      id: w.id,
      type: 'Wet Well / Sump',
      label: w.label,
      rim: Number(w.rimElevation.toFixed(2)),
      floor: Number(w.floorElevation.toFixed(2)),
      dim: `${w.diameterM}m Dia (${w.storageVolumeM3} m³)`,
      flow: w.inflowLs ?? '-',
      head: '-',
      power: '-',
      status: 'Operating Sump',
    });
    row.font = regularFont;
    row.eachCell((cell) => (cell.border = thinBorder));
  });

  network.pumps.forEach((p) => {
    const row = pumpSheet.addRow({
      id: p.id,
      type: 'Sewage Lift Pump',
      label: p.label,
      rim: '-',
      floor: '-',
      dim: `${p.efficiencyPercent}% Eff`,
      flow: p.ratedDischargeLs,
      head: p.dynamicHeadM,
      power: p.powerKw ?? 0,
      status: p.status === 'ON' ? 'Active Duty' : 'Standby',
    });
    row.font = regularFont;
    row.eachCell((cell) => (cell.border = thinBorder));
  });

  network.forceMains.forEach((fm) => {
    const row = pumpSheet.addRow({
      id: fm.id,
      type: 'Pressurized Force Main',
      label: fm.label,
      rim: '-',
      floor: '-',
      dim: `${fm.diameterMm}mm ${fm.material} (L=${fm.lengthM}m)`,
      flow: '-',
      head: `hf = ${fm.frictionHeadlossM ?? 0}m`,
      power: `V = ${fm.velocityMs ?? 0}m/s`,
      status: 'Pressurized Pipe',
    });
    row.font = regularFont;
    row.eachCell((cell) => (cell.border = thinBorder));
  });

  // ==========================================
  // SHEET 5: OUTFALL EFFLUENT DISCHARGES
  // ==========================================
  const outSheet = workbook.addWorksheet('Outfall_Discharges', {
    views: [{ showGridLines: true }],
  });

  outSheet.columns = [
    { header: 'Outfall ID', key: 'id', width: 16 },
    { header: 'Label', key: 'label', width: 28 },
    { header: 'Latitude (°N)', key: 'lat', width: 16 },
    { header: 'Longitude (°E)', key: 'lng', width: 16 },
    { header: 'Invert Elev (m MSL)', key: 'inv', width: 20 },
    { header: 'Receiving Water (m MSL)', key: 'water', width: 22 },
    { header: 'Total Effluent Flow (L/s)', key: 'qLs', width: 24 },
    { header: 'Discharge Volume (m³/day)', key: 'm3d', width: 24 },
  ];

  const outHRow = outSheet.getRow(1);
  outHRow.font = headerFont;
  outHRow.height = 24;
  outHRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  network.outfalls.forEach((o) => {
    const flowLs = o.totalDischargeLs ?? 0;
    const m3Day = Math.round(flowLs * 86.4 * 10) / 10;
    const row = outSheet.addRow({
      id: o.id,
      label: o.label,
      lat: Number(o.lat.toFixed(6)),
      lng: Number(o.lng.toFixed(6)),
      inv: Number(o.invertElevation.toFixed(2)),
      water: Number(o.receivingWaterElevation.toFixed(2)),
      qLs: flowLs,
      m3d: m3Day,
    });
    row.font = regularFont;
    row.eachCell((cell) => (cell.border = thinBorder));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function downloadWastewaterExcel(
  network: WastewaterNetwork,
  summary: WastewaterSimulationSummary
): Promise<void> {
  const blob = await generateWastewaterExcel(network, summary);
  const cleanName = network.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `Wastewater_Hydraulic_Calculation_${cleanName}_${timestamp}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
