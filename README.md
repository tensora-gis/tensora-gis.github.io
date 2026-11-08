# Tensora GIS

> **Next-Generation Civil Infrastructure, Hydrology & Multi-Network Hydraulic Modelling Platform**

Tensora GIS is an engineering-grade geospatial modeling and simulation suite designed for highway, railway, and municipal infrastructure projects. Built with TypeScript and React, Tensora GIS unifies four core engineering disciplines into a cohesive, high-performance web platform powered by real global Digital Elevation Models (DEMs):

1. **Stormwater Catchment & Stream Delineation** - Real Earth D8 flow accumulation, formation modeling, and 70%-framed delineation reports.
2. **Water Distribution Modelling & Transient Surge** - EPANET-standard Global Gradient Algorithm (GGA), Extended Period Simulation (EPS), Fire Flow analysis, Darwin automated pipe optimization, and Joukowsky/Allievi Water Hammer physics.
3. **Wastewater Collection & Sewer Hydraulics** - EPA SWMM 5.2 engine, circular partial-flow Manning hydraulics, tractive force self-cleansing checks, drop structures, lift station pumping cycles, Pomeroy-Parkhurst $\text{H}_2\text{S}$ corrosion, and I&I analysis.
4. **River Analysis & 2D Hydrodynamic CFD** - In-browser 2D Saint-Venant shallow-water finite-volume solver with WebGPU hardware acceleration, authentic solid civil structures, modifiable mesh shaping, well-balanced Audusse hydrostatic reconstruction, and LiDAR bathymetric carving.

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

### 4. River Analysis & 2D Hydrodynamic CFD Modelling

Tensora GIS includes an in-browser two-dimensional depth-averaged Saint-Venant shallow-water hydrodynamic solver with coupled depth-averaged RANS turbulence and sediment transport running client-side, designed to simulate real river reaches, floodplains, and hydraulic structures directly on the user's computer:

- **In-Browser Hardware Acceleration (WebGPU / WebGL2 / CPU)**:
  - **Client-Side Hardware Execution**: Solves the 2D finite-volume shallow-water equations in real time using the client machine's integrated or discrete GPU via WebGPU compute shaders (`WGSL`).
  - **GPGPU & CPU Fallbacks**: Seamless fallback to WebGL2 floating-point render textures (`GLSL`) and a multi-threaded CPU reference solver in TypeScript.
  - **Live Telemetry**: Interactive simulation operating at up to 60 FPS with live computational throughput metrics (MegaCells/sec).
- **Solid Civil Hydraulic Structures & Flow Disruption (Coupled CFD)**:
  - Structures are **authentic 2D closed solid civil bodies with physical thickness**, not decorative lines or polylines.
  - **Physical Flow Disruption**: Water flow cannot penetrate solid structure cells ($h = 0$, $\mathbf{u} = 0$, strictly enforced via no-slip zero-flux reflective boundary walls). River currents strike the upstream face, creating dynamic stagnation pressure heads, backwater curves, and wake vortex recirculation zones downstream.
  - **10 Supported Civil Structure Types**:
    1. *Bridge Piers*: Sharp-nosed ($K_1=0.7$), round-nosed ($0.9$), circular ($1.0$), and square ($1.1$) piers with drag force ($F_d = \frac{1}{2} C_D \rho A V^2$), HEC-18 localized scour depth estimation, and wake turbulence shedding.
    2. *Spur Dikes / Groynes*: Bank-anchored deflecting groynes with adjustable permeability ($0.0$ rock mound to $0.5$ timber piles), deflection angle ($70^\circ$ repelling to $110^\circ$ attracting), and Melville & Coleman head scour depth estimation.
    3. *Levees & Floodwalls*: 100% lateral solid flow barriers with broad-crested weir overtopping and Villemonte submergence correction.
    4. *Hydraulic Control Weirs*: Broad-crested and sharp-crested discharge formulations ($Q = C_d L H^{3/2}$) with submergence reduction.
    5. *River Training Deflectors & Guide Walls*: Multi-point guide bunds redirecting high-velocity flow to protect vulnerable banks and intakes.
    6. *Multi-Span Highway Bridges*: Yarnell pier drag headloss, submerged low-chord orifice pressure flow, and roadway deck weir overtopping.
    7. *Box Culverts*: Dual-mode FHWA HDS-5 governing rating curves (Inlet Control vs. Outlet Control full-barrel pipe friction).
    8. *Sluice & Radial Gates*: Underflow and free overflow orifice discharge with transition hydraulics.
    9. *Road Embankments*: Highway embankment weir overflow modeling overtopping lanes during extreme flood events.
    10. *Geometric Solid Obstacles*: Rotated rectangular caissons, circular cylinders/islands, and arbitrary multi-vertex solid polygons.
