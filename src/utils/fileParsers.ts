import JSZip from 'jszip';
import { DOMParser as XMLDOMParser } from '@xmldom/xmldom';
import { ChainageRecord, CorridorAlignment } from '../types/hydrology';
import {
  decimalToDMS,
  haversineDistanceM,
  interpolateAlongPolyline,
  findPerpendicularPointOnPolyline,
  polylineLengthM,
  formatChainageNumber,
  formatRailwayStationLabel,
  calculateBearing,
  destinationPoint,
  parseCoordinateInput,
  isValidLat,
  isValidLng,
} from './geoUtils';
import { fetchBulkElevations } from './elevationService';

// Browser-safe working limits.  The source file may contain more detail, but
// drawing or projecting every vertex/annotation can otherwise exhaust a tab.
// These retain the complete corridor extent while keeping interactive GIS work
// responsive on ordinary machines.
const MAX_ANALYSIS_COORDINATES = 25_000;
const MAX_PROJECTED_PLACEMARKS = 10_000;
const MAX_GENERATED_STATIONS = 10_000;
const MAX_RENDER_TRACKS = 100;
const MAX_POINTS_PER_RENDER_TRACK = 1_000;

function downsampleEvenly<T>(items: T[], maxItems: number): T[] {
  if (items.length <= maxItems) return items;
  if (maxItems < 2) return [items[0]];

  const sampled: T[] = [];
  const lastIndex = items.length - 1;
  for (let i = 0; i < maxItems; i++) {
    sampled.push(items[Math.round((i * lastIndex) / (maxItems - 1))]);
  }
  return sampled;
}

/**
 * Extracts a chainage numeric value from any string format
 * Handles:
 * - "69+340.000", "69+340", "CH 69+340", "CH: 69+340"
 * - "69/340.000", "69/340", "CH 69/340", "69/4"
 * - "CH: 69340.000", "CH 69340", "CH-69340", "Chainage 69340", "KM 69.340"
 * - "Station 69340", "69340.000", "69340"
 */
export function extractChainageFromString(str: string | number): number | null {
  if (typeof str === 'number') {
    return isNaN(str) ? null : str;
  }
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();

  // Pattern 1: Chainage with plus sign: e.g. 69+340 or 69+340.000 or CH 69+340
  const plusMatch = s.match(/(?:ch|km|station|stn)?[:\s]*([0-9]+)\+([0-9]+(?:\.[0-9]+)?)/i);
  if (plusMatch) {
    const km = parseFloat(plusMatch[1]);
    const m = parseFloat(plusMatch[2]);
    if (!isNaN(km) && !isNaN(m)) {
      return km * 1000 + m;
    }
  }

  // Pattern 2: Chainage with slash: e.g. 69/340 or 69/340.000
  const slashMatch = s.match(/(?:ch|km|station|stn)?[:\s]*([0-9]+)\/([0-9]+(?:\.[0-9]+)?)/i);
  if (slashMatch) {
    const km = parseFloat(slashMatch[1]);
    const m = parseFloat(slashMatch[2]);
    if (!isNaN(km) && !isNaN(m)) {
      return km * 1000 + m;
    }
  }

  // Pattern 3: Explicit prefix: e.g. "CH: 69340.000", "Chainage 69340", "CH-69340"
  const prefixMatch = s.match(/(?:chainage|ch|station|stn)[:\s-]*([0-9]+(?:\.[0-9]+)?)/i);
  if (prefixMatch) {
    const val = parseFloat(prefixMatch[1]);
    if (!isNaN(val)) return val;
  }

  // Pattern 4: KM format: e.g. "KM 69.340" -> 69340m
  const kmMatch = s.match(/km[:\s]*([0-9]+(?:\.[0-9]+)?)/i);
  if (kmMatch) {
    const kmVal = parseFloat(kmMatch[1]);
    if (!isNaN(kmVal)) return kmVal * 1000;
  }

  // Pattern 5: Pure number or float: e.g. "69340.000" or "69340"
  const pureNumMatch = s.match(/^([0-9]+(?:\.[0-9]+)?)$/);
  if (pureNumMatch) {
    const val = parseFloat(pureNumMatch[1]);
    if (!isNaN(val)) return val;
  }

  // Pattern 6: Any number inside string with at least 2 digits
  const anyNumMatch = s.match(/([0-9]{2,}(?:\.[0-9]+)?)/);
  if (anyNumMatch) {
    const val = parseFloat(anyNumMatch[1]);
    if (!isNaN(val)) return val;
  }

  return null;
}

/**
 * Universal Coordinate Parser for KML/KMZ
 * Robust against spaces, newlines, tabs, scientific notation, and altitude tags.
 * In KML standard: longitude, latitude, [altitude]
 */
function parseKMLCoordinates(coordText: string): [number, number][] {
  const result: [number, number][] = [];
  if (!coordText) return result;

  // Split coordinate tuples by whitespace, commas, or newlines
  // A coordinate tuple is typically: lon,lat,alt or lon,lat
  const tupleRegex = /(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?:\s*,\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?))?/g;
  let match;

  while ((match = tupleRegex.exec(coordText)) !== null) {
    const val1 = parseFloat(match[1]);
    const val2 = parseFloat(match[2]);

    if (!isNaN(val1) && !isNaN(val2)) {
      let lng = val1;
      let lat = val2;

      // Autodetect if non-standard KML swapped lat,lng (lat must be between -90 and 90)
      if (Math.abs(val1) <= 90 && Math.abs(val2) > 90 && Math.abs(val2) <= 180) {
        lat = val1;
        lng = val2;
      }

      const last = result[result.length - 1];
      if (!last || Math.abs(last[0] - lat) > 1e-7 || Math.abs(last[1] - lng) > 1e-7) {
        result.push([lat, lng]);
      }
    }
  }

  // If no comma-separated coordinates found, parse whitespace-separated coordinates
  if (result.length === 0) {
    const parts = coordText.trim().split(/[\s,]+/).map(Number).filter((n) => !isNaN(n));
    if (parts.length >= 2) {
      const step = parts.length >= 3 && parts.length % 3 === 0 ? 3 : 2;
      for (let i = 0; i < parts.length - 1; i += step) {
        const val1 = parts[i];
        const val2 = parts[i + 1];
        let lng = val1;
        let lat = val2;
        if (Math.abs(val1) <= 90 && Math.abs(val2) > 90 && Math.abs(val2) <= 180) {
          lat = val1;
          lng = val2;
        }
        result.push([lat, lng]);
      }
    }
  }

  return result;
}

