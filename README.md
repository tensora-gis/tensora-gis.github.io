# Tensora GIS

> **Next-Generation Civil Infrastructure, Hydrology & Multi-Network Hydraulic Modelling Platform**

Tensora GIS is an engineering-grade geospatial modeling and simulation suite designed for highway, railway, and municipal infrastructure projects. Built with TypeScript and React, Tensora GIS unifies four core engineering disciplines into a cohesive, high-performance web platform powered by real global Digital Elevation Models (DEMs):

1. **Stormwater Catchment, Stream Delineation & DPR Cross-Drainage Hydraulics** - Real Earth D8 flow accumulation, formation modeling, 70%-framed delineation reports, and multi-codal DPR Excel workbooks (IRC / MoRTH / IS vs. FHWA / AASHTO / USGS).
2. **Water Distribution Modelling & Transient Surge** - EPANET-standard Global Gradient Algorithm (GGA), Extended Period Simulation (EPS) with diurnal patterns, Fire Flow analysis, Darwin automated pipe optimization, and Joukowsky/Allievi Water Hammer physics with 1D Method of Characteristics (MOC).
3. **Wastewater Collection & Sewer Hydraulics** - EPA SWMM 5.2 engine, circular partial-flow Manning hydraulics, 1D Saint-Venant Dynamic Wave routing with Preissmann virtual slot, tractive force self-cleansing checks, drop structures, lift station pumping cycles, Pomeroy-Parkhurst $\text{H}_2\text{S}$ corrosion, and I&I analysis.
4. **River Analysis & 2D Hydrodynamic CFD** - In-browser 2D Saint-Venant shallow-water finite-volume solver with WebGPU hardware acceleration, authentic solid civil structures, modifiable mesh shaping along river centerlines, well-balanced Audusse hydrostatic reconstruction, LiDAR bathymetric carving, and interactive 3D ParaView/OpenFOAM exports.

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

Designed specifically for road and railway corridor cross-drainage culvert design where traditional raw DEM analysis fails due to the elevated embankment:

