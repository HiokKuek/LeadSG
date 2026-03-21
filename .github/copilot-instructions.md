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
7. **Admin identity source**: admin access is from Clerk metadata only (`publicMetadata.role = "admin"`)
8. **Payment code scope**: payment code is single-use and bound to one confirmed preflight request
9. **Admin bypass budget**: admin bypass starts consume internal quota pool detail calls

### Google API Cost Strategy
1. Text Search (`places.id` field mask only) first
2. Place Details (paid enterprise SKU) only for cache misses/expired entries
3. Present preflight estimate before run:
   - selected SSIC codes
   - candidate company count
   - estimated cache hits/misses
   - projected paid calls and estimated max cost

### Planned Data Model Additions
- `payment_codes`
- `payment_code_redemptions`
- `enrichment_preflight_requests`
- `enrichment_internal_quota`
- `company_contact_enrichment` (keyed by `uen`, matched to `active_entities.uen`)
- `enrichment_jobs`
- `enrichment_job_items`

### Authentication Provider
- Use Clerk for hosted authentication, user management dashboard, and social/email-password sign-in.
- Treat Clerk as identity source of truth; app DB stores domain data only.
- Store user tier in Clerk metadata (`publicMetadata.tier`) for authorization decisions.

### Planned API Additions
- `POST /api/enrichment/preflight`
- `POST /api/enrichment/preflight/requests`
- `GET /api/enrichment/preflight/requests`
- `POST /api/enrichment/redeem`
- `POST /api/enrichment/jobs`
- `GET /api/enrichment/jobs/:id`
- `GET /api/enrichment/results`
- `POST /api/enrichment/admin/quote` (admin-only quote + optional code issuance)
- `GET /api/enrichment/admin/preflight-requests`
- `POST /api/enrichment/admin/preflight-requests/:id/issue-code`
- `POST /api/enrichment/admin/preflight-requests/:id/start`
- `GET/PATCH /api/enrichment/admin/internal-quota`

### API Behavior Notes (Phase 2)
- `/api/enrichment/preflight` is user-facing and should not expose cache hit/miss internals
- User preflight response should provide estimated payable amount based on Google pricing model
- Admin quote endpoint can expose cache-aware economics (`estimated user charge`, `estimated provider cost`, margin)
- Admin quote endpoint can issue payment codes after manual payment confirmation
- User must confirm preflight request before payment code step
- User can only start job from `ready_to_start` preflight request
- Admin bypass start is allowed but must atomically decrement internal quota pool

### Execution Architecture
- Keep existing search API contract stable and additive
- Use async job processing for enrichment (do not block request/response path)
- Run worker on home NAS (OpenMediaVault Docker) with queue-backed design
- Prefer private networking and persistent worker logs

### Schema Source of Truth and ETL Compatibility
- App and enrichment tables are managed by Drizzle migrations (`db:generate`, `db:push`)
- ETL script remains responsible only for ACRA mirror tables and `active_entities` view lifecycle
- Keep ETL and Drizzle column types aligned for shared base tables to avoid migration/view conflicts
- Run schema migration before calling enrichment endpoints in a fresh environment

### Logging Expectations
- Structured JSON logs from API and worker
- Include correlation metadata: `request_id`, `job_id`, `user_id`, `code_id`, `ssic_list`, stage, retries, latency
- Persist usage/audit data for manual payment reconciliation

---

## Phase 3: User-Friendly UI/UX Implementation (March 2026)

### User Workflow (Redesigned for Clarity)
**Screen**: `EnrichmentControls` provides unified access; users see `UserEnrichmentPanel` by default

1. **"Get Company Details" Hero Section**
   - Headline: "Get Company Details (phone number + website)"
   - Disclaimer: Note that contact information is not always available
   - SSIC Input with "Estimate Cost" button

2. **Cost Estimation Modal** (Framer Motion, smooth slide-in)
   - Shows: company count, API calls needed, total cost
   - Actions: "Cancel" or "Proceed to Purchase"