/**
 * Helper to find all XML elements matching a localName, ignoring XML namespace prefixes
 */
function findElementsByLocalName(root: any, localName: string): any[] {
  const elements: any[] = [];
  if (!root) return elements;
  const target = localName.toLowerCase();

  try {
    const all = root.getElementsByTagName ? root.getElementsByTagName('*') : [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const elLocal = (el.localName || el.nodeName.split(':').pop() || '').toLowerCase();
      if (elLocal === target) {
        elements.push(el);
      }
    }
  } catch {
    // Ignore DOM inspection issues
  }
  return elements;
}

/**
 * Cleans and sanitizes raw KML text before XML parsing
 * Handles UTF-8 BOM, non-printable control chars, unescaped ampersands, leading garbage
 */
function cleanAndSanitizeKML(rawText: string): string {
  if (!rawText) return '';
  let text = rawText.replace(/^\uFEFF/, '').trim();

  // Strip anything before <?xml or <kml
  // Some exporters use uppercase or namespace-prefixed tags.  KML element
  // names are case-sensitive once parsed, but finding the document envelope
  // should not make an otherwise readable upload fail.
  const xmlIdx = text.search(/<\?xml\b/i);
  const kmlMatch = /<(?:[\w.-]+:)?kml\b/i.exec(text);
  const kmlIdx = kmlMatch?.index ?? -1;
  if (xmlIdx !== -1 && (kmlIdx === -1 || xmlIdx < kmlIdx)) {
    text = text.slice(xmlIdx);
  } else if (kmlIdx !== -1) {
    text = text.slice(kmlIdx);
  }

  // Strip non-printable ASCII control characters (preserving \t, \n, \r)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  // Fix unescaped ampersands
  text = text.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');

  return text;
}

/**
 * Reads a File as KML string, handling both .kml and .kmz (compressed ZIP)
 * Checks magic bytes (PK..) and uncompresses all .kml documents found in archive.
 */
export async function readKmlOrKmzFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 4));
  // Magic bytes for ZIP file: 0x50, 0x4B (PK..)
  const isZip = (bytes[0] === 0x50 && bytes[1] === 0x4b) || file.name.toLowerCase().endsWith('.kmz');

  if (isZip) {
    const zip = await JSZip.loadAsync(buffer);
    const validEntries = Object.keys(zip.files).filter(
      (name) =>
        name.toLowerCase().endsWith('.kml') &&
        !zip.files[name].dir &&
        !name.startsWith('__MACOSX') &&
        !name.includes('/._') &&
        !name.startsWith('._')
    );

    if (validEntries.length === 0) {
      // Check if any non-hidden files contain XML tags
      const nonDirEntries = Object.keys(zip.files).filter(
        (name) => !zip.files[name].dir && !name.startsWith('__MACOSX') && !name.startsWith('.')
      );
      for (const entry of nonDirEntries) {
        try {
          const sample = await zip.files[entry].async('text');
          if (sample.includes('<kml') || sample.includes('<Document') || sample.includes('<Placemark')) {
            validEntries.push(entry);
          }
        } catch {
          // Ignore binary entry
        }
      }
    }

    if (validEntries.length === 0) {
      throw new Error('Invalid KMZ file: No .kml document found inside the archive.');
    }

    // A KMZ can contain several KML files (styles, overlays, NetworkLink
    // targets). Concatenating them creates invalid XML, causing the browser
    // parser to ignore an otherwise valid alignment. Prefer the KML which
    // actually contains geometry; use doc.kml only as a tie breaker.
    const documents = await Promise.all(
      validEntries.map(async (entry) => ({
        entry,
        content: await zip.files[entry].async('text'),
      }))
    );
    documents.sort((a, b) => {
      const score = (document: { entry: string; content: string }) => {
        const geometryCount = (document.content.match(/<(?:[\w.-]+:)?(?:coordinates|coord)\b/gi) || []).length;
        const placemarkCount = (document.content.match(/<(?:[\w.-]+:)?Placemark\b/gi) || []).length;
        const docBonus = /(^|\/)doc\.kml$/i.test(document.entry) ? 1 : 0;
        return geometryCount * 10000 + placemarkCount * 10 + docBonus;
      };
      return score(b) - score(a);
    });

    return documents[0].content;
  }

  // Plain text KML
  const decoder = new TextDecoder('utf-8', { fatal: false });
  return decoder.decode(buffer);
}

/**
 * Fallback Regex Parser for malformed, corrupt, or non-strict KML documents
 * Guarantees extraction of all LineStrings, Points, and Placemarks without failing
 */
function parseKMLWithRegexFallback(kmlText: string, filename: string): CorridorAlignment {
  const allTracks: [number, number][][] = [];
  const rawPlacemarksList: { name: string; description: string; point: [number, number]; rawText: string }[] = [];

  // Extract LineStrings
  const lineStringRegex = /<(?:[\w.-]+:)?LineString\b[\s\S]*?<(?:[\w.-]+:)?coordinates\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?coordinates\s*>[\s\S]*?<\/(?:[\w.-]+:)?LineString\s*>/gi;
  let lsMatch;
  while ((lsMatch = lineStringRegex.exec(kmlText)) !== null) {
    const coords = parseKMLCoordinates(lsMatch[1]);
    if (coords.length >= 2) {
      allTracks.push(coords);
    }
  }

  // If no LineString matched, try all coordinates blocks with >= 2 points
  if (allTracks.length === 0) {
    const coordRegex = /<(?:[\w.-]+:)?coordinates\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?coordinates\s*>/gi;
    let cMatch;
    while ((cMatch = coordRegex.exec(kmlText)) !== null) {
      const coords = parseKMLCoordinates(cMatch[1]);
      if (coords.length >= 2) {
        allTracks.push(coords);
      }
    }
  }

  // Extract Placemarks
  const placemarkRegex = /<(?:[\w.-]+:)?Placemark\b[\s\S]*?<\/(?:[\w.-]+:)?Placemark\s*>/gi;
  let pmMatch;
  while ((pmMatch = placemarkRegex.exec(kmlText)) !== null) {
    const pmBlock = pmMatch[0];
    const nameMatch = pmBlock.match(/<(?:[\w.-]+:)?name\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?name\s*>/i);
    const descMatch = pmBlock.match(/<(?:[\w.-]+:)?description\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?description\s*>/i);
    const name = nameMatch ? nameMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
    const description = descMatch ? descMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';

    const pointMatch = pmBlock.match(/<(?:[\w.-]+:)?Point\b[\s\S]*?<(?:[\w.-]+:)?coordinates\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?coordinates\s*>[\s\S]*?<\/(?:[\w.-]+:)?Point\s*>/i);
    if (pointMatch) {
      const pts = parseKMLCoordinates(pointMatch[1]);
      if (pts.length >= 1) {
        rawPlacemarksList.push({ name, description, point: pts[0], rawText: pmBlock });
      }
    }
  }

  const docNameMatch = kmlText.match(/<(?:[\w.-]+:)?name\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?name\s*>/i);
  const docName = docNameMatch ? docNameMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';

  return buildCorridorAlignment(allTracks, rawPlacemarksList, filename, docName);
}

