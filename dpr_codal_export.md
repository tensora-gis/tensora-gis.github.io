# Tensora GIS — Indian Codal Detailed Project Report (DPR) Excel Export Specification (`dpr_codal_export.md`)

> **Target Audience**: Agentic Coding Assistants (Antigravity / LLM Code Agents) & Core Contributors
>
> **Canonical Module Order**: Strictly follows `README.md` (`1. Stormwater` $\to$ `2. Water` $\to$ `3. Wastewater` $\to$ `4. River CFD`)
>
> **Governing Indian Standards**: **IRC** (Indian Roads Congress), **CPHEEO** (Central Public Health and Environmental Engineering Organisation), **BIS / IS** (Bureau of Indian Standards), and **CWC** (Central Water Commission)
>
> **Runtime Constraints**: Must execute identically via client-side `ExcelJS` (for static GitHub Pages builds) and server-side `/api/export-excel` (`Express` + `ExcelJS`).

## Agent Execution Protocol (Read Before Writing Code)

When implementing this specification in an agentic IDE (such as Antigravity):

1. **Execute Sequentially by Module**: Implement and verify **one module at a time** in the exact order below (`Shared DPR Builder` $\to$ `Module 1` $\to$ `Module 2` $\to$ `Module 3` $\to$ `Module 4`).

2. **Live Auditable Excel Formulas Only**: Every calculated cell in the DPR worksheets **must** be written as a dynamic `ExcelJS` formula object (`cell.value = { formula: '...' }`) referencing input cells and the `00_Codal_Constants` lookup sheet. Never write static hardcoded strings for derived engineering values.

3. **Standardized Worked Calculation Audit Columns**: Every module must include a `02_Worked_Calculations` worksheet formatted with the exact 9-column scrutiny layout:
   `Step No. | Design Parameter | Governing Formula | Numerical Substitution | Computed Value | Unit | Indian Code & Clause | Permissible Limit | Compliance Status`

4. **Automated Conditional Formatting**: Apply `ExcelJS` conditional formatting rules to every `Compliance Status` column (`"PASS"` $\to$ Green fill `#DCFCE7` / dark green text `#166534`; `"MARGINAL"` $\to$ Amber fill `#FEF3C7` / `#92400E`; `"FAIL"` $\to$ Red fill `#FEE2E2` / `#991B1B`).

5. **Preserve Dual-Mode Export Parity**: Ensure both browser-side workbook builders (`src/utils/*.ts`, `src/river/export/*.ts`) and Express backend endpoints (`src/server/`) share the exact same DPR sheet generator logic.

## Shared DPR Workbook Architecture (`src/utils/dprExcelBase.ts`)

Create a shared helper module `src/utils/dprExcelBase.ts` used by all four engineering modules:

### 1. Design Standard Selector State

* Add a global export configuration option `designStandard: 'INDIAN_DPR' | 'INTERNATIONAL'` (defaulting to `'INDIAN_DPR'` when DPR export is triggered, or selectable via a dropdown toggle in `src/components/Header.tsx` and module export bars).

* Store optional DPR project metadata (`projectTitle`, `packageNo`, `clientAuthority` e.g., NHAI / MoRTH / PHE / Jal Jeevan Mission / AMRUT / CWC, `consultantName`, `designReturnPeriodYears`).

### 2. Standardized DPR Worksheet Styling & Audit Helpers

* **`buildTitleBanner(sheet, meta)`**: Renders a formal DPR engineering title block (Rows 1–5) displaying Project Name, Package/Chainage, Design Code Standard (`IRC / CPHEEO / IS`), DEM Elevation Provenance (`Copernicus GLO-30` / `NASA SRTM`), and UTC Timestamp.

* **`appendWorkedCalculationRow(sheet, rowSpec)`**: Appends a formatted row to `02_Worked_Calculations` containing:

  1. `Step No.` (e.g., `1.1`, `1.2`)

  2. `Design Parameter` (plain engineering description)

  3. `Governing Formula` (human-readable symbolic formula text)

  4. `Numerical Substitution` (dynamic Excel `=CONCAT(...)` formula substituting actual cell values into the equation string so reviewers see exact numbers plugged into the formula)

  5. `Computed Value` (live Excel formula `{ formula: '...' }` formatted to 2–3 decimal places)

  6. `Unit` (`m`, `m/s`, `m3/s`, `Pa`, `kN`, `kg`)

  7. `Indian Code & Clause` (exact code number, year, and clause)

  8. `Permissible Limit` (codal threshold text or formula reference)

  9. `Compliance Status` (live `=IF(...)` formula returning `"PASS"`, `"MARGINAL"`, or `"FAIL"`)

