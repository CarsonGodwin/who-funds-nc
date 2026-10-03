// Helpers for building SQL strings. DuckDB-WASM runs in the user's own browser on
// public data, so the goal is correctness (quotes, bad numbers) rather than tenant isolation.

export const escapeSql = (str: string): string => str.replace(/'/g, "''");

export const sqlString = (str: string): string => `'${escapeSql(str)}'`;

/** "2020-01-31" (from <input type="date">) -> 20200131, the format stored in the parquet files. */
export const dateToInt = (dateStr: string): number => parseInt(dateStr.replace(/-/g, ''), 10);

/**
 * Today as YYYYMMDD. The source data has a few typo'd dates far in the future (e.g. 98960907),
 * so "latest" and per-year/month summaries ignore anything after today.
 */
export function todayInt(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Parse user-entered numeric text; returns null when empty or not a finite number. */
export function parseNumber(text: string | undefined): number | null {
  if (text === undefined || text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export type NameMatchMode = 'contains' | 'exact' | 'starts_with';

export function nameCondition(column: string, term: string, mode: NameMatchMode = 'contains'): string {
  const t = escapeSql(term);
  if (mode === 'exact') return `${column} ILIKE '${t}'`;
  if (mode === 'starts_with') return `${column} ILIKE '${t}%'`;
  return `${column} ILIKE '%${t}%'`;
}

export const whereClause = (conditions: string[]): string =>
  conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

/** Only allow columns from a known list into ORDER BY. */
export function orderByClause(
  sort: { column: string; direction: 'asc' | 'desc' } | undefined,
  allowed: readonly string[],
  fallback: string
): string {
  if (sort && allowed.includes(sort.column)) {
    return `ORDER BY ${sort.column} ${sort.direction === 'asc' ? 'ASC' : 'DESC'}`;
  }
  return `ORDER BY ${fallback}`;
}
