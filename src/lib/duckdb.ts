import * as duckdb from '@duckdb/duckdb-wasm';
import {
  getCachedFile,
  setCachedFile,
  fetchRemoteVersion,
  isCacheFresh,
  downloadWithProgress,
  clearCache,
  getCacheInfo,
} from './parquet-cache';

export { clearCache, getCacheInfo };

// Parquet files are served from the site itself (public/parquet) by default.
// Set PUBLIC_DATA_URL to load them from an external CDN/bucket instead.
const configuredDataUrl = (import.meta.env.PUBLIC_DATA_URL || '').trim();
const defaultBundledDataUrl = `${import.meta.env.BASE_URL}parquet`;
const DATA_BASE_URL = (configuredDataUrl || defaultBundledDataUrl).replace(/\/$/, '');

/**
 * Each parquet file is exposed to the UI as a view with the same name.
 * `extraColumns` adds compatibility aliases on top of the file's own columns.
 * `size` is approximate and only used to tell users how much a first load downloads.
 */
const TABLES = [
  { view: 'filers', file: 'filers.parquet', extraColumns: '', size: 120_000 },
  { view: 'reports', file: 'reports.parquet', extraColumns: ', form_type AS report_type, loan_balance AS loans_outstanding', size: 8_400_000 },
  { view: 'expenditures', file: 'expenditures.parquet', extraColumns: ', expenditure_id AS id', size: 260_000 },
  { view: 'contributions', file: 'contributions_2020.parquet', extraColumns: ', contribution_id AS id', size: 19_400_000 },
] as const;

export const APPROX_DOWNLOAD_BYTES = TABLES.reduce((sum, t) => sum + t.size, 0);

/** Columns each view must expose; checked at startup so a bad data refresh fails loudly. */
export const NC_SCHEMA_CONTRACT: Record<(typeof TABLES)[number]['view'], string[]> = {
  filers: ['id', 'name', 'type', 'party', 'office_held', 'office_sought', 'office_district', 'city', 'state', 'status'],
  contributions: [
    'contribution_id', 'id', 'filer_id', 'filer_name', 'contributor_name', 'contributor_type',
    'contributor_city', 'contributor_state', 'contributor_zip', 'contributor_employer',
    'contributor_occupation', 'amount', 'date', 'received_date', 'description',
  ],
  expenditures: [
    'expenditure_id', 'id', 'filer_id', 'filer_name', 'payee_name', 'payee_city', 'payee_state',
    'payee_zip', 'amount', 'date', 'received_date', 'category', 'category_code', 'description',
  ],
  reports: [
    'report_id', 'filer_id', 'filer_name', 'form_type', 'report_type', 'period_start', 'period_end',
    'filed_date', 'received_date', 'total_contributions', 'total_expenditures', 'cash_on_hand',
    'loan_balance', 'loans_outstanding',
  ],
};

// ---- Initialization progress ------------------------------------------------

export type InitStatus =
  | 'idle'
  | 'loading-wasm'
  | 'checking-cache'
  | 'downloading'
  | 'loading-data'
  | 'ready'
  | 'error';

export interface InitProgress {
  status: InitStatus;
  error: string | null;
  currentFile?: string;
  fileProgress?: number; // 0-100
  totalProgress?: number; // 0-100
  downloadedBytes?: number;
  totalBytes?: number;
  cached?: boolean;
}

let initProgress: InitProgress = { status: 'idle', error: null };
const progressListeners = new Set<(progress: InitProgress) => void>();

function setProgress(updates: Partial<InitProgress>) {
  initProgress = { ...initProgress, ...updates };
  progressListeners.forEach((listener) => listener(initProgress));
}

export function onInitProgressChange(callback: (progress: InitProgress) => void): () => void {
  progressListeners.add(callback);
  callback(initProgress);
  return () => progressListeners.delete(callback);
}

// ---- Loading ----------------------------------------------------------------

let connection: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<void> | null = null;

/** Return a parquet file's bytes, from the IndexedDB cache when it is still current. */
async function loadParquetFile(fileName: string, fileIndex: number, totalFiles: number): Promise<ArrayBuffer> {
  const url = `${DATA_BASE_URL}/${fileName}`;

  const cached = await getCachedFile(url);
  if (cached && isCacheFresh(cached, await fetchRemoteVersion(url))) {
    setProgress({
      currentFile: fileName,
      fileProgress: 100,
      totalProgress: Math.round(((fileIndex + 1) / totalFiles) * 100),
      cached: true,
    });
    return cached.data;
  }

  setProgress({ status: 'downloading', currentFile: fileName, fileProgress: 0, cached: false });

  try {
    const { data, version } = await downloadWithProgress(url, (loaded, total) => {
      setProgress({
        fileProgress: Math.round((loaded / total) * 100),
        totalProgress: Math.round(((fileIndex + loaded / total) / totalFiles) * 100),
        downloadedBytes: loaded,
        totalBytes: total,
      });
    });
    await setCachedFile(url, data, version);
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load ${fileName} from ${url}. ${message}`);
  }
}

async function validateSchemaContract(conn: duckdb.AsyncDuckDBConnection): Promise<void> {
  const result = await conn.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_name IN (${TABLES.map((t) => `'${t.view}'`).join(', ')})
  `);

  const available = new Map<string, Set<string>>();
  for (const row of result.toArray()) {
    const { table_name, column_name } = row.toJSON() as { table_name: string; column_name: string };
    if (!available.has(table_name)) available.set(table_name, new Set());
    available.get(table_name)!.add(column_name.toLowerCase());
  }

  for (const [table, required] of Object.entries(NC_SCHEMA_CONTRACT)) {
    const have = available.get(table) ?? new Set<string>();
    const missing = required.filter((column) => !have.has(column.toLowerCase()));
    if (missing.length > 0) {
      throw new Error(`Schema contract mismatch for ${table}. Missing columns: ${missing.join(', ')}`);
    }
  }
}

async function startDuckDB(): Promise<void> {
  setProgress({ status: 'loading-wasm' });

  // The WASM bundle + worker come from jsDelivr: duckdb-eh.wasm is larger than
  // Cloudflare's 25 MiB per-asset limit, so it can't be shipped with the static build.
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' })
  );
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), new Worker(workerUrl));
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);

  const conn = await db.connect();

  setProgress({ status: 'checking-cache' });

  // Load and register one file at a time so only one raw buffer is held in JS memory.
  for (let i = 0; i < TABLES.length; i++) {
    const { view, file, extraColumns } = TABLES[i];
    const data = await loadParquetFile(file, i, TABLES.length);
    await db.registerFileBuffer(file, new Uint8Array(data));
    await conn.query(`CREATE VIEW IF NOT EXISTS ${view} AS SELECT *${extraColumns} FROM read_parquet('${file}')`);
  }

  setProgress({ status: 'loading-data', totalProgress: 100 });
  await validateSchemaContract(conn);

  connection = conn;
  setProgress({ status: 'ready' });
}

function initDuckDB(): Promise<void> {
  initPromise ??= startDuckDB().catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    setProgress({ status: 'error', error: message });
    console.error('DuckDB initialization failed:', error);
    throw error;
  });
  return initPromise;
}

/** Start loading (if needed) and resolve once the database is ready to query. */
export const waitForInit = initDuckDB;

/** Run SQL against the in-browser database, initializing it on first use. */
export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  await initDuckDB();
  const result = await connection!.query(sql);
  return result.toArray().map((row) => row.toJSON() as T);
}