/**
 * Builds CorridorAlignment from extracted tracks and placemarks
 */
function buildCorridorAlignment(
  allTracks: [number, number][][],
  rawPlacemarksList: { name: string; description: string; point: [number, number]; rawText: string }[],
  filename: string,
  docName: string
): CorridorAlignment {
  // Build the continuous primary centerline coordinatesList
  let coordinatesList: [number, number][] = [];
  if (allTracks.length === 1) {
    coordinatesList = [...allTracks[0]];
  } else if (allTracks.length > 1) {
    const sorted = [...allTracks].sort((a, b) => polylineLengthM(b) - polylineLengthM(a));
    coordinatesList = [...sorted[0]];
    const remaining = sorted.slice(1);

    while (remaining.length > 0) {
      const lastPoint = coordinatesList[coordinatesList.length - 1];
      const firstPoint = coordinatesList[0];
      let bestIdx = -1;
      let minGapM = Infinity;
      let appendToEnd = true;
      let shouldReverse = false;

      for (let j = 0; j < remaining.length; j++) {
        const seg = remaining[j];
        const gapEndStart = haversineDistanceM(lastPoint[0], lastPoint[1], seg[0][0], seg[0][1]);
        const gapEndEnd = haversineDistanceM(lastPoint[0], lastPoint[1], seg[seg.length - 1][0], seg[seg.length - 1][1]);
        const gapStartStart = haversineDistanceM(firstPoint[0], firstPoint[1], seg[0][0], seg[0][1]);
        const gapStartEnd = haversineDistanceM(firstPoint[0], firstPoint[1], seg[seg.length - 1][0], seg[seg.length - 1][1]);

        if (gapEndStart < minGapM) {
          minGapM = gapEndStart;
          bestIdx = j;
          appendToEnd = true;
          shouldReverse = false;
        }
        if (gapEndEnd < minGapM) {
          minGapM = gapEndEnd;
          bestIdx = j;
          appendToEnd = true;
          shouldReverse = true;
        }
        if (gapStartEnd < minGapM) {
          minGapM = gapStartEnd;
          bestIdx = j;
          appendToEnd = false;
          shouldReverse = false;
        }
        if (gapStartStart < minGapM) {
          minGapM = gapStartStart;
          bestIdx = j;
          appendToEnd = false;
          shouldReverse = true;
        }
      }

      if (bestIdx >= 0 && minGapM < 5000) {
        const nextSeg = remaining.splice(bestIdx, 1)[0];
        if (shouldReverse) nextSeg.reverse();
        if (appendToEnd) {
          coordinatesList.push(...nextSeg);
        } else {
          coordinatesList.unshift(...nextSeg);
        }
      } else {
        break;
      }
    }
  }

  // If no LineString was found in the KML but placemarks exist, construct the line from stations
  if (coordinatesList.length < 2 && rawPlacemarksList.length >= 2) {
    const withCh = rawPlacemarksList.filter((pm) => extractChainageFromString(pm.name) !== null);
    if (withCh.length >= 2) {
      withCh.sort((a, b) => (extractChainageFromString(a.name) ?? 0) - (extractChainageFromString(b.name) ?? 0));
      coordinatesList = withCh.map((pm) => pm.point);
    } else {
      coordinatesList = rawPlacemarksList.map((pm) => pm.point);
    }
    if (allTracks.length === 0) {
      allTracks.push(coordinatesList);
    }
  } else if (coordinatesList.length === 0 && rawPlacemarksList.length === 1) {
    coordinatesList = [rawPlacemarksList[0].point];
    if (allTracks.length === 0) {
      allTracks.push(coordinatesList);
    }
  }

  // Preserve the route's endpoints and distribution, but bound the geometry
  // used by expensive projection and map operations. This is essential for
  // CAD/Google Earth exports that contain millions of tiny segments.
  if (coordinatesList.length > MAX_ANALYSIS_COORDINATES) {
    coordinatesList = downsampleEvenly(coordinatesList, MAX_ANALYSIS_COORDINATES);
  }

  const totalLengthM = polylineLengthM(coordinatesList);

  // Station interval. Normal projects keep the required 100 m spacing; very
  // long corridors widen the interval (rounded to 100 m) rather than creating
  // hundreds of thousands of markers.
  const intervalM = Math.max(100, Math.ceil((totalLengthM / MAX_GENERATED_STATIONS) / 100) * 100);

  // Extract all placemarks that contain explicit chainage values
  const placemarksWithChainage: { pm: (typeof rawPlacemarksList)[0]; chainage: number }[] = [];
  for (const pm of rawPlacemarksList) {
    const ch =
      extractChainageFromString(pm.name) ??
      extractChainageFromString(pm.description) ??
      extractChainageFromString(pm.rawText);
    if (ch !== null) {
      placemarksWithChainage.push({ pm, chainage: ch });
    }
  }

  // Ensure polyline orientation matches increasing chainage direction
  if (coordinatesList.length >= 2 && placemarksWithChainage.length >= 2) {
    const sortedPms = [...placemarksWithChainage].sort((a, b) => a.chainage - b.chainage);
    const firstPm = sortedPms[0];
    const lastPm = sortedPms[sortedPms.length - 1];
    if (lastPm.chainage - firstPm.chainage >= 50) {
      const perpFirst = findPerpendicularPointOnPolyline(firstPm.pm.point[0], firstPm.pm.point[1], coordinatesList);
      const perpLast = findPerpendicularPointOnPolyline(lastPm.pm.point[0], lastPm.pm.point[1], coordinatesList);
      if (perpFirst.chainage > perpLast.chainage) {
        coordinatesList.reverse();
      }
    }
  }

  // Determine starting chainage datum for the railway corridor (strictly 100m aligned)
  let baseStartChainage: number | null = null;
  if (placemarksWithChainage.length > 0 && coordinatesList.length >= 2) {
    const sortedPms = [...placemarksWithChainage].sort((a, b) => a.chainage - b.chainage);
    const refPm = sortedPms[0];
    const perp = findPerpendicularPointOnPolyline(refPm.pm.point[0], refPm.pm.point[1], coordinatesList);
    const implied = refPm.chainage - perp.chainage;
    baseStartChainage = Math.round(implied / 100) * 100;
  }

  if (baseStartChainage === null) {
    const nameCh = extractChainageFromString(docName) ?? extractChainageFromString(filename);
    if (nameCh !== null) {
      baseStartChainage = Math.round(nameCh / 100) * 100;
    } else {
      baseStartChainage = 0;
    }
  }

  // Project each annotation once. Previously this projection was repeated for
  // every generated 100 m station. A dense Google Earth drawing can contain
  // thousands of annotation points and thousands of line vertices, turning a
  // single upload into billions of segment checks and freezing the browser.
  const placemarksForProjection = downsampleEvenly(rawPlacemarksList, MAX_PROJECTED_PLACEMARKS);
  const projectedPlacemarks = coordinatesList.length >= 2
    ? placemarksForProjection.map((pm) => ({
        pm,
        projection: findPerpendicularPointOnPolyline(pm.point[0], pm.point[1], coordinatesList),
      }))
    : [];

  // Index annotations by the SAME interval used for generated stations. The
  // bucket width must match the lookup width below, otherwise an annotation is
  // filed under one index and searched under another and is never found.
  // A point up to 45 m from a station can only be in the current or adjacent
  // interval, so only those buckets need checking.
  const placemarksByInterval = new Map<number, (typeof projectedPlacemarks)[number][]>();
  for (const projected of projectedPlacemarks) {
    const interval = Math.floor(projected.projection.chainage / intervalM);
    const bucket = placemarksByInterval.get(interval);
    if (bucket) bucket.push(projected);
    else placemarksByInterval.set(interval, [projected]);
  }

  // Generate STRICTLY UNIFORM Chainage Stations along the entire corridor
  const chainages: ChainageRecord[] = [];

  // KML/KMZ station annotations are authoritative. Do not replace values such
  // as "47378.350" with generated 100 m labels like "47+400". Generated
  // stations are only a fallback for line-only KML files.
  const explicitStations = projectedPlacemarks
    .map((projected) => ({
      ...projected,
      chainage: extractChainageFromString(projected.pm.name) ?? extractChainageFromString(projected.pm.description),
    }))
    .filter((station): station is (typeof projectedPlacemarks)[number] & { chainage: number } => station.chainage !== null)
    .sort((a, b) => a.projection.chainage - b.projection.chainage);

  if (explicitStations.length >= 2) {
    for (const station of explicitStations) {
      const { pm, chainage, projection } = station;
      const displayValue = pm.name.trim() || formatChainageNumber(chainage);
      const labelPoint = destinationPoint(
        projection.perpendicularPoint[0],
        projection.perpendicularPoint[1],
        20,
        (projection.segmentBearing + 90) % 360
      );
      const elevMatch = pm.rawText.match(/(?:elev|rl|msl|level)[:\s]*([0-9]+(?:\.[0-9]+)?)/i);
      const elevation = elevMatch ? parseFloat(elevMatch[1]) : undefined;

      chainages.push({
        id: `st-kml-${chainage}-${chainages.length}`,
        chainage,
        formatted: displayValue,
        lat: projection.perpendicularPoint[0],
        lng: projection.perpendicularPoint[1],
        dmsLat: decimalToDMS(projection.perpendicularPoint[0], true),
        dmsLng: decimalToDMS(projection.perpendicularPoint[1], false),
        decLat: projection.perpendicularPoint[0],
        decLng: projection.perpendicularPoint[1],
        labelLat: labelPoint[0],
        labelLng: labelPoint[1],
        elevation: Number.isFinite(elevation) ? elevation : undefined,
        elevationSource: Number.isFinite(elevation) ? 'survey' : 'none',
        distanceFromStartM: projection.chainage,
        bearing: projection.segmentBearing,
        is100mStation: false,
        isMajorKm: Math.abs(chainage % 1000) < 0.001,
        name: pm.name,
      });
    }
  } else if (coordinatesList.length >= 2 && totalLengthM >= 10) {
    const count = Math.max(1, Math.floor(totalLengthM / intervalM));
    for (let i = 0; i <= count; i++) {
      const dist = i * intervalM;
      const currentCh = baseStartChainage + dist;
      const { point, bearing } = interpolateAlongPolyline(coordinatesList, dist);
      const perpBearing = (bearing + 90) % 360;
      const labelPt = destinationPoint(point[0], point[1], 20, perpBearing);
      const isMajorKm = intervalM <= 1000 && Math.round(currentCh) % 1000 === 0;

      let elevation: number | undefined;
      let matchedName: string | undefined;

      const stationInterval = Math.floor(dist / intervalM);
      const nearbyPlacemarks = [
        ...(placemarksByInterval.get(stationInterval - 1) || []),
        ...(placemarksByInterval.get(stationInterval) || []),
        ...(placemarksByInterval.get(stationInterval + 1) || []),
      ];
      for (const projected of nearbyPlacemarks) {
        if (Math.abs(projected.projection.chainage - dist) <= 45) {
          matchedName = projected.pm.name;
          const elevMatch = projected.pm.rawText.match(/(?:elev|rl|msl|level)[:\s]*([0-9]+(?:\.[0-9]+)?)/i);
          if (elevMatch) {
            const e = parseFloat(elevMatch[1]);
            if (!isNaN(e)) elevation = e;
          }
          break;
        }
      }

      chainages.push({
        id: `st-${Math.round(currentCh)}`,
        chainage: currentCh,
        formatted: formatRailwayStationLabel(currentCh),
        lat: point[0],
        lng: point[1],
        dmsLat: decimalToDMS(point[0], true),
        dmsLng: decimalToDMS(point[1], false),
        decLat: point[0],
        decLng: point[1],
        labelLat: labelPt[0],
        labelLng: labelPt[1],
        elevation,
        elevationSource: elevation !== undefined ? 'survey' : 'none',
        distanceFromStartM: dist,
        bearing,
        is100mStation: true,
        isMajorKm,
        name: matchedName,
      });
    }
  } else if (coordinatesList.length >= 1) {
    // Single point or very short segment
    const pt = coordinatesList[0];
    chainages.push({
      id: `st-single-${baseStartChainage}`,
      chainage: baseStartChainage,
      formatted: formatRailwayStationLabel(baseStartChainage),
      lat: pt[0],
      lng: pt[1],
      dmsLat: decimalToDMS(pt[0], true),
      dmsLng: decimalToDMS(pt[1], false),
      decLat: pt[0],
      decLng: pt[1],
      elevationSource: 'none',
      distanceFromStartM: 0,
      is100mStation: true,
      isMajorKm: true,
    });
  }

  const startChainage = chainages.length > 0 ? chainages[0].chainage : 0;
  const endChainage = chainages.length > 0 ? chainages[chainages.length - 1].chainage : totalLengthM;

  // allTracks is display-only. Cap both layers and vertices so a dense KMZ
  // cannot create thousands of Leaflet paths and freeze the map after parsing.
  const renderTracks = allTracks.length > MAX_RENDER_TRACKS
    ? [coordinatesList]
    : allTracks.map((track) => downsampleEvenly(track, MAX_POINTS_PER_RENDER_TRACK));

  return {
    name: docName || filename.replace(/\.[^/.]+$/, ''),
    filename,
    coordinates: coordinatesList,
    allTracks: renderTracks.length > 0 ? renderTracks : [coordinatesList],
    totalLengthM,
    startChainage,
    endChainage,
    chainages,
  };
}

