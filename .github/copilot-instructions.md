# LeadSG 📞 - Project Summary

## Core Objective
Build a high-performance search tool allowing users to query Singapore companies by SSIC code with:
- Zero-downtime ETL using blue-green table swapping
- Type-safe Next.js App Router backend
- Minimalist Tailwind v4 frontend with URL-synced search and smooth pagination
- Weekly automated data updates via GitHub Actions

---

## Tech Stack & Architecture

### Frontend
- **Framework**: Next.js 16 (App Router), React 19.2.4, TypeScript 5
- **Styling**: Tailwind CSS v4, custom shadcn-style components
- **State**: nuqs 2.8.9 for URL query sync (`?ssic=62011&page=2`)
- **Components**: `SearchPanel` (client), Suspense boundary required (Next.js 16 quirk)
- **UX**: Pagination overlay loader, session cache + page prefetch for faster next/prev

### Backend API
- **Route**: `GET /api/search?ssic=XXXXX&page=N`
- **ORM**: Drizzle 0.45.1 with lazy PostgreSQL client (supports serverless)
- **Validation**: Zod 4.3.6 for SSIC regex (`^\d{5}$`) and positive integer page number
- **Response**: Paginated JSON with `data`, `pagination`, and `totals` (`liveCompanies`, `lastUpdatedAt`)
- **Caching**: `Cache-Control: public, max-age=30, stale-while-revalidate=120`

### Database
- **Engine**: PostgreSQL 16 (local Docker or Neon cloud)
- **Schema**: `entities_a`, `entities_b`, `active_entities` (view), `etl_metadata`
- **Columns**: UEN, entity_name, street_name, primary_ssic_code, entity_status_description
- **Indexes**: On `primary_ssic_code` for fast SSIC lookups
- **Pattern**: Blue-green swap (atomic view switch, zero downtime)

### ETL Pipeline (Python)
- **File**: `etl/acra_data_mirror.py` (~210 lines)
- **Data Source**: data.gov.sg ACRA entity registry (27 datasets: A-Z + Others)
- **Logic**:
  1. Initiate async CSV generation via `/initiate-download`
  2. Poll with backoff (6s intervals, 10 retries) via `/poll-download`
   3. Download CSV with hardcoded filter `entity_status_description LIKE "Live"` (matches `Live` + `Live Company`)
   4. Normalize columns (handle aliases), filter valid UEN/SSIC
   5. Merge datasets, deduplicate, load via PostgreSQL COPY
   6. Atomically swap view to new table in transaction
   7. Update `etl_metadata.last_updated_at` on successful run
- **Rate Limiting**: 13s delay between datasets (respects 5 req/min free tier)
- **Filtering**: Hardcoded `LIKE "Live"` behavior (do not rely on env filter)

### Automation
- **CI/CD**: GitHub Actions workflow (`.github/workflows/acra-etl.yml`)
- **Schedule**: Weekly (Mondays 03:00 UTC)
- **Secrets Required**: DATABASE_URL, ACRA_API_KEY
- **Optional Secrets**: ACRA_POLL_RETRIES, ACRA_POLL_WAIT_SECS, ACRA_RATE_LIMIT_DELAY
- **Deployment**: Vercel (Next.js), Neon (PostgreSQL)

---

## Key Code Patterns Established

### 1. Lazy DB Initialization (Serverless-Safe)
```python
# src/lib/db.ts
let client: Database | null = null;

export function getDb(): Database {
  if (!client) client = new Database(process.env.DATABASE_URL!);
  return client;
}
```
Avoids build-time DATABASE_URL requirement; connects only at runtime.

### 2. Blue-Green Table Swap (Zero Downtime)
```python
# etl/acra_data_mirror.py
1. detect_active_table() → find which table is current
2. truncate inactive table
3. bulk load new data via COPY
4. create indexes
5. swap_active_view() → atomic view switch in transaction
6. conn.commit()
```
Queries always hit `SELECT * FROM active_entities`; they never see empty tables.

