import { CorridorAlignment, HydrologyReport } from '../types/hydrology';
import { generateClientHydrologySnapshot } from './stormwaterSnapshot';

const LABEL_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFF1F5F9' },
};
const THIN_BORDER = {
  top: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
  left: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
  bottom: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
  right: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
};

/**
 * KML colour encoding is aabbggrr: alpha, then BLUE, then GREEN, then RED.
 * Byte order is the reverse of CSS rgba, which is the usual source of mistake.
 */
const KML_COLORS = {
  /** Opaque cyan:  a=ff b=ff g=ff r=00 */
  cyanOutline: 'ffffff00',
  /** 40% opaque cyan fill:  a=66 b=ff g=ff r=00 */
  cyanFill: '66ffff00',
  /** Opaque red:  a=ff b=00 g=00 r=ff */
  red: 'ff0000ff',
  /** Opaque sky blue #38bdf8:  a=ff b=f8 g=bd r=38 */
  skyBlue: 'fff8bd38',
  /** Opaque amber #f59e0b:  a=ff b=0b g=9e r=f5 */
  amber: 'ff0b9ef5',
} as const;

/** Escapes text for safe inclusion in an XML element body. */
function xmlEscape(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Formats a [lat, lng] list as a KML coordinate run, optionally closed. */
function toKmlCoords(coords: [number, number][], close = false): string {
  if (coords.length === 0) return '';
  const parts = coords.map(([lat, lng]) => `${lng.toFixed(7)},${lat.toFixed(7)},0`);
  if (close) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (first !== last) parts.push(first);
  }
  return parts.join(' ');
}