- **Corridor Ingestion & Linear Referencing**: Ingests alignment vectors (`.kml` / `.kmz`) and survey chainage registers (`.csv` / `.xlsx`). Interactively projects any station perpendicularly onto the 3D alignment, reporting coordinates in both Decimal Degrees and Degrees-Minutes-Seconds (DMS).
- **Physical Formation Modeling**: Models the embankment cross-section ($12\text{ m}$ formation half-width) and cuts the formation to simulate culvert invert placement at the true toe of slope, preventing artificial upstream pooling or false catchment truncation.
- **Priority-Flood D8 Routing**: Resolves hydrological flow directions, accumulates upstream drainage areas, and extracts the primary channel draining directly into the target crossing.
- **Dynamic Scope Expansion**: Automatically evaluates relief drop ($\Delta h$). If drop is under $5\text{ m}$, the analysis radius systematically scales ($500\text{ m} \to 1{,}000\text{ m} \to 2{,}000\text{ m}$) to locate the true hydrologic divide.
- **Spatially Distributed Green-Ampt Infiltration Physics**: Full USDA 7-soil parameter classification table ($K_s$, $\psi$, $\theta_s$, $\theta_r$, $n$). Evaluates the time-to-ponding criterion $F_p = \frac{K_s \psi \Delta\theta}{i - K_s}$ and executes an implicit Newton-Raphson solver for cumulative infiltration depth $F(t)$ and Hortonian overland excess $i_{eff}(t)$ with tolerance $< 10^{-9}\text{ m}$.
- **2D Semi-Implicit Diffusive-Wave Overland Routing**: 2D local inertial formulation (Bates et al., 2010) with adaptive CFL gravity-wave time-stepping, embankment toe ponding, culvert abstraction coupling, and WebGPU WGSL compute kernel acceleration (`src/river/gpu/overland_diffusive.wgsl`).
- **FHWA HDS-5 Culvert Rating Hydraulics**: Inlet control (Form 1 unsubmerged / Form 2 submerged) with smooth transition blending, full-barrel and part-full outlet control energy balance ($H_L = (K_e + 19.63 n^2 L / R_h^{4/3} + 1) V^2 / 2g$), governing headwater rating curve $HW(Q)$, and inverse bisection rating solver $Q(HW)$.
- **Dual Engineering Codal Provisions (Indian vs. International)**:
  - **Indian Codal Provisions**:
    - **Standards**: IRC:SP:13-2004, IRC:5-2015, IRC:SP:42, IS 456, IS 10430.
    - **Rational Method**: $Q_r = 0.028 \cdot P \cdot f \cdot I_c \cdot A$ with Kirpich overland time of concentration $t_c = 0.0195 \cdot (L^{0.77} / S^{0.385})$ and rainfall intensity $I_c = \frac{F}{(t_c + c)^d}$.
    - **Empirical Flood Envelopes**: Dickens ($Q = C_d A^{3/4}$), Ryves ($Q = C_y A^{2/3}$), and Inglis ($Q = \frac{124 A}{\sqrt{A + 10.4}}$).
    - **Regime Hydraulics & Scour**: Lacey regime waterway width $W = 4.825 \sqrt{Q}$, Molesworth afflux $h_a = \left(\frac{V^2}{17.88} + 0.015\right) \left(\left(\frac{A}{a}\right)^2 - 1\right)$, and Lacey regime scour depth $d_{sm} = 1.34 \left(\frac{q^2}{f_{Lacey}}\right)^{1/3}$ with codal bend/pier multiplier ($1.50 - 2.00$).
    - **Compliance Thresholds**: Velocity $0.60 - 3.00\text{ m/s}$, Max Afflux $h_a \le 0.30\text{ m}$, Max $HW/D \le 1.20$.
  - **International Standards**:
    - **Standards**: FHWA HDS-5, AASHTO, USGS National Streamflow Statistics (NSS), USBR, HEC-18 / HEC-20.
    - **Rational Method**: $Q = 0.00278 \cdot C \cdot I \cdot A$ (metric) with USGS regional regression envelope $Q = a \cdot A^b$.
    - **Culvert Hydraulics & Scour**: FHWA waterway multiplier $3.65 \sqrt{Q}$, USBR backwater, and HEC-18 contraction/local scour depth ($d_s / y_0 = 2.0 K_1 K_2 K_3 (a / y_0)^{0.65} Fr_1^{0.43}$).
    - **Compliance Thresholds**: Velocity $0.90 - 4.50\text{ m/s}$, Max Backwater $h_a \le 0.15\text{ m}$, Max $HW/D \le 1.50$.
  - **Live Standard Switcher**: Global UI toggle in both the Header and ReportCard dynamically switches all active calculation sheets, formulas, and labels in real time.
- **Shared Detailed Project Report (DPR) 5-Worksheet Excel Architecture**:
  - `src/utils/dprExcelBase.ts`: Single-source truth for typography (Calibri/Consolas), 60+ engineering number formats, cell borders, fill palettes, and codal constants lookup tables.
  - `src/utils/stormwaterDprBuilder.ts` & `src/server/stormwaterDprWorkbook.ts`: Generates a fully formatted 5-worksheet DPR workbook with live UPPERCASE Excel formulas, cell cross-references, conditional formatting rules, and embedded 70% framed North-up catchment snapshot:
    1. `00_Codal_Constants`: Live tabular lookups of codal constants, runoff coefficients, velocity envelopes, afflux limits, and scour multipliers.
    2. `01_CD_Executive_Summary`: Alignment, chainage, coordinates, high-resolution snapshot, and dynamic KPI links to calculations.
    3. `02_Hydrology_Worked_Calcs`: Full step-by-step worked formulas ($t_c, I_c, Q_r$, empirical envelopes, and $Q_{design}$).
    4. `03_Culvert_Hydraulics_Scour`: Lacey waterway, Manning barrel capacity, velocity compliance, afflux, $HW/D$, and regime scour.
    5. `04_Catchment_Hypsometry`: 25+ elevation bands detailing area distribution, cumulative hypsometry, and stream profile.
- **Offline Client Excel Parity**: ExcelJS is bundled directly into the client production bundle with background prewarming (`prewarmExcelJS()`), guaranteeing 100% offline DPR generation on static hosts (GitHub Pages) with zero broken CDN chunks. Safe 10-second deferred blob URL cleanup prevents premature download cancellation.

### 2. Water Distribution & Transient Surge Modelling

Comprehensive pressurized pipeline network analysis based on the EPANET Global Gradient Algorithm (GGA) coupled with Bentley HAMMER-grade transient water hammer physics:

