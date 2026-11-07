# Tensora GIS

> **Next-Generation Civil Infrastructure, Hydrology & Multi-Network Hydraulic Modelling Platform**

Tensora GIS is an engineering-grade geospatial modeling and simulation suite designed for highway, railway, and municipal infrastructure projects. Built with TypeScript and React, Tensora GIS unifies four core engineering disciplines into a cohesive, high-performance web platform powered by real global Digital Elevation Models (DEMs):

1. **Stormwater Catchment & Stream Delineation** - Real Earth D8 flow accumulation, formation modeling, and 70%-framed delineation reports.
2. **Water Distribution Modelling & Transient Surge** - EPANET-standard Global Gradient Algorithm (GGA), Extended Period Simulation (EPS), Fire Flow analysis, Darwin automated pipe optimization, and Joukowsky/Allievi Water Hammer physics.
3. **Wastewater Collection & Sewer Hydraulics** - EPA SWMM 5.2 engine, circular partial-flow Manning hydraulics, tractive force self-cleansing checks, drop structures, lift station pumping cycles, Pomeroy-Parkhurst $\text{H}_2\text{S}$ corrosion, and I&I analysis.
4. **River Analysis & 2D Hydrodynamic CFD** - Finite-volume 2D Saint-Venant shallow-water solver with well-balanced Audusse hydrostatic reconstruction, dynamic CFL time-stepping, 6 hydraulic structure physics formulations, global HydroRIVERS reach catalog, NASA SWOT radar calibration, and multi-format GIS export.

---

## Table of Contents