/**
 * Normal, Standard KML Parser for Railway Engineering & GIS
 * - Preserves ALL tracks and lines found in KML (LineString, MultiGeometry, Tracks)
 * - Preserves ALL placemarks (culverts, bridges, stations, chainage ticks)
 * - Has automatic sanitization and regex fallback for malformed KML/KMZ files
 */
export function parseKMLString(rawKmlText: string, filename = 'Alignment.kml'): CorridorAlignment {
  const kmlText = cleanAndSanitizeKML(rawKmlText);
  let xmlDoc: any = null;
  let useFallback = false;

  try {
    const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : new XMLDOMParser();
    xmlDoc = parser.parseFromString(kmlText, 'text/xml');
    const parseErrors = findElementsByLocalName(xmlDoc, 'parsererror');
    if (parseErrors.length > 0) {
      useFallback = true;
    }
  } catch {
    useFallback = true;
  }

  if (useFallback || !xmlDoc) {
    return parseKMLWithRegexFallback(kmlText, filename);
  }

  // 1. Extract ALL LineStrings from everywhere (including MultiGeometry, Placemarks, Folders)
  const lineStringElements = findElementsByLocalName(xmlDoc, 'LineString');
  const allTracks: [number, number][][] = [];

  for (let i = 0; i < lineStringElements.length; i++) {
    const coordsNodes = findElementsByLocalName(lineStringElements[i], 'coordinates');
    if (coordsNodes.length > 0 && coordsNodes[0].textContent) {
      const coords = parseKMLCoordinates(coordsNodes[0].textContent);
      if (coords.length >= 2) {
        allTracks.push(coords);
      }
    }
  }

  // Also check LinearRing (polygons / loops)
  const linearRingElements = findElementsByLocalName(xmlDoc, 'LinearRing');
  for (let i = 0; i < linearRingElements.length; i++) {
    const coordsNodes = findElementsByLocalName(linearRingElements[i], 'coordinates');
    if (coordsNodes.length > 0 && coordsNodes[0].textContent) {
      const coords = parseKMLCoordinates(coordsNodes[0].textContent);
      if (coords.length >= 2) {
        allTracks.push(coords);
      }
    }
  }

  // Also check for Google Earth gx:Track coordinates
  const trackElements = findElementsByLocalName(xmlDoc, 'track');
  for (let i = 0; i < trackElements.length; i++) {
    const coordNodes = findElementsByLocalName(trackElements[i], 'coord');
    const trackCoords: [number, number][] = [];
    for (let j = 0; j < coordNodes.length; j++) {
      const text = coordNodes[j].textContent || '';
      const parts = text.trim().split(/\s+/).map(Number);
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        trackCoords.push([parts[1], parts[0]]); // [lat, lng]
      }
    }
    if (trackCoords.length >= 2) {
      allTracks.push(trackCoords);
    }
  }

  // 2. Extract Placemarks (Chainages, Culverts, Bridges, Stations)
  const placemarkElements = findElementsByLocalName(xmlDoc, 'Placemark');
  const rawPlacemarksList: { name: string; description: string; point: [number, number]; rawText: string }[] = [];

  for (let i = 0; i < placemarkElements.length; i++) {
    const pm = placemarkElements[i];
    const nameNodes = findElementsByLocalName(pm, 'name');
    const descNodes = findElementsByLocalName(pm, 'description');
    const name = nameNodes[0]?.textContent?.trim() || '';
    const description = descNodes[0]?.textContent?.trim() || '';

    let extendedText = '';
    const simpleDataNodes = findElementsByLocalName(pm, 'SimpleData');
    simpleDataNodes.forEach((sd) => {
      extendedText += ' ' + (sd.getAttribute('name') || '') + ':' + (sd.textContent || '');
    });
    const dataNodes = findElementsByLocalName(pm, 'Data');
    dataNodes.forEach((d) => {
      extendedText += ' ' + (d.getAttribute('name') || '') + ':' + (d.textContent || '');
    });

    const rawText = (pm.textContent || '') + ' ' + extendedText;

    const pointNodes = findElementsByLocalName(pm, 'Point');
    if (pointNodes.length > 0) {
      const coordNodes = findElementsByLocalName(pointNodes[0], 'coordinates');
      if (coordNodes.length > 0 && coordNodes[0].textContent) {
        const pts = parseKMLCoordinates(coordNodes[0].textContent);
        if (pts.length >= 1) {
          rawPlacemarksList.push({ name, description, point: pts[0], rawText });
        }
      }
    }
  }

  // If DOM parsing yielded zero features, fallback to regex parser
  if (allTracks.length === 0 && rawPlacemarksList.length === 0) {
    return parseKMLWithRegexFallback(kmlText, filename);
  }

  const docNameNode = findElementsByLocalName(xmlDoc, 'name')[0];
  const docName = docNameNode?.textContent || '';

  return buildCorridorAlignment(allTracks, rawPlacemarksList, filename, docName);
}