- **Network Elements**: Interactive placement and editing of Junctions, Pipes, Variable-Speed Booster Pumps, Storage Tanks, Open Reservoirs, and Control Valves (PRV, PSV, PBV, FCV, TCV, GPV).
- **Steady-State Hydraulics**: Solves the non-linear Hazen-Williams and Darcy-Weisbach headloss equations via sparse matrix numerical iteration to exact flow and head balance convergence.
- **Extended Period Simulation (EPS)**: 24-hour diurnal demand patterns with custom hourly multipliers, tracking dynamic tank water level fluctuations, system head variations, and pump duty cycles.
- **Fire Flow Analysis**: Evaluates available fire-fighting flow capacities across all junctions subject to a mandatory residual pressure constraint (default $\ge 14\text{ m} / 20\text{ psi}$).
- **Water Quality & Chlorine Decay**: Computes nodal water age (hours) and first-order disinfectant residual decay kinetics ($C(t) = C_0 \cdot e^{-k \cdot t}$).
- **Automated Pipe Sizing Optimization**: Darwin-style genetic constraint optimization evaluating pipe velocity ($0.6 - 2.5\text{ m/s}$) and unit friction loss ($< 10\text{ m/km}$), recommending standardized nominal diameters ($100 - 600\text{ mm}$) with capital expenditure estimates.
- **1D Method of Characteristics (MOC) Discretization**: Multi-pipe reach discretization with characteristic compatibility equations ($C^+, C^-$), characteristic impedance $B = \frac{a}{g A}$, and friction resistance $R = \frac{f \Delta x}{2 g D A^2}$. An adaptive common timestep search ($\Delta t$) strictly constrains wave-speed adjustments across all pipes to within $\pm 5\%$.
- **Discrete Vapor Cavity Model (DVCM)**: Integrated tracking of local cavity volume when piezometric head drops to vapor pressure ($H \le -10\text{ m}$ gauge), capturing water column separation, cavity growth, and subsequent collapse impact shock pressure spikes.
- **Dynamic Rotating Machinery & Surge Suppression**: Suter 4-quadrant pump trip rundown modeling rotational deceleration and transient downsurge rarefaction waves. Sizing and dynamic simulation of hydro-pneumatic air vessels with polytropic gas law $P_{abs} \forall_{air}^n = \text{const}$ and differential orifice throttling.
- **Transient Surge & Water Hammer Physics**:
  - Joukowsky instantaneous surge formulation: $\Delta H = \frac{a \cdot \Delta V}{g}$ for rapid pump trip and fast valve closure ($t \le \frac{2L}{a}$).
  - Allievi slow-closure equation: $\Delta H = \frac{2 L V_0}{g \cdot T_c}$ for controlled closure ($t > \frac{2L}{a}$).
  - Material-specific acoustic wave speeds ($a$): DI ($1{,}050\text{ m/s}$), Steel ($1{,}150\text{ m/s}$), PVC ($400\text{ m/s}$), HDPE ($320\text{ m/s}$), Concrete ($950\text{ m/s}$).
  - Identifies pipes at risk of overpressure rupture vs. nominal pressure ratings ($\text{PN}$).
- **EPANET Two-Way Interoperability**: Full `.INP` export and import round-trips.
- **11-Worksheet Calculation Workbook**: Engineering export detailing Executive Summary, Junction Calculations, Pipe Hydraulics, Energy & Pumping, Control Valves, Sources & Storage, 24-Hr EPS, Fire Flow Register, Water Quality, Pipe Optimization, and Transient Surge Analysis.

### 3. Wastewater Collection & SWMM Sewer Hydraulics

Full dynamic sanitary and storm sewer modeling running on the EPA SWMM 5.2 computational engine with Bentley SewerGEMS-grade capabilities:

