import { useState, useEffect } from 'react';
import { onInitProgressChange, waitForInit, clearCache, getCacheInfo, APPROX_DOWNLOAD_BYTES, type InitProgress } from '../lib/duckdb';
import { formatBytes } from '../lib/parquet-cache';

const APPROX_DOWNLOAD = `~${Math.round(APPROX_DOWNLOAD_BYTES / 1e6)} MB`;

interface DatabaseLoaderProps {
  children: React.ReactNode;
}

export default function DatabaseLoader({ children }: DatabaseLoaderProps) {
  const [progress, setProgress] = useState<InitProgress>({ status: 'idle', error: null });
  const [cacheSize, setCacheSize] = useState<number>(0);

  useEffect(() => {
    // Check cache size
    getCacheInfo().then(info => setCacheSize(info.totalSize));

    // Start initialization
    waitForInit().catch(() => {
      // Error is handled by progress listener
    });

    // Listen for progress changes
    const unsubscribe = onInitProgressChange(setProgress);
    return unsubscribe;
  }, []);

  const handleClearCache = async () => {
    if (confirm(`Clear cached data? You will need to re-download ${APPROX_DOWNLOAD} on next visit.`)) {
      await clearCache();
      window.location.reload();
    }
  };

  if (progress.status === 'ready') {
    return <>{children}</>;
  }

  if (progress.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-red-500 mb-4">
          <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Failed to Load Database</h3>
        <p className="text-slate-600 text-center max-w-md mb-4">
          {progress.error || 'An unexpected error occurred while loading the database.'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-nc-blue text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={handleClearCache}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Clear Cache
          </button>
        </div>
      </div>
    );
  }

  // Get status message
  const getStatusMessage = () => {
    switch (progress.status) {
      case 'loading-wasm':
        return 'Loading database engine...';
      case 'checking-cache':
        return 'Checking local cache...';
      case 'downloading':
        return progress.currentFile
          ? `Downloading ${progress.currentFile}...`
          : 'Downloading data...';
      case 'loading-data':
        return 'Preparing database...';
      default:
        return 'Initializing...';
    }
  };

  // Get subtitle
  const getSubtitle = () => {
    if (progress.status === 'downloading' && progress.downloadedBytes && progress.totalBytes) {
      return `${formatBytes(progress.downloadedBytes)} / ${formatBytes(progress.totalBytes)}`;
    }
    if (progress.cached) {
      return 'Loading from local cache (no network)';
    }
    if (progress.status === 'loading-wasm') {
      return 'Setting up the in-browser SQL engine...';
    }
    if (progress.status === 'checking-cache') {
      return 'Checking if data is already cached locally...';
    }
    return `First load downloads ${APPROX_DOWNLOAD}, then it's cached locally`;
  };

  return (
    <div className="flex flex-col items-center justify-center py-20">
      {/* Progress circle */}
      <div className="relative mb-6">
        <svg className="w-24 h-24 transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="48"
            cy="48"
            r="40"
            stroke="#e2e8f0"
            strokeWidth="8"
            fill="none"
          />
          {/* Progress circle */}
          <circle
            cx="48"
            cy="48"
            r="40"
            stroke="#002868"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 40}`}
            strokeDashoffset={`${2 * Math.PI * 40 * (1 - (progress.totalProgress || 0) / 100)}`}
            className="transition-all duration-300"
          />
        </svg>
        {/* Percentage text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-nc-blue">
            {progress.totalProgress || 0}%
          </span>
        </div>
      </div>

      {/* Status message */}
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        {getStatusMessage()}
      </h3>

      {/* Subtitle */}
      <p className="text-slate-500 text-sm text-center max-w-md mb-4">
        {getSubtitle()}
      </p>

      {/* File progress bar (when downloading) */}
      {progress.status === 'downloading' && progress.fileProgress !== undefined && (
        <div className="w-64 mb-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>{progress.currentFile}</span>
            <span>{progress.fileProgress}%</span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-nc-blue transition-all duration-150"
              style={{ width: `${progress.fileProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Cache indicator */}
      {progress.cached && (
        <div className="flex items-center gap-2 text-green-600 text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Using cached data</span>
        </div>
      )}

      {/* Cache info */}
      {cacheSize > 0 && (
        <p className="text-xs text-slate-400 mt-4">
          Local cache: {formatBytes(cacheSize)}
        </p>
      )}
    </div>
  );
}