* **`applyComplianceConditionalFormatting(sheet, colLetter, startRow, endRow)`**: Registers `containsText` conditional formatting rules for `"PASS"`, `"MARGINAL"`, and `"FAIL"`.

## 1. Stormwater Catchment & Stream Delineation (Cross-Drainage DPR)

### 1.1 Objective & Codal Scope

Upgrade the current single-sheet Stormwater workbook (`src/utils/stormwaterSnapshot.ts` and `src/server/`) into a **5-Worksheet Cross-Drainage (CD) Structure DPR Package** compliant with **IRC:SP:13-2022** (*Guidelines for the Design of Small Bridges and Culverts*), **IRC:SP:42-2014** (*Guidelines on Road Drainage*), **IRC:78-2014** (*Standard Specifications and Code of Practice for Road Bridges — Foundations and Substructure*), and **IS 458:2021** (*Precast Concrete Pipes*).

### 1.2 Worksheet Structure & Live Excel Formulas

1. **`00_Codal_Constants`**:

   * Runoff coefficient $P$ table (**IRC:SP:13-2022**, Table 4.1: Steep rocky $0.90$, Hilly $0.75$, Cultivated plains $0.50$, Sandy/permeable $0.35$).

   * Regional empirical coefficients: Dickens $C_d$ ($11.4$ North Indian plains, $14.0\text{--}19.5$ Central/hilly, $22.0\text{--}25.0$ Western Ghats), Ryves $C_y$ ($6.8$ within $25\text{ km}$ of coast, $8.5$ between $25\text{--}160\text{ km}$, $10.2$ limited hills).

   * Lacey's silt factor $K_{sf} = 1.76 \sqrt{d_{50}}$ lookup table (**IRC:SP:13-2022**, Table 7.1: Fine silt $0.60$, Medium sand $1.00$, Coarse sand $1.30$, Bajri/gravel $1.75$).

2. **`01_CD_Executive_Summary`**:

   * Embeds the high-resolution **70%-framed catchment delineation snapshot**, corridor alignment chainage, DD & DMS crossing coordinates, DEM source attribution, and a linked KPI scorecard pulling final design discharge, proposed culvert size, afflux, and foundation scour depth from Sheets `02` and `03`.

3. **`02_Hydrology_Worked_Calcs`**:

   * **Step 1.1 — Catchment Relief Drop (**$\Delta H$**)**: `=B8-B9` (Ridge contour elevation minus culvert invert elevation, $\text{m}$).

   * **Step 1.2 — Time of Concentration (**$t_c$**)**:
     

     $$
     t_c = 0.87 \left(\frac{L^3}{H}\right)^{0.385}
     $$

     
     Excel formula: `=0.87*POWER((POWER(L_km,3)/H_m),0.385)` (**IRC:SP:13-2022**, Cl. 4.4.2).

   * **Step 1.3 — Critical Rainfall Intensity (**$I_c$**)**:
     

     $$
     I_c = \frac{F}{T} \left(\frac{T + 1}{t_c + 1}\right)
     $$

     
     Excel formula: `=(F_mm/T_hr)*((T_hr+1)/(tc_hr+1))` (**IRC:SP:13-2022**, Cl. 4.4.3).

   * **Step 1.4 — Rational Peak Discharge (**$Q_r$**)**:
     

     $$
     Q_r = 0.028 \, P \, f \, A \, I_c
     $$

     
     Excel formula: `=0.028*P_coeff*f_spread*A_ha*Ic_mmhr` (**IRC:SP:13-2022**, Cl. 4.4.1).

   * **Step 1.5 — Empirical Peak Envelopes (**$Q_d, Q_y, Q_i$**)**:

     * Dickens: $Q_d = C_d A^{3/4}$ (`=Cd*POWER(A_km2,0.75)`) (**IRC:SP:13-2022**, Cl. 4.3.1).

     * Ryves: $Q_y = C_y A^{2/3}$ (`=Cy*POWER(A_km2,2/3)`) (**IRC:SP:13-2022**, Cl. 4.3.2).

     * Inglis (Ghat/Deccan): $Q_i = \frac{124 A}{\sqrt{A + 10.4}}$ (`=(124*A_km2)/SQRT(A_km2+10.4)`).

   * **Step 1.6 — Governing Design Discharge (**$Q_{\text{design}}$**)**: `=MAX(Qr, Qd, Qy)` with compliance check flagging if empirical discharge exceeds Rational by $> 50\%$ (**IRC:SP:13-2022**, Cl. 4.2).

