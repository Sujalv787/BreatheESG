# SOURCES.md — Research Behind Each Data Source

---

## Source 1: SAP — Fuel and Procurement Data

### What I researched

SAP's primary transactional table for material movements is **MSEG** (Material Document Segment), which records every goods issue, goods receipt, and stock transfer in an SAP system. The related header table is MKPF (Material Document Header). Together these form the basis for a physical inventory and consumption trail.

Key fields in MSEG relevant to emissions:
- `WERKS` — Plant (a legal/organizational unit in SAP, e.g. factory, office)
- `MATNR` — Material number (the SAP internal ID for the material — not human readable without a master data lookup via MARA/MAKT tables)
- `MENGE` — Quantity in base unit of measure
- `MEINS` — Base unit of measure (SAP uses ISO unit codes: `L` for litre, `KG` for kilogram, `M3` for cubic metre, `TO` for metric ton)
- `BUDAT` — Posting date in the fiscal period
- `KOSTL` — Cost center (the business unit the consumption is attributed to)
- `TXZ01` — Short text / material description from the purchase order line item

**Date format:** SAP stores dates internally as `YYYYMMDD` strings. When exported via SE16N with a German-locale GUI (common in European deployments), the export may apply locale-specific date formatting (`DD.MM.YYYY`). Both are handled in the parser.

**German column headers:** In German-locale SAP GUIs, column headers in SE16N exports appear as the ABAP technical name (not translated), so they are consistent regardless of locale. The column names above (`WERKS`, `MATNR`, etc.) are ABAP field names, not English labels — they appear identically in UK and German SAP systems. The "German headers" issue is more relevant to legacy SAPScript/ALV reports than SE16N table exports.

**What the data actually looks like (a realistic MSEG row for a fuel issue):**

| WERKS | MATNR | MENGE | MEINS | BUDAT | KOSTL | TXZ01 |
|-------|-------|-------|-------|-------|-------|-------|
| 1000 | MAT-0042 | 500.000 | L | 20240115 | CC-PROD-01 | Diesel B7 EN590 |
| 2000 | MAT-0019 | 250.000 | KG | 20240118 | CC-MAINT | Heavy Fuel Oil 380 cSt |
| 1000 | MAT-0091 | 1200.000 | L | 20240201 | CC-FLEET | Unleaded Petrol 95 RON |

**Why SE16N and not a standard SAP report:** SAP has a "Goods Movement" standard report (MB51) that aggregates MSEG data. However, MB51 requires configuring output fields and lacks the short text field (TXZ01 comes from the purchase order, not MSEG directly — in a real integration, a JOIN between MSEG and EKKN/MAKT is needed). For a prototype, SE16N with a manually configured layout is the fastest path.

### What I learned

1. **Unit inconsistency is real:** Different plants may book the same material in different units (one plant books diesel in litres, another in kilograms). The parser handles L→kg conversion using density, but an unknown unit is flagged rather than silently dropped.

2. **Material numbers are meaningless without master data:** A `MATNR` of `MAT-0042` tells us nothing. The material's classification (fuel vs. lubricant vs. packaging) comes from the material master (`MARA.MATKL` — material group). For this prototype, we infer fuel type from the short text (`TXZ01`) using keyword matching. In production, a material group lookup table would be needed.

3. **Cost centers don't map to geography:** `KOSTL` identifies a business unit (e.g. `CC-PROD-01` = Production Cost Center 01), not a physical location. Scope 1 reporting requires plant-level geography to determine which national grid factor applies. Without a `WERKS`-to-country mapping, all records are implicitly assumed to be UK-based.

### Sample data design

The sample SAP file (`backend/sample_data/sap_sample.csv`) contains 20 rows:
- 12 diesel fuel issues across two plants, varying quantities (200–800L), two date formats mixed
- 4 petrol fuel issues at a fleet cost center
- 2 heavy fuel oil issues (in KG, not L) to test kg-direct path
- 1 row with an unrecognized unit (`GAL` — US gallons, which we flag rather than convert)
- 1 row with a missing BUDAT to test parse error handling

### What would break in a real deployment