- **Completely Modifiable Mesh Generation & Arbitrary Shaping**:
  - Structured curvilinear 2D quad mesh generated along the river reach centerline.
  - Full freedom to deform, elongate, or compress the mesh shape:
    - *Streamwise Elongation & Compression (`streamwiseStretchRatio`)*: $0.1\times$ to $10.0\times$ (interactive UI slider $0.2\times$ to $3.0\times$ with `[-20% Compress]`, `[1.0x Reset]`, and `[+20% Elongate]` quick actions).
    - *Longitudinal Channel Width Tapering (`longitudinalTaperRatio`)*: $0.2\times$ to $3.0\times$ (linear cross-channel tapering from upstream to downstream for converging gorges or expanding delta estuaries).
    - *Meander Curvature Scaling (`meanderCurvatureScale`)*: $0.0\times$ to $2.5\times$ ($0.0\times$ flattens bends into a straight hydraulic lab flume; $>1.0\times$ amplifies natural sinuous oxbow loops).
    - *Asymmetric Bank Skew (`asymmetricBankRatio`)*: $-1.0$ (left bank heavy) to $+1.0$ (right bank heavy) for cut-bank shear stress modeling.
    - *6 Rapid Shape Presets*: Natural Reach, Straight Flume, Convergent Gorge, Expanding Delta, S-Curve Meander, and Compressed Chute.
    - *Discretization Control*: Full control over streamwise cells ($n_x = 15 - 150$), transverse cells ($n_y = 4 - 40$), channel width scaling ($0.5\times - 2.5\times$), lateral floodplain overbank width ($0 - 80\text{ m}$), and local boundary layer refinement around solid structures.
    - *Standalone Scaling*: Exported `scaleMesh(mesh, streamwiseScale, lateralScale)` utility for direct mesh reshaping with automatic cell area, normal, and geodetic bounds recalculation.
- **Pure Direct Interactive Leaflet Drag-and-Drop (Zero UI Duplication)**:
  - Translate and rotate the computational mesh directly via interactive Leaflet map gizmos.
  - Zero duplicate directional buttons, nudges, or residual sliders on the interface.
  - Unified `🏗️ Civil Structure / Obstacle ▾` dropdown with live drawing guide and status feedback.
  - Single `<select value={thematicDisplay}>` scalar field dropdown with explicit engineering units, eliminating cluttered horizontal button bars.
