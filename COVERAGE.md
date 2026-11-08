# Global River Database & Reach Coverage Report

**Target**: Tensora GIS Client-Side Digital Twin  
**Status**: 30 Curated Global Benchmark Reaches + Global Copernicus 30m Procedural Synthesis  

---

## 1. Executive Summary: River Catalog & Data Provenance

Tensora GIS integrates **30 curated benchmark river reaches** across North America, South America, Europe, Asia, Africa, and Oceania, coupled with an on-demand procedural terrain reach synthesizer backed by live Copernicus 30m DEM queries:

| Dataset / Source | Scope in Tensora GIS | Role in Engine | Spatial Resolution | License |
|:---|:---|:---|:---|:---|
| **Curated Benchmark Reaches** | **30 Major World Rivers** | Core validation and demonstration catalog (Mississippi, Rhine, Amazon, Danube, Nile, Yangtze, etc.) | Geodetic Centerlines | Open / MIT |
| **Copernicus GLO-30 DEM** | **Global (100% landmass)** | On-demand elevation sampling for procedural reach thalweg extraction and floodplain carving | $30\text{ m}$ | Free / Open |
| **HydroRIVERS / HydroSHEDS** | **Methodology / Topological Reference** | Empirical Strahler scaling and catchment drainage area relationships | Reference vector | CC-BY-4.0 |
| **NASA SWOT KaRIn Altimetry** | **Reference Reaches** | Water surface elevation and slope comparison data for hydrodynamic model calibration | Reach-averaged | Open (NASA/CNES) |
| **GRWL (Global River Width from Landsat)** | **Reference Reaches** | Satellite-observed active channel width for benchmark reaches | Sub-pixel | CC BY 4.0 |

---

## 2. Four Accuracy Tiers

Every river reach and simulation in Tensora GIS carries a strict confidence tier:

| Accuracy Tier | Geometry & Hydrology Source | Confidence Badge |
|:---|:---|:---|
| **Estimated (Global)** | HydroRIVERS topology + empirical Leopold-Maddock hydraulic geometry ($h \propto Q^{0.4}$) | 🌍 `Estimated (Global)` |
| **Estimated (SWOT)** | SWOT-River-Volume bathymetry overlay (~240k reaches) | 📡 `Estimated (SWOT)` |
| **Calibrated (SWOT)** | Calibrated against NASA SWOT KaRIn radar altimetry (RiverSP WSE & slope) | 🛰️ `Calibrated (SWOT)` |
| **Surveyed (Validated)** | Survey-grade soundings or user-drawn cross-sections | 📐 `Surveyed (Validated)` |

---

## 3. Client-Side Data Architecture

To deliver real-time simulations in the browser without requiring gigabytes of downloads or remote compute clusters:
- **Curated Global Benchmarks**: 30 major river reaches pre-indexed in client memory with geodetic centerlines and empirical hydraulic geometry.
- **IndexedDB Local Storage**: User-modified meshes, CAD structures, imported LiDAR point clouds, and simulation states are cached locally.
- **Procedural Topological Synthesis**: For any location clicked on Earth outside the benchmark reaches, the engine queries Copernicus 30m DEM elevation data to procedurally generate a local river reach along the ground-truth terrain gradient.

---

## 4. Multi-Branch Tributary Confluence Handling

When simulating a river reach:
- Contributing tributaries within the $2\text{–}5\text{ km}$ buffer radius are detected from the topological skeleton.
- Upstream tributary discharges ($Q_{trib}$) are aggregated into composite boundary conditions and lateral cell inflows.
- Multi-branch momentum and mass conservation are preserved across all confluence angles.
