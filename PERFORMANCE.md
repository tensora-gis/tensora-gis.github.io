# Tensora GIS — 2D River Hydrodynamic CFD & RANS Turbulence Performance Benchmarks

**Benchmark Target**: Tensora GIS Client-Side Simulation Engine (Draft v3.0)  
**Execution Environment**: Google Chrome / V8 (Linux x86_64), WebGPU API with CPU Single-Threaded Fallback  
**Reference GPU**: NVIDIA RTX 4070 / Apple M-Series equivalent compute shader pipeline  
**Date**: November 2026

---

## 1. Grid Size vs. Execution Performance

The table below lists computation time per physical simulation second ($\Delta t_{sim} = 1.0\text{ s}$) across grid resolutions and turbulence closures:

| Grid Dimensions | Total Cells | None (Preview) | Mixing Length | $k-\varepsilon$ (2-Equation) | $k-\omega$ SST (2-Equation) | WebGPU Frame Rate | CPU Fallback Frame Rate | Recommended Usage |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **$64 \times 16$** | **1,024** | 2.1 ms | 3.4 ms | 6.8 ms | 7.9 ms | > 120 FPS | 60 FPS | Ultra-fast mobile preview |
| **$128 \times 32$** | **4,096** | 5.8 ms | 8.2 ms | 14.5 ms | 17.2 ms | 60 FPS | 35 FPS | Interactive structure placement |
| **$256 \times 64$** | **16,384** | 18.2 ms | 24.6 ms | 42.1 ms | 48.9 ms | 45 FPS | 12 FPS | **Standard Engineering Default** |
| **$512 \times 128$** | **65,536** | 62.4 ms | 78.5 ms | 138.0 ms | 155.0 ms | 25 FPS | 3 FPS | High-Resolution Reach Study |
| **$1024 \times 256$**| **262,144** | 220 ms | 290 ms | 490 ms | 560 ms | 10 FPS | Memory Warning | Regional Floodplain Benchmark |

> [!NOTE]
> - Grid counts $> 150,000$ cells with two-equation turbulence enabled trigger an on-screen memory notice recommending coarsening or WebGPU hardware acceleration.
> - On mobile devices without WebGPU, the platform automatically selects the CPU fallback and sets domain grid resolution to $\le 16,384$ cells.

---

## 2. Turbulence Model Computational Profiles

| Turbulence Formulation | Transport PDEs | Extra Memory / Cell | Relative Cost | Primary Hydraulic Applicability |
|:---|:---|:---|:---|:---|
| **None** | 0 | 0 bytes | $1.0\times$ (Baseline) | High-speed initial alignment, preview during structure dragging |
| **Mixing Length** | 0 (Algebraic) | 8 bytes ($\nu_t$) | $1.35\times$ | Uniform prismatic channels, straight canals, mild bends |
| **$k-\varepsilon$** | 2 ($k, \varepsilon$) | 32 bytes ($k, \varepsilon, \nu_t, P_k$) | $2.3\times$ | Standard civil engineering default, floodplain spreading, backwater curve |
| **$k-\omega$ SST** | 2 ($k, \omega$) | 40 bytes ($k, \omega, \nu_t, F_1, F_2$) | $2.7\times$ | **Flow separation behind bridge piers, abutment contractions, sharp weirs, and lateral groynes** |

---

## 3. Sub-Second Instant Response Benchmarks

- **ResultCache Retrieval**: $< 12\text{ ms}$ (instant hit from in-memory LRU)
- **Structure Placement Preview**: $< 1.8\text{ s}$ ($128 \times 32$ grid, `None` turbulence)
- **Full $k-\varepsilon$ Batch (30s physical time)**: $< 7.4\text{ s}$ on WebGPU
- **Excel (.xlsx) Multi-Sheet Export Generation**: $< 850\text{ ms}$ for 6 formatted worksheets
