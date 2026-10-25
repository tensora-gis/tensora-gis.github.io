/**
 * Comprehensive Wastewater & Sanitary Sewer Calculation Excel Exporter
 *
 * Generates an engineering-grade, multi-worksheet calculation workbook (.xlsx)
 * documenting network topology, nodal sanitary flow generation, gravity pipe
 * Manning hydraulics, self-cleansing checks, surcharge states, lift stations,
 * 24-hr SWMM dynamic hydrograph routing, automated pipe sizing & slope optimization,
 * Pomeroy-Parkhurst H2S corrosion assessment, and inflow/infiltration analysis.
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
  HourlySewerSimulationPoint,
  SewerConstraintDesignResult,
  H2SCorrosionResult,
  InflowInfiltrationResult,
  LiftStationCycleResult,
} from '../types/wastewater';

export async function generateWastewaterExcel(
  network: WastewaterNetwork,
  summary: WastewaterSimulationSummary
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tensora GIS - Wastewater Collection & SWMM Engine';
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
    { width: 36 },
    { width: 32 },
    { width: 26 },
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
  subCell.value = `Project Network: ${network.name} | Manning Open-Channel Hydraulics & SWMM Dynamic Routing | Metric (SI) Units`;
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
  sumSheet.addRow(['Elevation Datum Source:', 'Copernicus GLO-30 / SRTM 30m DEM (Open-Meteo)', 'Total Gravity Sewer Length:', `${summary.totalGravityConduitLengthM} m`]);
  sumSheet.addRow(['Hydraulic Calculation Engine:', "SWMM 5.2 & Manning's Hydraulic Solver", 'Calculation Timestamp:', summary.runTimestamp]);

  sumSheet.addRow([]);

  // Section 2: Critical Hydraulic Extremes
  sumSheet.addRow(['HYDRAULIC PERFORMANCE & COMPLIANCE', '', 'CRITICAL THRESHOLD CHECKS', '']);
  sumSheet.getRow(14).font = boldFont;
  ['A14', 'B14', 'C14', 'D14'].forEach((cell) => {
    sumSheet.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  sumSheet.addRow(['Maximum Fullness Ratio (d/D):', `${summary.maxCapacityUtilizationRatio}`, 'Capacity Warning (d/D > 0.80):', summary.maxCapacityUtilizationRatio > 0.80 ? 'Exceeded' : 'Satisfactory']);
  sumSheet.addRow(['Critical Conduit Location:', `Conduit ${summary.criticalConduitId || 'N/A'}`, 'Surcharged Conduits Count:', `${summary.surchargedConduitIds.length} conduits`]);
  sumSheet.addRow(['Minimum Flow Velocity:', `${summary.minVelocityMs} m/s`, 'Self-Cleansing Check (V ≥ 0.6 m/s):', summary.subCleansingConduitIds.length === 0 ? 'Compliant' : `${summary.subCleansingConduitIds.length} sub-cleansing`]);
  sumSheet.addRow(['Minimum Velocity Location:', `Conduit ${summary.minVelocityConduitId || 'N/A'}`, 'Scour Velocity Check (V ≤ 3.0 m/s):', summary.scourWarningConduitIds.length === 0 ? 'Compliant' : `${summary.scourWarningConduitIds.length} scouring risks`]);
  sumSheet.addRow(['Maximum Flow Velocity:', `${summary.maxVelocityMs} m/s`, 'Reverse / Flat Slope Warnings:', `${summary.reverseSlopeConduitIds.length} conduits`]);
  sumSheet.addRow(['Maximum Velocity Location:', `Conduit ${summary.maxVelocityConduitId || 'N/A'}`, 'Surface Flooding Manholes:', `${summary.floodedManholeIds.length} manholes`]);
  sumSheet.addRow(['Total Lift Pumping Power:', `${summary.totalPumpingPowerKw} kW`, 'Force Main Piping Length:', `${summary.totalForceMainLengthM} m`]);
  sumSheet.addRow(['Daily Pumping Energy:', `${summary.dailyEnergyKwh ?? 0} kWh/day`, 'Estimated Annual Power Cost:', `$${(summary.annualEnergyCostUsd ?? 0).toLocaleString()} USD`]);
  sumSheet.addRow(['Severe H2S Corrosion Conduits:', `${(summary.h2sCorrosionResults || []).filter((h) => h.corrosionPotential === 'Severe').length} Conduits`, 'Sizing Upgrades Recommended:', `${(summary.constraintDesignResults || []).filter((s) => s.designStatus !== 'Optimal').length} Conduits`]);

  for (let r = 5; r <= 12; r++) {
    for (let c = 1; c <= 4; c++) {
      const cell = sumSheet.getRow(r).getCell(c);
      cell.font = regularFont;
      cell.border = thinBorder;
    }
  }
  for (let r = 15; r <= 23; r++) {
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
    { header: 'Invert Elev (m MSL)', key: 'inv', width: 16 },
    { header: 'Depth (m)', key: 'depth', width: 12 },
    { header: 'Diameter (mm)', key: 'dia', width: 14 },
    { header: 'Population', key: 'pop', width: 12 },
    { header: 'Base ADWF (L/s)', key: 'adwf', width: 15 },
    { header: 'Peaking Formula', key: 'formula', width: 16 },
    { header: 'Peak Sanitary (L/s)', key: 'peak', width: 16 },
    { header: 'I&I (L/s)', key: 'ii', width: 12 },
    { header: 'Total Inflow (L/s)', key: 'total', width: 16 },
    { header: 'Water Depth (m)', key: 'wDepth', width: 14 },
    { header: 'HGL Elev (m MSL)', key: 'hgl', width: 16 },
    { header: 'Surcharge (m)', key: 'sur', width: 14 },
    { header: 'Status', key: 'status', width: 16 },
  ];

  const mhHRow = mhSheet.getRow(1);
  mhHRow.font = headerFont;
  mhHRow.height = 24;
  mhHRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  network.manholes.forEach((m) => {
    let statusText = 'Normal Gravity';
    if (m.isFlooding) statusText = 'SURFACE FLOODING';
    else if (m.isSurcharged) statusText = 'Surcharged';

    const row = mhSheet.addRow({
      id: m.id,
      label: m.label,
      lat: Number(m.lat.toFixed(6)),
      lng: Number(m.lng.toFixed(6)),
      rim: Number(m.rimElevation.toFixed(2)),
      inv: Number(m.invertElevation.toFixed(2)),
      depth: Number(m.depth.toFixed(2)),
      dia: m.diameterMm,
      pop: m.population,
      adwf: m.averageSanitaryFlowLs ?? 0,
      formula: m.peakingFormula.toUpperCase(),
      peak: m.peakSanitaryFlowLs ?? 0,
      ii: m.inflowInfiltrationLs ?? 0,
      total: m.totalInflowLs ?? 0,
      wDepth: m.waterDepthM ?? 0,
      hgl: m.waterElevationM ?? 0,
      sur: m.surchargeDepthM ?? 0,
      status: statusText,
    });
    row.font = regularFont;
    row.eachCell((cell) => (cell.border = thinBorder));

    if (m.isFlooding) {
      row.getCell('status').font = { ...boldFont, color: { argb: 'FFDC2626' } };
    } else if (m.isSurcharged) {
      row.getCell('status').font = { ...boldFont, color: { argb: 'FFD97706' } };
    }
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
    { header: 'From Manhole', key: 'from', width: 15 },
    { header: 'To Manhole', key: 'to', width: 15 },
    { header: 'Diameter (mm)', key: 'dia', width: 14 },
    { header: 'Material', key: 'mat', width: 12 },
    { header: 'Manning n', key: 'n', width: 12 },
    { header: 'Length (m)', key: 'len', width: 12 },
    { header: 'Up Invert (m)', key: 'upInv', width: 14 },
    { header: 'Dn Invert (m)', key: 'dnInv', width: 14 },
    { header: 'Slope (%)', key: 'slopePct', width: 12 },
    { header: 'Design Q (L/s)', key: 'flow', width: 14 },
    { header: 'Full Q (L/s)', key: 'qFull', width: 14 },
    { header: 'Velocity (m/s)', key: 'vel', width: 14 },
    { header: 'Full V (m/s)', key: 'vFull', width: 14 },
    { header: 'Depth d (m)', key: 'depth', width: 12 },
    { header: 'Fullness d/D', key: 'ratio', width: 14 },
    { header: 'Hyd Radius (m)', key: 'rh', width: 14 },
    { header: 'Froude No.', key: 'fr', width: 12 },
    { header: 'Regime', key: 'regime', width: 14 },
    { header: 'Cleansing Check', key: 'clean', width: 16 },
    { header: 'Scour Check', key: 'scour', width: 14 },
  ];

  const pipeHRow = pipeSheet.getRow(1);
  pipeHRow.font = headerFont;
  pipeHRow.height = 24;
  pipeHRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  network.conduits.forEach((c) => {
    const fr = c.froudeNumber ?? 0;
    const regime = fr > 1.05 ? 'Supercritical' : fr < 0.95 ? 'Subcritical' : 'Critical Flow';

    const row = pipeSheet.addRow({
      id: c.id,
      label: c.label,
      from: c.startNodeId,
      to: c.endNodeId,
      dia: c.diameterMm,
      mat: c.material,
      n: c.manningN,
      len: Number(c.lengthM.toFixed(1)),
      upInv: Number(c.upstreamInvertM.toFixed(2)),
      dnInv: Number(c.downstreamInvertM.toFixed(2)),
      slopePct: Number((c.slopeMPerM * 100).toFixed(3)),
      flow: c.designFlowLs ?? 0,
      qFull: c.fullCapacityLs ?? 0,
      vel: c.actualVelocityMs ?? 0,
      vFull: c.fullVelocityMs ?? 0,
      depth: c.flowDepthM ?? 0,
      ratio: c.flowDepthRatio ?? 0,
      rh: c.hydraulicRadiusM ?? 0,
      fr: c.froudeNumber ?? 0,
      regime,
      clean: c.selfCleansingOk ? 'OK (V >= 0.6 m/s)' : 'DEFICIT (< 0.6 m/s)',
      scour: c.scourVelocityOk ? 'Safe (V <= 3.0 m/s)' : 'SCOUR RISK (> 3.0 m/s)',
    });
    row.font = regularFont;
    row.eachCell((cell) => (cell.border = thinBorder));

    if (!c.selfCleansingOk) {
      row.getCell('clean').font = { ...boldFont, color: { argb: 'FFD97706' } };
    }
    if (!c.scourVelocityOk) {
      row.getCell('scour').font = { ...boldFont, color: { argb: 'FFDC2626' } };
    }
    if ((c.flowDepthRatio ?? 0) > 0.80) {
      row.getCell('ratio').font = { ...boldFont, color: { argb: 'FFDC2626' } };
    }
  });

  // ==========================================
  // SHEET 4: LIFT STATIONS & PUMP UNITS
  // ==========================================
  const pumpSheet = workbook.addWorksheet('Lift_Stations_And_Pumps', {
    views: [{ showGridLines: true }],
  });

  pumpSheet.columns = [
    { header: 'Structure ID', key: 'id', width: 16 },
    { header: 'Structure Type', key: 'type', width: 20 },
    { header: 'Label', key: 'label', width: 26 },
    { header: 'Rim Elev (m MSL)', key: 'rim', width: 16 },
    { header: 'Floor Elev (m MSL)', key: 'floor', width: 16 },
    { header: 'Diameter / Vol', key: 'dim', width: 20 },
    { header: 'Design Inflow (L/s)', key: 'flow', width: 16 },
    { header: 'Rated Q (L/s)', key: 'qPump', width: 16 },
    { header: 'Dynamic Head (m)', key: 'head', width: 16 },
    { header: 'Power (kW)', key: 'power', width: 14 },
    { header: 'Efficiency (%)', key: 'eff', width: 14 },
    { header: 'Cycle Time (min)', key: 'cycle', width: 16 },
    { header: 'Starts/Hour', key: 'starts', width: 14 },
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
    const cycle = (summary.liftStationCycleResults || []).find((c) => c.wetWellId === w.id);
    const row = pumpSheet.addRow({
      id: w.id,
      type: 'Wet Well / Sump',
      label: w.label,
      rim: Number(w.rimElevation.toFixed(2)),
      floor: Number(w.floorElevation.toFixed(2)),
      dim: `${w.diameterM}m Dia (${w.storageVolumeM3} m³)`,
      flow: w.inflowLs ?? '-',
      qPump: '-',
      head: '-',
      power: '-',
      eff: '-',
      cycle: cycle?.cycleTimeMinutes ?? '-',
      starts: cycle?.startsPerHour ?? '-',
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
      dim: 'Submersible Unit',
      flow: '-',
      qPump: p.ratedDischargeLs,
      head: p.dynamicHeadM,
      power: p.powerKw ?? 0,
      eff: p.efficiencyPercent,
      cycle: '-',
      starts: '<= 10/hr',
      status: p.status === 'ON' ? 'Active Duty' : 'Standby',
    });
    row.font = regularFont;
    row.eachCell((cell) => (cell.border = thinBorder));
  });

  // ==========================================
  // SHEET 5: FORCE MAIN HYDRAULICS
  // ==========================================
  const fmSheet = workbook.addWorksheet('Force_Main_Hydraulics', {
    views: [{ showGridLines: true }],
  });

  fmSheet.columns = [
    { header: 'Force Main ID', key: 'id', width: 16 },
    { header: 'Label', key: 'label', width: 26 },
    { header: 'From Station', key: 'from', width: 16 },
    { header: 'To Node', key: 'to', width: 16 },
    { header: 'Diameter (mm)', key: 'dia', width: 14 },
    { header: 'Material', key: 'mat', width: 12 },
    { header: 'Length (m)', key: 'len', width: 12 },
    { header: 'Hazen-Williams C', key: 'c', width: 16 },
    { header: 'Flow Velocity (m/s)', key: 'vel', width: 16 },
    { header: 'Friction Loss (m)', key: 'hf', width: 16 },
    { header: 'Unit Loss (m/km)', key: 'unitLoss', width: 16 },
    { header: 'Velocity Rating', key: 'rating', width: 18 },
  ];

  const fmHRow = fmSheet.getRow(1);
  fmHRow.font = headerFont;
  fmHRow.height = 24;
  fmHRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  network.forceMains.forEach((fm) => {
    const vel = fm.velocityMs ?? 0;
    const hf = fm.frictionHeadlossM ?? 0;
    const unitLoss = fm.lengthM > 0 ? Math.round((hf / fm.lengthM) * 1000 * 10) / 10 : 0;
    const rating = vel < 0.8 ? 'Low (Risk of settling)' : vel > 2.5 ? 'High (Surge risk)' : 'Optimal (0.8 - 2.5 m/s)';

    const row = fmSheet.addRow({
      id: fm.id,
      label: fm.label,
      from: fm.startNodeId,
      to: fm.endNodeId,
      dia: fm.diameterMm,
      mat: fm.material,
      len: fm.lengthM,
      c: fm.cFactor,
      vel,
      hf,
      unitLoss,
      rating,
    });
    row.font = regularFont;
    row.eachCell((cell) => (cell.border = thinBorder));
  });

  // ==========================================
  // SHEET 6: EPS 24-HR DYNAMIC ROUTING
  // ==========================================
  const epsSheet = workbook.addWorksheet('EPS_24Hr_Dynamic_Routing', {
    views: [{ showGridLines: true }],
  });

  epsSheet.columns = [
    { header: 'Hour', key: 'hour', width: 10 },
    { header: 'Time Label', key: 'time', width: 14 },
    { header: 'Diurnal Multiplier', key: 'mult', width: 18 },
    { header: 'Total Flow (L/s)', key: 'flow', width: 16 },
    { header: 'Hourly Volume (m³/h)', key: 'vol', width: 20 },
    { header: 'Critical Conduit', key: 'conduit', width: 16 },
    { header: 'Max Capacity (d/D)', key: 'cap', width: 18 },
    { header: 'Wet Well Level (m MSL)', key: 'level', width: 22 },
    { header: 'Lift Pump Duty', key: 'pump', width: 16 },
    { header: 'Hydraulic Regime', key: 'regime', width: 18 },
  ];

  const epsHRow = epsSheet.getRow(1);
  epsHRow.font = headerFont;
  epsHRow.height = 24;
  epsHRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  (summary.hourlySimulationPoints || []).forEach((pt) => {
    const volM3h = Math.round(pt.totalFlowLs * 3.6 * 10) / 10;
    const regime = pt.maxCapacityUtilization > 0.80 ? 'Heavy Loading' : pt.maxCapacityUtilization < 0.35 ? 'Low Flow' : 'Normal Gravity';

    const row = epsSheet.addRow({
      hour: pt.hour,
      time: pt.timeLabel,
      mult: Number(pt.diurnalMultiplier.toFixed(2)),
      flow: pt.totalFlowLs,
      vol: volM3h,
      conduit: pt.criticalConduitId,
      cap: pt.maxCapacityUtilization,
      level: pt.wetWellWaterLevelM,
      pump: pt.pumpOperatingState,
      regime,
    });
    row.font = regularFont;
    row.eachCell((cell) => (cell.border = thinBorder));
  });

  // ==========================================
  // SHEET 7: AUTOMATED PIPE SIZING & OPTIMIZATION
  // ==========================================
  const optSheet = workbook.addWorksheet('Automated_Pipe_Sizing_Design', {
    views: [{ showGridLines: true }],
  });

  optSheet.columns = [
    { header: 'Conduit ID', key: 'id', width: 14 },
    { header: 'Current Diam (mm)', key: 'currDia', width: 18 },
    { header: 'Optimized Diam (mm)', key: 'recDia', width: 20 },
    { header: 'Current Slope (%)', key: 'currSlope', width: 16 },
    { header: 'Optimized Slope (%)', key: 'recSlope', width: 18 },
    { header: 'Soil Cover (m)', key: 'cover', width: 14 },
    { header: 'Design Status', key: 'status', width: 26 },
    { header: 'Engineering Recommendation & Civil Action', key: 'note', width: 50 },
  ];

  const optHRow = optSheet.getRow(1);
  optHRow.font = headerFont;
  optHRow.height = 24;
  optHRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  (summary.constraintDesignResults || []).forEach((opt) => {
    const row = optSheet.addRow({
      id: opt.conduitId,
      currDia: opt.currentDiameterMm,
      recDia: opt.recommendedDiameterMm,
      currSlope: opt.currentSlopePercent,
      recSlope: opt.recommendedSlopePercent,
      cover: opt.coverDepthM,
      status: opt.designStatus,
      note: opt.designNote,
    });
    row.font = regularFont;
    row.eachCell((cell) => (cell.border = thinBorder));

    if (opt.designStatus !== 'Optimal') {
      row.getCell('status').font = { ...boldFont, color: { argb: 'FFD97706' } };
    }
  });

  // ==========================================
  // SHEET 8: H2S CORROSION & ODOR ASSESSMENT
  // ==========================================
  const h2sSheet = workbook.addWorksheet('H2S_Corrosion_and_Odor_Risk', {
    views: [{ showGridLines: true }],
  });

  h2sSheet.columns = [
    { header: 'Conduit ID', key: 'id', width: 14 },
    { header: 'BOD5 (mg/L)', key: 'bod', width: 14 },
    { header: 'Temp (°C)', key: 'temp', width: 12 },
    { header: 'Pomeroy Z-Index', key: 'z', width: 16 },
    { header: 'Sulfide Rate (mg/L·hr)', key: 'rate', width: 20 },
    { header: 'Odor Potential', key: 'odor', width: 16 },
    { header: 'Crown Loss (mm/yr)', key: 'loss', width: 18 },
    { header: 'Corrosion Potential', key: 'pot', width: 20 },
  ];

  const h2sHRow = h2sSheet.getRow(1);
  h2sHRow.font = headerFont;
  h2sHRow.height = 24;
  h2sHRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  (summary.h2sCorrosionResults || []).forEach((h) => {
    const row = h2sSheet.addRow({
      id: h.conduitId,
      bod: h.bod5MgL,
      temp: h.temperatureC,
      z: h.zFactor,
      rate: h.sulfideBuildupRateMgLHr,
      odor: h.odorRisk,
      loss: h.crownLossMmPerYear,
      pot: h.corrosionPotential,
    });
    row.font = regularFont;
    row.eachCell((cell) => (cell.border = thinBorder));

    if (h.corrosionPotential === 'Severe') {
      row.getCell('pot').font = { ...boldFont, color: { argb: 'FFDC2626' } };
    } else if (h.corrosionPotential === 'Moderate') {
      row.getCell('pot').font = { ...boldFont, color: { argb: 'FFD97706' } };
    }
  });

  // ==========================================
  // SHEET 9: INFLOW & INFILTRATION ANALYSIS
  // ==========================================
  const iiSheet = workbook.addWorksheet('Inflow_Infiltration_Analysis', {
    views: [{ showGridLines: true }],
  });

  iiSheet.columns = [
    { header: 'Manhole ID', key: 'id', width: 14 },
    { header: 'Base ADWF (L/s)', key: 'adwf', width: 16 },
    { header: 'Groundwater GWI (L/s)', key: 'gwi', width: 20 },
    { header: 'Storm RDII (L/s)', key: 'rdii', width: 16 },
    { header: 'Total Wet Weather (L/s)', key: 'total', width: 22 },
    { header: 'Dilution Ratio', key: 'dil', width: 16 },
    { header: 'Infiltration Priority', key: 'priority', width: 20 },
  ];

  const iiHRow = iiSheet.getRow(1);
  iiHRow.font = headerFont;
  iiHRow.height = 24;
  iiHRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  (summary.inflowInfiltrationResults || []).forEach((ii) => {
    const priority = ii.dilutionRatio > 4.0 ? 'High Infiltration Risk' : ii.dilutionRatio > 2.5 ? 'Moderate' : 'Low / Sealed';
    const row = iiSheet.addRow({
      id: ii.manholeId,
      adwf: ii.dryWeatherFlowLs,
      gwi: ii.gwiFlowLs,
      rdii: ii.rdiiFlowLs,
      total: ii.totalWetWeatherPeakLs,
      dil: ii.dilutionRatio,
      priority,
    });
    row.font = regularFont;
    row.eachCell((cell) => (cell.border = thinBorder));
  });

  // ==========================================
  // SHEET 10: OUTFALL EFFLUENT DISCHARGES
  // ==========================================
  const outSheet = workbook.addWorksheet('Outfall_and_Discharge_Summary', {
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
    { header: 'Free Outfall Margin (m)', key: 'margin', width: 22 },
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
    const margin = Math.round((o.invertElevation - o.receivingWaterElevation) * 100) / 100;

    const row = outSheet.addRow({
      id: o.id,
      label: o.label,
      lat: Number(o.lat.toFixed(6)),
      lng: Number(o.lng.toFixed(6)),
      inv: Number(o.invertElevation.toFixed(2)),
      water: Number(o.receivingWaterElevation.toFixed(2)),
      qLs: flowLs,
      m3d: m3Day,
      margin: margin >= 0 ? `+${margin}m Free` : `${margin}m Submerged`,
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