3. **Purchase Request Creation**
   - Clicking "Proceed" creates preflight request and auto-confirms
   - Free requests (`projectedPaidCalls = 0`) auto-advance to `ready_to_start` instantly
   - Paid requests (`projectedPaidCalls > 0`) advance to `requested` (awaiting admin code)

4. **Request History List** (Always visible, all requests)
   - Dropdown showing all requests with status, cost, SSIC
   - User can review past + current requests

5. **Code Redemption Section** (Conditional, appears if status = `code_issued`)
   - Info box: "Your request is awaiting admin approval. Once approved, you'll receive a confirmation code."
   - Button: "I Have a Confirmation Code"
   - Multi-step verification: input field + separate "Verify" button
   - After verification, request auto-advances to `ready_to_start`

6. **Job Launch**
   - "Start Job" button enabled when `status = ready_to_start`
   - After clicking, shows animated success message: "Job Queued" with job ID
   - Auto-refreshes request list

### Admin Workflow (New Dedicated Dashboard Section)
**Access**: Toggle "Admin Dashboard" button visible only to users with `publicMetadata.role = "admin"`

**Screen**: `AdminEnrichmentDashboard` (full-page component, accessed via toggle)

1. **Quota Header** (Gradient blue card, always visible at top)
   - Shows: "Available Quota: {remainingDetailCalls}" in large font
   - Inline adjustment: text input for delta (e.g., "+100", "-50") + "Apply" button
   - Guard: SQL `greatest(..., 0)` prevents negative balances

2. **Preflight Queue Table** (Animated rows with staggered entrance)
   - Columns: User Email, SSIC Codes, Est. Cost, API Calls, Status, Actions
   - Row styling: Highlighted when selected, hover effects
   - Status badge colors:
     - Blue: `requested` (awaiting code)
     - Amber: `code_issued` (waiting for user redemption)
     - Green: `ready_to_start` (ready to launch)
     - Gray: `started` (job already running)

3. **Details Modal** (Click any row or "Details" button)
   - Displays: User email, SSICs, cost, API calls, candidate count, status
   - Highlighted box showing: user charge, projected API calls
   - **Code Section**:
     - If code not issued: "Issue Code" button
     - After issuance: Code displayed in green box with Copy icon
     - Hover/click to copy code to clipboard + visual feedback
   - **Admin Actions**:
     - "Issue Code" button (generates single-use code, marks request `code_issued`)
     - "Admin Bypass Start" button (charges internal quota, creates job, marks request `started`)

4. **Animations & Interactions**
   - Table rows fade in with stagger effect
   - Modals use scale + opacity transitions
   - Copy-to-clipboard shows brief green checkmark
   - Code display animates in with smooth reveal
   - Status badge color transitions on update

### Component Architecture
- **`EnrichmentControls`** (container): Manages toggle state, renders user or admin view
- **`UserEnrichmentPanel`**: Handles user workflow (estimate, purchase, code redeem, job launch)
- **`AdminEnrichmentDashboard`**: Handles admin workflow (queue list, code issuance, quota adjust)
- **Animations**: Framer Motion for modals, table rows, code reveals, transitions

### Dependencies Added (Phase 3)
- `framer-motion` ^14: Smooth animations for modals, table rows, code highlights
- Lucide React icons: Keyboard icons (ChevronDown, Copy, Check, X, Loader2, etc.)

### State Management
- All state managed locally within respective components (`useState`)
- Request list auto-synced to database via API calls
- No external state → clean separation of concerns

### API Contract Notes (Phase 3)
- Removed redundant `/api/enrichment/admin/quote` endpoint (replaced by request-driven flow)
- All endpoints kept stable:
  - User: `/api/enrichment/preflight`, `/api/enrichment/preflight/requests`, `/api/enrichment/redeem`, `/api/enrichment/jobs`
  - Admin: `/api/enrichment/admin/preflight-requests`, `/admin/preflight-requests/[id]/issue-code`, `/admin/preflight-requests/[id]/start`, `/admin/internal-quota`

### Styling & Theming
- Tailwind CSS v4: All components use zinc/blue/green/amber color schemes
- Gradient headers for admin quota display
- Consistent button/input styling across user + admin panels
- Responsive design maintains UX on smaller screens (modals scale appropriately)

