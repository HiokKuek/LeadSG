# Journey Log — Multi-SSIC Paid Contact Enrichment

## 2026-03-20

### Planning kickoff
- Reviewed current LeadSG architecture and constraints in `.github/copilot-instructions.md`.
- Confirmed extension direction with product decisions:
  - SSIC-only enrichment
  - multi-SSIC selection in one run
  - manual payment + unique code redemption per authenticated account
  - cache results in Postgres and avoid duplicate Google calls
  - async execution for user-triggered jobs

### Key design choices captured
- Keep `GET /api/search` stable and additive.
- Add explicit cache table keyed by `uen` linked to `active_entities`.
- Add payment code lifecycle with redemption tracking and quota accounting.
- Add hard-stop cost controls before and during execution.
- Prefer worker on NAS (OpenMediaVault) over managed worker hosts.

### Operational approach
- API server handles auth, preflight, redemption, job submission, and polling.
- NAS worker handles long-running enrichment jobs.
- Queue-backed architecture to decouple user request latency from Google API processing.
- Structured logging + audit tables planned for reconciliation and debugging.

### Next implementation milestones
1. Add Drizzle schema and migrations for users/payment/cache/jobs.
2. Add enrichment API endpoints (`preflight`, `redeem`, `jobs`, `status`, `results`).
3. Add queue/worker scaffold and NAS deployment artifacts.
4. Integrate multi-SSIC + code redemption flow in `SearchPanel`.
5. Add tests for quotas, cache, and job lifecycle.

### Phase 2 progress update
- Implemented enrichment endpoints in app backend:
  - `POST /api/enrichment/preflight`
  - `POST /api/enrichment/redeem`
  - `POST /api/enrichment/jobs`
  - `GET /api/enrichment/jobs/:id`
  - `GET /api/enrichment/results`
- Added admin-only endpoint `POST /api/enrichment/admin/quote`:
  - computes user charge estimate vs provider (Google) cost estimate
  - supports optional payment code issuance for manual payment flow
- Updated user preflight response to hide cache hit/miss internals while still showing estimated price.

### Migration + ETL compatibility note
- Initial `db:push` failed because Drizzle tried altering `entities_a.uen` while `active_entities` view depended on it.
- Resolved by aligning Drizzle schema with ETL bootstrap (`uen` type as `TEXT`).
- Regenerated migrations and reapplied `db:push` successfully.
- Decision retained: Drizzle is source of truth for app/enrichment tables; ETL remains focused on ACRA mirror workflow.

### Phase 2.5 progress update (Auth + frontend controls)
- Integrated Auth.js credentials flow with session-based auth.
- Replaced temporary `x-user-id` enrichment auth with session-derived user resolution.
- Added login page and homepage auth controls for visual testing.
- Added preview enrichment controls UI to exercise preflight/redeem/job endpoints from browser.
- Added `users.password_hash` schema support and generated follow-up migration.