- **No material group lookup:** We rely on TXZ01 text matching. A material with TXZ01 = "EN590 B7 #2" would be recognized as diesel, but "Transport fuel - see PO 450001234" would not.
- **No plant-to-country mapping:** All emission factors assume UK. A German plant would need DEHST factors, a US plant would need EPA factors.
- **One fiscal period at a time:** SE16N exports are typically run per fiscal month. An automated integration would need date-range parameterization.
- **No duplicate detection:** If the same file is uploaded twice, all rows are inserted twice. Production needs a deduplication key (e.g. hash of `WERKS + MATNR + BUDAT + MENGE + KOSTL`).

---

## Source 2: Utility — Electricity Data

### What I researched

UK electricity metering infrastructure assigns each meter a **MPAN (Meter Point Administration Number)** — a 21-digit identifier. Half-hourly (HH) meters (typically commercial premises > 100kVA) produce 48 settlement readings per day. Non-half-hourly (NHH) meters produce monthly estimated or actual reads.

UK utility supplier portals that offer CSV exports:
- **EDF Energy MyAccount for Business:** Monthly consumption summary CSV with meter ID, period start/end, kWh consumption
- **British Gas for Business:** "Download your usage data" — similar structure
- **E.ON Next Business:** Monthly billing CSV, includes tariff breakdown
- **Drax (Opus Energy):** CSV download with MPAN, site, period, kWh, unit rate, standing charge

The common structure across all of these (and what I modeled):

| meter_id | site_name | billing_period_start | billing_period_end | kwh_consumption | tariff_code | supplier |
|----------|-----------|---------------------|-------------------|----------------|------------|---------|
| 1012345678901 | Manchester HQ | 2024-01-08 | 2024-02-07 | 24500.00 | FLEX-HH-2024 | EDF Energy |
| 1012345678901 | Manchester HQ | 2024-02-08 | 2024-03-08 | 21800.00 | FLEX-HH-2024 | EDF Energy |

**Key design insight — billing periods don't align with calendar months:** The first billing period above starts Jan 8 and ends Feb 7 (31 days). This is because UK utility billing periods are anchored to the meter read date, not to the calendar. A missed read can produce a 62-day estimated period (two months merged), which the parser flags as anomalous. A quarterly read produces a 90-day period. These anomalies are real and frequent in UK utility data.

**Emission factor:** UK DESNZ (formerly BEIS) publishes the "Government greenhouse gas conversion factors for company reporting" annually. The 2023 grid average electricity factor for the UK is **0.20707 kg CO₂e/kWh** (Scope 2, location-based). This accounts for the generation mix (coal, gas, nuclear, wind, solar) weighted by the actual generation profile.

This factor has dropped significantly over time as renewables penetration increases:
- 2019: 0.2556 kg CO₂e/kWh
- 2021: 0.2334 kg CO₂e/kWh
- 2023: 0.20707 kg CO₂e/kWh

### What the sample data looks like

The sample utility file (`backend/sample_data/utility_sample.csv`) contains 12 rows covering three sites over Q1 2024:
- **Manchester HQ (HH meter):** 4 rows, standard 30–31 day billing periods
- **Birmingham Office (NHH meter):** 4 rows, including one 62-day estimated read (flagged by parser)
- **Edinburgh Data Centre (HH meter):** 3 rows, standard periods
- **1 row with missing billing_period_end** to test parse error handling

### What would break in a real deployment

- **Single emission factor:** We use one factor for all electricity. Different grid regions (Scottish grid is greener than England/Wales) have slightly different factors. A multi-site client with Scottish and English sites should ideally use region-specific factors.
- **No market-based calculation:** If the client has a renewable PPA, their Scope 2 market-based figure is zero. Our system reports location-based regardless.
- **No half-hourly data support:** HH meters produce 48 rows per day. Our model stores one row per billing period. This is fine for monthly reporting but loses granularity needed for demand-side response analysis or time-of-use Scope 2.
- **Currency / cost data ignored:** The tariff_code is stored in raw_data and description but not used. A full utility integration would also normalize cost data to support spend-based Scope 3 Category 3 (fuel and energy related activities) calculations.