### 3. Nuqs URL Sync (Client State)
```typescript
// src/components/search-panel.tsx
const [ssic, setSsic] = useQueryState('ssic', parseAsString);
const [page, setPage] = useQueryState('page', parseAsInteger);
// Auto-persists to URL: ?ssic=62011&page=2
```
Browser back/forward works; state survives page reload.

### 4. Column Normalization with Aliases
```python
# etl/acra_data_mirror.py → resolve_column_name()
ALIASES = {
  "uen": ["uen", "uen_no", "entity_uen"],
  "entity_name": ["entity_name", "entityname", "business_name", "name"],
  "street_name": ["street_name", "street", "address_street_name"],
  "primary_ssic_code": ["primary_ssic_code", "primary_ssic", "ssic_code", "ssic"],
   "entity_status_description": ["entity_status_description", "entity_status", "status"],
}
```
Handles variations in source CSV column names without hardcoding.

### 5. Environment-Driven Configuration
```bash
# .env.local / .env.example
DATABASE_URL=postgres://...
ACRA_API_KEY=v2:...
ACRA_POLL_RETRIES=10
ACRA_POLL_WAIT_SECS=6
ACRA_RATE_LIMIT_DELAY=13
```
No hardcoded secrets; all runtime config from environment except status filter (hardcoded in ETL logic).

### 6. Last-Updated Metadata
```sql
-- Updated each successful ETL run
etl_metadata(id = 1, last_updated_at = NOW())
```
API surfaces this as `totals.lastUpdatedAt` for frontend display.

### 7. Short-Term Caching
- API responses include short cache headers (`max-age=30`, `stale-while-revalidate=120`)
- Frontend uses sessionStorage TTL cache for page results and summary counters
- Frontend prefetches next page after each successful load

---

## Current Status

✅ **Completed**:
- Full-stack scaffolding (Next.js 16 + Drizzle + Tailwind v4)
- Search API with pagination, totals, and caching headers
- Frontend UI with smooth pagination loader and short-term client caching
- Python ETL with async polling, hardcoded Live-like filter, blue-green swap, and metadata timestamp
- GitHub Actions weekly automation
- Production build validation (passes lint + TypeScript check)

🔄 **Next Steps**:
1. **Monitor ETL runtime**: Ensure scheduled workflow remains healthy weekly
2. **Observe cache behavior**: Tune TTL if fresher counters are needed
3. **Production hardening**: Add basic telemetry/log alerts for ETL failures

---

## Known Issues/Edge Cases

1. **Next.js Root Warning During Build**
   - Multiple lockfiles detected in parent folder can trigger a Turbopack root warning
   - Consider setting `turbopack.root` in `next.config.ts` or cleaning extra lockfiles

2. **Next.js 16 Suspense Boundary Requirement**
   - `useQueryState` from nuqs requires Suspense boundary wrapper
   - Already fixed in `src/app/page.tsx`; don't remove the fallback

3. **Database Connection at Build Time**
   - Next.js tries to access DATABASE_URL during build
   - Mitigated by lazy initialization; only instantiate at runtime
   - Works locally and on Vercel (serverless)

4. **Rate Limiting on Free Tier**
   - data.gov.sg allows 5 requests/minute
   - Script delays 13s between datasets (26 datasets = ~6 min total)
   - If rate limit hit, polls will timeout; retry after 1 hour

5. **Column Name Variations**
   - Source data from different ACRA exports may use different column names
   - Already handles 4+ variations per column; expand ALIASES dict if new variations found

6. **Duplicate Handling**
   - Deduplicates by (UEN, SSIC, entity_status_description)
   - Blue-green swap prevents partial updates; all-or-nothing atomicity guaranteed

---