- **Mathematical & Physical CFD Engine Formulations**:
  - **Analytical Toro (2001) HLLC Riemann Solver**: Evaluates exact contact middle wave speed $S^*$ including the hydrostatic pressure gradient jump $\frac{1}{2}g(h_L^2 - h_R^2)$.
  - **Dry-Bed Rarefaction Wave Speeds**: Exact analytical wave speeds ($v_n \pm 2\sqrt{gh}$) guaranteeing stable advancing flood wave fronts over dry terrain without division-by-zero.
  - **Well-Balanced Audusse Hydrostatic Reconstruction**: Strict $C$-property preservation next to solid structures and over steep mountain drops ($< 10^{-7}\text{ m/s}$ spurious velocity).
  - **Anisotropic CFL Dynamic Time-Stepping**: Dynamically evaluates the Courant-Friedrichs-Lewy condition ($\text{CFL} \le 0.45$) based on maximum wave celerity $c = \sqrt{gh} + |\mathbf{u}|$ and effective cell dimension $\Delta x_{eff} = \min(\sqrt{A_c}, A_c / \max_f(L_f))$.
  - **Semi-Implicit Manning Bed Friction**: Implicit formulation stabilizing shear friction deceleration ($\tau_b = \rho g n^2 |\mathbf{u}| \mathbf{u} / h^{1/3}$) over extremely shallow inundation zones without timestep collapse.
  - **Depth-Averaged RANS Turbulence Closures**:
    - *Algebraic Mixing Length*: Nezu & Rodi parabolic vertical velocity profile ($\nu_t = \frac{1}{6} \kappa u_* h$).
    - *Standard $k-\varepsilon$ and $k-\omega$ SST*: Depth-averaged transport equations with Rastogi & Rodi (1978) bed-shear source terms ($P_{kv} = u_*^3/h$, $P_{\epsilon v} = 3.6 u_*^4/h^2$) that prevent catastrophic $\epsilon$ blowup in shallow water, preserving physical eddy viscosity $\nu_t$.
  - **Coupled Sediment Transport & Morphodynamics**:
    - 2D advection-diffusion of suspended sediment plume dispersion.
    - Empirical transport capacities (Engelund & Hansen total load, Meyer-Peter & Müller bedload, van Rijn).
    - Exner equation bed elevation updates coupled directly to local water depth ($h^{n+1} = \max(0, h^n - \Delta z_b)$) with wall boundary flux masking to prevent artificial mass loss.
  - **Reynolds Transport Outflow Tracking**: Physical downstream boundary outflow integration ($Q_{out}$) ensures accurate cumulative mass conservation auditing.
- **LiDAR Survey Point Cloud Ingestion & Bathymetric Rectification**:
  - **Multi-Format Ingestion**: Parses Lat/Lng/Elev, Lng/Lat/Elev, and local metric $[X, Y, Z]$ total station and terrestrial LiDAR point clouds with automatic geo-referencing.
  - **Adaptive Spatial Bucket Expansion**: Expands IDW search radius up to 8 buckets ($R \approx 320\text{ m}$) guaranteeing **100% terrain coverage** even on sparse surveys or elongated meshes.
  - **Downstream Monotonic Thalweg Enforcement**: Enforces a non-increasing bed profile downstream to eliminate spurious adverse slope humps.
  - **Hydro-Enforced Bathymetry Carving**: Carves active wet channels below LiDAR water surface plateaus while preserving elevated floodplain overbanks with dual-zone Manning roughness.
- **Curated Global Benchmark Reaches & Procedural Terrain Synthesis**:
  - **30 Curated Benchmark Reaches**: Pre-configured global river reach catalog across North America, South America, Europe, Asia, Africa, and Oceania (Mississippi, Rhine, Amazon, Danube, Nile, Yangtze, Colorado, Thames, Ganges, etc.) with real geodetic centerlines, empirical bankfull geometry, Manning roughness, and discharge data.
  - **Procedural Reach Generation**: For locations outside the 30 curated reaches, the engine queries the Copernicus 30m DEM and creates a procedural reach along the sampled terrain slope when clicking on the map.