4. **`03_Culvert_Hydraulics_Scour`**:

   * **Step 2.1 — Lacey's Linear Regime Waterway (**$W$**)**:
     

     $$
     W = 4.825 \sqrt{Q_{\text{design}}}
     $$

     
     Excel formula: `=4.825*SQRT(Q_design)` (**IRC:SP:13-2022**, Cl. 5.2).

   * **Step 2.2 — Proposed Culvert Barrel Capacity & Velocity (**$V$**)**: Computes wetted area $A_w$, hydraulic radius $R_h$, Manning full/partial capacity, and barrel velocity $V = Q_{\text{design}} / (N_{\text{barrels}} \cdot A_w)$, checking $0.6\text{ m/s} \le V \le 3.0\text{ m/s}$ (**IRC:SP:13-2022**, Cl. 5.3 & **IRC:SP:50-2013**).

   * **Step 2.3 — Headwater Depth Ratio (**$HW/D$**) & Upstream Afflux (**$h_a$**)**: Evaluates Molesworth / orifice afflux (**IRC:SP:13-2022**, Cl. 5.4), flagging `"FAIL"` if $h_a > 0.30\text{ m}$ or $HW/D > 1.20$.

   * **Step 2.4 — Mean & Maximum Scour Depth (**$d_{sm}, d_{\max}$**)**:
     

     $$
     d_{sm} = 1.34 \left(\frac{D_b^2}{K_{sf}}\right)^{1/3}, \qquad d_{\max} = 2.0 \, d_{sm}
     $$

     
     Excel formula: `=1.34*POWER((POWER(Db,2)/Ksf),1/3)` (**IRC:SP:13-2022**, Cl. 7.2; **IRC:78-2014**, Cl. 703.2).

5. **`04_Catchment_Hypsometry`**: Elevation-area distribution and formation cut cross-section coordinates.

### 1.3 Target Files & Verification Gate

* **Files**: `src/utils/dprExcelBase.ts` (new), `src/utils/stormwaterSnapshot.ts`, `src/server/` Excel route, `src/components/ReportCard.tsx`.

* **Verification**: Extend `scripts/verify-stormwater-excel.ts` to assert all 5 worksheets exist, live formulas evaluate without `#REF!`/`#NAME?`, and run `npx tsx scripts/verify-stormwater-excel.ts`.

## 2. Water Distribution Modelling & Transient Surge (CPHEEO / JJM / AMRUT DPR)

### 2.1 Objective & Codal Scope

Upgrade the existing 11-worksheet workbook (`src/utils/waterExcelExport.ts`) into a **13-Worksheet CPHEEO Water Supply DPR Package** compliant with the **CPHEEO Manual on Water Supply and Treatment (3rd Ed.)**, **IS 1172:1993** (*Basic Requirements for Water Supply, Drainage and Sanitation*), **IS 9668:1990** (*Code of Practice for Provision and Maintenance of Water Supplies for Fire Fighting*), **IS 8329:2000** (*Centrifugally Cast Ductile Iron Pressure Pipes*), and **IS 4984:2016** (*High Density Polyethylene Pipes for Water Supply*).

### 2.2 New & Upgraded DPR Worksheets (`waterExcelExport.ts`)

1. **`00_CPHEEO_Codal_Constants`**:

   * Per-capita supply norms (**CPHEEO Manual**, Table 2.1 & **IS 1172:1993**): $55\text{ lpcd}$ (Rural JJM FHTC), $70\text{ lpcd}$ (Towns without sewerage), $135\text{ lpcd}$ (Cities with sewerage), $150\text{ lpcd}$ (Metro cities) + $15\%$ Unaccounted-For Water (UFW / NRW).

   * Peak factor lookup table (**CPHEEO Manual**, Cl. 10.3.1): $3.0$ ($< 50{,}000$ pop), $2.5$ ($50{,}000\text{--}200{,}000$ pop), $2.0$ ($> 200{,}000$ pop).

   * Hazen-Williams roughness $C$ (**CPHEEO Manual**, Table 6.1): DI/CI mortar-lined ($140$), HDPE/uPVC ($145$), Steel welded ($130$), Existing aged CI ($100$).

   * Pipe Pressure Rating (`PN` / Class) lookup table (**IS 8329** K7/K9 & **IS 4984** PN6/PN8/PN10/PN12.5/PN16).

