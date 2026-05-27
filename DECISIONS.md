# DECISIONS.md — Every Ambiguity Resolved

This document records every non-obvious decision made during the build: what the ambiguity was, what I chose, why, and what I would ask the PM about in a real engagement.

---

## 1. SAP Integration Format

### The ambiguity
SAP exposes data in at least four fundamentally different ways:
- **IDoc (Intermediate Document):** XML/EDI segments transmitted between SAP and external systems. The most "native" SAP integration format. Requires a middleware layer (SAP PI/PO or BTP Integration Suite) and an active RFC connection.
- **OData services:** REST-ish API served by SAP Netweaver Gateway (or BTP). Clean, modern, filterable. Requires Netweaver Gateway to be configured and network access to the SAP system.
- **BAPI (Business API):** RFC function module calls (e.g. `BAPI_MATERIAL_GETLIST`, `MB_READ_GOODS_MOVEMENT`). Requires SAP RFC SDK or `pyrfc`, which is not trivially available.
- **Flat file export (SE16N / MB52 / CO03):** A human-readable CSV or text export generated from SAP's table browser or standard reports. No middleware required — a user with SAP GUI access runs a transaction and downloads a file.

### What I chose
**Flat file CSV export from transaction SE16N** (table MSEG — Material Document Segment, which records goods movements including fuel issues).

### Why
For a new enterprise client onboarding, the fastest path to data is the one requiring least IT involvement on the client's side. IDoc requires SAP Basis team involvement to configure partner profiles and message types. OData requires the Netweaver Gateway team (separate from the functional SAP team) to expose an API. BAPI requires network access and RFC credentials.

A flat file export requires exactly one SAP user with read access to table MSEG to press F8 in SE16N. Most enterprise sustainability leads can do this within a day of being asked.

The specific columns I chose from MSEG:
- `WERKS` — Plant code (identifies the physical location)
- `MATNR` — Material number (identifies the material)
- `MENGE` — Quantity in base unit
- `MEINS` — Base unit of measure (e.g. `L`, `KG`, `LIT`)
- `BUDAT` — Posting date (the date the goods movement was posted in SAP)
- `KOSTL` — Cost center (identifies the business unit consuming the material)
- `TXZ01` — Short text / material description (the human-readable material name)

Date format handling: SAP exports BUDAT in `YYYYMMDD` when exported via SE16N, but German-locale SAP GUIs sometimes export as `DD.MM.YYYY`. The parser handles both.

### What I'd ask the PM
- "Does the client use SAP S/4HANA or SAP ECC? S/4HANA has Universal Journal (ACDOCA) which may be a better source than MSEG for cost accounting entries."
- "Do they track fuel by material number with consistent material descriptions, or do they use free-text purchase order line items? If the latter, regex matching on TXZ01 will have high error rates."
- "Is there a plant-to-geography lookup table we can use? WERKS codes mean nothing to us without a mapping."

---

## 2. Utility Data Integration Format