/**
 * Universal CSV / XLSX Chainage Data Parser
 * - Multi-sheet inspection
 * - Dynamic header row detection (skips metadata/empty top rows)
 * - DMS coordinate decoding
 * - Snaps all coordinates onto the main line if alignment polyline is provided
 * - Fully loads ALL rows without skipping
 */
export async function parseChainageFile(
  fileData: ArrayBuffer | string,
  existingAlignment?: CorridorAlignment
): Promise<ChainageRecord[]> {
  let rawRows: any[][] = [];

  if (typeof fileData === 'string') {
    const lines = fileData.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const delimiter = lines[0]?.includes('\t')
      ? '\t'
      : lines[0]?.includes(';')
      ? ';'
      : lines[0]?.includes('|')
      ? '|'
      : ',';
    rawRows = lines.map((l) => l.split(delimiter).map((c) => c.replace(/^["']|["']$/g, '').trim()));
  } else {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileData);

    // Scan all sheets to find the one with chainage data.
    let bestSheetRows: any[][] = [];
    let maxMatchScore = -1;

    for (const worksheet of workbook.worksheets) {
      const sheetData: any[][] = [];
      const columnCount = worksheet.columnCount;
      worksheet.eachRow({ includeEmpty: true }, (row) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        const cells: any[] = new Array(Math.max(columnCount, values.length)).fill('');
        values.forEach((value, i) => {
          cells[i] = value && typeof value === 'object' && 'text' in value ? value.text : value ?? '';
        });
        sheetData.push(cells);
      });

      // Count chainage-related keyword matches in sheet
      let matchScore = 0;
      sheetData.slice(0, 15).forEach((row) => {
        if (!Array.isArray(row)) return;
        row.forEach((cell) => {
          const str = String(cell).toLowerCase();
          if (/chainage|ch\b|station|stn|northing|easting|latitude|longitude|lat\b|lon\b/i.test(str)) {
            matchScore += 10;
          }
        });
      });

      if (matchScore > maxMatchScore) {
        maxMatchScore = matchScore;
        bestSheetRows = sheetData;
      }
    }

    rawRows = bestSheetRows;
  }

  if (rawRows.length === 0) return [];

  // Step 1: Detect header row (scan first 20 rows)
  let headerRowIdx = -1;
  let chainageColIdx = -1;
  let latColIdx = -1;
  let lngColIdx = -1;
  let elevColIdx = -1;

  for (let r = 0; r < Math.min(20, rawRows.length); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c]).trim().toLowerCase();
      if (chainageColIdx === -1 && /^(chainage|ch|station|stn|km|distance|m)$/i.test(cell)) {
        chainageColIdx = c;
      } else if (chainageColIdx === -1 && /chainage|ch\b|station/i.test(cell)) {
        chainageColIdx = c;
      }

      if (latColIdx === -1 && /^(lat|latitude|northing|y)$/i.test(cell)) {
        latColIdx = c;
      } else if (latColIdx === -1 && /lat|latitude|northing/i.test(cell)) {
        latColIdx = c;
      }

      if (lngColIdx === -1 && /^(lon|lng|long|longitude|easting|x)$/i.test(cell)) {
        lngColIdx = c;
      } else if (lngColIdx === -1 && /lon|lng|long|easting/i.test(cell)) {
        lngColIdx = c;
      }

      if (elevColIdx === -1 && /^(elev|elevation|level|rl|alt|altitude|z)$/i.test(cell)) {
        elevColIdx = c;
      } else if (elevColIdx === -1 && /elev|rl|altitude/i.test(cell)) {
        elevColIdx = c;
      }
    }

    if (chainageColIdx !== -1 || (latColIdx !== -1 && lngColIdx !== -1)) {
      headerRowIdx = r;
      break;
    }
  }

  // Fallback: if no header found, assume col 0 is chainage, col 1 lat, col 2 lng
  if (chainageColIdx === -1 && latColIdx === -1) {
    chainageColIdx = 0;
    if (rawRows[0] && rawRows[0].length >= 3) {
      latColIdx = 1;
      lngColIdx = 2;
    }
  }

  const records: ChainageRecord[] = [];

  // Reconcile the sheet's chainage frame with the loaded corridor's frame.
  // Sheets frequently carry true railway chainages (e.g. 209,xxx m) while a
  // KML-only corridor defaults to a 0-based frame. Resolving without the
  // sheet's own frame would clamp every station onto one fixed endpoint --
  // the classic "all stations share one coordinate" bug.
  let frameOverride: { startChainage: number; endChainage: number } | undefined;
  if (existingAlignment && existingAlignment.coordinates.length >= 2 && chainageColIdx !== -1) {
    let sheetMin = Infinity;
    let sheetMax = -Infinity;
    for (const row of rawRows) {
      if (!Array.isArray(row) || chainageColIdx >= row.length) continue;
      const v = extractChainageFromString(row[chainageColIdx]);
      if (v !== null) {
        if (v < sheetMin) sheetMin = v;
        if (v > sheetMax) sheetMax = v;
      }
    }
    if (Number.isFinite(sheetMin) && Number.isFinite(sheetMax) && sheetMax > sheetMin) {
      if (sheetMin < existingAlignment.startChainage - 1 || sheetMax > existingAlignment.endChainage + 1) {
        frameOverride = { startChainage: sheetMin, endChainage: sheetMax };
      }
    }
  }

  // Headerless sheets (such as a single column of chainage numbers) start at
  // row zero. This prevents the first requested chainage from being lost.
  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

  for (let i = startRow; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row) || row.length === 0 || row.every((c) => c === '' || c === undefined)) continue;

    let chVal: number | null = null;
    if (chainageColIdx !== -1 && row[chainageColIdx] !== undefined) {
      chVal = extractChainageFromString(row[chainageColIdx]);
    }

    // Try finding chainage in any cell if missing
    if (chVal === null) {
      for (let c = 0; c < row.length; c++) {
        if (c !== latColIdx && c !== lngColIdx && c !== elevColIdx) {
          const val = extractChainageFromString(row[c]);
          if (val !== null) {
            chVal = val;
            break;
          }
        }
      }
    }

    let lat: number | null = null;
    let lng: number | null = null;

    if (latColIdx !== -1 && row[latColIdx] !== undefined) {
      lat = parseCoordinateInput(String(row[latColIdx]));
    }
    if (lngColIdx !== -1 && row[lngColIdx] !== undefined) {
      lng = parseCoordinateInput(String(row[lngColIdx]));
    }

    let elevation: number | undefined;
    if (elevColIdx !== -1 && row[elevColIdx] !== undefined) {
      const e = parseFloat(String(row[elevColIdx]));
      if (!isNaN(e)) elevation = e;
    }

    // A row with coordinates but no chainage can be chainaged for real by
    // projecting it onto the corridor alignment. With no corridor loaded there
    // is no way to know where chainage zero lies, so the row is skipped rather
    // than assigned an invented station number.
    if (chVal === null && lat !== null && lng !== null) {
      if (existingAlignment && existingAlignment.coordinates.length >= 2) {
        const projected = findPerpendicularPointOnPolyline(
          lat,
          lng,
          existingAlignment.coordinates,
          existingAlignment.startChainage
        );
        chVal = projected.chainage;
      } else {
        continue;
      }
    }

    if (chVal === null) continue;

    // Snap perpendicularly onto main line if alignment exists
    if (existingAlignment && existingAlignment.coordinates.length >= 2) {
      if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
        const perp = findPerpendicularPointOnPolyline(lat, lng, existingAlignment.coordinates);
        lat = perp.perpendicularPoint[0];
        lng = perp.perpendicularPoint[1];
      } else {
        // Chainage-only row: resolve via station-bracketing along the line,
        // reconciled to the sheet's own chainage frame when necessary
        const resolved = resolveCoordinateForTargetChainage(chVal, existingAlignment, frameOverride);
        lat = resolved.lat;
        lng = resolved.lng;
      }
    }

    if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
      records.push({
        id: `row-${i}-${chVal}`,
        chainage: chVal,
        formatted: formatChainageNumber(chVal),
        lat,
        lng,
        dmsLat: decimalToDMS(lat, true),
        dmsLng: decimalToDMS(lng, false),
        decLat: lat,
        decLng: lng,
        elevation,
        elevationSource: elevation !== undefined ? 'survey' : 'none',
        distanceFromStartM: 0,
      });
    } else {
      // Chainage-only sheet (e.g. a single column of chainage numbers).
      // Coordinates are resolved later along the loaded corridor alignment,
      // so the record is preserved instead of being dropped.
      records.push({
        id: `row-${i}-${chVal}`,
        chainage: chVal,
        formatted: formatChainageNumber(chVal),
        lat: 0,
        lng: 0,
        dmsLat: '',
        dmsLng: '',
        elevation,
        elevationSource: elevation !== undefined ? 'survey' : 'none',
        distanceFromStartM: 0,
        chainageOnly: true,
      });
    }
  }

  records.sort((a, b) => a.chainage - b.chainage);

  if (records.length > 0) {
    const baseCh = records[0].chainage;
    records.forEach((r) => {
      r.distanceFromStartM = r.chainage - baseCh;
    });
  }

  return records;
}

