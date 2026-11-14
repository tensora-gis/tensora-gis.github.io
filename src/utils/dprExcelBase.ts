import type ExcelJS from 'exceljs';

/**
 * Global Design Standard Selector
 * DPR exports can align with Indian Codal Standards (IRC / CPHEEO / IS / CWC)
 * or International Standards (AASHTO / EPA / USACE).
 */
export type DprDesignStandard = 'INDIAN_DPR' | 'INTERNATIONAL';

export interface DprProjectMetadata {
  designStandard?: DprDesignStandard;
  projectTitle?: string;
  packageNo?: string;
  clientAuthority?: string;
  consultantName?: string;
  designCodeStandard?: string;
  designReturnPeriodYears?: number;
  targetChainage?: string;
  demProvenance?: string;
  timestamp?: string;
}

let activeGlobalStandard: DprDesignStandard = 'INDIAN_DPR';
type StandardChangeListener = (standard: DprDesignStandard) => void;
const standardListeners = new Set<StandardChangeListener>();

export function getGlobalDesignStandard(): DprDesignStandard {
  return activeGlobalStandard;
}

export function subscribeDesignStandard(listener: StandardChangeListener): () => void {
  standardListeners.add(listener);
  return () => {
    standardListeners.delete(listener);
  };
}

export function setGlobalDesignStandard(standard: DprDesignStandard): void {
  activeGlobalStandard = standard;
  standardListeners.forEach((fn) => {
    try {
      fn(standard);
    } catch (e) {
      console.warn('Error in designStandard listener:', e);
    }
  });
}

export function getDefaultDprMetadata(
  moduleKey: 'stormwater' | 'water' | 'wastewater' | 'river',
  overrideStandard?: DprDesignStandard
): DprProjectMetadata {
  const std = overrideStandard || activeGlobalStandard;
  const isIndian = std === 'INDIAN_DPR';
  const defaults: Record<string, DprProjectMetadata> = {
    stormwater: {
      designStandard: std,
      projectTitle: isIndian
        ? 'DETAILED PROJECT REPORT (DPR) — STORMWATER CROSS-DRAINAGE STRUCTURE'
        : 'CROSS-DRAINAGE HYDRAULIC DESIGN AUDIT — FHWA HDS-5 & AASHTO STANDARDS',
      packageNo: isIndian ? 'PKG-01 / CD-WORKS' : 'DOT-HWY-01 / CD-CULVERT',
      clientAuthority: isIndian
        ? 'National Highways Authority of India (NHAI) / MoRTH'
        : 'Department of Transportation (DOT) / Federal Highway Administration (FHWA)',
      consultantName: 'Tensora GIS Engineering Consultancy',
      designCodeStandard: isIndian
        ? 'IRC:SP:13-2022 / IRC:SP:42-2014 / IRC:78-2014 / IS 458:2021'
        : 'FHWA HDS-5 / AASHTO Drainage Manual / ASTM C76M / FHWA HEC-18',
      designReturnPeriodYears: 50,
      demProvenance: 'Copernicus GLO-30 (FABDEM 30m Global DEM)',
    },
    water: {
      designStandard: activeGlobalStandard,
      projectTitle: isIndian
        ? 'DETAILED PROJECT REPORT (DPR) — WATER SUPPLY DISTRIBUTION & TRANSIENT SURGE'
        : 'WATER DISTRIBUTION NETWORK HYDRAULIC MODELING REPORT',
      packageNo: 'WSS-ZONE-01',
      clientAuthority: isIndian
        ? 'Jal Jeevan Mission (JJM) / AMRUT / State PHED'
        : 'Municipal Water Works & Sanitation Authority',
      consultantName: 'Tensora GIS Engineering Consultancy',
      designCodeStandard: isIndian
        ? 'CPHEEO Manual on Water Supply (3rd Ed.) / IS 1172 / IS 9668 / IS 8329'
        : 'AWWA M31 / Ten States Standards / EPA Guidelines',
      designReturnPeriodYears: 30,
      demProvenance: 'Copernicus GLO-30 (FABDEM 30m Global DEM)',
    },
    wastewater: {
      designStandard: activeGlobalStandard,
      projectTitle: isIndian
        ? 'DETAILED PROJECT REPORT (DPR) — SEWERAGE NETWORK & SEWAGE TREATMENT PLANT'
        : 'SANITARY SEWERAGE COLLECTION SYSTEM DESIGN REPORT',
      packageNo: 'WW-SEW-01',
      clientAuthority: isIndian
        ? 'CPHEEO / National Mission for Clean Ganga (NMCG) / State PCB'
        : 'Water Environment Federation / Environmental Protection Agency',
      consultantName: 'Tensora GIS Engineering Consultancy',
      designCodeStandard: isIndian
        ? 'CPHEEO Sewerage & Sewage Treatment Manual (2013) / IS 1742 / CPCB'
        : 'WEF MOP 9 / ASCE Sewer Design Manual',
      designReturnPeriodYears: 30,
      demProvenance: 'Copernicus GLO-30 (FABDEM 30m Global DEM)',
    },
    river: {
      designStandard: activeGlobalStandard,
      projectTitle: isIndian
        ? 'DETAILED PROJECT REPORT (DPR) — 2D RIVER HYDRODYNAMICS & TRAINING STRUCTURES'
        : '2D RIVER HYDRODYNAMIC & MORPHODYNAMIC SIMULATION REPORT',
      packageNo: 'RIVER-TRAIN-01',
      clientAuthority: isIndian
        ? 'Central Water Commission (CWC) / State Irrigation Dept / NHAI'
        : 'US Army Corps of Engineers (USACE) / Flood Control District',
      consultantName: 'Tensora GIS Engineering Consultancy',
      designCodeStandard: isIndian
        ? 'IRC:89-2019 / IS 12094:2000 / IRC:78-2014 / CWC Guidelines'
        : 'USACE HEC-RAS 2D Guidelines / FHWA HEC-18 Scour Manual',
      designReturnPeriodYears: 100,
      demProvenance: 'Copernicus GLO-30 (FABDEM 30m Global DEM)',
    },
  };
  return defaults[moduleKey];
}