---

## Phase 4: Landing Page Simplification (March 2026)

### Homepage UX Decisions (Locked)
1. **Unified hero for all users**
    - Both authenticated and unauthenticated users see the same headline: `LeadSG 📞`
    - Removed authenticated-only hero variants from Phase 3 homepage experiments

2. **Guest CTA moved below search panel**
    - On unauthenticated view, keep main search experience first
    - Show guest-only CTA block *after* `SearchPanel`:
       - Message: "Sign up to unlock advanced features like contact enrichment and bulk data export."
       - Primary button: "Get Started Free →" linking to `/sign-up`

3. **Footer branding**
    - Add footer text: `Built by HiokKuek {currentYear}`
    - Include pulsating heart animation via utility class (`animate-pulse-heart`)

### Implementation Notes (Phase 4)
- `src/app/page.tsx`
   - Keep single `LeadSG 📞` header regardless of auth state
   - Keep `EnrichmentControls` gated behind authentication
   - Render guest CTA block only when `!userId`
   - Render footer at page bottom with dynamic year
- `src/app/globals.css`
   - Define `@keyframes pulse-heart`
   - Register `.animate-pulse-heart` in `@layer utilities`

### Guardrails for Future Edits
- Do not re-introduce different hero headlines for authenticated users unless explicitly requested.
- Keep guest sign-up motivation below the SSIC search block to preserve search-first UX.
- Keep footer text and pulsating heart treatment as default branding.

---

---

## Worker Deployment (NAS Docker)

The enrichment worker runs as a background service on OpenMediaVault (amd64) to process job queues for contact enrichment. It operates independently of the Next.js app and connects directly to the same PostgreSQL database.

### Architecture Pattern: Job Queue + Polling

**Job Queue Model:**
- Jobs stored in `enrichment_jobs` table with status field: `queued` → `running` → `completed/partial_stopped_budget/failed`
- No external queue (Redis/SQS); database is the single source of truth
- Atomic claim via CAS (compare-and-swap) update: worker finds oldest `queued` job and atomically transitions to `running` in one transaction
- Race-condition safe: only one worker claims each job; failed claims are retried with backoff

**Processing Flow:**
1. Worker polls database every `WORKER_POLL_INTERVAL_MS` (default 5000ms) for `queued` jobs
2. Claims oldest job with timeout protection (5 retry attempts, exponential backoff)
3. For each SSIC code in job:
   - Queries candidate companies from `active_entities` by `primary_ssic_code`
   - For each company:
     - **Cache-first lookup**: fetch fresh (not expired) `company_contact_enrichment` row by UEN
     - **Cache miss**: call Google Places Text Search (phone + website) → Place Details (full contact info)
     - Retry logic: up to 5 attempts per row with exponential backoff (1s base, 2x multiplier)
     - Resume on failure: logs error + moves to next row (partial completion allowed)
4. Tracks metrics: processed rows, cache hits, consumed paid API calls, skipped rows (budget exhausted)
5. Refunds unused reserved budget after job completes
6. Updates job status and signals completion; results ready for download via `/api/enrichment/jobs/{jobId}/download`

**Budget Reservation & Refund:**
- Preflight request estimates `reservedPaidCalls` (worst-case scenario)
- Worker atomically reserves this amount before job start
- Cache hits save API cost but don't refund (reuse cached data)
- After processing all candidates, refund unused reserved calls back to internal quota pool

### Enrichment Worker Implementation

**File**: `src/worker/enrichment-worker.ts` (~400 lines)

**Key Functions:**
- `log(level, event, payload)`: Structured JSON logging for observability (startup, claim metrics, job lifecycle, progress checkpoints, row-level failures, budget exhaustion events)
- `claimNextJob()`: Atomic CAS loop to acquire next queued job with race-condition handling
- `getCandidates(ssicList)`: Query `active_entities` by SSIC codes, order by entity name
- `processJob(job)`: Main enrichment loop with cache-first lookup and Google API retry logic
- `processClaimedJob(job)`: Try-catch wrapper; ensures budget refund on any failure
- `runWorkerLoop()`: Infinite poll loop (or single-shot via `WORKER_RUN_ONCE` env var) with idle sleep

