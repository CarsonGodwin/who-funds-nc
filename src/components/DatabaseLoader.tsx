import { useState, useEffect, type ReactNode } from 'react';
import {
  onInitProgressChange,
  waitForInit,
  clearCache,
  getCacheInfo,
  APPROX_DOWNLOAD_LABEL,
  type InitProgress,
} from '../lib/duckdb';
import { formatBytes } from '../lib/parquet-cache';

const STATUS_MESSAGES: Partial<Record<InitProgress['status'], string>> = {
  'loading-wasm': 'Starting the database engine…',
  'checking-cache': 'Checking for saved data…',
  'loading-data': 'Preparing the data…',
};

function statusMessage(progress: InitProgress): string {
  if (progress.status === 'downloading') return 'Downloading campaign finance data…';
  if (progress.cached) return 'Loading saved data…';
  return STATUS_MESSAGES[progress.status] ?? 'Getting ready…';
}

function detailMessage(progress: InitProgress): string {
  if (progress.status === 'downloading' && progress.downloadedBytes && progress.totalBytes) {
    return `${progress.currentFile}: ${formatBytes(progress.downloadedBytes)} of ${formatBytes(progress.totalBytes)}`;
  }
  if (progress.cached) return 'Using the copy saved in your browser from an earlier visit.';
  return `The first visit downloads ${APPROX_DOWNLOAD_LABEL}; after that it loads from your browser's cache.`;
}

/** Renders `children` once the in-browser database is ready, with download progress until then. */
export default function DatabaseLoader({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<InitProgress>({ status: 'idle', error: null });
  const [cacheSize, setCacheSize] = useState(0);

  useEffect(() => {
    getCacheInfo().then((info) => setCacheSize(info.totalSize));
    waitForInit().catch(() => {
      // Reported through the progress listener.
    });
    return onInitProgressChange(setProgress);
  }, []);

  const handleClearCache = async () => {
    if (confirm(`Clear saved data? The next visit will download ${APPROX_DOWNLOAD_LABEL} again.`)) {
      await clearCache();
      window.location.reload();
    }
  };

  if (progress.status === 'ready') {
    return <>{children}</>;
  }

  if (progress.status === 'error') {
    return (
      <div role="alert" className="card mx-auto max-w-lg p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m0 3.75h.008M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">The data couldn't be loaded</h2>
        <p className="mt-2 text-sm break-words text-slate-600">
          {progress.error || 'An unexpected error occurred while loading the database.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={() => window.location.reload()} className="btn-primary">
            Try again
          </button>
          <button type="button" onClick={handleClearCache} className="btn-secondary">
            Clear saved data
          </button>
        </div>
      </div>
    );
  }

  const percent = progress.totalProgress ?? 0;

  return (
    <div className="card mx-auto max-w-lg p-8 text-center" aria-live="polite">
      <h2 className="text-lg font-semibold text-slate-900">{statusMessage(progress)}</h2>
      <p className="mt-1 text-sm text-slate-500">{detailMessage(progress)}</p>

      <div
        className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label="Loading data"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full rounded-full bg-nc-blue transition-[width] duration-300" style={{ width: `${Math.max(percent, 2)}%` }} />
      </div>
      <p className="mt-2 text-xs font-medium text-slate-500 tabular-nums">{percent}%</p>

      {cacheSize > 0 && <p className="mt-4 text-xs text-slate-400">Saved in this browser: {formatBytes(cacheSize)}</p>}
    </div>
  );
}
