# Global River Knowledge Graph — 8.5M Reach Census & Provenance Report

**Generated**: 2026-11-08T16:21:25.975Z
**Target**: Tensora GIS Client-Side Digital Twin
**Version**: Knowledge Graph v4.0 (Draft v4.0 Specification)

---

## 1. Executive Summary: The Global River Census

Tensora GIS integrates an indexed, pre-loaded Global River Knowledge Graph designed to simulate **any river or tributary on Earth (~8.5 million reaches)** with instant 2D shallow-water hydrodynamics, depth-averaged RANS turbulence ($k-\varepsilon$, $k-\omega$ SST), and coupled sediment transport (Exner bed evolution).

| Dataset | Entity Count | Role in Knowledge Graph | Spatial Resolution | License |
|:---|:---|:---|:---|:---|
| **HydroRIVERS / HydroSHEDS** | **~8,500,000 reaches** | Primary topological skeleton (catchment $\ge 10\text{ km}^2$, $Q \ge 0.1\text{ m}^3/\text{s}$) | Vector reaches | CC-BY-4.0 |
| **SWORD v16** | **~248,000 reaches** | High-resolution reach overlay (rivers $>30\text{ m}$ width) | $\sim 10\text{ km}$ segments | Open (NASA/CNES) |
| **SWOT-River-Volume** | **~240,000 reaches** | Active channel bathymetry & prior cross-section geometry | Reach-averaged | Open (Zenodo) |
| **GRADES-hydroDL** | **~2,940,000 reaches** | Daily discharge time series (1979–2019) + 10-yr/100-yr flood flows | Daily | CC BY-NC 4.0 |
| **GRDC-Caravan** | **~6,000 gauges** | Curated reference discharge observations & WMO calibration | Station | CC-BY-4.0 |
| **GRWL** | **Global ($>30\text{ m}$)** | Satellite-derived water body width from Landsat | Sub-pixel | CC BY 4.0 |
| **Copernicus GLO-30 DEM** | **Global (100% land)** | Digital Elevation Model for floodplain topography & carving | $30\text{ m}$ | Free / Open |

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

## 3. Spatial Sharding Architecture

To serve ~8.5 million reaches without requiring gigabytes of downloads or backend servers:
- **1° × 1° Spatial Tiles**: Reaches are partitioned into ~14,200 land shards (`<5 MB` compressed per shard).
- **Client-Side Lazy Loading**: Shards are requested on-demand as the user pans or zooms in Leaflet.
- **IndexedDB Tier**: Downloaded and simulated reaches are persisted locally with TTL expiration.
- **Procedural Topological Synthesis**: For any point clicked on Earth outside pre-cached reaches, the deterministic procedural synthesizer generates the local reach and upstream tributary confluences using Strahler scaling and DEM slope.

---

## 4. Multi-Branch Tributary Confluence Handling

When simulating a river reach:
- Contributing tributaries within the $2\text{–}5\text{ km}$ buffer radius are detected from the topological skeleton.
- Upstream tributary discharges ($Q_{trib}$) are aggregated into composite boundary conditions and lateral cell inflows.
- Multi-branch momentum and mass conservation are preserved across all confluence angles.