2. **`02_Worked_Hydraulic_Calcs` (Line-by-Line CPHEEO Audit Sheet)**:

   * **Step 1.1 — Population Projection & Net + Gross Water Demand**: Audits total network demand against population $\times$ lpcd $\times (1 + \text{UFW}\%)$.

   * **Step 1.2 — Fire Fighting Demand (**$Q_F$**)**:
     

     $$
     Q_F = 100 \sqrt{P}
     $$

     
     Excel formula: `=100*SQRT(Pop_thousands)` ($\text{kL/day}$, **CPHEEO Manual**, Cl. 2.2.7 & **IS 9668:1990**).

   * **Step 1.3 — Hazen-Williams Pipe Friction Loss (**$h_f$**)**:
     

     $$
     h_f = \frac{10.67 \, L \, Q^{1.852}}{C^{1.852} \, D^{4.87}}
     $$

     
     Excel formula: `=(10.67*L_m*POWER(Q_m3s,1.852))/(POWER(C_hw,1.852)*POWER(D_m,4.87))` (**CPHEEO Manual**, Cl. 6.2.2), checking unit headloss $h_f / L \le 5.0\text{ m/km}$ (trunk mains) / $8.0\text{ m/km}$ (distribution) and velocity $0.6\text{ m/s} \le V \le 3.0\text{ m/s}$.

   * **Step 1.4 — Terminal Residual Pressure Compliance**: Checks nodal residual head against **CPHEEO Manual**, Cl. 10.3.2 ($7.0\text{ m}$ single-storey, $12.0\text{ m}$ two-storey, $17.0\text{ m}$ three-storey).

   * **Step 1.5 — ESR Balancing Storage Mass-Curve Check**: Evaluates cumulative supply vs. 24-hr EPS diurnal demand curve (**CPHEEO Manual**, Cl. 10.6), verifying `Tank Live Volume >= Balancing Storage + Fire Reserve`.

   * **Step 1.6 — Transient Water Hammer & Pipe Class Check**:
     

     $$
     \Delta H = \frac{a \cdot \Delta V}{g}, \qquad H_{\text{total}} = H_{\text{static}} + \Delta H \le 1.25 \times H_{\text{PN}}
     $$

     
     Checks maximum surge head against **IS 8329** / **IS 4984** nominal pressure rating and flags negative cavitation head ($\text{HGL} \le -5.0\text{ m}$, **CPHEEO Manual**, Cl. 6.8).

3. **Upgraded Existing Register Sheets**:

   * Inject live `CPHEEO_Status` (`=IF(...)`) columns and conditional formatting into `Junction_Calculations`, `Pipe_Hydraulics`, `Fire_Flow_Register`, and `Transient_Surge_Analysis`.

### 2.3 Target Files & Verification Gate

* **Files**: `src/utils/waterExcelExport.ts`, `src/components/WaterDistributionModelling.tsx`.

* **Verification**: Extend `scripts/water-transient-selftest.ts` to verify the 13-sheet DPR workbook generation and run `npx tsx scripts/water-transient-selftest.ts`.

## 3. Wastewater Collection & SWMM Sewer Hydraulics (CPHEEO Sewerage DPR)

### 3.1 Objective & Codal Scope

Upgrade the existing 10-worksheet workbook (`src/utils/wastewaterExcelExport.ts`) into a **12-Worksheet CPHEEO Sewerage DPR Package** compliant with the **CPHEEO Manual on Sewerage and Sewage Treatment Systems (2013, Part A: Engineering)**, **IS 458:2021** (*Precast Concrete Pipes — NP3/NP4*), and **IS 5600:2002** (*Sewage and Drainage Pumps*).

### 3.2 New & Upgraded DPR Worksheets (`wastewaterExcelExport.ts`)

