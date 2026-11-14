import type ExcelJS from 'exceljs';

let excelJsInstance: typeof ExcelJS | null = null;
let excelJsLoadingPromise: Promise<typeof ExcelJS> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Document is undefined'));
      return;
    }

    // Check if script is already present
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if ((window as any).ExcelJS) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Multi-Tier Fault-Tolerant ExcelJS Loader.
 *
 * Tiers:
 * 1. Return already resolved memory instance or window.ExcelJS.
 * 2. Native dynamic import('exceljs') bundled by Vite.
 * 3. Fallback to Cloudflare CDN (cdnjs).
 * 4. Fallback to jsDelivr CDN.
 * 5. Fallback to Unpkg CDN.
 */
export async function loadExcelJS(): Promise<typeof ExcelJS> {
  if (excelJsInstance) {
    return excelJsInstance;
  }

  if (typeof window !== 'undefined' && (window as any).ExcelJS) {
    excelJsInstance = (window as any).ExcelJS as typeof ExcelJS;
    return excelJsInstance;
  }

  if (excelJsLoadingPromise) {
    return excelJsLoadingPromise;
  }

  excelJsLoadingPromise = (async () => {
    // Tier 1: Try native dynamic import
    try {
      const mod = await import('exceljs');
      const ExcelJSExport = ((mod as any).default || mod) as typeof ExcelJS;
      if (ExcelJSExport && (ExcelJSExport.Workbook || (ExcelJSExport as any).default?.Workbook)) {
        excelJsInstance = ((ExcelJSExport as any).Workbook ? ExcelJSExport : (ExcelJSExport as any).default) as typeof ExcelJS;
        if (typeof window !== 'undefined') {
          (window as any).ExcelJS = excelJsInstance;
        }
        return excelJsInstance;
      }
    } catch (importErr) {
      console.warn(
        'Native dynamic import of exceljs failed (e.g. stale chunk on GitHub Pages after deploy), falling back to CDN:',
        importErr
      );
    }

    // Tier 2: CDN Fallbacks in browser environment
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const cdns = [
        'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
        'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
        'https://unpkg.com/exceljs@4.4.0/dist/exceljs.min.js',
      ];

      for (const cdnUrl of cdns) {
        try {
          await loadScript(cdnUrl);
          if ((window as any).ExcelJS) {
            excelJsInstance = (window as any).ExcelJS as typeof ExcelJS;
            return excelJsInstance;
          }
        } catch (cdnErr) {
          console.warn(`CDN fallback ${cdnUrl} failed:`, cdnErr);
        }
      }
    }

    // Reset promise on complete failure to allow retry
    excelJsLoadingPromise = null;
    throw new Error(
      'The Excel generation module could not be loaded because a new version of the app was deployed to GitHub Pages. ' +
      'Please refresh your browser to use the updated version.'
    );
  })();

  return excelJsLoadingPromise;
}

/**
 * Pre-warms the ExcelJS module during browser idle time so export operations
 * never encounter chunk loading latency or offline chunk 404s.
 */
export function prewarmExcelJS(): void {
  if (typeof window === 'undefined') return;
  if (excelJsInstance || (window as any).ExcelJS) return;

  const run = () => {
    loadExcelJS().catch((err) => {
      console.debug('Idle prewarm of ExcelJS handled:', err);
    });
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 1500);
  }
}
