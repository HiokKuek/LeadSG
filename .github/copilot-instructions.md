# ACRA Data Mirror & SSIC Search Tool - Project Summary

## Core Objective
Build a high-performance search tool allowing users to query Singapore companies by SSIC code with:
- Zero-downtime ETL using blue-green table swapping
- Type-safe Next.js App Router backend
- Minimalist Tailwind v4 frontend with URL-synced search
- Weekly automated data updates via GitHub Actions

---

## Tech Stack & Architecture

### Frontend
- **Framework**: Next.js 16 (App Router), React 19.2.4, TypeScript 5
- **Styling**: Tailwind CSS v4, custom shadcn-style components
- **State**: nuqs 2.8.9 for URL query sync (e.g., `?ssic=62011`)
- **Components**: `SearchPanel` (client), Suspense boundary required (Next.js 16 quirk)

### Backend API
- **Route**: `GET /api/search?ssic=XXXXX`
- **ORM**: Drizzle 0.45.1 with lazy PostgreSQL client (supports serverless)
- **Validation**: Zod 4.3.6 for SSIC regex (`^\d{5}$`) and SEARCH_LIMIT (1-500)
- **Response**: JSON array of `EntitySearchResult` objects

### Database
- **Engine**: PostgreSQL 16 (local Docker or Neon cloud)
- **Schema**: `entities_a`, `entities_b`, `active_entities` (view)
- **Columns**: UEN, entity_name, street_name, primary_ssic_code
- **Indexes**: On `primary_ssic_code` for fast SSIC lookups
- **Pattern**: Blue-green swap (atomic view switch, zero downtime)

### ETL Pipeline (Python)
- **File**: `etl/acra_data_mirror.py` (~210 lines)
- **Data Source**: data.gov.sg ACRA entity registry (27 datasets: A-Z + Others)
- **Logic**:
  1. Initiate async CSV generation via `/initiate-download`
  2. Poll with backoff (6s intervals, 10 retries) via `/poll-download`
  3. Download CSV, normalize columns (handle 4+ aliases), filter valid UEN/SSIC
  4. Merge datasets, deduplicate by (UEN, SSIC), load via PostgreSQL COPY
  5. Atomically swap view to new table in transaction
- **Rate Limiting**: 13s delay between datasets (respects 5 req/min free tier)
- **Filtering**: Configurable entity status ("Live", "Live Company", or both)

### Automation
- **CI/CD**: GitHub Actions workflow (`.github/workflows/acra-etl.yml`)
- **Schedule**: Weekly (Mondays 03:00 UTC)
- **Secrets Required**: DATABASE_URL, ACRA_API_KEY, ACRA_ENTITY_STATUS_FILTER
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
// Auto-persists to URL: ?ssic=62011
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
}
```
Handles variations in source CSV column names without hardcoding.

### 5. Environment-Driven Configuration
```bash
# .env.local / .env.example
DATABASE_URL=postgres://...
ACRA_API_KEY=v2:...
ACRA_ENTITY_STATUS_FILTER=Live,Live Company  # Comma-separated
ACRA_POLL_RETRIES=10
ACRA_POLL_WAIT_SECS=6
ACRA_RATE_LIMIT_DELAY=13
```
No hardcoded secrets; all config from environment.

---

## Current Status

✅ **Completed**:
- Full-stack scaffolding (Next.js 16 + Drizzle + Tailwind v4)
- Search API with SSIC validation and indexing
- Minimalist frontend UI with nuqs sync, skeleton loading
- Python ETL with async polling, column mapping, blue-green swap
- GitHub Actions weekly automation
- Production build validation (passes lint + TypeScript check)
- Docker Postgres guidance provided

⏳ **In Progress/Testing**:
- Local ETL execution (user has valid API key, running `npm run etl:run`)
- **Current blocker**: 403 Forbidden on `/initiate-download` endpoint
  - User's API key needs verification (may be invalid/expired/insufficient permissions)
  - Once API key is valid, ETL should populate database

🔄 **Next Steps**:
1. **Verify API Key**: Test directly via curl; validate on data.gov.sg dashboard
2. **Run ETL**: Once key is valid, `npm run etl:run` should load ~300k-400k entities
3. **Test Frontend Search**: After ETL completes, verify search works at `http://localhost:3000`
4. **Integration Testing**: Test edge cases (invalid SSIC, empty results, pagination)
5. **Production Deployment**: Push to Vercel + Neon with secrets configured
6. **Monitor Weekly Runs**: Verify GitHub Actions executes every Monday 03:00 UTC

---

## Known Issues/Edge Cases

1. **API Key 403 Error** (Active)
   - Root cause: API key invalid/expired or lacks permissions
   - Solution: Regenerate key on data.gov.sg dashboard
   - Test via curl before running ETL

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
   - Deduplicates by (UEN, SSIC) pair; same UEN can have multiple SSIC codes
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
│       ├── env.ts                # Zod env validation
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
curl "http://localhost:3000/api/search?ssic=62011"

# Verification
psql postgres://postgres:postgres@localhost:5432/leadsg -c "SELECT COUNT(*) FROM active_entities"
```

---

## Critical Notes for Next Session

1. **API Key is the blocker**: User needs to validate/regenerate key on data.gov.sg
2. **Once ETL works**: Search should be immediately functional (no additional config needed)
3. **Deployment is straightforward**: Push to Vercel + set secrets on GitHub + Neon DB
4. **No breaking changes expected**: Architecture is stable; frontend/backend/ETL are decoupled

---

**Last Updated**: 19 March 2026  
**Context**: Full-stack implementation complete; awaiting API key validation for ETL testing