## Files Structure
```
leadsg/
├── src/
│   ├── app/
│   │   ├── page.tsx               # Home page with SearchPanel
│   │   └── api/search/route.ts    # Search API endpoint
│   ├── components/
│   │   ├── search-panel.tsx       # Client search form (nuqs)
│   │   ├── search-panel-fallback.tsx
│   │   └── ui/                    # shadcn-style primitives
│   └── lib/
│       ├── schema.ts             # Drizzle schema
│       ├── db.ts                 # Lazy PostgreSQL client
│       └── types.ts              # EntitySearchResult
├── etl/
│   ├── acra_data_mirror.py       # Main ETL script
│   └── requirements.txt          # pandas, psycopg, requests, python-dotenv
├── .github/workflows/
│   └── acra-etl.yml              # Weekly scheduler
├── .env.example                  # Config template
├── .env.local                    # Local overrides (not committed)
├── package.json                  # npm scripts (db:generate, db:push, etl:run)
└── drizzle.config.ts             # ORM code generation
```

---

## Quick Commands
```bash
# Setup
docker run --name leadsg-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=leadsg -p 5432:5432 -d postgres:16
pip install -r etl/requirements.txt
npm install

# Development
npm run dev                    # Start Next.js dev server (http://localhost:3000)
npm run db:generate          # Generate Drizzle types
npm run db:push              # Push schema to PostgreSQL
npm run etl:run              # Run ETL pipeline

# Testing
curl "http://localhost:3000/api/search?ssic=62011&page=1"

# Verification
psql postgres://postgres:postgres@localhost:5432/leadsg -c "SELECT COUNT(*) FROM active_entities"
psql postgres://postgres:postgres@localhost:5432/leadsg -c "SELECT last_updated_at FROM etl_metadata WHERE id = 1"
```

---

## Critical Notes for Next Session

1. **Status filter is hardcoded**: ETL uses `LIKE "Live"` intentionally to include `Live Company`
2. **UI expects totals + pagination contract**: Keep `/api/search` response shape stable
3. **ETL metadata powers frontend freshness info**: Keep `etl_metadata` update in ETL transaction
4. **No breaking changes expected**: Architecture is stable; frontend/backend/ETL are decoupled

---

## Planned Extension: Multi-SSIC Paid Contact Enrichment

### Product Constraints (Confirmed)
1. **Scope is SSIC-only**: users enrich by SSIC code(s), not arbitrary company picks
2. **Multi-SSIC selection supported**: users can submit multiple SSIC codes in one run
3. **Manual payment flow**: no Stripe/automated billing yet
4. **Code redemption required**: user must redeem a unique admin-issued code tied to their authenticated account before job start
5. **Cache-first behavior**: enrichment results must be cached in Postgres and reused for subsequent queries
6. **Hard budget controls**: enforce account/code/global limits before and during paid Google calls

### Google API Cost Strategy
1. Text Search (`places.id` field mask only) first
2. Place Details (paid enterprise SKU) only for cache misses/expired entries
3. Present preflight estimate before run:
   - selected SSIC codes
   - candidate company count
   - estimated cache hits/misses
   - projected paid calls and estimated max cost

### Planned Data Model Additions
- `users`
- `payment_codes`
- `payment_code_redemptions`
- `company_contact_enrichment` (keyed by `uen`, matched to `active_entities.uen`)
- `enrichment_jobs`
- `enrichment_job_items`

### Planned API Additions
- `POST /api/enrichment/preflight`
- `POST /api/enrichment/redeem`
- `POST /api/enrichment/jobs`
- `GET /api/enrichment/jobs/:id`
- `GET /api/enrichment/results`

### Execution Architecture
- Keep existing search API contract stable and additive
- Use async job processing for enrichment (do not block request/response path)
- Run worker on home NAS (OpenMediaVault Docker) with queue-backed design
- Prefer private networking and persistent worker logs

### Logging Expectations
- Structured JSON logs from API and worker
- Include correlation metadata: `request_id`, `job_id`, `user_id`, `code_id`, `ssic_list`, stage, retries, latency
- Persist usage/audit data for manual payment reconciliation

---

**Last Updated**: 20 March 2026  
**Context**: Full-stack search is complete; planning started for multi-SSIC prepaid contact enrichment with cache-first async execution