/** Safe, meaningful filename fragment from a chainage label. */
function chainageTag(value: string | number): string {
  const cleaned = String(value).replace(/[^0-9.+a-zA-Z_-]/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'MAP_POINT';
}

/**
 * Generates an OGC-compliant KML styled for Google Earth.
 *
 * Includes:
 *   1. Yellow "Untitled Placemark" at the target chainage, with exact DMS
 *      coordinates and the full hydrology table in its balloon.
 *   2. Red stream LineString.
 *   3. Sky-blue tributary LineStrings.
 *   4. Cyan catchment Polygon.
 *   5. The corridor alignment, when one is supplied.
 */
export function generateGoogleEarthKML(
  report: HydrologyReport,
  alignment?: CorridorAlignment
): string {
  const chainageLabel = xmlEscape(report.targetChainageFormatted);

  const balloonRows: [string, string][] = [
    ['LATITUDE', `${xmlEscape(report.latitudeDMS)}  (${report.latitudeDD})`],
    ['LONGITUDE', `${xmlEscape(report.longitudeDMS)}  (${report.longitudeDD})`],
    ['CATCHMENT AREA (A)', `${report.catchmentAreaKm2} km²`],
    ['LENGTH OF STREAM (L)', `${report.lengthOfStreamKm} km`],
    ['LEVEL STREAM ORIGIN', `${report.levelStreamOriginM} m MSL`],
    ['HIGHEST CONTOUR', `${report.highestContourM} m MSL`],
    ['ELEVATION DIFFERENCE (Δh)', `${report.elevationDropM} m`],
    [
      'ANALYSIS SCOPE',
      `${report.scopeAppliedM} m${report.scopeExpandedDueToFlatRelief ? ' (expanded: relief below 5 m)' : ''}`,
    ],
    ['RELIEF IN SCOPE', `${report.reliefWithinScopeM} m`],
    ['ELEVATION SOURCE', xmlEscape(report.elevationSource)],
  ];

  const balloonTable = balloonRows
    .map(
      ([k, v]) => `            <tr><td><b>${k}</b></td><td>${v}</td></tr>`
    )
    .join('\n');

  const tributaryPlacemarks = (report.tributaryPaths ?? [])
    .filter((p) => p.length >= 2)
    .map(
      (path, idx) => `
      <Placemark>
        <name>Overland Runoff Tributary ${idx + 1}</name>
        <styleUrl>#tribStyle</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>${toKmlCoords(path)}</coordinates>
        </LineString>
      </Placemark>`
    )
    .join('');

  const contourPlacemarks = (report.contours ?? [])
    .filter((c) => c.coordinates.length >= 2)
    .map(
      (c) => `
      <Placemark>
        <name>Contour ${c.elevation} m MSL</name>
        <styleUrl>#contourStyle</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>${toKmlCoords(c.coordinates)}</coordinates>
        </LineString>
      </Placemark>`
    )
    .join('');

  const alignmentPlacemark =
    alignment && alignment.coordinates.length >= 2
      ? `
      <Placemark>
        <name>${xmlEscape(alignment.name || 'Corridor Alignment')}</name>
        <styleUrl>#corridorStyle</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>${toKmlCoords(alignment.coordinates)}</coordinates>
        </LineString>
      </Placemark>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Hydrology Catchment - Chainage ${chainageLabel}</name>
    <description>Stormwater catchment and stream delineation at chainage ${chainageLabel} (${xmlEscape(report.latitudeDMS)}, ${xmlEscape(report.longitudeDMS)}). Elevation source: ${xmlEscape(report.elevationSource)}.</description>

    <Style id="yellowPushpin">
      <IconStyle>
        <scale>1.2</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href>
        </Icon>
        <hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/>
      </IconStyle>
      <LabelStyle>
        <color>ffffffff</color>
        <scale>1.0</scale>
      </LabelStyle>
      <BalloonStyle>
        <text><![CDATA[
          <h2>$[name]</h2>
          <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse; font-family:sans-serif; font-size:12px;">
${balloonTable}
          </table>
        ]]></text>
      </BalloonStyle>
    </Style>

    <Style id="cyanCatchmentStyle">
      <LineStyle>
        <color>${KML_COLORS.cyanOutline}</color>
        <width>2.5</width>
      </LineStyle>
      <PolyStyle>
        <color>${KML_COLORS.cyanFill}</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>

    <Style id="redStreamStyle">
      <LineStyle>
        <color>${KML_COLORS.red}</color>
        <width>3.5</width>
      </LineStyle>
    </Style>

    <Style id="tribStyle">
      <LineStyle>
        <color>${KML_COLORS.skyBlue}</color>
        <width>1.8</width>
      </LineStyle>
    </Style>

    <Style id="contourStyle">
      <LineStyle>
        <color>${KML_COLORS.amber}</color>
        <width>1.4</width>
      </LineStyle>
    </Style>

    <Style id="corridorStyle">
      <LineStyle>
        <color>${KML_COLORS.red}</color>
        <width>2.0</width>
      </LineStyle>
    </Style>

    <Folder>
      <name>Delineation Output</name>
      <open>1</open>

      <Placemark>
        <name>Untitled Placemark - Chainage ${chainageLabel}</name>
        <description>Chainage: ${chainageLabel}
Latitude: ${xmlEscape(report.latitudeDMS)} (${report.latitudeDD})
Longitude: ${xmlEscape(report.longitudeDMS)} (${report.longitudeDD})
Catchment area: ${report.catchmentAreaKm2} km²
Stream length: ${report.lengthOfStreamKm} km</description>
        <styleUrl>#yellowPushpin</styleUrl>
        <Point>
          <coordinates>${report.longitudeDD.toFixed(7)},${report.latitudeDD.toFixed(7)},0</coordinates>
        </Point>
      </Placemark>

      <Placemark>
        <name>Primary Stream Flow Path (L = ${report.lengthOfStreamKm} km)</name>
        <styleUrl>#redStreamStyle</styleUrl>
        <LineString>
          <extrude>1</extrude>
          <tessellate>1</tessellate>
          <coordinates>${toKmlCoords(report.streamCoordinates)}</coordinates>
        </LineString>
      </Placemark>
${tributaryPlacemarks}
      <Placemark>
        <name>Catchment Area (A = ${report.catchmentAreaKm2} km²)</name>
        <styleUrl>#cyanCatchmentStyle</styleUrl>
        <Polygon>
          <extrude>1</extrude>
          <tessellate>1</tessellate>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>${toKmlCoords(report.catchmentPolygon, true)}</coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>
${contourPlacemarks}
${alignmentPlacemark}
    </Folder>
  </Document>
</kml>`;
}

/** Downloads a string as a file in the browser. */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Exports the single-chainage Google Earth KML. */
export function exportKML(report: HydrologyReport, alignment?: CorridorAlignment): void {
  const kmlString = generateGoogleEarthKML(report, alignment);
  downloadFile(
    kmlString,
    `Chainage_${chainageTag(report.targetChainageFormatted)}_Catchment.kml`,
    'application/vnd.google-earth.kml+xml'
  );
}

/** Shared snapshot request shape used by the snapshot and Excel endpoints. */
export function buildSnapshotPayload(
  report: HydrologyReport,
  alignment?: CorridorAlignment | null
): Record<string, unknown> {
  return {
    targetChainageFormatted: report.targetChainageFormatted,
    targetChainage: report.targetChainage,
    latitudeDMS: report.latitudeDMS,
    longitudeDMS: report.longitudeDMS,
    latitudeDD: report.latitudeDD,
    longitudeDD: report.longitudeDD,
    catchmentAreaKm2: report.catchmentAreaKm2,
    lengthOfStreamKm: report.lengthOfStreamKm,
    levelStreamOriginM: report.levelStreamOriginM,
    highestContourM: report.highestContourM,
    elevationDropM: report.elevationDropM,
    scopeAppliedM: report.scopeAppliedM,
    scopeExpandedDueToFlatRelief: report.scopeExpandedDueToFlatRelief,
    reliefWithinScopeM: report.reliefWithinScopeM,
    meetsReliefThreshold: report.meetsReliefThreshold,
    elevationSource: report.elevationSource,
    elevationOriginKind: report.elevationOriginKind,
    demCoverage: report.demCoverage,
    contributingCells: report.contributingCells,
    catchmentPolygon: report.catchmentPolygon,
    streamCoordinates: report.streamCoordinates,
    alignmentCoordinates: alignment?.coordinates,
    allTracks: alignment?.allTracks,
    tributaryPaths: report.tributaryPaths,
    contours: report.contours,
    chainages: alignment?.chainages?.map((c) => ({
      chainage: c.chainage,
      formatted: c.formatted,
      lat: c.lat,
      lng: c.lng,
    })),
  };
}

/** Triggers a browser download for a generated blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports the formatted Excel workbook.
 *
 * Tries server-side /api/export-excel with pre-rendered client snapshot base64.
 * If server is offline or fails, seamlessly builds the exact same workbook
 * client-side with ExcelJS, complete with the embedded 70% catchment snapshot!
 */
export async function exportExcelReport(
  report: HydrologyReport,
  alignment?: CorridorAlignment | null
): Promise<void> {
  const filename = `Hydrology_Report_CH_${chainageTag(report.targetChainageFormatted)}.xlsx`;

  let clientSnapshotDataUrl: string | undefined;
  if (typeof document !== 'undefined') {
    try {
      const snap = await generateClientHydrologySnapshot(report, alignment);
      clientSnapshotDataUrl = snap.dataUrl;
    } catch (err) {
      console.warn('Pre-rendering client snapshot for Excel export notice:', err);
    }
  }

  const payload: Record<string, unknown> = buildSnapshotPayload(report, alignment);
  if (clientSnapshotDataUrl) {
    payload.snapshotBase64 = clientSnapshotDataUrl.split(',')[1];
  }

  try {
    const resp = await fetch('/api/export-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (resp.ok) {
      downloadBlob(await resp.blob(), filename);
      return;
    }
  } catch (err) {
    console.warn('Server /api/export-excel call failed, using client-side generator:', err);
  }

  // Client-side workbook generation fallback with embedded snapshot
  const blob = await buildClientHydrologyWorkbook(report, alignment, clientSnapshotDataUrl);
  downloadBlob(blob, filename);
}

/**
 * Builds the Excel workbook directly on the client with ExcelJS,
 * matching the server layout and embedding the 70%-framed snapshot image.
 */
export async function buildClientHydrologyWorkbook(
  report: HydrologyReport,
  alignment?: CorridorAlignment | null,
  clientSnapshotDataUrl?: string
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tensora GIS - Hydrology Catchment Engine';
  workbook.created = new Date();

  const nameBase = (report.targetChainageFormatted || 'Report')
    .replace(/[\\/*?:[\]]/g, '_')
    .slice(0, 31);
  const summary = workbook.addWorksheet(nameBase, {
    views: [{ showGridLines: true }],
  });
  summary.columns = [{ width: 28 }, { width: 20 }, { width: 14 }];

  const headline: [string, any, string][] = [
    ['LATITUDE :', report.latitudeDMS, ''],
    ['LONGITUDE :', report.longitudeDMS, ''],
    ['CATCHMENT AREA (A):', report.catchmentAreaKm2, 'km2'],
    ['LENGTH OF STREAM (L):', report.lengthOfStreamKm, 'km'],
    ['LEVEL STREAM ORIGIN:', report.levelStreamOriginM, 'm'],
    ['HIGHEST CONTOUR:', report.highestContourM, 'm'],
  ];

  for (const [label, value, unit] of headline) {
    const row = summary.addRow([label, value, unit]);
    row.height = 24;
    const cellA = row.getCell(1);
    const cellB = row.getCell(2);
    const cellC = row.getCell(3);
    cellA.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cellA.fill = LABEL_FILL;
    cellB.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0284C7' } };
    cellC.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF64748B' } };
    cellA.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellB.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellC.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellA.border = THIN_BORDER;
    cellB.border = THIN_BORDER;
    cellC.border = THIN_BORDER;
  }

  summary.addRow([]);
  const scopeM = report.scopeAppliedM ?? 500;
  const secondary: [string, any, string][] = [
    ['ELEVATION DROP (Δh):', report.elevationDropM, 'm'],
    ['TARGET CHAINAGE:', report.targetChainageFormatted ?? String(report.targetChainage), ''],
    [
      'ANALYSIS SCOPE:',
      scopeM,
      report.scopeExpandedDueToFlatRelief ? 'm (expanded: relief < 5m)' : 'm',
    ],
    ['RELIEF IN SCOPE:', report.reliefWithinScopeM !== undefined ? report.reliefWithinScopeM : '—', 'm'],
    ['MEETS 5 m THRESHOLD:', report.meetsReliefThreshold === undefined ? '—' : report.meetsReliefThreshold ? 'Yes' : 'No', ''],
    ['ELEVATION SOURCE:', report.elevationSource ?? 'Not recorded', ''],
    [
      'ORIGIN DATUM:',
      report.elevationOriginKind === 'survey' ? 'Uploaded survey sheet' : 'Sampled from DEM',
      '',
    ],
    ['DEM COVERAGE:', report.demCoverage !== undefined ? Number((report.demCoverage * 100).toFixed(1)) : 100, '%'],
  ];

  for (const [label, value, unit] of secondary) {
    const row = summary.addRow([label, value, unit]);
    row.height = 20;
    const cellA = row.getCell(1);
    const cellB = row.getCell(2);
    const cellC = row.getCell(3);
    cellA.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF334155' } };
    cellB.font = { name: 'Arial', size: 9, color: { argb: 'FF334155' } };
    cellC.font = { name: 'Arial', size: 9, color: { argb: 'FF64748B' } };
    cellA.fill = LABEL_FILL;
    cellA.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellB.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellC.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cellA.border = THIN_BORDER;
    cellB.border = THIN_BORDER;
    cellC.border = THIN_BORDER;
  }

  summary.addRow([]);

  // Embed the delineation snapshot
  let snapshotDataUrl = clientSnapshotDataUrl;
  if (!snapshotDataUrl && typeof document !== 'undefined') {
    try {
      const snap = await generateClientHydrologySnapshot(report, alignment);
      snapshotDataUrl = snap.dataUrl;
    } catch (err) {
      console.warn('Could not generate client snapshot for Excel:', err);
    }
  }

  if (snapshotDataUrl) {
    const base64Data = snapshotDataUrl.includes(',')
      ? snapshotDataUrl.split(',')[1]
      : snapshotDataUrl;
    const imageId = workbook.addImage({
      base64: base64Data,
      extension: 'png',
    });
    summary.addImage(imageId, {
      tl: { col: 0, row: summary.rowCount + 1 },
      ext: { width: 840, height: 574 },
    });
  }

  const out = await workbook.xlsx.writeBuffer();
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