- **In-Browser Hydrodynamic Visualization & Reporting**:
  - Continuous color contour maps for depth ($h$), velocity magnitude ($|\mathbf{V}|$), total dynamic head ($H$), turbulent kinetic energy ($k$), water surface elevation ($\text{WSE}$), Froude number ($\text{Fr}$), bed shear stress ($\tau_b$), eddy viscosity ($\nu_t$), sediment concentration ($C$), and bed morphodynamics ($\Delta z_b$).
  - Animated continuous streamlines and velocity direction arrows.
  - NASA SWOT radar altimetry comparison (WSE difference, Nash-Sutcliffe Efficiency NSE, and Strickler roughness adjustment).
  - 6-sheet engineering Excel workbook (`.xlsx`) export detailing Executive Summary, 2D Hydrodynamics Flow Field, RANS Turbulence Diagnostics, Sediment Transport & Morphodynamics, Hydraulic Structures, and NASA SWOT Calibration.

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
│   ├── river-cfd-selftest.ts          # 2D Shallow-Water Saint-Venant FVM solver tests
│   ├── knowledge-graph-selftest.ts    # 8.5M Reach census & spatial shard loader
│   ├── turbulence-selftest.ts         # Depth-averaged RANS (k-ε, k-ω SST) closure tests
│   ├── sediment-selftest.ts           # Exner morphodynamics & sediment transport
│   ├── openfoam-3d-selftest.ts        # OpenFOAM case directory (.zip) & blockMeshDict
│   ├── autocad-cfd-paraview-selftest.ts # Solid CAD structures & ParaView VTK export
│   ├── gpu-solver-selftest.ts         # WebGPU / WebGL2 / CPU solver parity & benchmarks
│   ├── solid-cfd-mesh-selftest.ts     # Solid structure footprinting & flow disruption
│   ├── move-mesh-selftest.ts          # Pure drag & drop Leaflet interactive mesh alignment
│   ├── lidar-accuracy-selftest.ts     # LiDAR IDW parsing, Audusse C-property & Toro S* HLLC
│   └── verify-crossing.ts             # End-to-end corridor crossing verification
├── server.ts                  # Express backend & Vite middleware server
├── src/
│   ├── auth/                  # Google Identity Services authentication gate
│   ├── components/            # React UI components
│   │   ├── common/            # Shared components (PumpIcon, etc.)
│   │   ├── water/             # Water Distribution UI (Toolbar, FlexTables, Profile, etc.)
│   │   ├── wastewater/        # Wastewater UI (Toolbar, FlexTables, Profile, etc.)
│   │   ├── Header.tsx         # Top app navigation bar
│   │   ├── LeftMenu.tsx       # Module selector (Stormwater / Water / Wastewater / River CFD)
│   │   ├── InputPanel.tsx     # Corridor file ingestion & coordinate inputs
│   │   ├── MapViewport.tsx    # Leaflet stormwater GIS map viewer
│   │   ├── ReportCard.tsx     # Hydrology calculation card & calibration tools
│   │   ├── RiverAnalysisModelling.tsx # River CFD workspace (2D FVM, GPU, CAD, Mesh Studio)
│   │   ├── WaterDistributionModelling.tsx # Water distribution workspace root
│   │   └── WastewaterModelling.tsx    # Wastewater collection workspace root
│   ├── river/                 # River Analysis & 2D Hydrodynamic CFD Core Engine
│   │   ├── calibration/       # NASA SWOT radar altimetry assimilation & Manning n tuning
│   │   ├── components/        # Specialized physics panels (Turbulence, Sediment, LiDAR, etc.)
│   │   ├── data/              # 8.5M Reach HydroRIVERS catalog & spatial shard loader
│   │   ├── export/            # OpenFOAM 3D case packager, ParaView VTK & Excel exports
│   │   ├── geometry/          # Mesh generation, arbitrary shaping, deformation & LiDAR IDW
│   │   ├── gpu/               # WebGPU WGSL compute, WebGL2 GLSL & CPU reference solvers
│   │   ├── sediment/          # Multi-formula sediment transport & Exner morphodynamics
│   │   ├── solver/            # Finite-volume 2D Saint-Venant solver & CFL time-stepper
│   │   ├── structures/        # Authentic solid CAD civil hydraulic structures & CFD coupling
│   │   ├── turbulence/        # Depth-averaged RANS models (Mixing length, k-ε, k-ω SST)
│   │   └── types/             # Hydrodynamic, mesh, and solver interface definitions
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

Tensora GIS includes exhaustive regression and physics self-test suites verifying mathematical accuracy, convergence stability, and file integrity across all engineering domains:

```bash
# Run all 11 core verification test suites end-to-end
npm test

# Run dedicated River CFD, GPU, CAD Solid & LiDAR verification suites
npm run test:river

# Individual module self-tests:
npx tsx scripts/gpu-solver-selftest.ts         # WebGPU, WebGL2, CPU parity & performance
npx tsx scripts/solid-cfd-mesh-selftest.ts    # Solid CAD civil structures & CFD flow disruption
npx tsx scripts/move-mesh-selftest.ts         # Interactive Leaflet gizmo mesh drag-and-drop
npx tsx scripts/lidar-accuracy-selftest.ts    # LiDAR IDW parsing, Audusse C-property & Toro S*
npx tsx scripts/engine-selftest.ts --offline  # 65 offline stormwater delineation tests
npx tsx scripts/wastewater-selftest.ts        # SWMM hydraulic engine stability & 10-run suite
npx tsx scripts/water-transient-selftest.ts   # EPANET GGA, EPS, Fire Flow & Hammer surge
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