**Logging Strategy:**
- Structured JSON logs: timestamp, event name, context (jobId, userId, uen, error code/message)
- Tracked events:
  - `worker.loop.started`: Worker startup with config (poll interval, cache TTL, progress log frequency)
  - `worker.claim.attempt/success/race_lost`: Claim loop metrics and race condition recovery
  - `worker.job.started`: Job accepted (jobId, candidateCount, reservedPaidCalls)
  - `worker.job.progress`: Checkpoint every N rows (configurable `WORKER_PROGRESS_LOG_EVERY_ROWS`)
  - `worker.job.row.search_failed / details_failed`: Row-level API failures with error details
  - `worker.job.partial_stopped_budget`: Budget exhausted during processing
  - `worker.reservation.released / skipped`: Budget refund tracking
  - `worker.loop.idle`: No queued jobs; worker sleeping

**Cache TTL & Invalidation:**
- Entries considered fresh if `updated_at > NOW() - ENRICHMENT_CACHE_TTL_DAYS` days
- Default TTL: 7 days (configurable via env var)
- Cache miss triggers Google API call; result stored with `updated_at = NOW()`
- Stale entries trigger refresh, reducing data freshness risk

### Docker Setup

**Files Created:**
- `Dockerfile.worker`: Multi-stage production image (Node 24-bookworm-slim, npm ci for reproducible builds, production NODE_ENV)
- `docker-compose.worker.yml`: Service definition with configurable image pull and local build fallback
- `.env.worker.example`: Template for NAS-specific environment variables
- `.dockerignore`: Excludes unnecessary build context (.git, .next, node_modules, venv, etl, *.log, .env files)

**Base Image:** Node 24-bookworm-slim (upgraded from 22 for security; resolves critical CVEs in OpenSSL/build tools)

**Security & Environment:**
- Multi-stage: deps layer (npm ci) separated from runner layer (production artifacts only)
- Command: `npm run worker:run` (entry point defined in package.json)
- No hardcoded secrets; all config via environment variables
- Support for serverless: lazy DB initialization (connects only at runtime, not build time)

### Environment Configuration

**Required Variables:**
- `DATABASE_URL`: PostgreSQL connection string (pooled recommended for cloud)
- `GOOGLE_PLACES_API_KEY`: Google Places API key (enterprise SKU for Place Details pricing)

**Recommended Optional:**
- `WORKER_POLL_INTERVAL_MS` (default 5000): Time between job queue polls (ms)
- `WORKER_RUN_ONCE` (default false): Single-shot mode for debugging (exits after one job poll cycle)
- `ENRICHMENT_CACHE_TTL_DAYS` (default 7): Cache entry freshness threshold (days)
- `WORKER_PROGRESS_LOG_EVERY_ROWS` (default 100): Log progress checkpoint frequency (rows)

**Pricing Configuration (Optional):**
- `GOOGLE_PLACES_DETAILS_PRICE_PER_1000_USD` (default 20): Cost per 1000 Place Details calls (USD)
- `ENRICHMENT_USER_PRICE_PER_1000_USD` (default 20): User billing rate per 1000 calls (USD)
- `UNICODE_NORMALIZATION_THRESHOLD` (default 0.95): String similarity threshold for deduplication

**Compose/Deployment Overrides:**
- `WORKER_IMAGE`: Docker image URI for registry pull (overrides local build; example: `ghcr.io/hiokkuek/leadsg-worker:latest`)
- `DOCKER_PLATFORM`: Multi-arch override for docker-compose (default linux/amd64)

### Build & Deployment Workflow

**Local Development:**
```bash
npm run worker:dev  # Run TypeScript worker directly (requires .env.local)
NODE_OPTIONS=--inspect npm run worker:dev  # Debug with DevTools
```