1. **`00_CPHEEO_Sewer_Constants`**:

   * Sewage return factor ($80\%$ of per-capita water supply) and groundwater infiltration allowance ($5{,}000\text{--}50{,}000\text{ L/km/day}$ or $250\text{--}500\text{ L/ha/day}$, **CPHEEO Sewerage Manual 2013**, Part A, Cl. 3.3 & 3.4).

   * Contributory population peak factor table (**CPHEEO Sewerage Manual**, Table 3.2): $3.0$ ($\le 20{,}000$), $2.5$ ($20{,}000\text{--}50{,}000$), $2.25$ ($50{,}000\text{--}750{,}000$), $2.0$ ($> 750{,}000$).

   * Maximum allowable $d/D$ filling ratio table (**CPHEEO Sewerage Manual**, Cl. 3.7): $0.67$ for $D \le 400\text{ mm}$, $0.75$ for $400\text{ mm} < D \le 900\text{ mm}$, $0.80$ for $D > 900\text{ mm}$.

   * Self-cleansing velocity & boundary tractive stress table (**CPHEEO Sewerage Manual**, Table 3.4 & 3.5): $V \ge 0.60\text{ m/s}$ (present peak DWF), $V \ge 0.80\text{ m/s}$ (ultimate peak DWF), $\tau \ge 1.0\text{--}2.0\text{ Pa}$, max non-scouring velocity $\le 3.0\text{ m/s}$ (RCC/DI).

2. **`02_Worked_Sewer_Calcs` (Line-by-Line CPHEEO Audit Sheet)**:

   * **Step 1.1 — Dry Weather Flow (DWF), Peak Flow & Wet-Weather I&I**:
     

     $$
     Q_{\text{design}} = \left(Q_{\text{DWF}} \times PF\right) + Q_{\text{I\&I}}
     $$

     
     Excel formula referencing `00_CPHEEO_Sewer_Constants` peak factor table (**CPHEEO Sewerage Manual**, Cl. 3.4 & Table 3.2).

   * **Step 1.2 — Partial-Flow Depth Ratio (**$d/D$**) Compliance**: Live formula `=IF(D_mm<=400, IF(d_D<=0.67,"PASS","FAIL"), IF(D_mm<=900, IF(d_D<=0.75,"PASS","FAIL"), IF(d_D<=0.80,"PASS","FAIL")))` (**CPHEEO Sewerage Manual**, Cl. 3.7).

   * **Step 1.3 — Self-Cleansing & Scour Velocity Check**: Checks $V_{\text{peak}} \ge 0.60\text{ m/s}$ and $V_{\text{peak}} \le 3.00\text{ m/s}$ (**CPHEEO Sewerage Manual**, Table 3.4).

   * **Step 1.4 — Boundary Tractive Force (**$\tau$**) Check**:
     

     $$
     \tau = \gamma \cdot R_h \cdot S_0 \ge 1.5\text{ Pa}
     $$

     
     Excel formula: `=9810*Rh_m*Slope` (**CPHEEO Sewerage Manual**, Table 3.5).

   * **Step 1.5 — Minimum Earth Cushion & Drop Manhole Check**: Checks `Ground_Elev - Crown_Elev >= 1.0 m` (flags `"MARGINAL: Concrete Encasement Required"` if $< 1.0\text{ m}$) and flags drop connection if `Upstream_Invert - Downstream_Invert > 0.60 m` (**CPHEEO Sewerage Manual**, Cl. 3.11 & 3.12; **IS 458:2021**).

   * **Step 1.6 — Lift Station Wet-Well Detention & Pump Cycle Audit**: Checks `Detention_Time <= 30 min` at DWF (to prevent septicity and $\text{H}_2\text{S}$ generation) and `Pump_Starts_Per_Hr <= 6` (**CPHEEO Sewerage Manual**, Cl. 4.3; **IS 5600**).

3. **Upgraded Existing Register Sheets**:

   * Inject live `CPHEEO_Status` columns and conditional formatting into `Manhole_Register`, `Gravity_Pipe_Hydraulics`, and `Pump_Stations`.

### 3.3 Target Files & Verification Gate

* **Files**: `src/utils/wastewaterExcelExport.ts`, `src/components/WastewaterModelling.tsx`.

* **Verification**: Extend `scripts/wastewater-selftest.ts` to verify the 12-sheet DPR workbook generation and run `npx tsx scripts/wastewater-selftest.ts`.

## 4. River Analysis & 2D Hydrodynamic CFD (IRC:89 & IS 12094 River Training DPR)

### 4.1 Objective & Codal Scope

Upgrade the existing 6-worksheet workbook (`src/river/export/`) into an **8-Worksheet Indian River Engineering & Training Works DPR Package** compliant with **IRC:89-2019** (*Guidelines for Design and Construction of River Training & Control Works for Road Bridges*), **IRC:78-2014** (*Standard Specifications and Code of Practice for Road Bridges — Foundations and Substructure*), **IS 12094:2000** (*Guidelines for Planning and Design of River Embankments / Levees*), and the **CWC Flood Management Manual**.

