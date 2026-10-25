# Tensora GIS

> **Next-Generation Civil Infrastructure, Hydrology & Multi-Network Hydraulic Modelling Platform**

Tensora GIS is an engineering-grade geospatial modeling and simulation suite designed for highway, railway, and municipal infrastructure projects. Built with TypeScript and React, Tensora GIS unifies three core engineering disciplines into a cohesive, high-performance web platform powered by real global Digital Elevation Models (DEMs):

1. **Stormwater Catchment & Stream Delineation** - Real Earth D8 flow accumulation, formation modeling, and 70%-framed delineation reports.
2. **Water Distribution Modelling & Transient Surge** - EPANET-standard Global Gradient Algorithm (GGA), Extended Period Simulation (EPS), Fire Flow analysis, Darwin automated pipe optimization, and Joukowsky/Allievi Water Hammer physics.
3. **Wastewater Collection & Sewer Hydraulics** - EPA SWMM 5.2 engine, circular partial-flow Manning hydraulics, tractive force self-cleansing checks, drop structures, lift station pumping cycles, Pomeroy-Parkhurst $\text{H}_2\text{S}$ corrosion, and I&I analysis.

---

## Table of Contents

- [Key Engineering Capabilities](#key-engineering-capabilities)
  - [1. Stormwater Catchment & Stream Delineation](#1-stormwater-catchment--stream-delineation)
  - [2. Water Distribution & Transient Surge Modelling](#2-water-distribution--transient-surge-modelling)
  - [3. Wastewater Collection & SWMM Sewer Hydraulics](#3-wastewater-collection--swmm-sewer-hydraulics)
- [Terrain & DEM Elevation Engine](#terrain--dem-elevation-engine)
- [System Architecture](#system-architecture)
- [Project Layout](#project-layout)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Production Build](#production-build)
- [Verification & Automated Self-Tests](#verification--automated-self-tests)
- [Deployment & Containerization](#deployment--containerization)
  - [Docker](#docker)
  - [Static Hosting (GitHub Pages)](#static-hosting-github-pages)
- [Engineering Standards & Data Integrity](#engineering-standards--data-integrity)

---

## Key Engineering Capabilities

### 1. Stormwater Catchment & Stream Delineation

Designed specifically for road and railway corridor culvert design where traditional raw DEM analysis fails due to the elevated embankment:

- **Corridor Ingestion & Linear Referencing**: Ingests alignment vectors (`.kml` / `.kmz`) and survey chainage registers (`.csv` / `.xlsx`). Interactively projects any station perpendicularly onto the 3D alignment, reporting coordinates in both Decimal Degrees and Degrees-Minutes-Seconds (DMS).
- **Physical Formation Modeling**: Models the embankment cross-section ($12\text{ m}$ formation half-width) and cuts the formation to simulate culvert invert placement at the true toe of slope, preventing artificial upstream pooling or false catchment truncation.
- **Priority-Flood D8 Routing**: Resolves hydrological flow directions, accumulates upstream drainage areas, and extracts the primary channel draining directly into the target crossing.
- **Dynamic Scope Expansion**: Automatically evaluates relief drop ($\Delta h$). If drop is under $5\text{ m}$, the analysis radius systematically scales ($500\text{ m} \to 1{,}000\text{ m} \to 2{,}000\text{ m}$) to locate the true hydrologic divide.
- **70%-Framed Catchment Snapshot**: Automatic North-up canvas rendering that frames the delineated catchment boundary and stream to cover 70% of the viewport width and height.
- **Standardized Excel Export**: Generates a clean, single-sheet calculation summary workbook embedding the high-resolution delineation snapshot, target chainage coordinates, catchment area ($A$), stream length ($L$), stream origin elevation, and highest ridge contour.

### 2. Water Distribution & Transient Surge Modelling

Comprehensive pressurized pipeline network analysis based on the EPANET Global Gradient Algorithm (GGA) coupled with Bentley HAMMER-grade transient water hammer physics:

- **Network Elements**: Interactive placement and editing of Junctions, Pipes, Variable-Speed Booster Pumps, Storage Tanks, Open Reservoirs, and Control Valves (PRV, PSV, PBV, FCV, TCV, GPV).
- **Steady-State Hydraulics**: Solves the non-linear Hazen-Williams and Darcy-Weisbach headloss equations via sparse matrix numerical iteration to exact flow and head balance convergence.
- **Extended Period Simulation (EPS)**: 24-hour diurnal demand patterns with custom hourly multipliers, tracking dynamic tank water level fluctuations, system head variations, and pump duty cycles.
- **Fire Flow Analysis**: Evaluates available fire-fighting flow capacities across all junctions subject to a mandatory residual pressure constraint (default $\ge 14\text{ m} / 20\text{ psi}$).
- **Water Quality & Chlorine Decay**: Computes nodal water age (hours) and first-order disinfectant residual decay kinetics ($C(t) = C_0 \cdot e^{-k \cdot t}$).
- **Automated Pipe Sizing Optimization**: Darwin-style genetic constraint optimization evaluating pipe velocity ($0.6 - 2.5\text{ m/s}$) and unit friction loss ($< 10\text{ m/km}$), recommending standardized nominal diameters ($100 - 600\text{ mm}$) with capital expenditure estimates.
- **Transient Surge & Water Hammer Physics**:
  - Joukowsky instantaneous surge formulation: $\Delta H = \frac{a \cdot \Delta V}{g}$ for rapid pump trip ($t \le \frac{2L}{a}$).
  - Allievi slow-closure equation: $\Delta H = \frac{2 L V_0}{g \cdot T_c}$ for controlled closure ($t > \frac{2L}{a}$).
  - Material-specific acoustic wave speeds ($a$): DI ($1{,}050\text{ m/s}$), Steel ($1{,}150\text{ m/s}$), PVC ($400\text{ m/s}$), HDPE ($320\text{ m/s}$), Concrete ($950\text{ m/s}$).
  - Identifies pipes at risk of overpressure rupture vs. nominal pressure ratings ($\text{PN}$).
  - Identifies vacuum cavitation risk ($\text{HGL} \le -5\text{ m}$) and sizes hydro-pneumatic air vessels ($\text{m}^3$) and vacuum relief air valves.
- **EPANET Two-Way Interoperability**: Full `.INP` export and import round-trips.
- **11-Worksheet Calculation Workbook**: Engineering export detailing Executive Summary, Junction Calculations, Pipe Hydraulics, Energy & Pumping, Control Valves, Sources & Storage, 24-Hr EPS, Fire Flow Register, Water Quality, Pipe Optimization, and Transient Surge Analysis.

### 3. Wastewater Collection & SWMM Sewer Hydraulics

Full dynamic sanitary and storm sewer modeling running on the EPA SWMM 5.2 computational engine with Bentley SewerGEMS-grade capabilities:

- **Collection Network Topology**: Manholes, Gravity Conduits, Wet Wells, Lift Station Pumps, Force Mains, and Outfalls.
- **Partial-Flow Manning Hydraulics**: Exact circular pipe partial-depth calculation using Newton-Raphson normal depth solver, tracking depth ratio ($d/D$), hydraulic radius ($R_h$), velocity, and Froude number ($\text{Fr}$).
- **Diurnal Sanitary Generation**: Peaking factors computed via Babbitt ($M = 5 / P^{0.2}$), Harmon ($M = 1 + \frac{14}{4 + \sqrt{P}}$), Ten-States, or custom diurnal curves.
- **Self-Cleansing & Tractive Force Physics**: Evaluates boundary shear stress $\tau = \gamma R_h S \ge 2.0\text{ Pa}$ and self-cleansing velocity ($\ge 0.6\text{ m/s}$) to guarantee sediment transport, flagging scour risk ($> 3.0\text{ m/s}$).
- **Drop Manhole & Backwater Dynamics**: Detects invert elevation discrepancies $> 0.6\text{ m}$, flags internal/external drop connection requirements, and computes Hydraulic Grade Line (HGL) backwater surcharge states.
- **Lift Station Pumping & Force Mains**: Mass balance in wet wells, cyclic pumping intervals, Hazen-Williams friction loss in force mains, and pump duty point calculation against dynamic system head curves.
- **Hydrogen Sulfide ($\text{H}_2\text{S}$) Corrosion Assessment**: Pomeroy-Parkhurst effective BOD ($EBOD$) and climatic temperature modeling predicting sulfide buildup rates ($\text{mg/L/hr}$) and crown corrosion risk.
- **Inflow & Infiltration (I&I) Routing**: Groundwater baseline infiltration plus RTK unit hydrograph wet weather inflow calculations.
- **Automated Pipe Sizing & Slope Sizing**: Automatically adjusts diameters and minimum gradients to eliminate surcharges while satisfying self-cleansing constraints.
- **EPA SWMM Two-Way Interoperability**: Standard SWMM `.INP` export and import.
- **10-Worksheet Calculation Workbook**: Multi-worksheet calculation register covering Network Overview, Manhole Register, Gravity Pipe Hydraulics, Pump Stations, Outfalls, 24-Hr Routing, Auto-Design, Corrosion, and I&I.

---

## Terrain & DEM Elevation Engine

Tensora GIS operates on ground-truth global terrain data without requiring local DEM file hosting:

- **Data Sources**: Copernicus GLO-30 ($30\text{ m}$ global coverage) and NASA SRTM ($30\text{ m}$), queried via Open-Meteo, OpenTopoData, and Mapzen/AWS Terrain Tiles.
- **Zero-Fabrication Principle**: The engine **never invents baseline elevations**. If DEM tiles are unreachable or coverage falls below $80\%$, the engine aborts with transparent error telemetry rather than outputting speculative figures.
- **Batching & Spatial Quantization**: Queries are spatially quantized to $0.0003^\circ$ grid cells to maximize local caching efficiency and eliminate redundant HTTP round-trips.

---

## System Architecture

Tensora GIS utilizes a dual-mode hybrid architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Tensora GIS Frontend                          │
│     React 19 • Leaflet Interactive GIS • Tailwind CSS v4 • TypeScript  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   [Local/Server Mode]                         [Static Client Mode]
   Express API Backend                         Client-Side In-Memory Engine
   • /api/snapshot (Canvas Rendering)          • HTML5 Canvas Delineation Snapshot
   • /api/export-excel (ExcelJS Server)        • ExcelJS Client Workbook Generator
   • Static Production SPA Serving             • Zero Server Dependency (GitHub Pages)
```

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Leaflet GIS, Lucide icons.
- **Backend / API**: Express 4, Node.js 20+, `@napi-rs/canvas` (high-performance C++ backend rasterization), `ExcelJS`.
- **Static Fallback**: If the Express API is unavailable (such as on GitHub Pages), the client-side engine automatically detects the 404 and executes equivalent canvas rendering and Excel workbook generation directly in the browser.

---

## Project Layout

```
tensora-gis/
├── .github/workflows/         # CI and GitHub Pages deployment pipelines
├── scripts/                   # Automated regression and physics self-test suites
│   ├── engine-selftest.ts             # 65 offline hydrology delineation tests
│   ├── verify-stormwater-excel.ts     # Excel export & 70% snapshot verification
│   ├── wastewater-selftest.ts         # SWMM hydraulic engine stability & 10-run suite
│   ├── water-transient-selftest.ts    # EPANET GGA, EPS, Fire Flow & Hammer physics
│   └── verify-crossing.ts             # End-to-end corridor crossing verification
├── server.ts                  # Express backend & Vite middleware server
├── src/
│   ├── auth/                  # Google Identity Services authentication gate
│   ├── components/            # React UI components
│   │   ├── common/            # Shared components (PumpIcon, etc.)
│   │   ├── water/             # Water Distribution UI (Toolbar, FlexTables, Profile, etc.)
│   │   ├── wastewater/        # Wastewater UI (Toolbar, FlexTables, Profile, etc.)
│   │   ├── Header.tsx         # Top app navigation bar
│   │   ├── LeftMenu.tsx       # Module selector (Stormwater / Water / Wastewater)
│   │   ├── InputPanel.tsx     # Corridor file ingestion & coordinate inputs
│   │   ├── MapViewport.tsx    # Leaflet stormwater GIS map viewer
│   │   ├── ReportCard.tsx     # Hydrology calculation card & calibration tools
│   │   ├── WaterDistributionModelling.tsx   # Water distribution workspace root
│   │   └── WastewaterModelling.tsx          # Wastewater collection workspace root
│   ├── data/                  # Standard reference alignments and sample networks
│   ├── server/                # Server-side snapshot canvas & Excel generators
│   ├── types/                 # TypeScript interfaces and engineering data models
│   └── utils/                 # Hydraulic, hydrological, and geospatial computation engines
│       ├── geoUtils.ts                # Geodesy, Haversine, DMS formatting, polyline math
│       ├── idUtils.ts                 # Guaranteed collision-free sequential ID generation
│       ├── elevationService.ts        # Multi-provider DEM fetcher with rate-limit quarantine
│       ├── flowDelineation.ts         # D8 routing, depression fill, catchment boundary
│       ├── delineationEngine.ts       # Corridor formation cut & scope ladder resolution
│       ├── stormwaterSnapshot.ts      # 70% viewport framing canvas snapshot engine
│       ├── epanetParser.ts            # EPANET .INP file parser and exporter
│       ├── waterHydraulicsEngine.ts   # EPANET GGA solver & transient surge analyzer
│       ├── waterExcelExport.ts        # 11-sheet water distribution calculation workbook
│       ├── swmmParser.ts              # EPA SWMM .INP file parser and exporter
│       ├── wastewaterHydraulicsEngine.ts # Partial-flow Manning & lift station solver
│       └── wastewaterExcelExport.ts   # 10-sheet wastewater calculation workbook
├── index.html                 # Single SPA HTML entrypoint
└── package.json               # Dependencies and build scripts
```

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.0.0` or higher (Node 22 LTS recommended)
- **npm**: `v10.0.0` or higher

### Local Development

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/tensora-gis/tensora-gis.github.io.git
   cd tensora-gis.github.io
   npm install
   ```

2. Start the integrated dev server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser. The Express API and Vite HMR run concurrently on the same port.

### Production Build

```bash
# Clean previous builds
npm run clean

# Typecheck and compile production bundle
npm run build

# Run production server
npm start
```

---

## Verification & Automated Self-Tests

Tensora GIS includes exhaustive regression test suites verifying mathematical accuracy, convergence stability, and file integrity:

```bash
# Run core offline hydrology delineation test suite (65 tests)
npm test

# Run Stormwater Excel export & 70% snapshot verification suite (26 tests)
npx tsx scripts/verify-stormwater-excel.ts

# Run Wastewater SWMM hydraulics, stability & 10-run suite (34 tests)
npx tsx scripts/wastewater-selftest.ts

# Run Water Distribution EPANET GGA, EPS, Fire Flow & Hammer suite (100% pass)
npx tsx scripts/water-transient-selftest.ts

# Run all test suites combined
npm test && npx tsx scripts/verify-stormwater-excel.ts && npx tsx scripts/wastewater-selftest.ts && npx tsx scripts/water-transient-selftest.ts
```

---

## Deployment & Containerization

### Docker

Build and run the self-contained multi-stage Docker image:

```bash
# Build Docker image
docker build -t tensora-gis .

# Run container on port 8080
docker run -p 8080:3000 tensora-gis
```

The container includes Node 22, installs all native build tools required for `@napi-rs/canvas`, builds the client assets, and launches the Express production server. Ready for deployment on Google Cloud Run, AWS App Runner, Render, Railway, or Fly.io.

### Static Hosting (GitHub Pages)

The repository automatically deploys to GitHub Pages on every push to `master` via GitHub Actions (`.github/workflows/deploy-pages.yml`). When running in a purely static environment, all computation engines, canvas snapshot generators, and Excel builders gracefully execute inside the browser runtime.

---

## Engineering Standards & Data Integrity

- **Open Standards**: Fully compatible with EPA SWMM 5.2 and EPANET 2.2 input and output standards.
- **Traceable Attribution**: Exported workbooks and KML packages document the DEM elevation source, spatial resolution, and boundary coordinates.
- **Zero Proprietary Lock-In**: Models export directly to industry-standard `.INP` and `.XLSX` files for seamless import into Bentley OpenFlows (WaterGEMS, SewerGEMS, HAMMER) or EPA desktop software.

---

## License

This software is released under the **MIT License**.