**Build for Registry (amd64 from arm Mac):**
1. Create buildx builder once:
   ```bash
   docker buildx create --name leadsg-builder --use --bootstrap
   ```

2. Build and push to GHCR:
   ```bash
   docker buildx build \
     --platform linux/amd64 \
     -f Dockerfile.worker \
     -t ghcr.io/hiokkuek/leadsg-worker:latest \
     --push \
     .
   ```

**NAS Deployment:**
1. Copy `.env.worker` to NAS with required vars (DATABASE_URL, GOOGLE_PLACES_API_KEY)
2. Pull image and start service:
   ```bash
   docker compose -f docker-compose.worker.yml pull
   docker compose -f docker-compose.worker.yml up -d
   ```

3. Verify logs:
   ```bash
   docker compose -f docker-compose.worker.yml logs -f enrichment-worker
   ```

4. Update to latest image:
   ```bash
   docker compose -f docker-compose.worker.yml pull
   docker compose -f docker-compose.worker.yml up -d
   ```

**NAS Notes:**
- Worker restarts automatically on container failure (restart policy: unless-stopped)
- Logs streamed to stdout (JSON format for container aggregation)
- No persistent storage needed (state managed entirely in Postgres)
- Network: must reach PostgreSQL host via `DATABASE_URL`

### Job Submission to Worker

**User Workflow:**
1. User selects SSIC codes and clicks "Get Company Details"
2. Frontend calls `POST /api/enrichment/preflight` → estimates cost (cache hits vs. paid calls)
3. User reviews cost and clicks "Proceed to Purchase"
4. Backend creates `enrichment_preflight_requests` entry (status: `requested`)
5. Admin approves preflight and issues payment code (marks status: `code_issued`)
6. User enters code via `POST /api/enrichment/redeem` (marks status: `ready_to_start`)
7. User clicks "Start Job" → `POST /api/enrichment/jobs` creates job row (status: `queued`, reserved budget locked)
8. Worker polls, claims job, processes enrichment
9. Results available via `GET /api/enrichment/jobs/{jobId}` and `GET /api/enrichment/jobs/{jobId}/download`

**Job Status Inference:**
- Clients poll `/api/enrichment/jobs/{jobId}` to check progress
- Worker updates status: queued → running → completed/failed/partial_stopped_budget
- Results (CSV) available only after status transitions from running (partial or completed)

---

## Phase 5: Enrichment Stabilization Fixes (March 2026)

### Pricing & Unit Correctness (Completed)
- Fixed `userChargeUsd` unit mismatch in job creation flows:
   - `POST /api/enrichment/jobs`
   - `POST /api/enrichment/admin/preflight-requests/:id/start`
- `enrichment_preflight_requests.estimatedPriceUsd` is already stored in **cents**; job rows now persist user charge in cents without double conversion.
- Read APIs now normalize displayed user charge using preflight's canonical estimate to ensure legacy over-stored rows still render correctly:
   - `GET /api/enrichment/jobs`
   - `GET /api/enrichment/jobs/:id`
   - `GET /api/enrichment/admin/jobs/:requestId`

### Admin Results Visibility (Completed)
- Added dedicated admin job lookup endpoint:
   - `GET /api/enrichment/admin/jobs/:requestId`
- Admin dashboard now fetches job results by preflight request ID, enabling admins to view/download results for non-owner users.

### Runtime/UI Stability (Completed)
- Fixed admin job modal crash caused by response-shape mismatch (`jobId`/`processedRows` vs prior UI field names).
- Added defensive guards for polling/history response parsing in `UserEnrichmentPanel` to avoid rendering error payloads as job objects.
- Fixed React duplicate key warning in admin modal flow by:
   - assigning explicit modal keys under `AnimatePresence`
   - ensuring request modal closes before opening results modal
   - adding safe fallback table row key when request ID is missing/empty

### Validation
- `npm run lint` passes.
- `npm run build` passes.

---

**Last Updated**: 21 March 2026 (Phase 5 Stabilization Updates Applied)  
**Context**: Enrichment pricing units, admin results access, and modal/rendering stability issues were fixed and validated (lint + build passing).