/**
 * Resolves the EXACT coordinate on the main corridor line for any target chainage
 */
export function resolveCoordinateForTargetChainage(
  targetChainage: number,
  alignment: CorridorAlignment,
  frameOverride?: { startChainage: number; endChainage: number }
): { lat: number; lng: number; bearing: number; exactMatch: boolean } {
  const chainages = alignment.chainages;

  /**
   * Tangent bearing of the corridor at an arbitrary point, derived from the
   * nearest station on either side. Falls back to the drawn geometry, and
   * finally to due north, rather than to any project's alignment bearing.
   */
  const bearingAt = (lat: number, lng: number): number => {
    if (chainages.length >= 2) {
      const sorted = [...chainages].sort((a, b) => a.chainage - b.chainage);
      let lo = sorted[0];
      let hi = sorted[sorted.length - 1];
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].chainage <= targetChainage && sorted[i + 1].chainage >= targetChainage) {
          lo = sorted[i];
          hi = sorted[i + 1];
          break;
        }
      }
      if (lo !== hi && (hi.lat !== lo.lat || hi.lng !== lo.lng)) {
        return calculateBearing(lo.lat, lo.lng, hi.lat, hi.lng);
      }
    }
    const coords = alignment.coordinates;
    if (coords.length >= 2) {
      const projection = findPerpendicularPointOnPolyline(lat, lng, coords);
      const nearest = nearestPolylineVertex(coords, projection.perpendicularPoint);
      const next = nearest ? coords[Math.min(coords.length - 1, nearest.index + 1)] : undefined;
      const prev = nearest ? coords[Math.max(0, nearest.index - 1)] : undefined;
      const partner = next ?? prev;
      if (partner) {
        return calculateBearing(projection.perpendicularPoint[0], projection.perpendicularPoint[1], partner[0], partner[1]);
      }
    }
    return 0;
  };

  // Check for exact matching chainage
  const exact = chainages.find((c) => Math.abs(c.chainage - targetChainage) < 0.1);
  if (exact) {
    const bearing = exact.bearing ?? bearingAt(exact.lat, exact.lng);
    return { lat: exact.lat, lng: exact.lng, bearing, exactMatch: true };
  }

  if (alignment.coordinates.length >= 2) {
    const totalDistM = alignment.totalLengthM;
    const coords = alignment.coordinates;

    // HUMAN-STYLE CHAINAGE RESOLUTION (station bracketing):
    // Locate the two surrounding chainage stations, project each onto the
    // actual polyline, then linearly walk the line between those two true
    // positions to hit the exact requested chainage. This resolves EVERY
    // metre across multi-thousand-km corridors, stays correct when station
    // chainages are compressed/stretched relative to the drawn geometry, and
    // only degrades to the proportional fallback when station data cannot
    // bracket the target at all.
    const distinctStations: ChainageRecord[] = [];
    const sortedStations = [...chainages].sort((a, b) => a.chainage - b.chainage);
    for (const st of sortedStations) {
      if (
        distinctStations.length === 0 ||
        st.chainage - distinctStations[distinctStations.length - 1].chainage > 1e-9
      ) {
        distinctStations.push(st);
      }
    }

    if (distinctStations.length >= 2) {
      const n = distinctStations.length;
      let loIdx = 0;
      let hiIdx = 1;
      if (targetChainage >= distinctStations[n - 1].chainage) {
        loIdx = n - 2;
        hiIdx = n - 1;
      } else if (targetChainage > distinctStations[0].chainage) {
        for (let k = 0; k < n - 1; k++) {
          if (distinctStations[k].chainage <= targetChainage && distinctStations[k + 1].chainage > targetChainage) {
            loIdx = k;
            hiIdx = k + 1;
            break;
          }
        }
      }

      const stLo = distinctStations[loIdx];
      const stHi = distinctStations[hiIdx];
      const projLo = findPerpendicularPointOnPolyline(stLo.lat, stLo.lng, coords);
      const projHi = findPerpendicularPointOnPolyline(stHi.lat, stHi.lng, coords);

      const chainSpanM = stHi.chainage - stLo.chainage;
      const alongSpanM = projHi.chainage - projLo.chainage;

      // Only slide along the line when both stations genuinely project to
      // distinct locations; otherwise a collapsed projection would snap the
      // target onto a single fixed point.
      if (alongSpanM > 1e-6 || alongSpanM < -1e-6) {
        const frac = (targetChainage - stLo.chainage) / chainSpanM;
        const alongDist = projLo.chainage + frac * alongSpanM;
        const clampedDist = Math.max(0, Math.min(totalDistM, alongDist));
        const { point, bearing } = interpolateAlongPolyline(coords, clampedDist);
        return { lat: point[0], lng: point[1], bearing, exactMatch: false };
      }
    }

    // Proportional fallback (no usable station bracketing).
    // The fallthrough frame normally is the corridor's own chainage frame,
    // but callers may reconcile an uploaded sheet's frame when the sheet
    // uses a different chainage origin (e.g. true railway chainages such as
    // 209,xxx m against a corridor whose drawn geometry starts at frame 0).
    // Without that override every out-of-frame target would clamp to the
    // same end of the polyline.
    const frame = frameOverride ?? {
      startChainage: alignment.startChainage,
      endChainage: alignment.endChainage,
    };
    const span = Math.max(1, frame.endChainage - frame.startChainage);
    const offsetM = ((targetChainage - frame.startChainage) / span) * totalDistM;

    const clampedDist = Math.max(0, Math.min(totalDistM, offsetM));
    const { point, bearing } = interpolateAlongPolyline(coords, clampedDist);

    return { lat: point[0], lng: point[1], bearing, exactMatch: false };
  }

  // Fallback: walk the station list rather than the drawn geometry.
  if (chainages.length >= 2) {
    const sorted = [...chainages].sort((a, b) => a.chainage - b.chainage);
    const c0 = targetChainage <= sorted[0].chainage ? sorted[0] : sorted[sorted.length - 1];
    const c1 = targetChainage <= sorted[0].chainage ? sorted[1] : sorted[sorted.length - 2];
    return {
      lat: c0.lat,
      lng: c0.lng,
      bearing: calculateBearing(c0.lat, c0.lng, c1.lat, c1.lng),
      exactMatch: false,
    };
  }

  // Last resort: the single point we do have. Its bearing is undefined rather
  // than borrowed from another project's alignment.
  const fallbackPoint: [number, number] | null =
    alignment.coordinates.length > 0
      ? alignment.coordinates[0]
      : chainages.length > 0
        ? [chainages[0].lat, chainages[0].lng]
        : null;

  if (fallbackPoint) {
    return { lat: fallbackPoint[0], lng: fallbackPoint[1], bearing: 0, exactMatch: false };
  }

  throw new Error('The corridor has no geometry to resolve a chainage against.');
}