- [Key Engineering Capabilities](#key-engineering-capabilities)
  - [1. Stormwater Catchment & Stream Delineation](#1-stormwater-catchment--stream-delineation)
  - [2. Water Distribution & Transient Surge Modelling](#2-water-distribution--transient-surge-modelling)
  - [3. Wastewater Collection & SWMM Sewer Hydraulics](#3-wastewater-collection--swmm-sewer-hydraulics)
  - [4. River Analysis & 2D Hydrodynamic CFD Modelling](#4-river-analysis--2d-hydrodynamic-cfd-modelling)
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

### 4. River Analysis & 2D Hydrodynamic CFD Modelling (8.5M-Reach Global River Digital Twin)

Full two-dimensional depth-averaged Saint-Venant shallow-water hydrodynamic solver with coupled depth-averaged RANS turbulence and sediment transport running in real time directly within the client browser without external backend servers:

- **The 8.5M Reach Global Knowledge Graph**:
  - Incorporates the complete global river network across every continent: all **~8.5 million reaches** from HydroRIVERS / FAO, down to headwater tributaries (catchment $\ge 10\text{ km}^2$, $Q \ge 0.1\text{ m}^3/\text{s}$).
  - High-resolution SWORD v16 reach overlay (~248,000 reaches wider than $30\text{ m}$).
  - Prior cross-section shape and active channel bathymetry from SWOT-River-Volume (~240,000 reaches).
  - Modeled daily discharge time-series and 10-yr / 100-yr flood flows from GRADES-hydroDL (~2.94 million reaches).
  - Curated reference gauge observations and WMO calibration from GRDC-Caravan (~6,000 gauges).
  - Global river widths from Landsat (GRWL) and 30m global terrain from Copernicus GLO-30 DEM. See [`COVERAGE.md`](file:///home/orion/Downloads/VSC/Opencode/tensora-gis/COVERAGE.md).
- **Four Accuracy Tiers & Confidence Badging**:
  - `Estimated (Global)`: HydroRIVERS topology with Leopold–Maddock empirical hydraulic geometry ($h \propto Q^{0.4}$, $W = a Q^b$). No bathymetry is fabricated.
  - `Estimated (SWOT)`: SWOT-River-Volume prior bathymetry overlay (~240k reaches).
  - `Calibrated (SWOT)`: Assimilated and calibrated against NASA SWOT KaRIn radar altimetry (observed WSE and surface slope) with automated agreement classifications (`EXCELLENT`, `GOOD`, `NEEDS_CALIBRATION`) and Manning's $n$ assimilation.
  - `Surveyed (Validated)`: Applied upon user-drawn cross-sections or ground-truth bathymetric soundings.
- **Spatial Sharding Architecture (<5 MB per Tile)**:
  - Partitions Earth's landmass into ~14,200 $1^\circ \times 1^\circ$ spatial shards.
  - Fast client-side on-demand lazy loader (`reachShardLoader.ts`) backed by an IndexedDB tier and deterministic procedural reach synthesizer, ensuring **zero data gaps** anywhere on Earth.
- **Multi-Branch Tributary Confluence Integration**:
  - Domain extractor identifies contributing tributary branches within the buffer corridor.
  - Aggregates upstream tributary discharge into multi-branch boundary inflows, conserving mass and momentum across all confluence angles.
- **Licensing Guardrails & Attribution**:
  - GRADES-hydroDL modeled discharge is license-tagged under **CC BY-NC 4.0 (Non-commercial)** with visible `NC` badges in the UI.
  - GRDC-Caravan observed gauge subset is licensed under CC-BY-4.0.
  - Esri World Imagery (High-Resolution Satellite) and Copernicus GloFAS via Open-Meteo require **0 API keys** and zero authentication tokens.
- **Interactive Mesh Movement & Alignment Controls**:
  - Full freedom to interactively reposition, shift, and rotate the 2D finite-volume computational mesh over any reach corridor:
    - *Translation*: Nudge mesh North/South/East/West ($\pm 10\text{ m}, \pm 50\text{ m}, \pm 200\text{ m}$) across floodplains.
    - *Rotation*: Rotate the computational grid ($\pm 2^\circ, \pm 10^\circ$) to align with complex meandering river geometries.
    - *Thalweg Shifting*: Re-align streamwise stationing and lateral channel offset with automatic DEM elevation updates.
- **Interactive CAD Hydraulic Structures with Full Drawing Freedom**:
  - Users have full freedom to draw custom single-point, two-point, or multi-point polyline civil structures directly on the river canvas:
    1. *Spur Dikes / Groynes*: Bank-anchored deflecting groynes with adjustable permeability ($0.0$ rock mound to $0.5$ timber piles), deflection angle ($70^\circ$ repelling to $110^\circ$ attracting), and Melville & Coleman head scour depth estimation.
    2. *Standalone Bridge Piers*: Individual or clustered piers with nose shape coefficient $K_1$ (sharp-nosed $0.7$, round-nosed $0.9$, circular $1.0$, square $1.1$), drag force ($F_d = \frac{1}{2} C_D \rho A V^2$), HEC-18 localized pier scour depth calculation, and wake vortex turbulence generation.
    3. *River Training Deflectors & Guide Walls*: Multi-point guide bunds redirecting high-velocity flow to protect vulnerable banks and intakes.
    4. *Levees & Floodwalls*: 100% lateral flow barrier with broad-crested weir overtopping and Villemonte submergence correction.
    5. *Overflow Weirs*: Broad-crested and sharp-crested discharge formulations ($Q = C_d L H^{3/2}$) with submergence reduction.
    6. *Multi-Span Highway Bridges*: Yarnell pier drag headloss, submerged low-chord orifice pressure flow, and roadway deck weir overtopping.
    7. *Box Culverts*: Dual-mode FHWA HDS-5 governing rating curves (Inlet Control vs. Outlet Control full-barrel pipe friction).
    8. *Sluice & Radial Gates*: Underflow and free overflow orifice discharge with transition hydraulics.
    9. *Transportation Road Embankments*: Highway embankment weir overflow modeling overtopping lanes during extreme flood events.
- **Depth-Averaged RANS Turbulence Closure**:
  - *None*: Fast inviscid / pure shallow-water solution ($\nu_t = 0$) for rapid layout previews.
  - *Algebraic Mixing Length*: Nezu & Rodi parabolic vertical velocity profile ($\nu_t = \frac{1}{6} \kappa u_* h$).
  - *Two-Equation $k-\varepsilon$*: Full transport for turbulent kinetic energy $k$ and dissipation rate $\varepsilon$ with shear production $P_k$, bed generation $P_{kv}, P_{\varepsilon v}$, and eddy viscosity $\nu_t = \min(c_\mu k^2 / \varepsilon, \nu_{t,max})$.
  - *Two-Equation $k-\omega$ SST*: Shear Stress Transport formulation for separated boundary flows near bridge piers, weirs, and abutments.
  - *Equilibrium Wall Functions*: Prescribes bed equilibrium $k$ and $\varepsilon$ from local friction velocity $u_* = n \sqrt{g} |\mathbf{V}| / h^{1/6}$.
  - See [`PERFORMANCE.md`](file:///home/orion/Downloads/VSC/Opencode/tensora-gis/PERFORMANCE.md) for grid size vs. frame time benchmarks across all turbulence closures.
- **Coupled Sediment Transport & Morphodynamic Bed Evolution**:
  - *Advection-Diffusion Plume Dispersion*: $\frac{\partial (h C)}{\partial t} + \nabla \cdot (h C \mathbf{V}) = \nabla \cdot \left( \frac{\nu_t}{\sigma_c} h \nabla C \right) + E - D$.
  - *4 Classical Transport Formulations*: Engelund & Hansen (1967) total load, Meyer-Peter & Müller (1948) bedload, van Rijn (1984) bed/suspended load, and Toffaleti (1969) multi-zone profile.
  - *Exner Equation Bed Update*: $\frac{\partial z_{bed}}{\partial t} = -\frac{1}{1-p} \nabla \cdot \mathbf{q}_s$ with decoupled sub-stepping and a 5% depth change stability limiter.
- **Full OpenFOAM 3D CFD Engine & ParaView Integration**:
  - Instantly packages an executable, production-ready **OpenFOAM 3D CFD Case directory (`.zip`)** directly from the client browser:
    - *Solvers*: Configured for `interFoam` free-surface two-phase VOF solver with RANS $k-\omega$ SST turbulence closure.
    - *3D Extruded Hex Mesh*: `system/blockMeshDict` extrudes the 2D river mesh into 3D curvilinear hexahedra with vertical depth grading for near-bed boundary layer resolution.
    - *Civil Structures STL*: Generates `constant/triSurface/structures.stl` and `system/snappyHexMeshDict` for automatic boundary layer refinement around bridge piers, spur dikes, and weirs.
    - *Boundary Conditions*: Full `0/` fields (`alpha.water`, `U`, `p_rgh`, `k`, `omega`, `nut`) with `flowRateInletVelocity`, rough bed wall functions ($k_s = 2.5 d_{50}$), and atmosphere inlet-outlet.
    - *One-Click Execution*: Includes `Allrun` and `Allclean` bash scripts and generates ParaView `case.foam`.
  - *3D ParaView VTK Export*: Exports complete 3D Structured Grid (`.vtk`) files with logarithmic vertical velocity distributions and turbulent kinetic energy fields.
- **Well-Balanced Audusse Hydrostatic Reconstruction**: Guarantees the strict $C$-property: undisturbed lake-at-rest over variable mountain bathymetry remains at exact zero velocity to machine precision ($< 10^{-7}\text{ m/s}$), preventing spurious artificial flow creation over steep terrain gradients.
- **Wetting and Drying Fronts**: Stable threshold-based drying ($h_{dry} = 10^{-3}\text{ m}$) preventing numerical division-by-zero on steep dry banks and moving flood waves.
- **Semi-Implicit Manning Bed Friction**: Implicit formulation stabilizing shear friction deceleration ($\tau_b = \rho g n^2 |\mathbf{u}| \mathbf{u} / h^{1/3}$) over extremely shallow inundation zones without timestep collapse.
- **Adaptive CFL Dynamic Time-Stepping**: Dynamically evaluates Courant-Friedrichs-Lewy condition ($\text{CFL} \le 0.45$) based on maximum wave celerity $c = \sqrt{gh} + |\mathbf{u}|$ across all 2D quad cells.
- **NASA SWOT Satellite Altimetry Calibration**: Direct comparison against NASA SWOT KaRIn Ka-band radar interferometer observations (Water Surface Elevation $\eta$, width, slope) with automated agreement classifications (`EXCELLENT`, `GOOD`, `NEEDS_CALIBRATION`) and automated Manning's $n$ calibration.
- **Hardware-Accelerated Computing Architecture**: WebGPU compute shaders with WebGL2 float texture GPGPU fallback and multi-threaded CPU reference engine.
- **6-Sheet Professional Engineering Excel Workbook (`.xlsx`)**: Executive Summary, 2D Hydrodynamics Flow Field, RANS Turbulence Diagnostics, Sediment Transport & Morphodynamics, Hydraulic Structures, and NASA SWOT Calibration registers.

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

# Run River Analysis 2D Shallow-Water CFD & Hydraulic Structures suite (43 tests)
npx tsx scripts/river-cfd-selftest.ts

# Run all test suites combined
npm test && npx tsx scripts/verify-stormwater-excel.ts && npx tsx scripts/wastewater-selftest.ts && npx tsx scripts/water-transient-selftest.ts && npx tsx scripts/river-cfd-selftest.ts
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
