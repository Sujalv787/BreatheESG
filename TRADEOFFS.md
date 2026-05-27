# TRADEOFFS.md — Three Things Deliberately Not Built

---

## 1. Background Job Queue (Celery + Redis) for Ingestion

### What it is
Rather than parsing and saving a CSV within the HTTP request, a production system would enqueue the file as a background task, return immediately with a run ID, and let the worker process the file asynchronously. The frontend would poll or use websockets to show progress.

### Why I didn't build it
The entire ingestion stack (parse, validate, save) for the sample files completes in under 3 seconds synchronously. Adding Celery requires a message broker (Redis or RabbitMQ), a separate worker process, result backend configuration, and monitoring. On Render's free tier, this means two additional services (Redis and a background worker) with non-trivial coordination logic.

### What breaks without it
A file with 50,000+ rows will exceed Gunicorn's 30-second request timeout and return a 502 to the user. The `IngestionRun` will be left in `PROCESSING` status permanently. Enterprise SAP exports for large plants can easily reach 100k–500k rows per month.

### The real fix
Use Celery with Redis. The view creates the `IngestionRun`, enqueues a task with the run ID and file path (stored in S3 or similar), and returns 202 Accepted. The worker parses and updates the run status. The frontend polls `GET /api/runs/{id}/` every 2 seconds.

---

## 2. Emission Factor Versioning

### What it is
DEFRA publishes updated greenhouse gas conversion factors every year, typically in June. The 2023 UK grid electricity factor (0.20707 kg CO₂e/kWh) will be different from the 2024 factor (which was 0.18388). If a company re-reports historical data or adjusts their base year, the factor used must match the reporting year, not the current year.

### Why I didn't build it
This requires an `EmissionFactor` table with `(source, category, unit, year, value, published_at)` columns, a lookup service called during parsing, and a re-calculation mechanism for existing records when factors update. It also requires a decision about which year's factor to use: reporting year, factor publication year, or transaction year. This is a design conversation with the PM (and ultimately with the auditor) that cannot be resolved without knowing the reporting framework.

### What breaks without it
All records use 2023 DEFRA factors regardless of the transaction date. A January 2022 electricity invoice will be calculated using 2023 factors, which is technically incorrect for historical reporting. For a base year recalculation (common in CSRD and SBTi target-setting), this produces wrong numbers.

### The real fix
An `EmissionFactor` table. Parsers look up the factor for `(category, transaction_year)`. Records store `emission_factor_used` and `emission_factor_source` alongside `quantity_kg_co2e`. An `EmissionFactor` admin interface lets the sustainability team update factors annually without a code deploy.

---

## 3. Market-Based Scope 2 Calculation

### What it is
The GHG Protocol's Scope 2 Guidance defines two methods for calculating electricity emissions:
- **Location-based:** Uses the average grid emission factor for the country or region. Simple; no additional data required.
- **Market-based:** Uses supplier-specific emission factors based on contractual instruments (Guarantees of Origin, Renewable Energy Certificates, Power Purchase Agreements). Zero if the company buys 100% renewable electricity with matching certificates.

CSRD (the EU's Corporate Sustainability Reporting Directive, mandatory for large companies from 2025) requires companies to disclose both methods. TCFD strongly encourages market-based. UK SECR requires location-based by default.

### Why I didn't build it
Market-based requires an additional data source: the supplier's residual mix emission factor (published annually by RE-Source in Europe) and, for each meter, the contractual instruments (GOs or RECs) covering that meter during that period. This data does not come from the utility portal export. It requires either a separate data ingestion flow (a certificate registry upload) or direct integration with a guarantee registry (like REGO in the UK or EECS in Europe).

Without knowing the client's energy procurement setup, building the market-based calculation would produce incorrect results more often than correct ones.

### What breaks without it
If the client has renewable PPAs (Power Purchase Agreements), their Scope 2 market-based figure is zero, but our system reports their location-based figure (potentially several thousand tonnes CO₂e). If they're reporting to CSRD or disclosing to CDP, they will need to manually override our Scope 2 number.

### The real fix
A separate `EnergyAttribute` table storing certificate data (GO ID, period, MWh covered, supplier, issuing registry). A market-based calculation service that, for each `EmissionRecord` of scope 2, checks whether a certificate covers the meter/period and applies the supplier-specific factor (or zero) instead of the grid average. The location-based record is always stored; the market-based figure is a derived view.
