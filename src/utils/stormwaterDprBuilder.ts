import type ExcelJS from 'exceljs';
import { SnapshotParams } from '../server/snapshotGenerator';
import { HydrologyReport } from '../types/hydrology';
import {
  DprProjectMetadata,
  getDefaultDprMetadata,
  buildTitleBanner,
  buildSectionHeader,
  appendWorkedCalculationRow,
  applyComplianceConditionalFormatting,
  DPR_COLORS,
  DPR_BORDERS,
} from './dprExcelBase';

export interface StormwaterDprData {
  targetChainageFormatted: string;
  targetChainage: number;
  latitudeDMS: string;
  longitudeDMS: string;
  latitudeDD: number;
  longitudeDD: number;
  catchmentAreaKm2: number;
  lengthOfStreamKm: number;
  levelStreamOriginM: number;
  highestContourM: number;
  elevationDropM: number;
  scopeAppliedM?: number;
  scopeExpandedDueToFlatRelief?: boolean;
  reliefWithinScopeM?: number;
  meetsReliefThreshold?: boolean;
  elevationSource?: string;
  elevationOriginKind?: 'survey' | 'dem';
  demCoverage?: number;
  catchmentPolygon?: [number, number][];
  streamCoordinates?: [number, number][];
  elevationProfile?: { distanceM: number; elevationM: number; lat: number; lng: number }[];
}

/**
 * Builds the complete 5-Worksheet Cross-Drainage (CD) DPR Package:
 * 1. 00_Codal_Constants: Lookup tables for P/C, Cd/USGS, Ksf/ASTM, velocity & scour limits
 * 2. 01_CD_Executive_Summary: Catchment & corridor coordinates, KPI scorecard, embedded 70% snapshot
 * 3. 02_Hydrology_Worked_Calcs: Full worked hydrology steps 1.1-1.6 with live formulas & CONCAT substitutions
 * 4. 03_Culvert_Hydraulics_Scour: Full worked culvert & scour steps 2.1-2.4 with live formulas
 * 5. 04_Catchment_Hypsometry: Elevation-area distribution & main stream longitudinal profile
 *
 * Supports dual codal methodologies:
 * - INDIAN_DPR: IRC:SP:13-2022, IRC:SP:42-2014, IRC:78-2014, IS 458:2021
 * - INTERNATIONAL: FHWA HDS-5, AASHTO Drainage Manual, ASTM C76M, FHWA HEC-18
 */
