/**
 * IndexedDB cache for parquet files.
 * Stores downloaded files locally and revalidates them against the server's
 * Last-Modified / Content-Length so refreshed data is picked up.
 */

const DB_NAME = 'who-funds-nc-parquet-cache';
// Caches from earlier app names; deleted on startup so they don't keep using disk space.
const LEGACY_DB_NAMES = ['tec-parquet-cache', 'armadollar-nc-parquet-cache'];
const DB_VERSION = 1;
const STORE_NAME = 'parquet-files';

/**
 * Identifies a published version of a remote file. ETag is only readable same-origin (or when the
 * bucket exposes it); Last-Modified is CORS-safelisted. Content-Length is deliberately not used:
 * it can differ between HEAD and GET when the CDN compresses.
 */
export interface RemoteVersion {
  etag: string | null;
  lastModified: string | null;
}

const normalizeEtag = (etag: string | null) => etag?.replace(/^W\//, '') ?? null;

function readVersion(response: Response): RemoteVersion {
  return {
    etag: normalizeEtag(response.headers.get('etag')),
    lastModified: response.headers.get('last-modified'),
  };
}

interface CachedFile {
  url: string;
  data: ArrayBuffer;
  timestamp: number;
  size: number;
  version?: RemoteVersion;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  LEGACY_DB_NAMES.forEach((name) => indexedDB.deleteDatabase(name));

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };
  });

  return dbPromise;
}

export async function getCachedFile(url: string): Promise<CachedFile | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(url);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as CachedFile | undefined) ?? null);
    });
  } catch (error) {
    console.warn('Failed to get cached file:', error);
    return null;
  }
}

/**
 * Ask the server which version of a file it currently has.
 * Returns null if the server can't be reached (e.g. offline) so callers can fall back to the cache.
 */
export async function fetchRemoteVersion(url: string): Promise<RemoteVersion | null> {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    if (!response.ok) return null;
    return readVersion(response);
  } catch {
    return null;
  }
}

/** True when the cached copy still matches what the server has (or we can't tell). */
export function isCacheFresh(cached: CachedFile, remote: RemoteVersion | null): boolean {
  if (!remote || !cached.version) return true;
  if (remote.etag && cached.version.etag) return remote.etag === cached.version.etag;
  if (remote.lastModified && cached.version.lastModified) {
    return remote.lastModified === cached.version.lastModified;
  }
  return true;
}

export async function setCachedFile(url: string, data: ArrayBuffer, version?: RemoteVersion | null): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const entry: CachedFile = {
        url,
        data,
        timestamp: Date.now(),
        size: data.byteLength,
        version: version ?? undefined,
      };
      const request = store.put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn('Failed to cache file:', error);
  }
}

export async function getCacheInfo(): Promise<{ files: string[]; totalSize: number }> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = request.result as CachedFile[];
        resolve({
          files: results.map(r => r.url),
          totalSize: results.reduce((sum, r) => sum + r.size, 0),
        });
      };
    });
  } catch (error) {
    console.warn('Failed to get cache info:', error);
    return { files: [], totalSize: 0 };
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn('Failed to clear cache:', error);
  }
}

export async function isCacheAvailable(): Promise<boolean> {
  try {
    await openDB();
    return true;
  } catch {
    return false;
  }
}

// Download file with progress tracking
export interface Download {
  data: ArrayBuffer;
  version: RemoteVersion;
}

export async function downloadWithProgress(
  url: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<Download> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `Network error fetching ${url}. Check that the parquet files were deployed, or, if PUBLIC_DATA_URL is set, that it is reachable and allows CORS from this site.`
    );
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  const version = readVersion(response);

  if (!response.body) {
    // Fallback for browsers without streaming support
    return { data: await response.arrayBuffer(), version };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    loaded += value.length;
    if (onProgress && total > 0) onProgress(loaded, total);
  }

  const combined = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return { data: combined.buffer, version };
}

// Format bytes for display
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