// ---------------------------------------------------------------------------
// Standard DPR Color Palette, Fonts, and Borders
// ---------------------------------------------------------------------------

export const DPR_COLORS = {
  headerNavy: 'FF0F172A',
  bannerDark: 'FF1E293B',
  bannerMuted: 'FF334155',
  bannerSub: 'FF475569',
  accentBlue: 'FF0284C7',
  sectionBg: 'FFE2E8F0',
  zebraBg: 'FFF8FAFC',
  labelBg: 'FFF1F5F9',
  white: 'FFFFFFFF',
  borderGray: 'FF94A3B8',
  subtleBorder: 'FFE2E8F0',
  passBg: 'FFDCFCE7',
  passText: 'FF166534',
  marginalBg: 'FFFEF3C7',
  marginalText: 'FF92400E',
  failBg: 'FFFEE2E2',
  failText: 'FF991B1B',
} as const;

export const DPR_BORDERS = {
  thin: {
    top: { style: 'thin' as const, color: { argb: DPR_COLORS.borderGray } },
    left: { style: 'thin' as const, color: { argb: DPR_COLORS.borderGray } },
    bottom: { style: 'thin' as const, color: { argb: DPR_COLORS.borderGray } },
    right: { style: 'thin' as const, color: { argb: DPR_COLORS.borderGray } },
  },
  header: {
    top: { style: 'medium' as const, color: { argb: DPR_COLORS.headerNavy } },
    left: { style: 'thin' as const, color: { argb: DPR_COLORS.borderGray } },
    bottom: { style: 'medium' as const, color: { argb: DPR_COLORS.headerNavy } },
    right: { style: 'thin' as const, color: { argb: DPR_COLORS.borderGray } },
  },
  doubleBottom: {
    top: { style: 'thin' as const, color: { argb: DPR_COLORS.borderGray } },
    left: { style: 'thin' as const, color: { argb: DPR_COLORS.borderGray } },
    bottom: { style: 'double' as const, color: { argb: DPR_COLORS.headerNavy } },
    right: { style: 'thin' as const, color: { argb: DPR_COLORS.borderGray } },
  },
};