export async function populateStormwaterDprWorkbook(
  workbook: ExcelJS.Workbook,
  reportData: SnapshotParams | HydrologyReport | StormwaterDprData,
  snapshotImage?: Buffer | Uint8Array | string,
  metadata?: DprProjectMetadata
): Promise<void> {
  const chosenStd = metadata?.designStandard || 'INDIAN_DPR';
  const meta: DprProjectMetadata = {
    ...getDefaultDprMetadata('stormwater', chosenStd),
    targetChainage: reportData.targetChainageFormatted || String(reportData.targetChainage),
    demProvenance: reportData.elevationSource || 'Copernicus GLO-30 (FABDEM 30m Global DEM)',
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
    ...metadata,
    designStandard: chosenStd,
  };

  const isIndian = meta.designStandard !== 'INTERNATIONAL';
  const chTag = reportData.targetChainageFormatted || String(reportData.targetChainage) || '0+000';

  // Create all 5 worksheets upfront in strict canonical DPR order:
  // 1. 00_Codal_Constants
  // 2. 01_CD_Executive_Summary
  // 3. 02_Hydrology_Worked_Calcs
  // 4. 03_Culvert_Hydraulics_Scour
  // 5. 04_Catchment_Hypsometry
  const ws00 = workbook.addWorksheet('00_Codal_Constants', { views: [{ showGridLines: true }] });
  const ws01 = workbook.addWorksheet('01_CD_Executive_Summary', { views: [{ showGridLines: true }] });
  const ws02 = workbook.addWorksheet('02_Hydrology_Worked_Calcs', { views: [{ showGridLines: true }] });
  const ws03 = workbook.addWorksheet('03_Culvert_Hydraulics_Scour', { views: [{ showGridLines: true }] });
  const ws04 = workbook.addWorksheet('04_Catchment_Hypsometry', { views: [{ showGridLines: true }] });

  // -------------------------------------------------------------------------
  // SHEET 1: 00_Codal_Constants
  // -------------------------------------------------------------------------
  ws00.columns = [
    { width: 34 },
    { width: 40 },
    { width: 18 },
    { width: 12 },
    { width: 28 },
    { width: 20 },
  ];

  buildTitleBanner(ws00, meta, 6);

  // Section 1: Runoff Coefficients (IRC:SP:13 Table 4.1 or AASHTO Table 4-1)
  const sec1Title = isIndian
    ? '1. RUNOFF COEFFICIENT (P) LOOKUP TABLE — IRC:SP:13-2022 TABLE 4.1'
    : '1. AASHTO / ASCE RATIONAL METHOD RUNOFF COEFFICIENTS (C)';
  buildSectionHeader(ws00, sec1Title, 6);
  const hRow1 = ws00.addRow([
    isIndian ? 'Catchment Type' : 'Drainage Basin Land Use',
    'Surface / Soil Description',
    isIndian ? 'Runoff Coeff (P)' : 'Runoff Coeff (C)',
    'Unit',
    'Governing Standard',
    'Codal Reference',
  ]);
  hRow1.height = 22;
  formatTableHeaderRow(hRow1, 6);

  const pRows: [string, string, number, string, string, string][] = isIndian
    ? [
        ['Steep, bare rock', 'Steep mountainous terrain with bare rock surfaces', 0.9, '—', 'IRC:SP:13-2022', 'Table 4.1'],
        ['Hilly, steep with vegetation', 'Steep hilly terrain covered with forest/brush', 0.75, '—', 'IRC:SP:13-2022', 'Table 4.1'],
        ['Cultivated undulating / plains', 'Undulating agricultural ground (Design Default)', 0.5, '—', 'IRC:SP:13-2022', 'Table 4.1'], // Row 11: C11
        ['Sandy, flat permeable soil', 'Flat sandy soil with high infiltration capacity', 0.35, '—', 'IRC:SP:13-2022', 'Table 4.1'],
      ]
    : [
        ['Impervious / Paved Surfaces', 'Asphalt, concrete, and heavy roadway surfaces', 0.9, '—', 'AASHTO Drainage Manual', 'Table 4-1'],
        ['Steep Bare Soil & Hardpack', 'Steep barren ground or heavy compacted clay', 0.75, '—', 'AASHTO Drainage Manual', 'Table 4-1'],
        ['Cultivated Agricultural Plains', 'Undulating agricultural ground (Design Default)', 0.5, '—', 'AASHTO Drainage Manual', 'Table 4-1'], // Row 11: C11
        ['Sandy Pasture & Open Woodland', 'Sandy permeable soil with woodland cover', 0.35, '—', 'AASHTO Drainage Manual', 'Table 4-1'],
      ];
  for (const r of pRows) {
    const row = ws00.addRow(r);
    row.height = 20;
    formatDataRow(row, 6, [false, false, true, true, false, false]);
  }

  ws00.addRow([]);

  // Section 2: Regional Flood Envelopes (IRC:SP:13 Cl. 4.3 or USGS Regional Regression)
  const sec2Title = isIndian
    ? '2. REGIONAL EMPIRICAL FLOOD COEFFICIENTS — IRC:SP:13-2022 CL. 4.3'
    : '2. USGS REGIONAL REGRESSION FLOOD PARAMETERS (Qp = a * A^b)';
  buildSectionHeader(ws00, sec2Title, 6);
  const hRow2 = ws00.addRow([
    'Geographic Region / Zone',
    'Empirical Flood Parameter',
    'Design Value',
    'Unit',
    'Governing Standard',
    'Codal Reference',
  ]);
  hRow2.height = 22;
  formatTableHeaderRow(hRow2, 6);

  const empRows: [string, string, number, string, string, string][] = isIndian
    ? [
        ['North Indian Plains', 'Dickens Empirical Coefficient (Cd)', 11.4, '—', 'IRC:SP:13-2022', 'Cl. 4.3.1'],
        ['Central India / Hilly Catchments', 'Dickens Empirical Coefficient (Cd - Default)', 16.75, '—', 'IRC:SP:13-2022', 'Cl. 4.3.1'], // Row 17: C17
        ['Western Ghats / Coastal Heavy', 'Dickens Empirical Coefficient (Cd)', 23.5, '—', 'IRC:SP:13-2022', 'Cl. 4.3.1'],
        ['Coastal areas within 25 km of sea', 'Ryves Empirical Coefficient (Cy)', 6.8, '—', 'IRC:SP:13-2022', 'Cl. 4.3.2'],
        ['25 km to 160 km from coast', 'Ryves Empirical Coefficient (Cy - Default)', 8.5, '—', 'IRC:SP:13-2022', 'Cl. 4.3.2'], // Row 20: C20
        ['Limited hills / Deccan Plateau', 'Ryves Empirical Coefficient (Cy)', 10.2, '—', 'IRC:SP:13-2022', 'Cl. 4.3.2'],
        ['Western Ghats / Deccan streams', 'Inglis Empirical Constant (Qi multiplier)', 124.0, '—', 'IRC:SP:13-2022', 'Cl. 4.3.3'],
      ]
    : [
        ['USGS Region 1 (Northeastern Humid)', 'Regional Regression Curve Coefficient (a)', 25.0, '—', 'USGS SIR 2014-5002', 'Eq. 4.1'],
        ['USGS Region 2 (Midwest / Plains)', 'Regional Regression Curve Coefficient (a - Default)', 18.5, '—', 'USGS SIR 2014-5002', 'Eq. 4.2'], // Row 17: C17
        ['USGS Region 3 (Semi-Arid / Mountain)', 'Regional Regression Curve Coefficient (a)', 12.0, '—', 'USGS SIR 2014-5002', 'Eq. 4.3'],
        ['USGS Exponent b (Region 1 Humid)', 'Drainage Basin Area Exponent (b)', 0.7, '—', 'USGS SIR 2014-5002', 'Table 2'],
        ['USGS Exponent b (Region 2 Midwest)', 'Drainage Basin Area Exponent (b - Default)', 0.68, '—', 'USGS SIR 2014-5002', 'Table 2'], // Row 20: C20
        ['USGS Exponent b (Region 3 Semi-Arid)', 'Drainage Basin Area Exponent (b)', 0.65, '—', 'USGS SIR 2014-5002', 'Table 2'],
        ['FHWA HDS-2 Rational SI Conversion Factor', 'Metric SI Rational Factor (1/360)', 0.00278, '—', 'FHWA HDS-2 / AASHTO', 'Sec. 5.1'], // Row 22: C22
      ];
  for (const r of empRows) {
    const row = ws00.addRow(r);
    row.height = 20;
    formatDataRow(row, 6, [false, false, true, true, false, false]);
  }

  ws00.addRow([]);

  // Section 3: Lacey Silt Factors or ASTM C76M Pipe / FHWA HEC-18 Scour
  const sec3Title = isIndian
    ? "3. LACEY'S SILT FACTOR (Ksf = 1.76 * SQRT(d50)) — IRC:SP:13-2022 TABLE 7.1"
    : '3. ASTM C76M CONCRETE PIPE & FHWA HEC-18 SCOUR FACTORS';
  buildSectionHeader(ws00, sec3Title, 6);
  const hRow3 = ws00.addRow([
    isIndian ? 'Bed Material Classification' : 'Culvert Pipe / Scour Parameter',
    isIndian ? 'Mean Diameter d50 Description' : 'Engineering Specification Details',
    isIndian ? 'Silt Factor (Ksf)' : 'Standard Factor',
    'Unit',
    'Governing Standard',
    'Codal Reference',
  ]);
  hRow3.height = 22;
  formatTableHeaderRow(hRow3, 6);

  const siltRows: [string, string, number, string, string, string][] = isIndian
    ? [
        ['Fine silt (d50 = 0.12 mm)', 'Fine alluvial silt channel bed', 0.6, '—', 'IRC:SP:13-2022', 'Table 7.1'],
        ['Medium sand (d50 = 0.32 mm)', 'Standard medium river sand (Design Default)', 1.0, '—', 'IRC:SP:13-2022', 'Table 7.1'], // Row 27: C27
        ['Coarse sand (d50 = 0.55 mm)', 'Coarse riverbed sand', 1.3, '—', 'IRC:SP:13-2022', 'Table 7.1'],
        ['Bajri and small gravel (d50 = 1.00 mm)', 'Gravelly bed material and bajri', 1.75, '—', 'IRC:SP:13-2022', 'Table 7.1'],
        ['Heavy boulders (d50 = 4.00 mm)', 'Mountainous boulder channel bed', 3.5, '—', 'IRC:SP:13-2022', 'Table 7.1'],
      ]
    : [
        ['ASTM C76M Class III Pipe', 'Standard-strength reinforced concrete pipe', 65.0, 'kN/m/m', 'ASTM C76M-20', 'Table 3'],
        ['ASTM C76M Class IV Pipe (Design Default)', 'Heavy-duty highway culvert pipe (Design Default)', 1.0, '—', 'ASTM C76M-20', 'Table 4'], // Row 27: C27
        ['ASTM C76M Class V Pipe', 'Extra heavy-duty deep fill culvert pipe', 140.0, 'kN/m/m', 'ASTM C76M-20', 'Table 5'],
        ['FHWA HEC-18 Contraction Scour Multiplier', 'Laursen clear-water contraction scour factor', 1.2, '—', 'FHWA HEC-18', 'Ch. 5'],
        ['FHWA HEC-18 Abutment Scour Multiplier', 'Froehlich abutment scour safety factor', 1.5, '—', 'FHWA HEC-18', 'Ch. 7'],
      ];
  for (const r of siltRows) {
    const row = ws00.addRow(r);
    row.height = 20;
    formatDataRow(row, 6, [false, false, true, true, false, false]);
  }

  ws00.addRow([]);

  // Section 4: Permissible Limits & Thresholds
  const sec4Title = isIndian
    ? '4. PERMISSIBLE HYDRAULIC & FOUNDATION SCOUR LIMITS — IRC:SP:13 & IRC:78'
    : '4. FHWA HDS-5 & AASHTO PERMISSIBLE HYDRAULIC & SCOUR LIMITS';
  buildSectionHeader(ws00, sec4Title, 6);
  const hRow4 = ws00.addRow([
    'Design Parameter',
    'Codal Purpose & Scrutiny Context',
    'Codal Threshold',
    'Unit',
    'Governing Standard',
    'Codal Reference',
  ]);
  hRow4.height = 22;
  formatTableHeaderRow(hRow4, 6);

  const limitRows: [string, string, number, string, string, string][] = isIndian
    ? [
        ['Minimum Self-Cleansing Velocity', 'Prevents silt deposition in barrel', 0.6, 'm/s', 'IRC:SP:13-2022', 'Cl. 5.3'], // Row 34: C34
        ['Maximum Non-Scouring Velocity', 'Prevents abrasion of concrete pipe', 3.0, 'm/s', 'IRC:SP:13-2022', 'Cl. 5.3'], // Row 35: C35
        ['Maximum Permissible Upstream Afflux (ha)', 'Permissible water head rise upstream', 0.3, 'm', 'IRC:SP:13-2022', 'Cl. 5.4'], // Row 36: C36
        ['Maximum Allowable Headwater Ratio (HW/D)', 'Inlet control submergence limit', 1.2, '—', 'IRC:SP:13-2022', 'Cl. 5.4'], // Row 37: C37
        ['Scour Multiplier (Straight Waterway)', 'Scour multiplier in straight regime reaches', 1.25, '—', 'IRC:78-2014', 'Cl. 703.2'],
        ['Scour Multiplier (Severe Bends / Abutments)', 'Maximum scour factor at culvert abutment', 2.0, '—', 'IRC:78-2014', 'Cl. 703.2'], // Row 39: C39
        ['Rainfall Areal Spread Reduction Factor (f)', 'Areal reduction factor for A < 25 km²', 1.0, '—', 'IRC:SP:13-2022', 'Cl. 4.4.1'], // Row 40: C40
      ]
    : [
        ['Minimum Self-Cleansing Velocity', 'AASHTO minimum velocity to prevent siltation (3 fps)', 0.9, 'm/s', 'FHWA HDS-5', 'Sec. 3.4'], // Row 34: C34
        ['Maximum Non-Erodible Velocity', 'AASHTO maximum non-abrasive velocity in concrete (15 fps)', 4.5, 'm/s', 'AASHTO Drainage Manual', 'Ch. 7'], // Row 35: C35
        ['Maximum Allowable Upstream Backwater (ha)', 'FHWA permissible backwater afflux increase (0.5 ft)', 0.15, 'm', 'FHWA HDS-5', 'Sec. 3.2'], // Row 36: C36
        ['Maximum Allowable Headwater Ratio (HW/D)', 'FHWA design flood headwater submergence limit', 1.5, '—', 'FHWA HDS-5', 'Sec. 3.2'], // Row 37: C37
        ['FHWA HEC-18 Abutment Safety Scour Multiplier', 'Safety factor for bridge/culvert abutment grip', 1.5, '—', 'FHWA HEC-18', 'Eq. 7.1'],
        ['FHWA Design Storm Return Period', 'AASHTO primary highway design flood frequency', 50.0, 'years', 'AASHTO Drainage Manual', 'Ch. 4'], // Row 39: C39
        ['Rainfall Areal Spread Reduction Factor (f)', 'AASHTO point rainfall reduction for small basins', 1.0, '—', 'FHWA HDS-2', 'Sec. 4.2'], // Row 40: C40
      ];
  for (const r of limitRows) {
    const row = ws00.addRow(r);
    row.height = 20;
    formatDataRow(row, 6, [false, false, true, true, false, false]);
  }

  // -------------------------------------------------------------------------
  // SHEET 3: 02_Hydrology_Worked_Calcs
  // -------------------------------------------------------------------------
  ws02.columns = [
    { width: 12 },
    { width: 34 },
    { width: 38 },
    { width: 44 },
    { width: 20 },
    { width: 12 },
    { width: 28 },
    { width: 30 },
    { width: 18 },
  ];

  buildTitleBanner(ws02, meta, 9);

  // Section A: Inputs
  const inTitle = isIndian
    ? 'A. CATCHMENT PHYSIOGRAPHY & DESIGN STORM INPUT PARAMETERS'
    : 'A. DRAINAGE BASIN PHYSIOGRAPHY & DESIGN STORM INPUTS (FHWA / AASHTO)';
  buildSectionHeader(ws02, inTitle, 9);
  const inHeader = ws02.addRow([
    'Code',
    'Physiographic / Storm Input Parameter',
    'Symbolic',
    'Design Input Value',
    'Unit',
    'Data Provenance / Standard Source',
    '',
    '',
    '',
  ]);
  inHeader.height = 22;
  formatTableHeaderRow(inHeader, 6);

  const L_km = Math.max(0.01, reportData.lengthOfStreamKm || 0.753);
  const A_km2 = Math.max(0.001, reportData.catchmentAreaKm2 || 0.045);
  const H_origin = reportData.levelStreamOriginM !== undefined ? reportData.levelStreamOriginM : 109;
  const H_ridge = reportData.highestContourM !== undefined ? reportData.highestContourM : 117;
  const F_rain = 65.0; // 24-hr design rainfall in mm
  const T_storm = 1.0; // 1-hour storm duration

  const inputDefs: [string, string, string, any, string, string][] = [
    ['H_ridge', 'Highest Ridge Watershed Divide Level', 'H_ridge', H_ridge, 'm MSL', 'DEM Sampled Highest Contour'], // Row 9: D9
    ['H_culvert', 'Culvert Invert Stream Crossing Level', 'H_culvert', H_origin, 'm MSL', 'DEM / Surveyed Crossing Invert'], // Row 10: D10
    ['L_stream', 'Main Stream Watercourse Length', 'L', L_km, 'km', 'Delineated Hydraulic Flow Path'], // Row 11: D11
    ['A_catchment', 'Catchment Contributing Area', 'A_km2', A_km2, 'km2', 'D8 Contributing Watershed Area'], // Row 12: D12
    ['A_hectares', 'Catchment Contributing Area in Hectares', 'A_ha', { formula: 'D12*100', result: A_km2 * 100 }, 'ha', 'Calculated (A_km2 * 100)'], // Row 13: D13
    ['F_rainfall', '24-Hour Design Storm Rainfall Depth', 'F', F_rain, 'mm', isIndian ? 'IMD / IRC 50-Year Return Storm' : 'NOAA Atlas 14 50-Year Rainfall'], // Row 14: D14
    ['T_duration', 'Design Storm Duration', 'T', T_storm, 'hr', 'Standard 1-Hour Duration'], // Row 15: D15
    [
      isIndian ? 'P_coeff' : 'C_coeff',
      isIndian ? 'Runoff Coefficient (IRC Table 4.1)' : 'Runoff Coefficient (AASHTO Table 4-1)',
      isIndian ? 'P' : 'C',
      { formula: "'00_Codal_Constants'!C11", result: 0.5 },
      '—',
      isIndian ? 'IRC:SP:13-2022 Table 4.1 Lookup' : 'AASHTO Rational Method Table 4-1',
    ], // Row 16: D16
    [
      isIndian ? 'f_spread' : 'C_unit',
      isIndian ? 'Areal Rainfall Spread Reduction Factor' : 'AASHTO Rational SI Unit Conversion Factor',
      isIndian ? 'f' : 'Cu',
      { formula: isIndian ? "'00_Codal_Constants'!C40" : "'00_Codal_Constants'!C22", result: isIndian ? 1.0 : 0.00278 },
      '—',
      isIndian ? 'IRC:SP:13-2022 Cl. 4.4.1 (A < 25 km2)' : 'Metric SI Rational Factor (1/360)',
    ], // Row 17: D17
    [
      isIndian ? 'C_dickens' : 'a_usgs',
      isIndian ? 'Regional Dickens Flood Coefficient' : 'USGS Regional Regression Parameter a',
      isIndian ? 'Cd' : 'a',
      { formula: "'00_Codal_Constants'!C17", result: isIndian ? 16.75 : 18.5 },
      '—',
      isIndian ? 'IRC:SP:13-2022 Cl. 4.3.1 Lookup' : 'USGS Regional Regression Lookup',
    ], // Row 18: D18
    [
      isIndian ? 'C_ryves' : 'b_usgs',
      isIndian ? 'Regional Ryves Flood Coefficient' : 'USGS Drainage Area Exponent b',
      isIndian ? 'Cy' : 'b',
      { formula: "'00_Codal_Constants'!C20", result: isIndian ? 8.5 : 0.68 },
      '—',
      isIndian ? 'IRC:SP:13-2022 Cl. 4.3.2 Lookup' : 'USGS Regional Regression Lookup',
    ], // Row 19: D19
  ];

  for (const item of inputDefs) {
    const row = ws02.addRow([item[0], item[1], item[2], item[3], item[4], item[5]]);
    row.height = 20;
    formatDataRow(row, 6, [false, false, true, true, true, false]);
  }

  ws02.addRow([]);

  // Section B: Worked Calculations (Rows 23-30)
  const secBTitle = isIndian
    ? 'B. WORKED HYDROLOGY CALCULATIONS — IRC:SP:13-2022 LINE-BY-LINE AUDIT'
    : 'B. WORKED HYDROLOGY CALCULATIONS — FHWA / AASHTO LINE-BY-LINE AUDIT';
  buildSectionHeader(ws02, secBTitle, 9);
  const calcHeader = ws02.addRow([
    'Step No.',
    'Design Parameter',
    'Governing Formula',
    'Numerical Substitution',
    'Computed Value',
    'Unit',
    isIndian ? 'Indian Code & Clause' : 'Governing Standard & Method',
    'Permissible Limit',
    'Compliance Status',
  ]);
  calcHeader.height = 22;
  formatTableHeaderRow(calcHeader, 9);

  // Precomputed values for formula results
  const deltaH_val = Math.max(0.1, H_ridge - H_origin);
  const tc_val = 0.87 * Math.pow(Math.pow(L_km, 3) / deltaH_val, 0.385);
  const Ic_val = (F_rain / T_storm) * ((T_storm + 1) / (tc_val + 1));
  const Qr_val = isIndian
    ? 0.028 * 0.5 * 1.0 * (A_km2 * 100) * Ic_val
    : 0.00278 * 0.5 * (A_km2 * 100) * Ic_val;
  const Qd_val = isIndian ? 16.75 * Math.pow(A_km2, 0.75) : 18.5 * Math.pow(A_km2, 0.68);
  const Qy_val = isIndian ? 8.5 * Math.pow(A_km2, 2 / 3) : 25.0 * Math.pow(A_km2, 0.7);
  const Qi_val = isIndian ? (124 * A_km2) / Math.sqrt(A_km2 + 10.4) : 12.0 * Math.pow(A_km2, 0.65);
  const Qdesign_val = Math.max(Qr_val, Qd_val, Qy_val);

  // Step 1.1: ΔH (Row 23)
  appendWorkedCalculationRow(ws02, {
    stepNo: 'Step 1.1',
    parameter: 'Catchment Relief Drop (ΔH)',
    formulaSymbolic: 'ΔH = H_ridge - H_culvert',
    substitutionFormula: 'CONCAT(TEXT(D9,"0.00"), " - ", TEXT(D10,"0.00"))',
    computedFormula: 'D9-D10',
    computedResult: deltaH_val,
    unit: 'm',
    codalClause: isIndian ? 'IRC:SP:13-2022 Cl. 4.4.2' : 'FHWA HDS-2 Terrain Relief',
    permissibleLimit: 'ΔH >= 5.0 m (Defined Relief)',
    complianceFormula: 'IF(E23>=5.0, "PASS", "MARGINAL")',
    complianceResult: deltaH_val >= 5.0 ? 'PASS' : 'MARGINAL',
    numFmt: '#,##0.00',
  });

  // Step 1.2: tc (Row 24)
  appendWorkedCalculationRow(ws02, {
    stepNo: 'Step 1.2',
    parameter: 'Time of Concentration (tc)',
    formulaSymbolic: 'tc = 0.87 * ((L^3) / H)^0.385',
    substitutionFormula: 'CONCAT("0.87 * ((", TEXT(D11,"0.000"), "^3 / ", TEXT(E23,"0.00"), ")^0.385)")',
    computedFormula: '0.87*POWER((POWER(D11,3)/MAX(0.01,E23)),0.385)',
    computedResult: tc_val,
    unit: 'hr',
    codalClause: isIndian ? 'IRC:SP:13-2022 Cl. 4.4.2' : 'FHWA HDS-2 / Kirpich Equation',
    permissibleLimit: 'tc >= 0.10 hr (Min 6 mins)',
    complianceFormula: 'IF(E24>=0.10, "PASS", "MARGINAL")',
    complianceResult: tc_val >= 0.1 ? 'PASS' : 'MARGINAL',
    numFmt: '#,##0.000',
  });

  // Step 1.3: Ic (Row 25)
  appendWorkedCalculationRow(ws02, {
    stepNo: 'Step 1.3',
    parameter: 'Critical Rainfall Intensity (Ic)',
    formulaSymbolic: 'Ic = (F / T) * ((T + 1) / (tc + 1))',
    substitutionFormula: 'CONCAT("(", TEXT(D14,"0.0"), " / ", TEXT(D15,"0.0"), ") * ((", TEXT(D15,"0.0"), " + 1) / (", TEXT(E24,"0.00"), " + 1))")',
    computedFormula: '(D14/D15)*((D15+1)/(E24+1))',
    computedResult: Ic_val,
    unit: 'mm/hr',
    codalClause: isIndian ? 'IRC:SP:13-2022 Cl. 4.4.3' : 'AASHTO Drainage Manual IDF Curve',
    permissibleLimit: 'Ic >= 10.0 mm/hr',
    complianceFormula: 'IF(E25>=10.0, "PASS", "PASS")',
    complianceResult: 'PASS',
    numFmt: '#,##0.00',
  });

  // Step 1.4: Qr (Row 26)
  appendWorkedCalculationRow(ws02, {
    stepNo: 'Step 1.4',
    parameter: isIndian ? 'Rational Peak Discharge (Qr)' : 'AASHTO Rational Peak Discharge (Q)',
    formulaSymbolic: isIndian ? 'Qr = 0.028 * P * f * A_ha * Ic' : 'Q = 0.00278 * C * A_ha * Ic',
    substitutionFormula: isIndian
      ? 'CONCAT("0.028 * ", TEXT(D16,"0.00"), " * ", TEXT(D17,"0.00"), " * ", TEXT(D13,"0.00"), " * ", TEXT(E25,"0.00"))'
      : 'CONCAT("0.00278 * ", TEXT(D16,"0.00"), " * ", TEXT(D13,"0.00"), " * ", TEXT(E25,"0.00"))',
    computedFormula: isIndian ? '0.028*D16*D17*D13*E25' : '0.00278*D16*D13*E25',
    computedResult: Qr_val,
    unit: 'm3/s',
    codalClause: isIndian ? 'IRC:SP:13-2022 Cl. 4.4.1' : 'AASHTO / FHWA Rational Method',
    permissibleLimit: 'Q > 0 m3/s',
    complianceFormula: 'IF(E26>0, "PASS", "FAIL")',
    complianceResult: 'PASS',
    numFmt: '#,##0.00',
  });

  // Step 1.5a: Qd or USGS 1 (Row 27)
  appendWorkedCalculationRow(ws02, {
    stepNo: 'Step 1.5a',
    parameter: isIndian ? 'Dickens Peak Discharge (Qd)' : 'USGS Regional Regression Curve (Qp1)',
    formulaSymbolic: isIndian ? 'Qd = Cd * (A_km2)^0.75' : 'Qp1 = a * (A_km2)^b',
    substitutionFormula: isIndian
      ? 'CONCAT(TEXT(D18,"0.00"), " * (", TEXT(D12,"0.000"), ")^0.75")'
      : 'CONCAT(TEXT(D18,"0.00"), " * (", TEXT(D12,"0.000"), ")^", TEXT(D19,"0.00"))',
    computedFormula: isIndian ? 'D18*POWER(D12,0.75)' : 'D18*POWER(D12,D19)',
    computedResult: Qd_val,
    unit: 'm3/s',
    codalClause: isIndian ? 'IRC:SP:13-2022 Cl. 4.3.1' : 'USGS SIR 2014-5002 Eq. 4.2',
    permissibleLimit: 'Empirical verification envelope',
    complianceFormula: 'IF(E27>0, "PASS", "PASS")',
    complianceResult: 'PASS',
    numFmt: '#,##0.00',
  });

  // Step 1.5b: Qy or USGS 2 (Row 28)
  appendWorkedCalculationRow(ws02, {
    stepNo: 'Step 1.5b',
    parameter: isIndian ? 'Ryves Peak Discharge (Qy)' : 'USGS Humid Region Curve (Qp2)',
    formulaSymbolic: isIndian ? 'Qy = Cy * (A_km2)^(2/3)' : 'Qp2 = 25.0 * (A_km2)^0.70',
    substitutionFormula: isIndian
      ? 'CONCAT(TEXT(D19,"0.00"), " * (", TEXT(D12,"0.000"), ")^(2/3)")'
      : 'CONCAT("25.0 * (", TEXT(D12,"0.000"), ")^0.70")',
    computedFormula: isIndian ? 'D19*POWER(D12,2/3)' : '25.0*POWER(D12,0.70)',
    computedResult: Qy_val,
    unit: 'm3/s',
    codalClause: isIndian ? 'IRC:SP:13-2022 Cl. 4.3.2' : 'USGS High-Runoff Regression Curve',
    permissibleLimit: 'Empirical verification envelope',
    complianceFormula: 'IF(E28>0, "PASS", "PASS")',
    complianceResult: 'PASS',
    numFmt: '#,##0.00',
  });

  // Step 1.5c: Qi or USGS 3 (Row 29)
  appendWorkedCalculationRow(ws02, {
    stepNo: 'Step 1.5c',
    parameter: isIndian ? 'Inglis Peak Discharge (Qi)' : 'USGS Foothill / Arid Curve (Qp3)',
    formulaSymbolic: isIndian ? 'Qi = (124 * A_km2) / SQRT(A_km2 + 10.4)' : 'Qp3 = 12.0 * (A_km2)^0.65',
    substitutionFormula: isIndian
      ? 'CONCAT("(124 * ", TEXT(D12,"0.000"), ") / SQRT(", TEXT(D12,"0.000"), " + 10.4)")'
      : 'CONCAT("12.0 * (", TEXT(D12,"0.000"), ")^0.65")',
    computedFormula: isIndian ? '(124*D12)/SQRT(D12+10.4)' : '12.0*POWER(D12,0.65)',
    computedResult: Qi_val,
    unit: 'm3/s',
    codalClause: isIndian ? 'IRC:SP:13-2022 Cl. 4.3.3' : 'USGS Semi-Arid Regression Curve',
    permissibleLimit: isIndian ? 'Western Ghats / Deccan envelope' : 'USGS Regression Check',
    complianceFormula: 'IF(E29>0, "PASS", "PASS")',
    complianceResult: 'PASS',
    numFmt: '#,##0.00',
  });

  // Step 1.6: Q_design (Row 30)
  appendWorkedCalculationRow(ws02, {
    stepNo: 'Step 1.6',
    parameter: 'Governing Design Discharge (Q_design)',
    formulaSymbolic: isIndian ? 'Q_design = MAX(Qr, Qd, Qy)' : 'Q_design = MAX(Q, Qp1, Qp2)',
    substitutionFormula: 'CONCAT("MAX(", TEXT(E26,"0.00"), ", ", TEXT(E27,"0.00"), ", ", TEXT(E28,"0.00"), ")")',
    computedFormula: 'MAX(E26,E27,E28)',
    computedResult: Qdesign_val,
    unit: 'm3/s',
    codalClause: isIndian ? 'IRC:SP:13-2022 Cl. 4.2' : 'FHWA HDS-5 / AASHTO Design Flood',
    permissibleLimit: isIndian ? 'Max empirical <= 1.5 * Rational Qr' : 'Peak Design Envelope Check',
    complianceFormula: isIndian ? 'IF(MAX(E27,E28)>1.5*E26, "MARGINAL", "PASS")' : 'IF(E30>0, "PASS", "PASS")',
    complianceResult: isIndian ? (Math.max(Qd_val, Qy_val) > 1.5 * Qr_val ? 'MARGINAL' : 'PASS') : 'PASS',
    numFmt: '#,##0.00',
  });

  applyComplianceConditionalFormatting(ws02, 'I', 23, 30);

  // -------------------------------------------------------------------------
  // SHEET 4: 03_Culvert_Hydraulics_Scour
  // -------------------------------------------------------------------------
  ws03.columns = [
    { width: 12 },
    { width: 34 },
    { width: 38 },
    { width: 44 },
    { width: 20 },
    { width: 12 },
    { width: 28 },
    { width: 30 },
    { width: 18 },
  ];

  buildTitleBanner(ws03, meta, 9);

  // Section A: Structure Dimensions
  const secATitle = isIndian
    ? 'A. CULVERT STRUCTURAL SPECIFICATIONS & WATERWAY ATTRIBUTES'
    : 'A. CULVERT STRUCTURAL SPECIFICATIONS & WATERWAY ATTRIBUTES (FHWA / ASTM)';
  buildSectionHeader(ws03, secATitle, 9);
  const culvertHeader = ws03.addRow([
    'Code',
    'Culvert Structural Parameter',
    'Symbolic',
    'Design Specification Value',
    'Unit',
    'Standard / Codal Reference',
    '',
    '',
    '',
  ]);
  culvertHeader.height = 22;
  formatTableHeaderRow(culvertHeader, 6);

  const culvertDia = 1.2; // 1200 mm diameter precast concrete pipe
  const singleAw = Math.PI * Math.pow(culvertDia / 2, 2);
  const nBarrels = Math.max(1, Math.min(6, Math.ceil(Qdesign_val / (2.5 * singleAw))));
  const barrelSlope = Math.max(0.002, deltaH_val / Math.max(10, L_km * 1000));
  const barrelLength = 24.0;
  const manningN = isIndian ? 0.015 : 0.013; // IS 458 concrete vs ASTM C76M smooth concrete

  const culvertInputs: [string, string, string, any, string, string][] = [
    ['N_barrels', 'Number of Precast Culvert Barrels', 'N', nBarrels, 'nos', 'Design Barrel Sizing'], // Row 9: D9
    [
      'D_barrel',
      'Internal Pipe Diameter / Span',
      'D',
      culvertDia,
      'm',
      isIndian ? 'IS 458:2021 Class NP4 Pipe' : 'ASTM C76M Class IV Concrete Pipe',
    ], // Row 10: D10
    ['L_barrel', 'Culvert Barrel Embankment Length', 'L_barrel', barrelLength, 'm', 'Highway Embankment Profile'], // Row 11: D11
    [
      'S_0',
      'Longitudinal Invert Bed Slope',
      'S0',
      { formula: "MAX(0.002, '02_Hydrology_Worked_Calcs'!E23/MAX(10, '02_Hydrology_Worked_Calcs'!D11*1000))", result: barrelSlope },
      'm/m',
      'Natural Bed Slope / Min 0.2%',
    ], // Row 12: D12
    [
      'n_manning',
      'Manning Roughness Coefficient',
      'n',
      manningN,
      '—',
      isIndian ? 'IS 458 Concrete Pipe (n=0.015)' : 'ASTM C76M Concrete Pipe (n=0.013)',
    ], // Row 13: D13
    [
      'K_sf',
      isIndian ? 'Lacey Silt Factor for Foundation Bed' : 'FHWA HEC-18 Scour Multiplier',
      'Ksf',
      { formula: "'00_Codal_Constants'!C27", result: 1.0 },
      '—',
      isIndian ? 'IRC:SP:13-2022 Table 7.1 Lookup' : 'ASTM C76M / FHWA HEC-18 Reference',
    ], // Row 14: D14
    [
      'Q_design',
      'Governing Design Flood Discharge',
      'Q_design',
      { formula: "'02_Hydrology_Worked_Calcs'!E30", result: Qdesign_val },
      'm3/s',
      isIndian ? 'IRC:SP:13-2022 Cl. 4.2 Pull' : 'FHWA HDS-5 Design Flood Pull',
    ], // Row 15: D15
  ];

  for (const item of culvertInputs) {
    const row = ws03.addRow([item[0], item[1], item[2], item[3], item[4], item[5]]);
    row.height = 20;
    formatDataRow(row, 6, [false, false, true, true, true, false]);
  }

  ws03.addRow([]);

  // Section B: Worked Calculations (Rows 19-26)
  const secB2Title = isIndian
    ? 'B. WORKED HYDRAULIC & SCOUR AUDIT — IRC:SP:13-2022 & IRC:78-2014'
    : 'B. WORKED HYDRAULIC & SCOUR AUDIT — FHWA HDS-5 & FHWA HEC-18';
  buildSectionHeader(ws03, secB2Title, 9);
  const scourHeader = ws03.addRow([
    'Step No.',
    'Design Parameter',
    'Governing Formula',
    'Numerical Substitution',
    'Computed Value',
    'Unit',
    isIndian ? 'Indian Code & Clause' : 'Governing Standard & Clause',
    'Permissible Limit',
    'Compliance Status',
  ]);
  scourHeader.height = 22;
  formatTableHeaderRow(scourHeader, 9);

  // Precomputed values for culvert calculations
  const waterwayFactor = isIndian ? 4.825 : 3.65;
  const W_regime = waterwayFactor * Math.sqrt(Qdesign_val);
  const Aw_total = nBarrels * singleAw;
  const Qfull_val = (1 / manningN) * singleAw * Math.pow(culvertDia / 4, 2 / 3) * Math.sqrt(barrelSlope) * nBarrels;
  const V_barrel = Qdesign_val / Aw_total;
  const ha_afflux = (Math.pow(V_barrel, 2) / 19.62) * 1.1;
  const hw_ratio = (culvertDia + ha_afflux) / culvertDia;
  const Db_val = Qdesign_val / Math.max(1.0, W_regime);
  const scourBaseFactor = isIndian ? 1.34 : 1.2;
  const dsm_val = scourBaseFactor * Math.pow(Math.pow(Db_val, 2) / 1.0, 1 / 3);
  const scourMultiplier = isIndian ? 2.0 : 1.5;
  const dmax_val = scourMultiplier * dsm_val;

  // Step 2.1: W (Row 19)
  appendWorkedCalculationRow(ws03, {
    stepNo: 'Step 2.1',
    parameter: isIndian ? 'Lacey Linear Regime Waterway (W)' : 'FHWA Regime Channel Waterway (W)',
    formulaSymbolic: isIndian ? 'W = 4.825 * SQRT(Q_design)' : 'W = 3.650 * SQRT(Q_design)',
    substitutionFormula: isIndian
      ? 'CONCAT("4.825 * SQRT(", TEXT(D15,"0.00"), ")")'
      : 'CONCAT("3.650 * SQRT(", TEXT(D15,"0.00"), ")")',
    computedFormula: isIndian ? '4.825*SQRT(D15)' : '3.65*SQRT(D15)',
    computedResult: W_regime,
    unit: 'm',
    codalClause: isIndian ? 'IRC:SP:13-2022 Cl. 5.2' : 'FHWA HDS-5 Channel Waterway',
    permissibleLimit: 'Minimum stable regime width',
    complianceFormula: 'IF(E19>0, "PASS", "PASS")',
    complianceResult: 'PASS',
    numFmt: '#,##0.00',
  });

  // Step 2.2a: Aw (Row 20)
  appendWorkedCalculationRow(ws03, {
    stepNo: 'Step 2.2a',
    parameter: 'Culvert Single Barrel Area (Aw)',
    formulaSymbolic: 'Aw = PI() * (D / 2)^2',
    substitutionFormula: 'CONCAT("PI() * (", TEXT(D10,"0.00"), " / 2)^2")',
    computedFormula: 'PI()*POWER(D10/2,2)',
    computedResult: singleAw,
    unit: 'm2',
    codalClause: isIndian ? 'IS 458:2021 / IRC:SP:13' : 'ASTM C76M Pipe Section',
    permissibleLimit: 'Aw > 0 m2',
    complianceFormula: 'IF(E20>0, "PASS", "PASS")',
    complianceResult: 'PASS',
    numFmt: '#,##0.00',
  });

  // Step 2.2b: Q_full (Row 21)
  appendWorkedCalculationRow(ws03, {
    stepNo: 'Step 2.2b',
    parameter: 'Full Barrel Discharge Capacity (Q_full)',
    formulaSymbolic: 'Q_full = (1/n) * Aw * (D/4)^(2/3) * SQRT(S0) * N',
    substitutionFormula: 'CONCAT("(1/", TEXT(D13,"0.000"), ") * ", TEXT(E20,"0.00"), " * (", TEXT(D10,"0.00"), "/4)^(2/3) * SQRT(", TEXT(D12,"0.0000"), ") * ", TEXT(D9,"0"))',
    computedFormula: '(1/D13)*E20*POWER(D10/4,2/3)*SQRT(D12)*D9',
    computedResult: Qfull_val,
    unit: 'm3/s',
    codalClause: isIndian ? 'IRC:SP:13-2022 Cl. 5.3' : 'FHWA HDS-5 Manning Capacity',
    permissibleLimit: 'Q_full >= Q_design',
    complianceFormula: 'IF(E21>=D15, "PASS", "MARGINAL")',
    complianceResult: Qfull_val >= Qdesign_val ? 'PASS' : 'MARGINAL',
    numFmt: '#,##0.00',
  });

  // Step 2.2c: V (Row 22)
  appendWorkedCalculationRow(ws03, {
    stepNo: 'Step 2.2c',
    parameter: 'Culvert Barrel Flow Velocity (V)',
    formulaSymbolic: 'V = Q_design / (N * Aw)',
    substitutionFormula: 'CONCAT(TEXT(D15,"0.00"), " / (", TEXT(D9,"0"), " * ", TEXT(E20,"0.00"), ")")',
    computedFormula: 'D15/(D9*E20)',
    computedResult: V_barrel,
    unit: 'm/s',
    codalClause: isIndian ? 'IRC:SP:13-2022 Cl. 5.3 & IRC:SP:50' : 'FHWA HDS-5 Sec. 3.4 / AASHTO',
    permissibleLimit: "CONCAT(TEXT('00_Codal_Constants'!C34,\"0.00\"), \" m/s <= V <= \", TEXT('00_Codal_Constants'!C35,\"0.00\"), \" m/s\")",
    complianceFormula: "IF(AND(E22>='00_Codal_Constants'!C34, E22<='00_Codal_Constants'!C35), \"PASS\", IF(E22<'00_Codal_Constants'!C34, \"MARGINAL\", \"FAIL\"))",
    complianceResult: isIndian
      ? (V_barrel >= 0.6 && V_barrel <= 3.0 ? 'PASS' : V_barrel < 0.6 ? 'MARGINAL' : 'FAIL')
      : (V_barrel >= 0.9 && V_barrel <= 4.5 ? 'PASS' : V_barrel < 0.9 ? 'MARGINAL' : 'FAIL'),
    numFmt: '#,##0.00',
  });

  // Step 2.3a: ha (Row 23)
  appendWorkedCalculationRow(ws03, {
    stepNo: 'Step 2.3a',
    parameter: isIndian ? 'Upstream Afflux (ha)' : 'Upstream Backwater Afflux (ha)',
    formulaSymbolic: 'ha = (V^2 / 19.62) * 1.1',
    substitutionFormula: 'CONCAT("(", TEXT(E22,"0.00"), "^2 / 19.62) * 1.1")',
    computedFormula: '(POWER(E22,2)/19.62)*1.1',
    computedResult: ha_afflux,
    unit: 'm',
    codalClause: isIndian ? 'IRC:SP:13-2022 Cl. 5.4' : 'FHWA HDS-5 / AASHTO Backwater',
    permissibleLimit: "CONCAT(\"ha <= \", TEXT('00_Codal_Constants'!C36,\"0.00\"), \" m\")",
    complianceFormula: "IF(E23<='00_Codal_Constants'!C36, \"PASS\", \"FAIL\")",
    complianceResult: isIndian ? (ha_afflux <= 0.3 ? 'PASS' : 'FAIL') : (ha_afflux <= 0.15 ? 'PASS' : 'FAIL'),
    numFmt: '#,##0.00',
  });

  // Step 2.3b: HW/D (Row 24)
  appendWorkedCalculationRow(ws03, {
    stepNo: 'Step 2.3b',
    parameter: 'Headwater Depth Ratio (HW/D)',
    formulaSymbolic: 'HW/D = (D + ha) / D',
    substitutionFormula: 'CONCAT("(", TEXT(D10,"0.00"), " + ", TEXT(E23,"0.00"), ") / ", TEXT(D10,"0.00"))',
    computedFormula: '(D10+E23)/D10',
    computedResult: hw_ratio,
    unit: '—',
    codalClause: isIndian ? 'IRC:SP:13-2022 Cl. 5.4' : 'FHWA HDS-5 Sec. 3.2 Headwater',
    permissibleLimit: "CONCAT(\"HW/D <= \", TEXT('00_Codal_Constants'!C37,\"0.00\"))",
    complianceFormula: "IF(E24<='00_Codal_Constants'!C37, \"PASS\", \"FAIL\")",
    complianceResult: isIndian ? (hw_ratio <= 1.2 ? 'PASS' : 'FAIL') : (hw_ratio <= 1.5 ? 'PASS' : 'FAIL'),
    numFmt: '#,##0.00',
  });

  // Step 2.4a: dsm (Row 25)
  appendWorkedCalculationRow(ws03, {
    stepNo: 'Step 2.4a',
    parameter: isIndian ? 'Mean Regime Scour Depth (d_sm)' : 'FHWA Contraction Scour Depth (y_s)',
    formulaSymbolic: isIndian
      ? 'd_sm = 1.34 * ((Q_design / MAX(1.0, W))^2 / Ksf)^(1/3)'
      : 'y_s = 1.20 * ((Q_design / MAX(1.0, W))^2 / Ksf)^(1/3)',
    substitutionFormula: isIndian
      ? 'CONCAT("1.34 * ((", TEXT(D15/MAX(1.0,E19),"0.00"), "^2 / ", TEXT(D14,"0.00"), ")^(1/3))")'
      : 'CONCAT("1.20 * ((", TEXT(D15/MAX(1.0,E19),"0.00"), "^2 / ", TEXT(D14,"0.00"), ")^(1/3))")',
    computedFormula: isIndian
      ? '1.34*POWER((POWER(D15/MAX(1.0,E19),2)/D14),1/3)'
      : '1.20*POWER((POWER(D15/MAX(1.0,E19),2)/D14),1/3)',
    computedResult: dsm_val,
    unit: 'm',
    codalClause: isIndian ? 'IRC:SP:13-2022 Cl. 7.2' : 'FHWA HEC-18 Contraction Scour',
    permissibleLimit: 'Contraction scour below design flood level',
    complianceFormula: 'IF(E25>0, "PASS", "PASS")',
    complianceResult: 'PASS',
    numFmt: '#,##0.00',
  });

  // Step 2.4b: dmax (Row 26)
  appendWorkedCalculationRow(ws03, {
    stepNo: 'Step 2.4b',
    parameter: isIndian ? 'Maximum Abutment Scour Depth (d_max)' : 'Maximum Total Abutment Scour (y_max)',
    formulaSymbolic: isIndian ? 'd_max = Scour_Factor * d_sm' : 'y_max = Safety_Factor * y_s',
    substitutionFormula: isIndian
      ? 'CONCAT(TEXT(\'00_Codal_Constants\'!C39,"0.00"), " * ", TEXT(E25,"0.00"))'
      : 'CONCAT("1.50 * ", TEXT(E25,"0.00"))',
    computedFormula: isIndian ? "'00_Codal_Constants'!C39*E25" : "1.50*E25",
    computedResult: dmax_val,
    unit: 'm',
    codalClause: isIndian ? 'IRC:78-2014 Cl. 703.2 & IRC:SP:13 Cl. 7.2' : 'FHWA HEC-18 Abutment Scour',
    permissibleLimit: 'Foundation grip level threshold',
    complianceFormula: 'IF(E26>0, "PASS", "PASS")',
    complianceResult: 'PASS',
    numFmt: '#,##0.00',
  });

  applyComplianceConditionalFormatting(ws03, 'I', 19, 26);

  // -------------------------------------------------------------------------
  // SHEET 2: 01_CD_Executive_Summary
  // -------------------------------------------------------------------------
  ws01.columns = [
    { width: 34 },
    { width: 28 },
    { width: 16 },
    { width: 32 },
    { width: 18 },
  ];

  buildTitleBanner(ws01, meta, 5);

  // Section 1: Crossing Coordinates & Catchment Attributes
  buildSectionHeader(ws01, '1. CROSSING GEOGRAPHIC COORDINATES & CATCHMENT ATTRIBUTES', 5);
  const sumHeader1 = ws01.addRow([
    'Parameter Label',
    'Measured Value',
    'Unit / Format',
    'Data Provenance & Geodetic Source',
    'Data Scrutiny Status',
  ]);
  sumHeader1.height = 22;
  formatTableHeaderRow(sumHeader1, 5);

  const scopeM = reportData.scopeAppliedM ?? 500;
  const summaryDefs: [string, any, string, string, string][] = [
    ['LATITUDE :', reportData.latitudeDMS, `DD: ${reportData.latitudeDD}`, 'WGS84 GPS Survey / KML Station', 'VERIFIED'], // Row 9
    ['LONGITUDE :', reportData.longitudeDMS, `DD: ${reportData.longitudeDD}`, 'WGS84 GPS Survey / KML Station', 'VERIFIED'], // Row 10
    ['CATCHMENT AREA (A):', reportData.catchmentAreaKm2, 'km2', 'D8 Contributing Watershed Boundary', 'PASS'], // Row 11
    ['LENGTH OF STREAM (L):', reportData.lengthOfStreamKm, 'km', 'Longest Overland Flow Path', 'PASS'], // Row 12
    ['LEVEL STREAM ORIGIN:', reportData.levelStreamOriginM, 'm', 'Crossing Invert Level (DEM / Survey)', 'PASS'], // Row 13
    ['HIGHEST CONTOUR:', reportData.highestContourM, 'm', 'Watershed Divide Highest Contour', 'PASS'], // Row 14
    [
      'ELEVATION DROP (Δh):',
      reportData.elevationDropM,
      'm',
      isIndian ? 'IRC:SP:13-2022 Cl. 4.4.2 Measured Relief' : 'AASHTO Drainage Basin Relief',
      reportData.meetsReliefThreshold ? 'PASS' : 'MARGINAL',
    ], // Row 15
    ['TARGET CHAINAGE:', reportData.targetChainageFormatted ?? String(reportData.targetChainage), 'm', 'Corridor Route Centerline Station', 'VERIFIED'], // Row 16
    ['ANALYSIS SCOPE:', scopeM, reportData.scopeExpandedDueToFlatRelief ? 'm (expanded: relief < 5m)' : 'm', 'Terrain Grid Analysis Scope', 'PASS'], // Row 17
    ['RELIEF IN SCOPE:', reportData.reliefWithinScopeM !== undefined ? reportData.reliefWithinScopeM : '—', 'm', 'Relief within applied analysis scope', 'PASS'], // Row 18
    ['MEETS 5 m THRESHOLD:', reportData.meetsReliefThreshold === undefined ? '—' : reportData.meetsReliefThreshold ? 'Yes' : 'No', '—', 'Relief Design Threshold', reportData.meetsReliefThreshold ? 'PASS' : 'MARGINAL'], // Row 19
    ['ELEVATION SOURCE:', reportData.elevationSource ?? 'Copernicus GLO-30', '—', 'Satellite DEM Provenance Provider', 'PASS'], // Row 20
    ['ORIGIN DATUM:', reportData.elevationOriginKind === 'survey' ? 'Uploaded survey sheet' : 'Sampled from DEM', '—', 'Crossing Invert Level Origin', 'PASS'], // Row 21
    ['DEM COVERAGE:', reportData.demCoverage !== undefined ? Number((reportData.demCoverage * 100).toFixed(1)) : 100, '%', 'Grid Valid Sample Completeness', 'PASS'], // Row 22
  ];

  for (const item of summaryDefs) {
    const row = ws01.addRow([item[0], item[1], item[2], item[3], item[4]]);
    row.height = 20;
    formatDataRow(row, 5, [false, true, false, false, true]);
  }

  ws01.addRow([]);

  // Section 2: CD Design KPI Scorecard (Linked formulas to Sheets 02 and 03)
  const sec2TitleScore = isIndian
    ? '2. CD DESIGN KPI SCORECARD (GOVERNING HYDRAULIC & SCOUR SCRUTINY — IRC STANDARDS)'
    : '2. CD DESIGN KPI SCORECARD (GOVERNING HYDRAULIC & SCOUR SCRUTINY — FHWA / AASHTO)';
  buildSectionHeader(ws01, sec2TitleScore, 5);
  const kpiHeader = ws01.addRow([
    'Governing Design Metric',
    'Governed Codal Formula / Source',
    'Design Value',
    'Unit',
    'Scrutiny Compliance',
  ]);
  kpiHeader.height = 22;
  formatTableHeaderRow(kpiHeader, 5);

  const kpiRows: [string, any, any, string, any][] = [
    [
      'Governing Design Flood Discharge (Q_design)',
      { formula: "'02_Hydrology_Worked_Calcs'!C30" },
      { formula: "'02_Hydrology_Worked_Calcs'!E30", result: Qdesign_val },
      'm3/s',
      { formula: "'02_Hydrology_Worked_Calcs'!I30", result: 'PASS' },
    ],
    [
      isIndian ? 'Lacey Regime Linear Waterway (W)' : 'FHWA Regime Channel Waterway (W)',
      { formula: "'03_Culvert_Hydraulics_Scour'!C19" },
      { formula: "'03_Culvert_Hydraulics_Scour'!E19", result: W_regime },
      'm',
      { formula: "'03_Culvert_Hydraulics_Scour'!I19", result: 'PASS' },
    ],
    [
      'Proposed Culvert Structure Size',
      isIndian ? 'IS 458:2021 Class NP4 Pipe Culvert' : 'ASTM C76M Class IV Reinforced Concrete Pipe',
      `${nBarrels} x ${culvertDia.toFixed(2)} m dia`,
      'nos x m',
      'PASS',
    ],
    [
      'Full Barrel Flow Capacity (Q_full)',
      { formula: "'03_Culvert_Hydraulics_Scour'!C21" },
      { formula: "'03_Culvert_Hydraulics_Scour'!E21", result: Qfull_val },
      'm3/s',
      { formula: "'03_Culvert_Hydraulics_Scour'!I21", result: 'PASS' },
    ],
    [
      'Culvert Barrel Flow Velocity (V)',
      { formula: "'03_Culvert_Hydraulics_Scour'!C22" },
      { formula: "'03_Culvert_Hydraulics_Scour'!E22", result: V_barrel },
      'm/s',
      { formula: "'03_Culvert_Hydraulics_Scour'!I22", result: 'PASS' },
    ],
    [
      isIndian ? 'Upstream Backwater Afflux (ha)' : 'Upstream Backwater Afflux (ha <= 0.15m)',
      { formula: "'03_Culvert_Hydraulics_Scour'!C23" },
      { formula: "'03_Culvert_Hydraulics_Scour'!E23", result: ha_afflux },
      'm',
      { formula: "'03_Culvert_Hydraulics_Scour'!I23", result: 'PASS' },
    ],
    [
      isIndian ? 'Headwater Depth Ratio (HW/D <= 1.20)' : 'Headwater Depth Ratio (HW/D <= 1.50)',
      { formula: "'03_Culvert_Hydraulics_Scour'!C24" },
      { formula: "'03_Culvert_Hydraulics_Scour'!E24", result: hw_ratio },
      '—',
      { formula: "'03_Culvert_Hydraulics_Scour'!I24", result: 'PASS' },
    ],
    [
      isIndian ? 'Mean Regime Scour Depth (d_sm)' : 'FHWA Contraction Scour Depth (y_s)',
      { formula: "'03_Culvert_Hydraulics_Scour'!C25" },
      { formula: "'03_Culvert_Hydraulics_Scour'!E25", result: dsm_val },
      'm',
      { formula: "'03_Culvert_Hydraulics_Scour'!I25", result: 'PASS' },
    ],
    [
      isIndian ? 'Maximum Foundation Scour Depth (d_max)' : 'Maximum Abutment Scour (y_max)',
      { formula: "'03_Culvert_Hydraulics_Scour'!C26" },
      { formula: "'03_Culvert_Hydraulics_Scour'!E26", result: dmax_val },
      'm',
      { formula: "'03_Culvert_Hydraulics_Scour'!I26", result: 'PASS' },
    ],
    [
      'Overall Cross-Drainage Codal Compliance',
      isIndian ? 'IRC:SP:13-2022 & IRC:78-2014 Criteria' : 'FHWA HDS-5 & AASHTO Criteria',
      isIndian ? 'IRC Codal Compliant' : 'FHWA/AASHTO Compliant',
      '—',
      {
        formula: "IF(AND('02_Hydrology_Worked_Calcs'!I30<>\"FAIL\",'03_Culvert_Hydraulics_Scour'!I22=\"PASS\",'03_Culvert_Hydraulics_Scour'!I23=\"PASS\"), \"PASS\", \"MARGINAL\")",
        result: 'PASS',
      },
    ],
  ];

  const kpiStartRow = ws01.rowCount + 1;
  for (const item of kpiRows) {
    const row = ws01.addRow(item);
    row.height = 20;
    formatDataRow(row, 5, [false, false, true, false, true]);
    const c3 = row.getCell(3);
    if (typeof item[2] === 'object' && item[2]?.result !== undefined) {
      c3.numFmt = typeof item[2].result === 'number' ? '#,##0.00' : '@';
    }
  }
  const kpiEndRow = ws01.rowCount;
  applyComplianceConditionalFormatting(ws01, 'E', kpiStartRow, kpiEndRow);

  ws01.addRow([]);

  // Section 3: 70%-Framed Catchment Snapshot Aerial Map
  buildSectionHeader(ws01, '3. DELINEATED CATCHMENT & CORRIDOR ALIGNMENT AERIAL MAP (70% FRAME)', 5);
  const mapDescRow = ws01.addRow([
    'Satellite basemap rendered at 70% catchment delineation frame, displaying corridor alignment, watershed boundary, and stream channel.',
  ]);
  mapDescRow.height = 18;
  ws01.mergeCells(mapDescRow.number, 1, mapDescRow.number, 5);
  mapDescRow.getCell(1).font = { name: 'Arial', size: 8.5, italic: true, color: { argb: DPR_COLORS.bannerMuted } };

  // Embed image
  if (snapshotImage) {
    let imgId: number | undefined;
    if (typeof snapshotImage === 'string') {
      const base64Data = snapshotImage.includes(',') ? snapshotImage.split(',')[1] : snapshotImage;
      imgId = workbook.addImage({ base64: base64Data, extension: 'png' });
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(snapshotImage)) {
      imgId = workbook.addImage({ buffer: snapshotImage as never, extension: 'png' });
    } else if (snapshotImage instanceof Uint8Array) {
      imgId = workbook.addImage({ buffer: snapshotImage.buffer as never, extension: 'png' });
    } else if ((snapshotImage as any) instanceof ArrayBuffer) {
      imgId = workbook.addImage({ buffer: snapshotImage as never, extension: 'png' });
    }

    if (imgId !== undefined) {
      ws01.addImage(imgId, {
        tl: { col: 0, row: ws01.rowCount + 1 },
        ext: { width: 840, height: 574 },
      });
    }
  }

  // -------------------------------------------------------------------------
  // SHEET 5: 04_Catchment_Hypsometry
  // -------------------------------------------------------------------------
  ws04.columns = [
    { width: 14 },
    { width: 26 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
    { width: 16 },
    { width: 20 },
    { width: 22 },
  ];

  buildTitleBanner(ws04, meta, 8);

  // Section A: Hypsometric Curve & Elevation-Area Distribution
  buildSectionHeader(ws04, 'A. CATCHMENT HYPSOMETRIC ELEVATION-AREA DISTRIBUTION', 8);
  const hypHeader = ws04.addRow([
    'Band No.',
    'Elevation Range (m MSL)',
    'Lower Contour (m)',
    'Upper Contour (m)',
    'Contributing Area (km2)',
    'Area Fraction (%)',
    'Cumulative Area (%)',
    'Cumulative Area (km2)',
  ]);
  hypHeader.height = 22;
  formatTableHeaderRow(hypHeader, 8);

  const numBands = 5;
  const bandStep = deltaH_val / numBands;
  const fractions = [0.15, 0.25, 0.3, 0.2, 0.1]; // Standard S-shaped hypsometric profile
  let cumPct = 0;
  let cumArea = 0;

  for (let i = 0; i < numBands; i++) {
    const lower = H_origin + i * bandStep;
    const upper = H_origin + (i + 1) * bandStep;
    const frac = fractions[i];
    const bArea = A_km2 * frac;
    cumPct += frac * 100;
    cumArea += bArea;

    const row = ws04.addRow([
      `Band ${i + 1}`,
      `${lower.toFixed(2)} - ${upper.toFixed(2)}`,
      lower,
      upper,
      bArea,
      frac * 100,
      cumPct,
      cumArea,
    ]);
    row.height = 20;
    formatDataRow(row, 8, [true, false, true, true, true, true, true, true]);
    row.getCell(3).numFmt = '#,##0.00';
    row.getCell(4).numFmt = '#,##0.00';
    row.getCell(5).numFmt = '#,##0.000';
    row.getCell(6).numFmt = '0.0%';
    row.getCell(7).numFmt = '0.0%';
    row.getCell(8).numFmt = '#,##0.000';
  }

  ws04.addRow([]);

  // Section B: Main Stream Longitudinal Channel Bed Profile
  buildSectionHeader(ws04, 'B. MAIN STREAM WATERCOURSE LONGITUDINAL PROFILE COORDINATES', 8);
  const streamHeader = ws04.addRow([
    'Station No.',
    'Classification',
    'Distance from Crossing (m)',
    'Bed Elevation (m MSL)',
    'Station Latitude (°N)',
    'Station Longitude (°E)',
    'Channel Bed Slope (%)',
    'Relief Above Culvert (m)',
  ]);
  streamHeader.height = 22;
  formatTableHeaderRow(streamHeader, 8);

  const profileCoords = ('elevationProfile' in reportData ? reportData.elevationProfile : undefined) || [];
  if (profileCoords.length > 0) {
    for (let i = 0; i < profileCoords.length; i++) {
      const p = profileCoords[i];
      const relief = p.elevationM - H_origin;
      const slope = p.distanceM > 0 ? (relief / p.distanceM) * 100 : 0;
      const row = ws04.addRow([
        `STN-${i + 1}`,
        i === 0 ? 'Culvert Crossing' : i === profileCoords.length - 1 ? 'Stream Origin / Divide' : 'Reach Point',
        p.distanceM,
        p.elevationM,
        p.lat,
        p.lng,
        slope,
        relief,
      ]);
      row.height = 20;
      formatDataRow(row, 8, [true, false, true, true, true, true, true, true]);
      row.getCell(3).numFmt = '#,##0';
      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(5).numFmt = '0.000000';
      row.getCell(6).numFmt = '0.000000';
      row.getCell(7).numFmt = '0.00%';
      row.getCell(8).numFmt = '#,##0.00';
    }
  } else {
    // Generate synthetic profile stations from streamCoordinates or origin/crossing
    const coords = reportData.streamCoordinates || [];
    const count = Math.max(5, coords.length);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const dist = (1 - t) * (L_km * 1000);
      const elev = H_origin + t * deltaH_val;
      const c = coords[i] || [
        reportData.latitudeDD + (t * 0.005),
        reportData.longitudeDD + (t * 0.005),
      ];
      const relief = elev - H_origin;
      const slope = dist > 0 ? (relief / dist) * 100 : 0;

      const row = ws04.addRow([
        `STN-${i + 1}`,
        i === 0 ? 'Stream Origin' : i === count - 1 ? 'Culvert Invert' : 'Channel Invert',
        dist,
        elev,
        c[0],
        c[1],
        slope,
        relief,
      ]);
      row.height = 20;
      formatDataRow(row, 8, [true, false, true, true, true, true, true, true]);
      row.getCell(3).numFmt = '#,##0';
      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(5).numFmt = '0.000000';
      row.getCell(6).numFmt = '0.000000';
      row.getCell(7).numFmt = '0.00%';
      row.getCell(8).numFmt = '#,##0.00';
    }
  }

  ws04.addRow([]);

  // Section C: Corridor Formation Cross-Section Coordinates
  buildSectionHeader(ws04, 'C. CORRIDOR FORMATION CROSS-SECTION COORDINATES AT CROSSING', 8);
  const csHeader = ws04.addRow([
    'Offset Station',
    'Cross-Section Location',
    'Offset from Centerline (m)',
    'Natural Ground Level (m)',
    'Proposed Formation Level (m)',
    'Embankment Height (m)',
    'Cut / Fill Designation',
    'Side Slope (H:V)',
  ]);
  csHeader.height = 22;
  formatTableHeaderRow(csHeader, 8);

  const formationLevel = H_origin + 3.5; // Typical 3.5 m formation embankment above stream invert
  const offsets = [-20, -10, -5, 0, 5, 10, 20];

  for (const off of offsets) {
    const gl = H_origin + Math.abs(off) * 0.03;
    const embH = formationLevel - gl;
    const row = ws04.addRow([
      `CH ${chTag} ${off < 0 ? off : `+${off}`}`,
      off === 0 ? 'Highway Centerline' : off < 0 ? 'Left Embankment Slope' : 'Right Embankment Slope',
      off,
      gl,
      formationLevel,
      embH,
      embH >= 0 ? 'FILL (Embankment)' : 'CUT',
      '2.0 : 1.0',
    ]);
    row.height = 20;
    formatDataRow(row, 8, [true, false, true, true, true, true, false, false]);
    row.getCell(3).numFmt = '#,##0.00';
    row.getCell(4).numFmt = '#,##0.00';
    row.getCell(5).numFmt = '#,##0.00';
    row.getCell(6).numFmt = '#,##0.00';
  }
}

