import { CorridorAlignment, HydrologyReport } from '../types/hydrology';
import { decimalToDMS } from './geoUtils';

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
 * Exports the formatted Excel workbook from the server-side generator.
 *
 * On static hosting (e.g. GitHub Pages) there is no Express API, so a 404/405
 * falls back to an identical client-side workbook built with ExcelJS — the
 * summary, chainage register and catchment-boundary sheets, without the
 * server-rendered basemap snapshot.
 */
export async function exportExcelReport(
  report: HydrologyReport,
  alignment?: CorridorAlignment | null
): Promise<void> {
  const filename = `Hydrology_Report_CH_${chainageTag(report.targetChainageFormatted)}.xlsx`;
  const payload = JSON.stringify(buildSnapshotPayload(report, alignment));
  const resp = await fetch('/api/export-excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });

  if (resp.ok) {
    downloadBlob(await resp.blob(), filename);
    return;
  }
  if (resp.status !== 404 && resp.status !== 405) {
    // A real server-side failure is surfaced, not silently degraded.
    const detail = await resp.json().catch(() => null);
    throw new Error(
      `Excel export failed (HTTP ${resp.status})${detail?.error ? `: ${detail.error}` : ''}`
    );
  }
  downloadBlob(await buildClientHydrologyWorkbook(report, alignment), filename);
}

/**
 * Client-side mirror of the server workbook generator: the three-sheet layout
 * without the embedded map snapshot (that is rendered on the server only).
 */
async function buildClientHydrologyWorkbook(
  report: HydrologyReport,
  alignment?: CorridorAlignment | null
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
  summary.columns = [{ width: 30 }, { width: 48 }];

  const headline: [string, string][] = [
    ['LATITUDE :', report.latitudeDMS],
    ['LONGITUDE :', report.longitudeDMS],
    ['CATCHMENT AREA (A):', `${report.catchmentAreaKm2} km²`],
    ['LENGTH OF STREAM (L):', `${report.lengthOfStreamKm} km`],
    ['LEVEL STREAM ORIGIN:', `${report.levelStreamOriginM} m MSL`],
    ['HIGHEST CONTOUR:', `${report.highestContourM} m MSL`],
  ];
  for (const [label, value] of headline) {
    summary.addRow([label, value]);
  }
  summary.addRow([]);
  summary.addRow(['ELEVATION DROP (Δh):', `${report.elevationDropM} m`]);
  summary.addRow(['ANALYSIS SCOPE:', report.scopeAppliedM ? `${report.scopeAppliedM} m` : 'Not recorded']);
  summary.addRow(['ELEVATION SOURCE:', report.elevationSource ?? 'Not recorded']);
  summary.addRow([
    'ORIGIN DATUM:',
    report.elevationOriginKind === 'survey' ? 'Uploaded survey sheet' : 'Sampled from DEM',
  ]);
  summary.addRow([
    'DEM COVERAGE:',
    report.demCoverage !== undefined ? `${(report.demCoverage * 100).toFixed(1)}%` : 'Not recorded',
  ]);
  summary.addRow([]);
  summary.addRow(['NOTE', 'Workbook generated in-browser (static deployment).']);

  const register = workbook.addWorksheet('Chainage_Register', { views: [{ showGridLines: true }] });
  register.columns = [
    { width: 16, header: 'Chainage' },
    { width: 24, header: 'Latitude (DMS)' },
    { width: 24, header: 'Longitude (DMS)' },
    { width: 16, header: 'Latitude (DD)' },
    { width: 16, header: 'Longitude (DD)' },
  ];
  register.getRow(1).font = { bold: true };
  const stations = buildSnapshotPayload(report, alignment ?? null).chainages as
    | { chainage: number; formatted: string; lat: number; lng: number }[]
    | undefined;
  if (stations && stations.length > 0) {
    for (const ch of stations) {
      register.addRow([
        ch.formatted ?? String(ch.chainage),
        decimalToDMS(ch.lat, true),
        decimalToDMS(ch.lng, false),
        Math.round(ch.lat * 1e7) / 1e7,
        Math.round(ch.lng * 1e7) / 1e7,
      ]);
    }
  } else {
    register.addRow(['No chainage stations were supplied with this request.']);
  }

  const boundary = workbook.addWorksheet('Catchment_Boundary', {
    views: [{ showGridLines: true }],
  });
  boundary.columns = [
    { width: 10, header: 'Vertex' },
    { width: 16, header: 'Latitude (DD)' },
    { width: 16, header: 'Longitude (DD)' },
    { width: 24, header: 'Latitude (DMS)' },
    { width: 24, header: 'Longitude (DMS)' },
  ];
  boundary.getRow(1).font = { bold: true };
  (report.catchmentPolygon ?? []).forEach(([lat, lng], idx) => {
    boundary.addRow([
      idx + 1,
      Math.round(lat * 1e7) / 1e7,
      Math.round(lng * 1e7) / 1e7,
      decimalToDMS(lat, true),
      decimalToDMS(lng, false),
    ]);
  });

  const out = await workbook.xlsx.writeBuffer();
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
