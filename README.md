# LeadSG 📞

This project mirrors Singapore ACRA entity data into Postgres using a blue-green ETL pipeline, then serves a fast SSIC search UI with Next.js App Router.

## Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS v4 + shadcn/ui-style components
- Drizzle ORM + Postgres (Neon-ready)
- Python ETL (`pandas` + `psycopg3`)
- Enrichment Worker (Node.js, Docker) with Google Places API integration
- Docker + Docker Compose for NAS deployment

## Features

- Zero-downtime blue-green data load into `entities_a` / `entities_b`
- Atomic switch of `active_entities` view in one transaction
- Indexed lookup by `primary_ssic_code`
- Hardcoded ETL status filter `LIKE "Live"` (matches both `Live` and `Live Company`)
- Persists ETL refresh timestamp in `etl_metadata.last_updated_at`
- URL-synced search state with `nuqs` (`?ssic=62011`)
- Server-side pagination (10 rows/page) with total match counts
- Frontend shows total live companies and last database update timestamp
- Short-lived API + browser session caching for smoother paging
- Weekly GitHub Actions ETL schedule
- Enrichment worker: background job processor for contact enrichment with cache-first lookup, Google Places API integration, and budget management
- Structured job queue with atomic claim pattern (database-backed, no Redis dependency)
- Async enrichment processing on NAS Docker with JSON logging for observability

## Environment

Copy `.env.example` to `.env.local` for local development.

Required:

- `DATABASE_URL`
- `ACRA_API_KEY`

Optional ETL runtime controls:

- `ACRA_POLL_RETRIES` (defaults to `10`)
- `ACRA_POLL_WAIT_SECS` (defaults to `6`)
- `ACRA_RATE_LIMIT_DELAY` (defaults to `13.0`)

ETL uses a hardcoded filter `entity_status_description LIKE "Live"`, which matches both `Live` and `Live Company`.

## Run Locally

```bash
npm install
npm run dev
```

Run ETL manually:

```bash
python -m pip install -r etl/requirements.txt
npm run etl:run
```

## Data Model

Primary search source is the `active_entities` view with columns:

- `uen`
- `entity_name`
- `street_name`
- `primary_ssic_code`
- `entity_status_description`

ETL metadata table:

- `etl_metadata(id, last_updated_at)`

ETL ensures indexes exist on both blue-green tables:

- `entities_a_primary_ssic_code_idx`
- `entities_b_primary_ssic_code_idx`

## Automation

Weekly ETL workflow: `.github/workflows/acra-etl.yml`

GitHub Secrets to set:

- `DATABASE_URL`
- `ACRA_API_KEY`

Optional GitHub Secrets (override script defaults if set):

- `ACRA_POLL_RETRIES`
- `ACRA_POLL_WAIT_SECS`
- `ACRA_RATE_LIMIT_DELAY`

## Search API

`GET /api/search?ssic=62011&page=1`

- Validates `ssic` as exactly 5 digits
- Returns paginated rows (`pageSize=10`) plus:
	- `pagination.totalMatching`
	- `totals.liveCompanies`
	- `totals.lastUpdatedAt`
- Uses short cache headers: `max-age=30, stale-while-revalidate=120`

## Deploy Notes

- Vercel: set `DATABASE_URL` in project environment variables.
- Neon: use pooled connection string and keep SSL enabled.
- No secrets are hardcoded in source.

## Enrichment Job Queue

Enrichment jobs are stored in `enrichment_jobs` table with status transitions: `queued` → `running` → `completed/partial_stopped_budget/failed`.

**Worker Behavior:**
- Polls database every `WORKER_POLL_INTERVAL_MS` (default 5s) for queued jobs
- Atomically claims oldest job (CAS update prevents double-processing)
- For each SSIC code:
  - Queries candidates from `active_entities` by `primary_ssic_code`
  - Cache-first lookup in `company_contact_enrichment` (TTL: 7 days)
  - Cache miss → Google Places Text Search (placeId) → Place Details (phone/website)
  - Retry logic: up to 5 attempts with exponential backoff (1s base, 2x multiplier)
  - Resume on failure: logs error, moves to next row (partial completion allowed)
- Refunds unused reserved budget after completion
- Results available via `/api/enrichment/jobs/{jobId}/download`

**Budget Model:**
- Preflight request reserves worst-case `reservedPaidCalls`
- Cache hits save API cost but don't trigger refund
- Unused reserved calls refunded to internal quota pool post-completion

## Docker Worker (NAS)

Use the worker container to process queued enrichment jobs continuously.

### Files

- `Dockerfile.worker`
- `docker-compose.worker.yml`
- `.env.worker.example`

### Required Environment Variables

At minimum, set these in `.env.worker`:

- `DATABASE_URL`
- `GOOGLE_PLACES_API_KEY`

Recommended optional settings:

- `WORKER_POLL_INTERVAL_MS` (default `5000`)
- `WORKER_RUN_ONCE` (default `false`)
- `ENRICHMENT_CACHE_TTL_DAYS` (default `7`)
- `WORKER_PROGRESS_LOG_EVERY_ROWS` (default `100`)
- `GOOGLE_PLACES_DETAILS_PRICE_PER_1000_USD` (default `20`)
- `ENRICHMENT_USER_PRICE_PER_1000_USD` (default `20`)

### Build for amd64 on arm Mac

Create and use a buildx builder:

```bash
docker buildx create --name leadsg-builder --use --bootstrap
```

Build and push amd64 image to your registry (example uses GHCR):

```bash
docker buildx build \
	--platform linux/amd64 \
	-f Dockerfile.worker \
	-t ghcr.io/hiokkuek/leadsg-worker:latest \
	--push \
	.
```

### Run on NAS with Docker Compose

1. Copy `docker-compose.worker.yml` and `.env.worker` to NAS.
2. Ensure NAS can reach Postgres host in `DATABASE_URL`.
3. Optional if using pushed image: set `WORKER_IMAGE` in `.env.worker` (example: `ghcr.io/hiokkuek/leadsg-worker:latest`).
4. Start service:

```bash
docker compose -f docker-compose.worker.yml up -d
```

If building directly on NAS from source, run:

```bash
docker compose -f docker-compose.worker.yml up -d --build
```

Check logs:

```bash
docker compose -f docker-compose.worker.yml logs -f enrichment-worker
```

Update to latest image:

```bash
docker compose -f docker-compose.worker.yml pull
docker compose -f docker-compose.worker.yml up -d
```
