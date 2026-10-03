import { useEffect, useRef, useState } from 'react';
import type { SearchResult } from './queries';
import type { SortParams } from './types';

/** `value`, but only after it has stopped changing for `delayMs` (e.g. while typing an amount). */
export function useDebounced<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export type FetchPage<T> = (page: number, sort: SortParams | undefined, knownCount?: number) => Promise<SearchResult<T>>;

/**
 * Paginated, sortable search state. Re-runs `fetchPage` whenever `searchKey` (a serialization of the
 * search inputs), the page, or the sort changes. A new `searchKey` starts again from page 1, and
 * responses that arrive after a newer request was made are dropped so results never go stale.
 */
export function usePagedSearch<T>(fetchPage: FetchPage<T>, searchKey: string, initialSort?: SortParams) {
  const [pageState, setPageState] = useState({ key: searchKey, page: 1 });
  const [sort, setSortState] = useState<SortParams | undefined>(initialSort);
  const [data, setData] = useState<T[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const page = pageState.key === searchKey ? pageState.page : 1;
  const latestRequest = useRef(0);
  const countFor = useRef<{ key: string; count: number } | null>(null);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  useEffect(() => {
    const requestId = ++latestRequest.current;
    // The total only depends on the search inputs, so paging and sorting can reuse it.
    const knownCount = countFor.current?.key === searchKey ? countFor.current.count : undefined;
    setLoading(true);
    setError(null);

    fetchRef.current(page, sort, knownCount)
      .then((result) => {
        if (requestId !== latestRequest.current) return;
        countFor.current = { key: searchKey, count: result.count };
        setData(result.data);
        setCount(result.count);
      })
      .catch((err) => {
        if (requestId !== latestRequest.current) return;
        console.error('Search failed:', err);
        setError(err instanceof Error ? err.message : 'Search failed');
        setData([]);
        setCount(0);
      })
      .finally(() => {
        if (requestId === latestRequest.current) setLoading(false);
      });
  }, [searchKey, page, sort]);

  return {
    data,
    count,
    loading,
    error,
    page,
    setPage: (next: number) => setPageState({ key: searchKey, page: next }),
    sort,
    setSort: (next: SortParams | undefined) => {
      setSortState(next);
      setPageState({ key: searchKey, page: 1 });
    },
  };
}

/** Read a query-string parameter (components using this only render client-side, inside DatabaseLoader). */
export const getUrlParam = (name: string): string => new URLSearchParams(window.location.search).get(name) ?? '';

/** Reflect a search in the address bar so it survives reloads and can be shared. */
export function setUrlParam(name: string, value: string): void {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(null, '', url);
}