/** Index of the polyline vertex closest to a point (used for local tangents). */
function nearestPolylineVertex(
  coords: [number, number][],
  point: [number, number]
): { index: number; distanceM: number } | null {
  let best: { index: number; distanceM: number } | null = null;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineDistanceM(point[0], point[1], coords[i][0], coords[i][1]);
    if (!best || d < best.distanceM) best = { index: i, distanceM: d };
  }
  return best;
}

/**
 * Fills in elevations for stations that arrived without one, by sampling the
 * global DEM. Stations whose source file already carried a reduced level are
 * left untouched, so survey data always wins.
 *
 * Stations the DEM cannot resolve are left without an elevation and flagged as
 * such - they are never given an assumed value.
 */
export async function enrichChainagesWithElevation(
  records: ChainageRecord[]
): Promise<ChainageRecord[]> {
  const needing = records.filter((r) => r.elevation === undefined && isValidLat(r.lat) && isValidLng(r.lng));
  if (needing.length === 0) return records;

  const elevations = await fetchBulkElevations(needing.map((r) => ({ lat: r.lat, lng: r.lng })));

  const resolvedById = new Map<string, number>();
  needing.forEach((rec, i) => {
    const v = elevations.elevations[i];
    if (v !== null && isFinite(v)) resolvedById.set(rec.id, Math.round(v * 10) / 10);
  });

  return records.map((r) => {
    const sampled = resolvedById.get(r.id);
    if (sampled === undefined) return r;
    return { ...r, elevation: sampled, elevationSource: 'dem' };
  });
}