/**
 * Builds the standardized 5-row DPR Engineering Title Banner (Rows 1–5),
 * plus an empty spacer row (Row 6).
 */
export function buildTitleBanner(
  sheet: ExcelJS.Worksheet,
  meta: DprProjectMetadata,
  spanCols = 9
): void {
  const effectiveSpan = Math.max(3, spanCols);
  const title = meta.projectTitle || 'DETAILED PROJECT REPORT (DPR) — ENGINEERING DESIGN & HYDRAULIC AUDIT';
  const pkg = meta.packageNo || 'PKG-01';
  const ch = meta.targetChainage ? `  |  LOCATION / CHAINAGE: ${meta.targetChainage}` : '';
  const client = meta.clientAuthority || 'National Highways Authority of India (NHAI) / MoRTH';
  const consultant = meta.consultantName || 'Tensora GIS Engineering Consultancy';
  const standard = meta.designCodeStandard || 'IRC:SP:13-2022 / IRC:SP:42-2014 / IRC:78-2014 / IS 458:2021';
  const rp = meta.designReturnPeriodYears ? `  |  DESIGN RETURN PERIOD: ${meta.designReturnPeriodYears} YEARS` : '';
  const dem = meta.demProvenance || 'Copernicus GLO-30 (FABDEM 30m Global DEM)';
  const dateStr = meta.timestamp || new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  const bannerRows: { text: string; bg: string; fg: string; size: number; bold: boolean; height: number }[] = [
    { text: title, bg: DPR_COLORS.headerNavy, fg: 'FFFFFFFF', size: 11, bold: true, height: 26 },
    { text: `PACKAGE: ${pkg}${ch}`, bg: DPR_COLORS.bannerDark, fg: 'FFE2E8F0', size: 9.5, bold: true, height: 20 },
    { text: `CLIENT AUTHORITY: ${client}  |  CONSULTANT: ${consultant}`, bg: DPR_COLORS.bannerMuted, fg: 'FFCBD5E1', size: 8.5, bold: false, height: 18 },
    { text: `GOVERNING STANDARD: ${standard}${rp}`, bg: DPR_COLORS.bannerMuted, fg: 'FFCBD5E1', size: 8.5, bold: false, height: 18 },
    { text: `ELEVATION PROVENANCE: ${dem}  |  AUDIT REPORT GENERATED: ${dateStr}`, bg: DPR_COLORS.bannerSub, fg: 'FFF1F5F9', size: 8, bold: false, height: 18 },
  ];

  for (let i = 0; i < bannerRows.length; i++) {
    const item = bannerRows[i];
    const rowNum = i + 1;
    const row = sheet.getRow(rowNum);
    row.height = item.height;
    row.getCell(1).value = item.text;

    sheet.mergeCells(rowNum, 1, rowNum, effectiveSpan);

    for (let c = 1; c <= effectiveSpan; c++) {
      const cell = row.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: item.bg },
      };
      cell.font = {
        name: 'Arial',
        size: item.size,
        bold: item.bold,
        color: { argb: item.fg },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = DPR_BORDERS.thin;
    }
  }

  // Row 6: Empty spacer row
  const spacer = sheet.getRow(6);
  spacer.height = 10;
}

/**
 * Builds a standardized section header banner across columns 1 to spanCols.
 */
export function buildSectionHeader(
  sheet: ExcelJS.Worksheet,
  title: string,
  spanCols = 9
): ExcelJS.Row {
  const row = sheet.addRow([title]);
  row.height = 23;
  const rowNum = row.number;
  const effectiveSpan = Math.max(2, spanCols);

  sheet.mergeCells(rowNum, 1, rowNum, effectiveSpan);

  for (let c = 1; c <= effectiveSpan; c++) {
    const cell = row.getCell(c);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: DPR_COLORS.sectionBg },
    };
    cell.font = {
      name: 'Arial',
      size: 9.5,
      bold: true,
      color: { argb: DPR_COLORS.headerNavy },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cell.border = DPR_BORDERS.thin;
  }
  return row;
}

