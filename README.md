# Armadollar NC

A searchable web interface for North Carolina campaign finance data, running entirely in the browser using DuckDB-WASM.

## Stack

- Astro 5 + React 19
- DuckDB-WASM
- Tailwind CSS
- Static hosting + CDN-hosted Parquet files

## How it works

1. Browser downloads Parquet files from `PUBLIC_DATA_URL`
2. Files are cached in IndexedDB
3. DuckDB-WASM runs SQL locally in the browser
4. UI components query local tables/views (no backend API)

## NC schema contract (required)

The app enforces this contract at startup in `src/lib/duckdb.ts` (`NC_SCHEMA_CONTRACT`). If columns are missing, initialization fails with a clear error.

### `filers`
Required columns:

- `id`
- `name`
- `type`
- `party`
- `office_held`
- `office_sought`
- `office_district`
- `city`
- `state`
- `status`

### `contributions`
Required columns:

- `contribution_id`
- `id` (the app aliases this from `contribution_id` in the view)
- `filer_id`
- `filer_name`
- `contributor_name`
- `contributor_type`
- `contributor_city`
- `contributor_state`
- `contributor_zip`
- `contributor_employer`
- `contributor_occupation`
- `amount`
- `date` (`YYYYMMDD` integer)
- `received_date` (`YYYYMMDD` integer)
- `description`

### `expenditures`
Required columns:

- `expenditure_id`
- `id` (the app aliases this from `expenditure_id` in the view)
- `filer_id`
- `filer_name`
- `payee_name`
- `payee_city`
- `payee_state`
- `payee_zip`
- `amount`
- `date` (`YYYYMMDD` integer)
- `received_date` (`YYYYMMDD` integer)
- `category`
- `category_code`
- `description`

### `reports`
Required columns:

- `report_id`
- `filer_id`
- `filer_name`
- `form_type`
- `report_type` (view alias from `form_type`)
- `period_start` (`YYYYMMDD` integer)
- `period_end` (`YYYYMMDD` integer)
- `filed_date` (`YYYYMMDD` integer)
- `received_date` (`YYYYMMDD` integer)
- `total_contributions`
- `total_expenditures`
- `cash_on_hand`
- `loan_balance`
- `loans_outstanding` (view alias from `loan_balance`)

## Required hosted files

At `PUBLIC_DATA_URL`:

- `filers.parquet`
- `reports.parquet`
- `expenditures.parquet`
- `contributions_2020.parquet`

Local static lookup:

- `public/nc_geo.json` (city→county mapping and NC county list)

## Setup

```bash
npm install --legacy-peer-deps
cp .env.example .env
```

Set in `.env`:

```bash
PUBLIC_DATA_URL=https://your-cdn-or-object-store/path
```

Run locally:

```bash
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

## NC data source and refresh runbook

### One-file CSV conversion (your current format)

If you have a single CSV with columns like:

- `Name`
- `City`, `State`, `Zip Code`
- `Profession/Job Title`
- `Employer's Name/Specific Field`
- `Transaction Type`
- `Committee Name`, `Committee SBoE ID`
- `Report Name`
- `Date Occured` (or `Date Occurred`)
- `Account Code`, `Amount`, `Purpose`

use this converter:

```bash
cd scripts
pip install -r requirements.txt

python convert_nc_transactions_csv_to_parquet.py \
  --input /absolute/path/to/your-file.csv \
  --output-dir ../public/parquet
```

Then set local `.env`:

```bash
PUBLIC_DATA_URL=/parquet
```

and run:

```bash
npm run dev
```

The script generates the exact four files this app expects:

- `filers.parquet`
- `contributions_2020.parquet`
- `expenditures.parquet`
- `reports.parquet`

It also normalizes date and amount formatting from spreadsheet-style values.

### 1) Acquire raw source data

- Pull campaign finance exports from NC State Board of Elections campaign finance resources.
- Store raw drops with date/version stamps (example: `raw/2026-04-04/*`).

### 2) Transform to app schema

- Normalize raw records into the four app tables (`filers`, `contributions`, `expenditures`, `reports`).
- Convert all date fields to integer `YYYYMMDD`.
- Ensure column names match the contract exactly.

### 3) Validate before publish

Recommended checks before upload:

- Schema check: all required columns present
- Null check: key IDs and `amount` not null where required
- Date check: valid 8-digit integer ranges
- Reconciliation check: spot-check totals/counts vs source portal

### 4) Export and upload

- Export each table to Parquet
- Upload to CDN/object storage path used by `PUBLIC_DATA_URL`
- Keep old versions for rollback (`vYYYYMMDD` or object versioning)

### 5) Deploy and smoke test

- Deploy static site
- Verify app load + schema validation pass
- Smoke test key routes:
  - `/`
  - `/advanced`
  - `/search/committees`
  - `/search/contributors`
  - `/query-builder`

## Notes on NC customization

- NC filer/office/party enums are defined in `src/components/AdvancedSearch.tsx` and `src/components/FacetedFilters.tsx`.
- Geography filters now use `public/nc_geo.json` and `src/lib/nc-geo.ts`.

## Outside this repo

You still need external operational work:

- Data pipeline scheduling (cron/CI/Airflow/GitHub Actions)
- Object storage/CDN management and access controls
- Monitoring + alerting for refresh failures
- Data governance checks (licensing, provenance, retention)
