# Tensora GIS — Catchment & Stream Delineation

A hydrological analysis tool for highway and railway corridors. It ingests a
corridor alignment (KML/KMZ) and/or a chainage sheet (CSV/XLSX), resolves the
latitude and longitude of **every** chainage, and delineates the upstream
catchment and stream draining to a chosen chainage using a global Digital
Elevation Model.

Outputs: Google Earth KML, an Excel workbook, and an interactive
satellite map.

---

## Running locally

**Prerequisites:** Node.js 20+

```bash
npm install
npm run dev          # http://localhost:3000
```

The dev server mounts Vite in middleware mode on the same Express app, so the
UI and the `/api/*` endpoints share one origin. No API keys are required.

```bash
npm run build        # production bundle into dist/
npm start            # serve the built bundle (NODE_ENV=production)
npm run lint         # typecheck only
```

---

## What it does

1. **Ingest** a corridor alignment (`.kml` / `.kmz`) and/or a chainage sheet
   (`.csv` / `.xlsx`). Column and coordinate formats are detected dynamically —
   nothing about a project is hardcoded.
2. **Linear referencing.** For every chainage, the exact latitude and longitude
   on the corridor is computed by projecting the station perpendicularly onto
   the alignment, and interpolated between stations for any chainage in
   between. Coordinates are reported in both DMS (`27°14'41.44"N`) and decimal
   degrees (`27.244844`).
3. **Hydrological delineation** at the chosen chainage:
   - Find the ground that **actually drains to** the chainage point. If no
     watercourse reaches it, no catchment is reported — the tool says so rather
     than drawing one.
   - Take the **head of the watercourse as the highest point within 1 km** of
     the crossing that drains to it. A culvert discharges from **one direction
     only**, so the catchment is that single drainage — not the whole grid.
   - Draw the channel as the **downhill D8 path the water actually takes**,
     from that highest point to the culvert, continuing the last few metres
     onto the chainage coordinate so it meets the placemark.
   - Measure the drop between the culvert invert and the headwater. If that
     drop is under **5 m**, widen the analysis scope (500 m → 1 km → 2 km) and
     re-run. Distance is not fixed: the head is wherever the highest ground is.
   - Report catchment area (km²), stream length (km), level stream origin
     (m MSL), and highest contour (m MSL) — where "highest contour" is the
     headwater level, the highest point the culvert must collect from.

### Why the corridor formation is modelled

A road or railway formation is a **raised, graded bench**. Ground on both sides
falls away from it, so the DEM cell under a chainage has essentially no
upstream drainage at all — raw flow routing cannot see the water. Tracing
upstream from that cell returns a spurious pocket of a few cells, a metre or
two of drop, and a stream that never touches the crossing.

The engine therefore treats the crossing as the structure it is:

- The formation is identified from the corridor geometry and **excluded from
  runoff generation** — it is paved ballast and sheds no water.
- It is **graded to drain towards the culvert**, exactly as a real formation is,
  which is what lets ground beside it reach the crossing. Grading only ever
  cuts the formation down; the natural ground outside is untouched.
- The **culvert invert** is the lowest natural ground just beyond the toe of
  the formation — the physical position of a culvert barrel. Using the crown of
  the embankment instead leaves the invert metres *above* the surrounding
  ground, so nothing can flow in.
- The **pour point** is the toe cell beside the formation with the largest real
  upstream catchment, so the water actually arrives rather than being assumed
  to.

Depressions are filled by priority-flood and flat areas are given an epsilon
gradient measured from the outlets. Both are standard hydrological
preprocessing: without the second, a metre-quantised DEM turns floodplain
catchments into invisible regions. Neither affects a single reported number —
every figure is read from the untouched natural DEM.
4. **Target a station** by typing a chainage, or by typing a latitude and
   longitude directly in decimal degrees or DMS.
5. **Export** a Google Earth KML, and an Excel workbook with three sheets:
   hydrology summary, the complete chainage register, and the catchment
   boundary vertices.

---

## Measurement integrity

This is the part worth reading before trusting a number.

**Elevations are never invented.** Terrain comes from real global DEMs
(Copernicus GLO-30 and SRTM 30 m, via Open-Meteo / OpenTopoData /
Open-Elevation). When a provider is unreachable, rate-limited, or has no data
for a location, the sample is recorded as unavailable.

- There is **no default or assumed baseline elevation**. If the DEM cannot be
  sampled, the run fails and reports why — it does not substitute a number.
- If DEM coverage of the analysis grid falls below 80%, the run is rejected as
  unreliable.
- Reported figures are exactly what was measured. The elevation drop is *not*
  rounded up to a 5 m minimum; if a site genuinely has less than 5 m of relief
  inside its catchment, that is what the report says, and the report flags it.

**Provenance is stated.** Every report, KML, and exported image names the
provider that actually answered, the DEM coverage of the analysis grid, the
cell size, the number of contributing cells, and whether the level stream
origin came from a survey sheet or from the DEM. Nothing claims to be
"Google Earth verified" — this is not Google Earth, and the imagery is Esri
World Imagery with the attribution the basemap provider requires.

**Scope is honoured.** The analysis grid is masked to the requested radius, so
a "500 m" scope really is confined to 500 m even though the raster around it is
square.

---

## Testing

```bash
npm test                    # 65 offline tests: geometry, scope rule, arrival, failure paths
npm run test:engine         # the above plus live DEM delineation at three sites (104 tests)
npm start &                 # then, against a running server:
npm run test:api            # 39 tests: snapshot, KML, Excel, input validation
npx tsx scripts/verify-crossing.ts   # the reported failure site, end to end
npm run test:all
```

`engine-selftest.ts` checks the delineation against analytically-known
synthetic terrain, including the reported failure reproduced in miniature: a
road on an embankment with higher ground on one side only, where naive D8 from
the crossing finds nothing. It asserts that stormwater **arrives at the
crossing**, that the drawn stream **terminates on the chainage coordinate**,
and that the drop reaches 5 m — in a plain-slope case and a DEM-plateau case.

It also asserts that the engine *refuses* to produce a catchment for an empty,
too-sparse, or perfectly flat DEM.

### A note on first-run time

A cold DEM needs to be downloaded for the region. The scope ladder only widens
when the terrain is too flat for the smaller scope, and DEM samples are cached
per region, so this is a one-time cost — but on genuinely flat ground the 2 km
attempt is the expensive one, taking a minute or two. The UI reports progress
and never blocks on a fabricated result.

---

## Project layout

```
server.ts                      Express app: /api/snapshot, /api/export-excel
src/
  types/hydrology.ts           Shared types
  utils/
    geoUtils.ts                Geodesy, DMS formatting, chainage resolution, polyline ops
    fileParsers.ts             KML/KMZ and CSV/XLSX parsing, chainage → coordinate resolution
    elevationService.ts        DEM sampling with provider fallbacks; never fabricates
    flowDelineation.ts         D8 flow routing, contributing area, boundary tracing
    delineationEngine.ts       The 500 m / 1,000 m / 2,000 m scope rule and report assembly
    exportUtils.ts             KML and Excel generation
  components/                  React UI
  server/                      Server-side canvas snapshot and Excel workbook builders
scripts/                       Self-tests
```

---

## Demo data

"Load Demo" inserts a short **synthetic** reference alignment so the app can be
exercised without a file. It is demo input only — it carries no hydrology
results. Every elevation and catchment figure still has to come from a real DEM
run.
