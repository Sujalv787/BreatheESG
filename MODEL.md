# MODEL.md — Data Model and Design Rationale

## Overview

The Breathe ESG Ingestion Platform stores emissions data that originates from three distinct enterprise data sources, gets normalized into a common representation, and is reviewed by analysts before being locked for external audit. The model is built around four core concerns:

1. **Multi-tenancy** — data from different client companies must be completely isolated
2. **Source-of-truth** — every normalized record traces back to the exact byte it came from
3. **Audit trail** — every status change is permanently recorded with who did it and why
4. **Scope classification** — GHG Protocol Scope 1 / 2 / 3 are first-class citizens, not a tag

---

## Entity Relationship

```
Tenant ──< User
Tenant ──< IngestionRun ──< RawRow ──< EmissionRecord ──< AuditEvent
                                           │
                                     approved_by → User
```

---

## Models

### `Tenant`

```
id          BigAutoField (PK)
name        CharField(255)
slug        SlugField(unique)
created_at  DateTimeField(auto)
```

**Why this exists:** Every enterprise client is a separate tenant. Tenants share the same database but are isolated by a thread-local middleware that automatically filters all querysets to the current user's tenant. This is an implicit multi-tenancy approach (single schema, discriminator FK) rather than schema-per-tenant. The tradeoff: simpler to operate, but a misconfigured query could theoretically leak data between tenants. For a prototype this is acceptable; production would add row-level security at the DB layer.

**`slug`** is a URL-safe unique identifier (`acme-corp`) used to identify tenants in non-PK contexts (e.g. future API routing, subdomain mapping).

---

### `User`

Extends Django's `AbstractUser`.

```
email       EmailField(unique)    ← primary login field
username    CharField             ← kept for Django admin compatibility
tenant      ForeignKey(Tenant)
```

`USERNAME_FIELD = 'email'` — analysts log in with email, not a username. This is standard practice in SaaS tools and matches how enterprise SSO integrations expect to identify users.

`tenant` FK is nullable to allow Django superusers (who need cross-tenant admin access) to exist without a tenant assignment.

A custom `TenantUserManager` overrides `get_queryset()` to apply tenant filtering automatically. This means `User.objects.all()` always returns only users in the current tenant during a web request, without callers needing to remember to filter.

---

### `IngestionRun`

```
id             BigAutoField (PK)
tenant         ForeignKey(Tenant)
source_type    CharField  choices: SAP | UTILITY | TRAVEL
uploaded_by    ForeignKey(User)
file_name      CharField(255)
status         CharField  choices: PENDING | PROCESSING | DONE | FAILED
row_count      IntegerField
error_count    IntegerField
created_at     DateTimeField(auto)
```

**Why `IngestionRun` exists as its own entity:** A single file upload is a batch event. Separating the run from its records means:

- An analyst can see "3 SAP files ingested this week" at a glance
- Errors are attributable to a specific upload, not a specific record in isolation
- Re-ingesting a file is a new run, not an overwrite — preserving history
- `error_count` lets the UI show a warning badge without scanning all rows

**`PROCESSING` status:** The run transitions `PENDING → PROCESSING → DONE/FAILED` within a single atomic transaction. This means if the server crashes mid-parse, the run stays `PROCESSING` and can be inspected. A production system would add a background task queue (Celery) and a heartbeat, but synchronous processing is acceptable for files up to ~50k rows within a 30-second request window.

---

### `RawRow`

```
id           BigAutoField (PK)
tenant       ForeignKey(Tenant)
run          ForeignKey(IngestionRun)
row_number   IntegerField
raw_data     JSONField         ← verbatim CSV row as key-value dict
parse_error  TextField(null)   ← null means the row parsed successfully
```

**This is the most important design decision in the model.** Every row of every uploaded file is stored verbatim in `raw_data` before any transformation. This means:

- An analyst can see exactly what the source system sent
- If the emission factor changes next year, we can re-derive `quantity_kg_co2e` from the original data
- Parse failures are stored as `RawRow` records with `parse_error` set — they are not silently dropped
- For SAP data, `raw_data` looks like `{"WERKS": "1000", "MATNR": "MAT-0042", "MENGE": "500", "MEINS": "L", "BUDAT": "20240115", "KOSTL": "CC-PROD", "TXZ01": "Diesel B7"}`

**Why `JSONField` over a normalized raw table?** The three source formats have completely different column structures. A single flexible JSON column is simpler and queryable enough for the review use case. PostgreSQL's JSONB supports indexing on specific keys if we need to query by, say, `MATNR` in the future.

---

### `EmissionRecord`

