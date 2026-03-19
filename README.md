# ACRA Data Mirror & SSIC Search Tool

This project mirrors Singapore ACRA entity data into Postgres using a blue-green ETL pipeline, then serves a fast SSIC search UI with Next.js App Router.

## Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS v4 + shadcn/ui-style components
- Drizzle ORM + Postgres (Neon-ready)
- Python ETL (`pandas` + `psycopg3`)

## Features

- Zero-downtime blue-green data load into `entities_a` / `entities_b`
- Atomic switch of `active_entities` view in one transaction
- Indexed lookup by `primary_ssic_code`
- URL-synced search state with `nuqs` (`?ssic=62011`)
- Minimal table UI with skeleton loading state
- Weekly GitHub Actions ETL schedule

## Environment

Copy `.env.example` to `.env.local` for local development.

Required:

- `DATABASE_URL`

Optional ETL discovery inputs:

- `ACRA_DATASET_METADATA_URL` (metadata endpoint at `api-open.data.gov.sg`)
- `ACRA_CHILD_DATASET_URLS` (comma-separated list of A-Z child CSV URLs)
- `ACRA_CHILD_DATASET_URL_TEMPLATE` (template containing `{letter}`)

`SEARCH_LIMIT` defaults to `100`.

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

ETL ensures indexes exist on both blue-green tables:

- `entities_a_primary_ssic_code_idx`
- `entities_b_primary_ssic_code_idx`

## Automation

Weekly ETL workflow: `.github/workflows/acra-etl.yml`

GitHub Secrets to set:

- `DATABASE_URL`
- `ACRA_DATASET_METADATA_URL` or `ACRA_CHILD_DATASET_URLS` or `ACRA_CHILD_DATASET_URL_TEMPLATE`

## Deploy Notes

- Vercel: set `DATABASE_URL` in project environment variables.
- Neon: use pooled connection string and keep SSL enabled.
- No secrets are hardcoded in source.