export interface WorkedCalculationRowSpec {
  stepNo: string;
  parameter: string;
  formulaSymbolic: string;
  substitutionFormula: string; // Dynamic Excel =CONCAT(...)
  computedFormula: string; // Live Excel calculation formula
  computedResult?: number | string;
  unit: string;
  codalClause: string;
  permissibleLimit: string;
  complianceFormula: string; // Live Excel =IF(...)
  complianceResult?: 'PASS' | 'MARGINAL' | 'FAIL';
  numFmt?: string;
}

/**
 * Appends a standardized 9-column worked calculation row for codal engineering audits:
 * Col 1 (A): Step No.
 * Col 2 (B): Design Parameter
 * Col 3 (C): Governing Formula (Symbolic text)
 * Col 4 (D): Numerical Substitution (dynamic Excel =CONCAT(...) formula)
 * Col 5 (E): Computed Value (live Excel formula { formula, result })
 * Col 6 (F): Unit
 * Col 7 (G): Indian Code & Clause
 * Col 8 (H): Permissible Limit
 * Col 9 (I): Compliance Status (live Excel =IF(...) formula returning PASS/MARGINAL/FAIL)
 */
export function appendWorkedCalculationRow(
  sheet: ExcelJS.Worksheet,
  spec: WorkedCalculationRowSpec
): ExcelJS.Row {
  // Strip leading '=' if present to conform to OpenXML standard formula storage
  const cleanSub = spec.substitutionFormula.replace(/^=/, '');
  const cleanComp = spec.computedFormula.replace(/^=/, '');
  const cleanCompl = spec.complianceFormula.replace(/^=/, '');

  const row = sheet.addRow([
    spec.stepNo,
    spec.parameter,
    spec.formulaSymbolic,
    { formula: cleanSub },
    spec.computedResult !== undefined
      ? { formula: cleanComp, result: spec.computedResult }
      : { formula: cleanComp },
    spec.unit,
    spec.codalClause,
    spec.permissibleLimit,
    spec.complianceResult !== undefined
      ? { formula: cleanCompl, result: spec.complianceResult }
      : { formula: cleanCompl },
  ]);

  row.height = 22;

  // Format Col 1: Step No.
  const c1 = row.getCell(1);
  c1.font = { name: 'Arial', size: 9, bold: true, color: { argb: DPR_COLORS.headerNavy } };
  c1.alignment = { vertical: 'middle', horizontal: 'center' };
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DPR_COLORS.labelBg } };
  c1.border = DPR_BORDERS.thin;

  // Format Col 2: Parameter
  const c2 = row.getCell(2);
  c2.font = { name: 'Arial', size: 9, bold: true, color: { argb: DPR_COLORS.headerNavy } };
  c2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  c2.border = DPR_BORDERS.thin;

  // Format Col 3: Symbolic Formula
  const c3 = row.getCell(3);
  c3.font = { name: 'Consolas', size: 8.5, color: { argb: DPR_COLORS.headerNavy } };
  c3.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  c3.border = DPR_BORDERS.thin;

  // Format Col 4: Substitution
  const c4 = row.getCell(4);
  c4.font = { name: 'Consolas', size: 8.5, color: { argb: DPR_COLORS.bannerMuted } };
  c4.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  c4.border = DPR_BORDERS.thin;

  // Format Col 5: Computed Value
  const c5 = row.getCell(5);
  c5.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: DPR_COLORS.accentBlue } };
  c5.alignment = { vertical: 'middle', horizontal: 'right' };
  c5.border = DPR_BORDERS.thin;
  if (spec.numFmt) {
    c5.numFmt = spec.numFmt;
  } else if (typeof spec.computedResult === 'number') {
    c5.numFmt = Number.isInteger(spec.computedResult) ? '#,##0' : '#,##0.00';
  } else {
    c5.numFmt = '#,##0.00';
  }

  // Format Col 6: Unit
  const c6 = row.getCell(6);
  c6.font = { name: 'Arial', size: 8.5, color: { argb: DPR_COLORS.bannerSub } };
  c6.alignment = { vertical: 'middle', horizontal: 'center' };
  c6.border = DPR_BORDERS.thin;

  // Format Col 7: Codal Clause
  const c7 = row.getCell(7);
  c7.font = { name: 'Arial', size: 8.5, italic: true, color: { argb: DPR_COLORS.bannerMuted } };
  c7.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  c7.border = DPR_BORDERS.thin;

  // Format Col 8: Permissible Limit
  const c8 = row.getCell(8);
  c8.font = { name: 'Arial', size: 8.5, color: { argb: DPR_COLORS.bannerMuted } };
  c8.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  c8.border = DPR_BORDERS.thin;

  // Format Col 9: Compliance Status
  const c9 = row.getCell(9);
  c9.font = { name: 'Arial', size: 9, bold: true };
  c9.alignment = { vertical: 'middle', horizontal: 'center' };
  c9.border = DPR_BORDERS.thin;

  // Set initial appearance based on complianceResult
  if (spec.complianceResult === 'FAIL') {
    c9.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DPR_COLORS.failBg } };
    c9.font = { name: 'Arial', size: 9, bold: true, color: { argb: DPR_COLORS.failText } };
  } else if (spec.complianceResult === 'MARGINAL') {
    c9.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DPR_COLORS.marginalBg } };
    c9.font = { name: 'Arial', size: 9, bold: true, color: { argb: DPR_COLORS.marginalText } };
  } else {
    c9.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DPR_COLORS.passBg } };
    c9.font = { name: 'Arial', size: 9, bold: true, color: { argb: DPR_COLORS.passText } };
  }

  return row;
}