### The ambiguity
Utility (electricity) data comes in several forms:
- **Half-hourly (HH) smart meter data:** 48 readings per day per meter, MPAN-identified. Available from Data Collectors (DC) or via energy management platforms. Accurate but high-volume and not always accessible.
- **PDF bills from the utility supplier:** Requires OCR. Error-prone. Not machine-readable without significant preprocessing.
- **Utility supplier portal CSV export:** Most major UK suppliers (EDF, British Gas, E.ON) and US utilities (PG&E, Con Edison) offer a "download your usage history" CSV from their billing portal.
- **Utility API:** Some suppliers offer APIs (e.g. PG&E Share My Data, UK's ENSEK). Not universally available; requires OAuth setup per supplier.

### What I chose
**Portal CSV export** — the "download usage history" CSV that every major utility portal offers.

### Why
PDF parsing requires an OCR pipeline (Tesseract or a paid API). This is non-trivial to build reliably across different bill formats from different suppliers. Utility APIs are not universal — a client with 50 sites across 15 different suppliers would require 15 separate OAuth integrations. Half-hourly data is often available only through an energy management platform (like Elexon, ENGIE Digital, or Utiligroup) the client may not subscribe to.

The portal CSV export is universally available, requires no special credentials beyond a login, and can be downloaded monthly by the facilities manager as part of their existing workflow.

The columns I modeled (`meter_id`, `site_name`, `billing_period_start`, `billing_period_end`, `kwh_consumption`, `tariff_code`, `supplier`) match the common fields in exports from EDF Energy's MyAccount portal, British Gas for Business, and UK Power Networks' self-serve portal.

**Billing period handling:** UK utility billing periods are typically 28–35 days, not calendar months. The parser flags any billing period outside this range (e.g. a 62-day period often means a missed read was estimated, or two bills were merged). This is a real data quality issue in utility ingestion.

**Emission factor used:** UK DESNZ/BEIS Greenhouse Gas Conversion Factors 2023 — Grid average electricity: **0.20707 kg CO₂e/kWh** (Scope 2, location-based). This is the DEFRA-published factor used by most UK-based reporting frameworks. Market-based calculation (using renewable energy certificates) is not implemented.

### What I'd ask the PM
- "Is the client reporting under UK SECR, EU CSRD, or GHG Protocol? CSRD requires Scope 2 market-based calculations, which needs Guarantees of Origin data."
- "Does the client use a third-party energy management platform? If so, we might be able to pull from their API rather than asking the facilities team to manually export."
- "Are any sites on renewable PPAs or have onsite generation? Those would be Scope 1, not Scope 2."

---

## 3. Corporate Travel Integration Format

### The ambiguity
Corporate travel data lives in:
- **Concur Expense:** SAP's travel and expense platform. Exposes a REST API (`v4.expenses`) with OAuth. Also produces a standard expense report export in CSV/XLS format.
- **Navan (formerly TripActions):** Modern TMC. REST API with API key auth. Richer data model (per-trip segments).
- **Cytric / Serko / other TMCs:** Less common, API-dependent.
- **Manual spreadsheets:** Many mid-market companies have no TMC and track travel in Excel maintained by office managers.

### What I chose
**Concur expense report CSV export.** Specifically, the standard "Export to CSV" available from the Expense Report List in Concur.

### Why
Concur is the dominant enterprise TMC with ~85% market share among Fortune 500 companies. Setting up the Concur API requires registering an OAuth application with SAP, obtaining company-level credentials from the client's Concur admin, and handling token refresh. For a prototype, the CSV export is immediately actionable.

The Concur export format contains: trip ID, traveler email, travel date, origin, destination, transport type, distance (if Concur calculated it), and nights (for hotels). This matches the columns in the `parsers/travel.py` schema.

**Distance estimation:** Concur sometimes omits distance for flights when the booking was made outside the system. The parser falls back to a Haversine great-circle calculation using a hardcoded database of 22 major international airports. This is an approximation — great-circle distance is shorter than actual routing — but it is the same method used by DEFRA's carbon calculation guidance for flight emissions when distance is not provided.

**Emission factors used (DEFRA 2023):**
- Flight: 0.255 kg CO₂e/km (economy class, international, per passenger, with radiative forcing multiplier of 1.89×)
- Train (UK): 0.041 kg CO₂e/km (national rail average)
- Car (rental/personal): 0.171 kg CO₂e/km (average petrol car)
- Hotel: 31.0 kg CO₂e/night (UK business hotel average)

### What I'd ask the PM
- "Is the client on Concur? If it's Navan, their API is cleaner and I'd prefer an API pull."
- "Are flight emissions being reported with or without radiative forcing? Some frameworks (TCFD, CSRD) require radiative forcing; others (GHG Protocol) leave it optional. This changes the factor from ~0.140 to ~0.255 kg/km."
- "Are personal vehicles in scope? If so, do we get mileage reimbursement reports?"

---

## 4. Multi-tenancy: Implicit Filtering vs Explicit Scoping

### The ambiguity
Two main approaches exist:
- **Explicit filtering:** Every view and queryset manually calls `.filter(tenant=request.user.tenant)`. Simple to reason about, verbose, and prone to missed filters.
- **Implicit filtering:** A thread-local middleware sets the active tenant; a custom manager applies the filter automatically on every `objects.all()` / `objects.filter()` call.

### What I chose
**Implicit filtering via thread-local middleware** (`TenantMiddleware` + `TenantManager`).

### Why
With 5+ models all needing tenant isolation, explicit filtering requires remembering to add `.filter(tenant=...)` in every view, every management command, every serializer that touches the DB. One missed call leaks data. The implicit approach makes the correct behavior the default — you have to opt out with `.unfiltered` to bypass it.

### Tradeoff
Thread-locals are invisible. A developer reading `EmissionRecord.objects.all()` cannot tell from that line alone that it will be filtered. This creates debugging surprises when running code outside a request context (e.g. in tests, shell, or management commands). All management commands must use `Model.unfiltered.all()` instead.

---

## 5. Authentication: JWT vs Session

### What I chose
**JWT (via `djangorestframework-simplejwt`)** with a 7-day access token.

### Why
The frontend is a separate Vite/React SPA making cross-origin API calls. Session cookies require `SameSite` configuration and same-origin constraints. JWTs are stateless, work cleanly across origins, and are the standard pattern for SPA + DRF setups.

**7-day access token lifetime:** Long enough that analysts aren't interrupted by re-login prompts during a work session. Short enough that a leaked token has a bounded window. A production system would implement refresh token rotation.

### What I'd ask the PM
- "Is SSO required? An enterprise client using Okta or Azure AD would expect SAML/OIDC, not email/password login."

---

## 6. Synchronous vs Asynchronous Ingestion

### What I chose
**Synchronous ingestion** — the entire parse + save happens within the HTTP request.

### Why
For a prototype handling files up to ~5,000 rows, synchronous processing completes within 2–5 seconds. Adding Celery + Redis adds significant infrastructure complexity (a broker service, worker processes, result backend, and monitoring). Render free tier does not support persistent background workers.

### The limit
Gunicorn's default timeout is 30 seconds. A 50,000-row SAP file would exceed this. The real fix is a task queue. See TRADEOFFS.md.

---

## 7. Emission Factor Source

### What I chose
**DEFRA / DESNZ Greenhouse Gas Conversion Factors 2023 (UK Government publication)**.

### Why
It is publicly available, annually updated, and the standard used in UK SECR (Streamlined Energy and Carbon Reporting) mandatory reporting. For a UK-based ESG platform onboarding UK enterprise clients, DEFRA is the correct source. US clients would use EPA eGRID for electricity and EPA's GHG Equivalencies Calculator for transport.

The factors are hardcoded in the parsers because the assignment scope is a prototype. A production system would store them in an `EmissionFactor` table versioned by year and source.

---

## 8. Database: SQLite (dev) vs PostgreSQL (prod)

### What I chose
SQLite for local development; PostgreSQL on Render (via `DATABASE_URL` env var and `dj-database-url`).

### Why
SQLite requires zero setup for a new developer running the project locally. `dj-database-url` parses the `DATABASE_URL` connection string that Render injects automatically, switching to PostgreSQL in production without any code change.

The one real-world concern: `JSONField` behaves identically in both (Django 4.x supports JSONField on SQLite 3.38+), so there is no dev/prod divergence for our data model.
