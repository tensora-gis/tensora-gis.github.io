import ExcelJS from 'exceljs';

export async function loadExcelJS(): Promise<typeof ExcelJS> {
  if (typeof window !== 'undefined' && (window as any).ExcelJS?.Workbook) {
    return (window as any).ExcelJS;
  }
  const anyMod = ExcelJS as any;
  if (anyMod?.Workbook) {
    return anyMod;
  }
  if (anyMod?.default?.Workbook) {
    return anyMod.default;
  }
  return anyMod;
}

export function prewarmExcelJS(): void {}