/**
 * Registers ExcelJS conditional formatting rules for Compliance Status columns:
 * "PASS"     -> Light green fill #DCFCE7 / dark green text #166534
 * "MARGINAL" -> Amber fill #FEF3C7 / dark amber text #92400E
 * "FAIL"     -> Red fill #FEE2E2 / dark red text #991B1B
 */
export function applyComplianceConditionalFormatting(
  sheet: ExcelJS.Worksheet,
  colLetter: string,
  startRow: number,
  endRow: number
): void {
  if (startRow > endRow) return;
  const ref = `${colLetter}${startRow}:${colLetter}${endRow}`;

  sheet.addConditionalFormatting({
    ref,
    rules: [
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'PASS',
        priority: 1,
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: DPR_COLORS.passBg },
          },
          font: {
            color: { argb: DPR_COLORS.passText },
            bold: true,
          },
        },
      },
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'MARGINAL',
        priority: 2,
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: DPR_COLORS.marginalBg },
          },
          font: {
            color: { argb: DPR_COLORS.marginalText },
            bold: true,
          },
        },
      },
      {
        type: 'containsText',
        operator: 'containsText',
        text: 'FAIL',
        priority: 3,
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: DPR_COLORS.failBg },
          },
          font: {
            color: { argb: DPR_COLORS.failText },
            bold: true,
          },
        },
      },
    ],
  });
}

/**
 * Helper to ensure safe and unique Excel worksheet names (<= 31 characters).
 */
export function uniqueSheetName(workbook: ExcelJS.Workbook, base: string): string {
  const clean = (base || 'Sheet').replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || 'Sheet';
  if (!workbook.worksheets.some((ws) => ws.name === clean)) return clean;
  let n = 2;
  for (;;) {
    const suffix = `_${n}`;
    const candidate = clean.slice(0, 31 - suffix.length) + suffix;
    if (!workbook.worksheets.some((ws) => ws.name === candidate)) return candidate;
    n++;
  }
}