- **Collection Network Topology**: Manholes, Gravity Conduits, Wet Wells, Lift Station Pumps, Force Mains, and Outfalls.
- **Full 1D Saint-Venant Dynamic Wave Routing with Preissmann Virtual Slot**: Continuity and momentum PDE conservation laws with a narrow Preissmann slot ($T_s = \frac{g A_{full}}{a^2}$) appended along the pipe crown when depth exceeds barrel diameter ($y > D$). Unifies open-channel gravity Manning flow and pressurized pipe surcharging within a single continuous hyperbolic system without numerical switching.
- **Preissmann 4-Point Implicit Scheme & CSR Sparse Matrix Solver**: Spatial/temporal weighting ($\theta \in [0.55, 1.0]$) coupled to nodal manhole continuity with surface overflow weir discharge. Assembles Compressed Sparse Row (CSR) Jacobian matrices solved via BiCGSTAB iteration to machine precision with mass continuity error $< 0.1\%$.
- **Two-Phase Air Geysering Model**: Dropshaft air entrainment rate $Q_{air,ent} = 0.05 Q_{water} \sqrt{h_{drop} / D}$, trapped sewer air pocket polytropic compression ($P_{air} \forall_{air}^{1.4} = \text{const}$), manhole cover vent hole relief, and dropshaft geyser blowout risk classification ('None', 'Moderate', 'Severe', 'Critical').
- **Partial-Flow Manning Hydraulics**: Exact circular pipe partial-depth calculation using Newton-Raphson normal depth solver, tracking depth ratio ($d/D$), hydraulic radius ($R_h$), velocity, and Froude number ($\text{Fr}$).
- **Diurnal Sanitary Generation**: Peaking factors computed via Babbitt ($M = 5 / P^{0.2}$), Harmon ($M = 1 + \frac{14}{4 + \sqrt{P}}$), Ten-States, or custom diurnal curves.
- **Self-Cleansing & Tractive Force Physics**: Evaluates boundary shear stress $\tau = \gamma R_h S \ge 2.0\text{ Pa}$ and self-cleansing velocity ($\ge 0.6\text{ m/s}$) to guarantee sediment transport, flagging scour risk ($> 3.0\text{ m/s}$).
- **Drop Manhole & Backwater Dynamics**: Detects invert elevation discrepancies $> 0.6\text{ m}$, flags internal/external drop connection requirements, and computes Hydraulic Grade Line (HGL) backwater surcharge states.
- **Lift Station Pumping & Force Mains**: Mass balance in wet wells, cyclic pumping intervals, Hazen-Williams friction loss in force mains, and pump duty point calculation against dynamic system head curves.
- **Hydrogen Sulfide ($\text{H}_2\text{S}$) Corrosion Assessment**: Pomeroy-Parkhurst effective BOD ($EBOD$) and climatic temperature modeling predicting sulfide buildup rates ($\text{mg/L/hr}$) and crown corrosion risk.
- **Inflow & Infiltration (I&I) Routing**: Groundwater baseline infiltration plus RTK unit hydrograph wet weather inflow calculations.
- **Automated Pipe Sizing & Slope Sizing**: Automatically adjusts diameters and minimum gradients to eliminate surcharges while satisfying self-cleansing constraints.
- **EPA SWMM Two-Way Interoperability**: Full parsing and export of `[OPTIONS] FLOW_ROUTING DYNWAVE`, `INERTIAL_DAMPING`, and conduit surcharge attributes.
- **10-Worksheet Calculation Workbook**: Multi-worksheet calculation register covering Network Overview, Manhole Register, Gravity Pipe Hydraulics, Pump Stations, Outfalls, 24-Hr Routing, Auto-Design, Corrosion, and I&I.

### 4. River Analysis & 2D Hydrodynamic CFD Modelling

Tensora GIS includes an in-browser two-dimensional depth-averaged Saint-Venant shallow-water hydrodynamic solver with coupled depth-averaged RANS turbulence and sediment transport running client-side, designed to simulate real river reaches, floodplains, and hydraulic structures directly on the user's computer:

- **In-Browser Hardware Acceleration (WebGPU / WebGL2 / CPU)**:
  - **Client-Side Hardware Execution**: Solves the 2D finite-volume shallow-water equations in real time using the client machine's integrated or discrete GPU via WebGPU compute shaders (`WGSL`).
  - **GPGPU & CPU Fallbacks**: Seamless fallback to WebGL2 floating-point render textures (`GLSL`) and a multi-threaded CPU reference solver in TypeScript.
  - **Live Telemetry**: Interactive simulation operating at up to 60 FPS with live computational throughput metrics (MegaCells/sec).
- **2nd-Order MUSCL-Hancock Space-Time Reconstruction**:
  - Piecewise linear spatial reconstruction with TVD Minmod and Van Leer limiters across curvilinear quad cells.
  - Audusse well-balanced water surface elevation reconstruction ($\eta = h + z_b$) strictly preserving the Lake-at-Rest C-property ($< 10^{-7}\text{ m/s}$ spurious velocities over complex bathymetry).
  - Half-step Hancock predictor at cell centroids eliminating numerical diffusion in vortex wakes and shear layers.