---

## Source 3: Corporate Travel — Flights, Hotels, Ground

### What I researched

**Concur (SAP Concur)** is the dominant enterprise travel and expense platform (~85% of Fortune 500 companies use it). Their standard expense report export (available from Reports → Export to File in Concur Intelligence) produces a CSV with the following relevant fields:

From actual Concur expense extract schema documentation:
- `ReportId` / `EntryId` — unique identifiers for the expense report and line item
- `EmployeeID`, `EmployeeEmail` — traveler identification
- `TransactionDate` — date of the travel
- `ExpenseTypeName` — e.g. "Airfare", "Hotel", "Taxi", "Train"
- `VendorName` — airline, hotel chain, etc.
- `City` — city of service (for hotels/ground)
- Origin/destination may appear in comment fields or not at all (Concur is expense-focused, not booking-focused)

**Concur TripLink data** (from connected booking tools): When travel is booked through Concur Travel (not just expensed through Concur Expense), richer booking data is available including origin/destination airport codes, booking class, and distance. This is the source I primarily modeled.

**Why airport codes, not city names:** The Concur TripLink segment data uses IATA airport codes (LHR, JFK, etc.) rather than city names. This is more precise (London has three airports) and easier to use for distance calculation. City names require geocoding, which adds external API dependency.

**Haversine distance calculation:** When distance is not provided, I compute the great-circle distance between the origin and destination airport using the Haversine formula and a hardcoded coordinate database for 22 major international airports. The great-circle distance is shorter than the actual flight path (which avoids restricted airspace, follows airways, etc.) by roughly 5–10%. DEFRA's carbon calculation guidance for flights explicitly endorses great-circle distance + a 1.08 uplift factor for routing inefficiency. I apply the DEFRA flight factor (0.255 kg CO₂e/km) which already incorporates radiative forcing (RFI = 1.89×), so the resulting figure is on the higher/more conservative side.

**Emission factors used (DEFRA 2023 GHG Conversion Factors):**

| Mode | Factor | Unit | Notes |
|------|--------|------|-------|
| Flight (economy) | 0.255 | kg CO₂e/km/pax | Includes radiative forcing (RFI 1.89×), international average |
| Train (UK) | 0.041 | kg CO₂e/km | National rail average |
| Car (rental) | 0.171 | kg CO₂e/km | Average petrol car |
| Hotel | 31.0 | kg CO₂e/night | UK business hotel average |

### What the sample data looks like

The sample travel file (`backend/sample_data/travel_sample.csv`) contains 15 rows:
- 8 flight segments (LHR→JFK, CDG→SIN, BOM→LHR, etc.) — some with distance provided, some without (testing Haversine fallback)
- 4 hotel stays (city center, varying night counts)
- 2 train journeys (London–Manchester, London–Edinburgh)
- 1 car rental (3-day, distance provided)
- The airport code DB covers all origins and destinations in the sample — a row with "DMM" (Dammam, Saudi Arabia) was intentionally excluded to demonstrate the parse error path

### What would break in a real deployment

- **22-airport database is too small:** A large enterprise with travel to secondary cities (say, Manchester MAN → Riyadh RUH via Amsterdam AMS) would fail on MAN or RUH not being in the database. Production would use a full IATA airport database (10,000+ airports with coordinates).
- **No cabin class differentiation:** Business class flights emit roughly 2.5× economy per passenger due to larger seat footprint. Concur booking data includes cabin class; we ignore it and always apply economy factors.
- **Hotel factor is a single UK average:** A five-star New York hotel has a very different emission factor from a budget UK B&B. DEFRA 2023 does not provide per-city hotel factors; the HCMI (Hotel Carbon Measurement Initiative) methodology does but requires integration with a hotel dataset.
- **Ground transport is simplified:** We use "car" as a single category. Concur distinguishes taxi, Uber, personal car, rental car — each with different emission factors (an EV taxi is 0 Scope 1, a diesel taxi is higher than average car).
- **No duplicate trip detection:** If a traveler expenses the same LHR→JFK flight twice (once as "Airfare" and once reimbursed via a corporate card charge), we'd count it twice.
