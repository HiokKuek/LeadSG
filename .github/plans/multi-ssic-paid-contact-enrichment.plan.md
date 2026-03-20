# Multi-SSIC Paid Contact Enrichment Plan

## Objective
Add an authenticated, prepaid enrichment workflow where users select one or more SSIC codes, view estimated Google API usage and cost, redeem a unique payment code tied to their account, and run async enrichment jobs that fetch website and phone details with strict cost controls.

## Confirmed Product Constraints
- Enrichment scope is SSIC-only.
- Users can select multiple SSIC codes per run.
- Billing is manual/off-platform; admin issues payment codes.
- User must redeem a payment code before starting a job.
- Cache enriched results in Postgres and reuse cache on subsequent runs.
- Keep existing `GET /api/search` contract backward-compatible.

## Proposed Architecture

### 1) Auth and access
- Add account auth via Auth.js.
- Add paid gating at enrichment endpoints only.
- Keep search endpoints unchanged initially.

### 2) Prepaid code model
- Add payment code issuance and redemption tables.
- Bind code redemption to exactly one authenticated account.
- Track purchased/remaining paid-call quota.

### 3) Cache-first enrichment
- Add `company_contact_enrichment` table keyed by `uen`.
- Join with `active_entities` by `uen` during preflight and result serving.
- Use TTL (`expires_at`) to decide cache refresh.

### 4) Job execution
- Async job model with queue + worker.
- Recommended queue on NAS: Redis + BullMQ.
- Worker performs per-company pipeline:
  1. Cache check
  2. Places Text Search (id-only)
  3. Place Details (paid) only if needed
  4. Persist fresh result + status

### 5) Cost and quota controls
- User preflight estimate:
  - candidate companies by selected SSIC set
  - projected paid Place Details calls
  - estimated payable amount
  - do not expose cache hit/miss internals
- Admin quote estimate:
  - candidate companies by selected SSIC set
  - estimated cache hits/misses
  - estimated provider (Google) cost
  - estimated user charge and gross margin
- Hard-stop guards:
  - user quota
  - redeemed-code quota
  - global monthly cap
- Atomic quota reservation at job start.

### 6) Logging and auditability
- Structured logs from API + worker with correlation IDs.
- Persist spend/audit metadata in DB.
- Include stop reasons (`budget_exceeded`, `quota_exhausted`, etc.).

## Data Model (Planned)
- `users`
- `payment_codes`
- `payment_code_redemptions`
- `company_contact_enrichment`
- `enrichment_jobs`
- `enrichment_job_items`

## API Surface (Planned)
- `POST /api/enrichment/preflight`
- `POST /api/enrichment/redeem`
- `POST /api/enrichment/jobs`
- `GET /api/enrichment/jobs/:id`
- `GET /api/enrichment/results`
- `POST /api/enrichment/admin/quote` (admin quote + optional payment code issuance)

## Schema Source of Truth + ETL
- Manage app/enrichment tables via Drizzle (`db:generate`, `db:push`).
- Keep ETL script focused on ACRA mirror tables and `active_entities` view lifecycle.
- Keep shared column types aligned between ETL bootstrap and Drizzle schema.
- In fresh environments, run schema migration before enrichment endpoint usage.

## Frontend UX (Planned)
In `SearchPanel`:
1. Multi-SSIC selector
2. Preflight card (counts, estimated paid calls, estimated cost)
3. Payment code input + redeem action
4. Start job button (enabled only after valid redemption)
5. Progress panel (queued/running/partial/completed/failed)
6. Render enriched contact columns

## Infrastructure (NAS / OpenMediaVault)
- Run Dockerized worker on NAS.
- Keep worker private (VPN/tunnel/internal network).
- Configure restart policies and persistent logs volume.
- Ensure reliable connectivity from app to queue and DB.
- Add idempotent job handling for restarts/retries.

## Rollout Sequence
1. Schema and migrations
2. Auth + code redemption endpoints
3. Preflight estimator
4. Queue + worker pipeline
5. Frontend integration
6. Logging/audit + alerts
7. Staged rollout behind `ENRICHMENT_ENABLED`

## Verification Checklist
- Preflight estimate accuracy (projected vs actual paid calls)
- Code redemption binding to account
- Cache hit behavior on repeated SSIC runs
- Hard-stop budget enforcement
- Worker restart/retry resilience on NAS