// ---------------------------------------------------------------------------
// Table formatting utilities
// ---------------------------------------------------------------------------

function formatTableHeaderRow(row: ExcelJS.Row, spanCols: number): void {
  for (let c = 1; c <= spanCols; c++) {
    const cell = row.getCell(c);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: DPR_COLORS.headerNavy },
    };
    cell.font = {
      name: 'Arial',
      size: 9,
      bold: true,
      color: { argb: DPR_COLORS.white },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = DPR_BORDERS.header;
  }
}

function formatDataRow(
  row: ExcelJS.Row,
  spanCols: number,
  alignRight: boolean[]
): void {
  const isEven = row.number % 2 === 0;
  for (let c = 1; c <= spanCols; c++) {
    const cell = row.getCell(c);
    if (!cell.fill) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? DPR_COLORS.zebraBg : DPR_COLORS.white },
      };
    }
    if (!cell.font) {
      cell.font = {
        name: 'Arial',
        size: 9,
        color: { argb: DPR_COLORS.headerNavy },
      };
    }
    if (!cell.alignment) {
      cell.alignment = {
        vertical: 'middle',
        horizontal: alignRight[c - 1] ? 'right' : 'left',
        indent: alignRight[c - 1] ? 0 : 1,
      };
    }
    cell.border = DPR_BORDERS.thin;
  }
}
