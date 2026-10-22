import { CorridorAlignment, HydrologyReport } from '../types/hydrology';

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
 */
export async function exportExcelReport(
  report: HydrologyReport,
  alignment?: CorridorAlignment | null
): Promise<void> {
  const filename = `Hydrology_Report_CH_${chainageTag(report.targetChainageFormatted)}.xlsx`;
  const resp = await fetch('/api/export-excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSnapshotPayload(report, alignment)),
  });

  if (!resp.ok) {
    throw new Error(`Excel export failed (HTTP ${resp.status})`);
  }
  downloadBlob(await resp.blob(), filename);
}
