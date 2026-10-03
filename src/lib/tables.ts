/**
 * Each parquet file is exposed to the UI as a view with the same name.
 * `extraColumns` adds compatibility aliases on top of the file's own columns.
 * `size` is approximate and only used to tell users how much a first load downloads.
 *
 * Kept free of DuckDB imports so pages can show the download size without bundling the engine.
 */
export const TABLES = [
  { view: 'filers', file: 'filers.parquet', extraColumns: '', size: 120_000 },
  { view: 'reports', file: 'reports.parquet', extraColumns: ', form_type AS report_type, loan_balance AS loans_outstanding', size: 8_400_000 },
  { view: 'expenditures', file: 'expenditures.parquet', extraColumns: ', expenditure_id AS id', size: 260_000 },
  { view: 'contributions', file: 'contributions_2020.parquet', extraColumns: ', contribution_id AS id', size: 19_400_000 },
] as const;

export const APPROX_DOWNLOAD_BYTES = TABLES.reduce((sum, t) => sum + t.size, 0);

export const APPROX_DOWNLOAD_LABEL = `~${Math.round(APPROX_DOWNLOAD_BYTES / 1e6)} MB`;