- **GPU Local Time-Stepping (LTS) Sub-Cycling**:
  - Anisotropic cell CFL evaluation partitioned into $2^k$ power-of-two tiers ($1\times, 2\times, 4\times, 8\times$) in WebGPU WGSL (`src/river/gpu/lts_subcycle.wgsl`).
  - Interface flux accumulators preserve exact machine-precision mass conservation between cells of differing LTS tiers, accelerating wide overbank simulations by $3\times - 5\times$.
- **Weakly Dispersive Non-Hydrostatic Dynamic Pressure Projection**:
  - Decomposes total pressure into hydrostatic ($\rho g (\eta - z)$) plus depth-averaged dynamic non-hydrostatic pressure ($q$).
  - Solves the 2D elliptic Poisson equation on GPU (`src/river/gpu/poisson_cg.wgsl`) and CPU via Jacobi / Conjugate Gradient iteration, projecting divergence-free velocities to capture vertical accelerations over submerged weirs and bridge decks.
- **Bank Slumping & Critical Angle-of-Repose Avalanching**:
  - Couples Exner morphodynamics with an angle-of-repose avalanching algorithm. When local bed slope exceeds $\phi_{submerged} \approx 30^\circ - 33^\circ$, excess sediment is redistributed laterally to downhill neighbors, guaranteeing exact volume conservation ($\sum \Delta z_b A_c = 0$) and preventing unphysical vertical cliffs.
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
- **Intelligent Full-River Reach Coverage & Centerline Mesh Generation**:
  - **Full-River Reach Coverage by Default**: For all 30 global rivers in `GLOBAL_RIVER_DATABASE`, HydroRIVERS, and user-detected waterways, the computational mesh defaults to spanning 100% of the entire river reach from upstream inlet to downstream outlet with zero coordinate skew or geographic drift.
  - **Adaptive 2D CFD Discretization**: Automatically determines optimal streamwise cell count ($n_x = 25 - 160$) and spacing ($\Delta x$) based on channel width $W_{\text{mean}}$ and reach length $L_{\text{reach}}$, synthesizing well-conditioned aspect ratios ($1.0 \le \Delta x / \Delta y \le 2.0$) and total cell counts ($300 - 1{,}300$ cells) that execute at a silky smooth 60 FPS in WebGPU WGSL and CPU solvers.
  - **Intelligent Curvilinear Centerline Shortening**: Users can shorten the computational domain along the physical river path ($10\% - 100\%$ slider or quick $25\%, 50\%, 75\%, 100\%$ presets). Trimming evaluates exact Catmull-Rom arc-length stations ($[S_{\text{start}}, S_{\text{end}}]$) along the true river thalweg centerline, ensuring the shortened mesh stays 100% inside the natural riverbed through all curves and oxbow bends without Cartesian distortion.
  - **Live Computational Mesh Wireframe Overlay**: Dedicated `[Grid]` wireframe toggle on the main simulation toolbar allowing engineers to inspect the boundary-conforming quad cells, outer bank limits, and dashed thalweg centerline in real time over satellite orthophotos.
  - **Arbitrary Shaping & Longitudinal Deformation**:
    - *Streamwise Stretch & Compression (`streamwiseStretchRatio`)*: $0.1\times$ to $10.0\times$ (interactive UI slider $0.2\times$ to $3.0\times$ with `[-20% Compress]`, `[1.0x Reset]`, and `[+20% Elongate]` quick actions).
    - *Longitudinal Channel Width Tapering (`longitudinalTaperRatio`)*: $0.2\times$ to $3.0\times$ (linear cross-channel tapering from upstream to downstream for converging gorges or expanding delta estuaries).
    - *Meander Curvature Scaling (`meanderCurvatureScale`)*: $0.0\times$ to $2.5\times$ ($0.0\times$ flattens bends into a straight hydraulic lab flume; $>1.0\times$ amplifies natural sinuous oxbow loops).
    - *Asymmetric Bank Skew (`asymmetricBankRatio`)*: $-1.0$ (left bank heavy) to $+1.0$ (right bank heavy) for cut-bank shear stress modeling.
    - *6 Rapid Shape Presets*: Natural Reach, Straight Flume, Convergent Gorge, Expanding Delta, S-Curve Meander, and Compressed Chute.
    - *Discretization Control*: Full control over streamwise cells ($n_x = 15 - 180$), transverse cells ($n_y = 4 - 40$), channel width scaling ($0.5\times - 2.5\times$), lateral floodplain overbank width ($0 - 80\text{ m}$), and local boundary layer refinement around solid structures.
    - *Standalone Scaling*: Exported `scaleMesh(mesh, streamwiseScale, lateralScale)` utility for direct mesh reshaping with automatic cell area, normal, and geodetic bounds recalculation.