### 4.2 New & Upgraded DPR Worksheets (`src/river/export/`)

1. **`00_IRC89_Codal_Constants`**:

   * Lacey's silt factor $f = 1.76 \sqrt{d_{50}}$ lookup table by riverbed material ($d_{50}$ in $\text{mm}$).

   * Maximum scour depth multipliers (**IRC:89-2019**, Table 4.1 & **IRC:78-2014**, Cl. 703.2): Straight reach ($1.27 R$), Moderate bend ($1.50 R$), Severe bend ($1.75 R$), Right-angled bend ($2.00 R$), Bridge piers ($2.00 d_{sm}$), Spur/groyne nose ($2.00\text{--}2.50 R$).

   * Guide bund & groyne geometry rules (**IRC:89-2019**, Cl. 5.3 & 6.2): Upstream guide bund length $1.25 L\text{--}1.50 L$, Downstream length $0.25 L$, Groyne spacing $2.0\text{--}2.5 \times$ projecting length.

   * Flood embankment freeboard table (**IS 12094:2000**, Cl. 5.2): $1.0\text{ m}$ for $Q < 3{,}000\text{ m}^3\text{/s}$, $1.5\text{ m}$ for $Q \ge 3{,}000\text{ m}^3\text{/s}$.

2. **`02_Worked_River_Training_Calcs` (Line-by-Line IRC:89 / IS 12094 Audit Sheet)**:

   * **Step 1.1 — Lacey's Regime Waterway (**$W$**) & Normal Scour Depth (**$R$**)**:
     

     $$
     W = 4.825 \sqrt{Q}, \qquad R = 0.473 \left(\frac{Q}{f}\right)^{1/3}
     $$

     
     Excel formulas: `=4.825*SQRT(Q_m3s)` and `=0.473*POWER((Q_m3s/f_silt),1/3)` (**IRC:89-2019**, Cl. 4.2 & 4.3).

   * **Step 1.2 — Bridge Pier & Abutment Scour Audit (2D CFD vs. IRC:78)**: Compares 2D CFD Exner bed scour depth ($\Delta z_{b,\max}$) and HEC-18 scour against **IRC:78-2014**, Cl. 703.2 codal maximum scour ($2.0 \, d_{sm}$), recommending safe foundation grip level.

   * **Step 1.3 — Guide Bund Layout & Curvature Audit**: Evaluates user-placed guide walls in the CFD model against **IRC:89-2019**, Cl. 5.3 upstream ($1.25 L\text{--}1.50 L$) and downstream ($0.25 L$) length ratios.

   * **Step 1.4 — Spur Dike / Groyne Spacing & Nose Scour Audit**: Evaluates groyne spacing ($2.0\text{--}2.5 \times$ length) and local nose scour against **IRC:89-2019**, Cl. 6.2 & 6.4.

   * **Step 1.5 — Slope Pitching Stone Weight (**$W_{\text{stone}}$**) & Launching Apron Thickness**:
     

     $$
     W_{\text{stone}} = \frac{0.02323 \, S_s \, V_{\text{CFD}}^6}{K (S_s - 1)^3}, \qquad T_{\text{apron}} = 1.5 \, T_{\text{pitching}}
     $$

     
     Excel formula driven directly by maximum local 2D CFD bank velocity $V_{\text{CFD}}$ (**IRC:89-2019**, Cl. 5.4 & 5.5).

   * **Step 1.6 — Levee / Embankment Freeboard Audit**: Compares modeled levee crest elevation minus 2D CFD peak $\text{WSE}$ against **IS 12094:2000**, Cl. 5.2 ($1.0\text{ m}$ or $1.5\text{ m}$ minimum freeboard).

3. **Upgraded Existing Register Sheets**:

   * Inject live `IRC89_Status` columns and conditional formatting into `Hydraulic_Structures` and `Sediment_Transport_Morphodynamics`.

### 4.3 Target Files & Verification Gate

* **Files**: `src/river/export/` Excel builder, `src/components/RiverAnalysisModelling.tsx`.

* **Verification**: Extend `scripts/river-cfd-selftest.ts` to validate the 8-sheet IRC:89 / IS 12094 DPR workbook export and run `npx tsx scripts/river-cfd-selftest.ts`.