```
id                 BigAutoField (PK)
tenant             ForeignKey(Tenant)
run                ForeignKey(IngestionRun)
raw_row            ForeignKey(RawRow)         ← 1:1 in practice; 1:N allowed for split records
scope              CharField  choices: 1 | 2 | 3
category           CharField(100)
description        TextField
quantity_kg_co2e   DecimalField(18, 4)        ← normalized output, always kg CO₂e
unit_original      CharField(50)              ← e.g. "L", "kWh", "km", "nights"
value_original     DecimalField(18, 4)        ← e.g. 500.0 (litres of diesel)
source_type        CharField                  ← denormalized from run for query efficiency
period_start       DateField
period_end         DateField
status             CharField  choices: PENDING | APPROVED | REJECTED | FLAGGED
flag_reason        TextField(null)
created_at         DateTimeField(auto)
approved_by        ForeignKey(User, null)
approved_at        DateTimeField(null)
```

**Scope assignment logic:**
- SAP fuel materials (diesel, petrol, oil) → **Scope 1** (direct combustion, company-owned vehicles/plant)
- SAP non-fuel materials (procurement) → **Scope 3, Category 1** (purchased goods and services)
- Utility electricity consumption → **Scope 2** (market-based or location-based; we use the UK grid average emission factor 0.20707 kg CO₂e/kWh from DESNZ/BEIS 2023)
- Corporate travel (flights, train, car, hotel) → **Scope 3, Category 6** (business travel)

**`quantity_kg_co2e`** is the single normalized output. All source units are converted at parse time:
- Litres of diesel → kg using density (0.835 kg/L for B7 diesel) → multiply by emission factor (2.68 kg CO₂e/kg, DEFRA 2023)
- kWh → multiply by grid factor (UK 2023: 0.20707 kg CO₂e/kWh, DESNZ)
- Flight km → multiply by economy-class factor (0.255 kg CO₂e/km per passenger, DEFRA 2023)
- Train km → 0.041 kg CO₂e/km (UK national rail average, DEFRA 2023)
- Car km → 0.171 kg CO₂e/km (average petrol car, DEFRA 2023)
- Hotel nights → 31.0 kg CO₂e/night (UK business hotel, DEFRA 2023)

**`period_start` / `period_end`:** For SAP records, these are both the posting date (`BUDAT`), since SAP records individual transactions. For utility records, these are the billing period dates (which are not necessarily calendar months — a standard UK utility billing period is 28–35 days). For travel, both fields are the travel date.

**Why store `unit_original` and `value_original`?** Normalization is lossy. Storing the source values lets an analyst see "500 litres" rather than "418 kg CO₂e" and verify the conversion. It also enables re-normalization if emission factors are updated.

**`status` machine:**
- `PENDING` — default on ingest
- `APPROVED` — analyst has reviewed and signed off; `approved_by` and `approved_at` are set
- `REJECTED` — analyst has rejected the record (e.g. duplicate, out-of-scope)
- `FLAGGED` — automatically set by the parser for anomalies (unrecognized unit, non-standard billing period); requires `flag_reason`

Records can only transition through `AuditEvent` creation — direct field updates without an audit event are not surfaced in the UI.

---

### `AuditEvent`

```
id         BigAutoField (PK)
record     ForeignKey(EmissionRecord)
user       ForeignKey(User)
action     CharField(50)     ← mirrors EmissionRecord.status values
note       TextField(blank)  ← analyst's written justification
timestamp  DateTimeField(auto)
```

**Why a separate audit table rather than `history` fields on `EmissionRecord`?** A single record can have multiple status transitions (e.g. `PENDING → FLAGGED → APPROVED`). A flat `approved_by` / `approved_at` on `EmissionRecord` only captures the most recent action. `AuditEvent` is an append-only log of every action, with analyst notes, meeting the audit trail requirement.

In a production system, this table would be write-protected at the database level (INSERT only, no UPDATE/DELETE) to prevent tampering.

---

## Multi-Tenancy Implementation

**Thread-local middleware pattern:**

```python
# ingestion/middleware.py
_thread_locals = threading.local()

class TenantMiddleware:
    def __call__(self, request):
        tenant = getattr(request.user, 'tenant', None)
        set_current_tenant(tenant)
        response = self.get_response(request)
        set_current_tenant(None)  # always clear after request
        return response
```

Every model that inherits `TenantBaseModel` has a custom manager that filters by the thread-local tenant. This means `EmissionRecord.objects.all()` is implicitly scoped to the current user's tenant in every view, with no per-view filter needed.

**Bypass for admin/seeding:** `Model.unfiltered.all()` uses the standard `models.Manager()` and skips tenant filtering. This is used in management commands (`python manage.py seed`) where no HTTP request context exists.

---

## What This Model Does Not Handle

- **Emission factor versioning:** DEFRA updates factors annually. We hard-code the 2023 values. A production system would have an `EmissionFactor` table versioned by year and factor source.
- **Multi-site within a tenant:** The model has no `Site` or `Facility` entity. A large enterprise client will have dozens of sites; queries would need a site FK to support per-site reporting.
- **Currency / spend data:** Some Scope 3 categories (Category 1, purchased goods) can be computed spend-based (£ × economic factor) as an alternative to activity-based (kg × density × EF). We only implement activity-based.
- **Market-based vs location-based Scope 2:** We use location-based (grid average). Market-based requires renewable energy certificate data that we do not ingest.