- **Pure Direct Interactive Leaflet Drag-and-Drop (Zero UI Duplication)**:
  - Translate and rotate the computational mesh directly via interactive Leaflet map gizmos.
  - Zero duplicate directional buttons, nudges, or residual sliders on the interface.
  - Unified `🏗️ Civil Structure / Obstacle ▾` dropdown with live drawing guide and status feedback.
  - Single `<select value={thematicDisplay}>` scalar field dropdown with explicit engineering units, eliminating cluttered horizontal button bars.
- **Mathematical & Physical CFD Engine Formulations**:
  - **Analytical Toro (2001) HLLC Riemann Solver**: Evaluates exact contact middle wave speed $S^*$ including the full Rankine-Hugoniot convective momentum jump $h^*_R v_{nR} (s_R - v_{nR}) - h^*_L v_{nL} (s_L - v_{nL}) + \frac{1}{2}g(h_L^{*2} - h_R^{*2})$ across CPU, WebGL2, and WebGPU WGSL compute solvers.
  - **Anti-Self-Intersection Mesh Curvature Limiting**: Enforces an inner-bank lateral offset limit in sharp meander bends ($R < W/2$), bounding inner-bank spacing to $\le 0.85 R_{\text{bend}}$ to prevent quadrilateral cell inversion or grid folding on tight oxbow reaches.
  - **OpenFOAM 3D Case & Watertight STL Pipeline**: Generates complete, syntactically conforming OpenFOAM directories with `blockMeshDict` (strictly outward normals across all 6 boundary patches), `snappyHexMeshDict`, `system/surfaceFeaturesDict` (`includedAngle 150`), `0/U`, `0/p_rgh`, `0/k` ($k$-$\omega$ SST kinetic energy), `0/omega` (specific dissipation rate), `0/nut` (turbulent viscosity with sediment roughness $k_s = 2.5 d_{50}$), and watertight `.stl` geometry with non-zero facet normals.
  - **Dry-Bed Rarefaction Wave Speeds**: Exact analytical wave speeds ($v_n \pm 2\sqrt{gh}$) guaranteeing stable advancing flood wave fronts over dry terrain without division-by-zero.
  - **Well-Balanced Audusse Hydrostatic Reconstruction**: Strict $C$-property preservation next to solid structures and over steep mountain drops ($< 10^{-7}\text{ m/s}$ spurious velocity).
  - **Symmetric Structure Interface Coupling**: Enforces interface flux antisymmetry ($F_{ij} = -F_{ji}$) with mutual overtopping modulation ($\min(\text{mod}_C, \text{mod}_N)$) and bilateral depth evaluation ($\max(h_L, h_R)$), guaranteeing zero spurious mass generation across solid boundaries.
  - **Graceful Multi-Backend Fallback Chain**: Sequential runtime initialization attempts `WebGPU` $\to$ `WebGL2` $\to$ `Host CPU Reference FVM`, logging hardware capabilities without unhandled exceptions.
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
│   ├── engine-selftest.ts             # 77 offline hydrology, Green-Ampt, 2D diffusive & FHWA HDS-5 tests
│   ├── verify-stormwater-excel.ts     # Excel export & 70% snapshot verification
│   ├── wastewater-selftest.ts         # SWMM 5.2 Dynamic Wave, Preissmann slot, CSR BiCGSTAB & geyser test suite
│   ├── water-transient-selftest.ts    # EPANET GGA, EPS, Fire Flow, 1D MOC & DVCM column separation suite
│   ├── river-cfd-selftest.ts          # 2D Shallow-Water Saint-Venant FVM solver tests
│   ├── knowledge-graph-selftest.ts    # 8.5M Reach census & spatial shard loader
│   ├── turbulence-selftest.ts         # Depth-averaged RANS (k-ε, k-ω SST) closure tests
│   ├── sediment-selftest.ts           # Exner morphodynamics & sediment transport
│   ├── openfoam-3d-selftest.ts        # OpenFOAM case directory (.zip) & blockMeshDict
│   ├── autocad-cfd-paraview-selftest.ts # Solid CAD structures & ParaView VTK export
│   ├── gpu-solver-selftest.ts         # WebGPU / WebGL2 / CPU parity, MUSCL-Hancock, LTS & avalanching benchmarks
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
│   │   ├── snapshotCanvas.ts          # Server-side @napi-rs/canvas rasterization
│   │   ├── stormwaterDprWorkbook.ts   # Server-side 5-worksheet DPR Excel builder
│   │   └── index.ts                   # Server export index
│   ├── types/                 # TypeScript interfaces and engineering data models
│   └── utils/                 # Hydraulic, hydrological, and geospatial computation engines
│       ├── geoUtils.ts                # Geodesy, Haversine, DMS formatting, polyline math
│       ├── idUtils.ts                 # Guaranteed collision-free sequential ID generation
│       ├── elevationService.ts        # Multi-provider DEM fetcher with rate-limit quarantine
│       ├── flowDelineation.ts         # D8 routing, depression fill, catchment boundary
│       ├── delineationEngine.ts       # Corridor formation cut & scope ladder resolution
│       ├── stormwaterSnapshot.ts      # 70% viewport framing canvas snapshot engine
│       ├── excelLoader.ts             # Direct client-side ExcelJS loader with background prewarming
│       ├── dprExcelBase.ts            # Shared DPR Excel styling, number formats & codal lookups
│       ├── stormwaterDprBuilder.ts    # 5-worksheet cross-drainage DPR Excel builder
│       ├── epanetParser.ts            # EPANET .INP parser/exporter with [PATTERNS]
│       ├── waterHydraulicsEngine.ts   # EPANET GGA solver & transient surge analyzer
│       ├── mocTransientSolver.ts      # 1D Method of Characteristics transient solver
│       ├── waterExcelExport.ts        # 11-sheet water distribution calculation workbook
│       ├── swmmParser.ts              # EPA SWMM .INP parser/exporter with [PATTERNS] & inverts
│       ├── dynamicWaveSolver.ts       # 1D Dynamic Wave Preissmann slot sewer solver
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
# Run all 13 core verification test suites end-to-end (100% offline)
npm test

# Run dedicated River CFD, GPU, CAD Solid & LiDAR verification suites (10 suites)
npm run test:river

# Run comprehensive Stormwater DPR Excel export assertion suite (116 assertions)
npx tsx scripts/verify-stormwater-excel.ts

# Individual module self-tests:
npx tsx scripts/gpu-solver-selftest.ts         # WebGPU, WebGL2, CPU parity & performance
npx tsx scripts/solid-cfd-mesh-selftest.ts    # Solid CAD civil structures & CFD flow disruption
npx tsx scripts/move-mesh-selftest.ts         # Interactive Leaflet gizmo mesh drag-and-drop
npx tsx scripts/lidar-accuracy-selftest.ts    # LiDAR IDW parsing, Audusse C-property & Toro S*
npx tsx scripts/engine-selftest.ts --offline  # 77 offline stormwater delineation tests
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
- **Dual Engineering Codal Provisions**: Unifies Indian codal provisions (IRC:SP:13-2004, IRC:5-2015, IRC:SP:42, IS 456, Lacey / Khosla) and International standards (FHWA HDS-5, AASHTO, USGS NSS, USBR, HEC-18 / HEC-20) with live formula recalculation.
- **WAI-ARIA Accessibility**: Complete keyboard navigation, non-blocking notification banners (zero intrusive `alert()` popups), and standard dialog roles (`role="dialog"`, `aria-modal="true"`, `Escape` key close handlers) across all engineering modal interfaces.
- **Zero Fabrication Guarantee**: The engine never invents baseline elevations or speculative hydrologic divides; any unavailable DEM tile or unverified boundary surfaces transparently with diagnostic telemetry.
- **Traceable Attribution**: Exported workbooks and KML packages document the DEM elevation source, spatial resolution, and boundary coordinates.
- **Zero Proprietary Lock-In**: Models export directly to industry-standard `.INP`, `.XLSX`, `.GEOJSON`, and `.ASC` files for seamless import into Bentley OpenFlows (WaterGEMS, SewerGEMS, HAMMER), EPA desktop software, ParaView, or OpenFOAM.

---

## License

This software is released under the **MIT License**.
