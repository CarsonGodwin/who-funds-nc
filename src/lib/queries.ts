import { query } from './duckdb';
import type { Filer, Contribution, SortParams } from './types';
import { dateToInt, escapeSql, nameCondition, orderByClause, todayInt, whereClause } from './sql';

// ---- Search -----------------------------------------------------------------

export interface SearchFilters {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  contributorType?: string;
  party?: string;
  officeType?: string;
  district?: string;
  filerId?: string;
  filerType?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sort?: SortParams;
  /** Skip the COUNT query when the total is already known (e.g. when only the page changed). */
  knownCount?: number;
}

export interface SearchResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** CSV exports are capped so a broad search can't build a multi-hundred-MB file in memory. */
export const EXPORT_LIMIT = 10_000;

/** Run a filtered, sorted, paginated SELECT * plus (unless known) its total count. */
export async function paginatedQuery<T>(
  from: string,
  conditions: string[],
  orderBy: string,
  { page, pageSize, knownCount }: PaginationParams,
  select = '*'
): Promise<SearchResult<T>> {
  const where = whereClause(conditions);

  const countPromise =
    knownCount !== undefined
      ? Promise.resolve(knownCount)
      : query<{ count: number }>(`SELECT COUNT(*) AS count FROM ${from} ${where}`).then((r) => Number(r[0]?.count || 0));

  const [count, data] = await Promise.all([
    countPromise,
    query<T>(`SELECT ${select} FROM ${from} ${where} ${orderBy} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
  ]);

  return { data, count, page, pageSize, totalPages: Math.ceil(count / pageSize) };
}

const DEFAULT_PAGINATION: PaginationParams = { page: 1, pageSize: 25 };

const dateConditions = (dateFrom?: string, dateTo?: string, column = 'date'): string[] => [
  ...(dateFrom ? [`${column} >= ${dateToInt(dateFrom)}`] : []),
  ...(dateTo ? [`${column} <= ${dateToInt(dateTo)}`] : []),
];

// ---- Contributions ----------------------------------------------------------

const CONTRIBUTION_SORT_COLUMNS = ['contributor_name', 'filer_name', 'amount', 'date', 'contributor_city'] as const;

function contributionConditions(filters: SearchFilters): string[] {
  const conditions = dateConditions(filters.dateFrom, filters.dateTo);
  if (filters.query) conditions.push(nameCondition('contributor_name', filters.query));
  if (filters.amountMin !== undefined) conditions.push(`amount >= ${filters.amountMin}`);
  if (filters.amountMax !== undefined) conditions.push(`amount <= ${filters.amountMax}`);
  if (filters.contributorType) conditions.push(`contributor_type = '${escapeSql(filters.contributorType)}'`);
  if (filters.filerId) conditions.push(`filer_id = '${escapeSql(filters.filerId)}'`);
  return conditions;
}

const contributionOrder = (sort?: SortParams) =>
  `${orderByClause(sort, CONTRIBUTION_SORT_COLUMNS, 'date DESC')}, contribution_id`;

export function searchContributions(
  filters: SearchFilters,
  pagination: PaginationParams = DEFAULT_PAGINATION
): Promise<SearchResult<Contribution>> {
  return paginatedQuery('contributions', contributionConditions(filters), contributionOrder(pagination.sort), pagination);
}

/** The rows a CSV export of this search should contain (first EXPORT_LIMIT, in the on-screen order). */
export function exportContributions(filters: SearchFilters, sort?: SortParams): Promise<Contribution[]> {
  return query<Contribution>(`
    SELECT contribution_id, date, amount, contributor_name, contributor_type, contributor_employer,
           contributor_occupation, contributor_city, contributor_state, contributor_zip,
           filer_id, filer_name, description
    FROM contributions
    ${whereClause(contributionConditions(filters))}
    ${contributionOrder(sort)}
    LIMIT ${EXPORT_LIMIT}
  `);
}

// ---- Filers -----------------------------------------------------------------

export interface FilerWithTotals extends Filer {
  total_raised: number;
  contribution_count: number;
}

const FILER_SORT_COLUMNS = ['name', 'city', 'total_raised', 'contribution_count'] as const;

let filerSummary: Promise<unknown> | null = null;

/**
 * Per-committee contribution totals, materialized once per page load so the committee list
 * can be sorted by money raised without re-aggregating every contribution on each page.
 */
function ensureFilerSummary(): Promise<unknown> {
  filerSummary ??= query(`
    CREATE TEMP TABLE IF NOT EXISTS filer_summary AS
    SELECT filer_id, SUM(amount) AS total_raised, COUNT(*) AS contribution_count
    FROM contributions
    GROUP BY filer_id
  `).catch((error) => {
    filerSummary = null;
    throw error;
  });
  return filerSummary;
}

export async function searchFilers(
  filters: SearchFilters,
  pagination: PaginationParams = DEFAULT_PAGINATION
): Promise<SearchResult<FilerWithTotals>> {
  await ensureFilerSummary();

  const conditions: string[] = [];
  if (filters.query) conditions.push(nameCondition('f.name', filters.query));
  if (filters.party) conditions.push(`f.party = '${escapeSql(filters.party)}'`);
  if (filters.officeType) {
    const office = escapeSql(filters.officeType);
    conditions.push(`(f.office_held = '${office}' OR f.office_sought = '${office}')`);
  }
  if (filters.district) conditions.push(`f.office_district = '${escapeSql(filters.district)}'`);
  if (filters.filerType) conditions.push(`f.type = '${escapeSql(filters.filerType)}'`);

  const orderBy = `${orderByClause(pagination.sort, FILER_SORT_COLUMNS, 'total_raised DESC')}, name ASC`;
  return paginatedQuery(
    'filers f LEFT JOIN filer_summary s ON s.filer_id = f.id',
    conditions,
    orderBy,
    pagination,
    'f.*, COALESCE(s.total_raised, 0) AS total_raised, COALESCE(s.contribution_count, 0) AS contribution_count'
  );
}

// ---- Distinct values (for filter dropdowns) ---------------------------------

const distinctCache = new Map<string, Promise<string[]>>();

/** Distinct non-empty values of a column, so dropdowns only offer options that exist in the data. */
export function getDistinctValues(table: 'filers' | 'contributions' | 'expenditures', column: string): Promise<string[]> {
  const key = `${table}.${column}`;
  let result = distinctCache.get(key);
  if (!result) {
    result = query<{ value: string }>(
      `SELECT DISTINCT ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> '' ORDER BY 1`
    ).then((rows) => rows.map((r) => r.value));
    distinctCache.set(key, result);
  }
  return result;
}

// ---- Filer profile ----------------------------------------------------------

const filerIs = (filerId: string) => `filer_id = '${escapeSql(filerId)}'`;

export async function getFiler(filerId: string): Promise<Filer | null> {
  const [filer] = await query<Filer>(`SELECT * FROM filers WHERE id = '${escapeSql(filerId)}' LIMIT 1`);
  return filer ?? null;
}

/** Years with at least one contribution, newest first; drives the profile's year filter. */
export async function getContributionYears(filerId: string): Promise<number[]> {
  const rows = await query<{ year: number }>(`
    SELECT DISTINCT date // 10000 AS year
    FROM contributions
    WHERE ${filerIs(filerId)} AND date BETWEEN 19000101 AND ${todayInt()}
    ORDER BY year DESC
  `);
  return rows.map((r) => Number(r.year));
}

export interface FilerStats {
  totalRaised: number;
  contributionCount: number;
  donorCount: number;
  totalSpent: number;
  expenditureCount: number;
  earliest: number | null;
  latest: number | null;
}

export async function getFilerStats(filerId: string, dateFrom?: string, dateTo?: string): Promise<FilerStats> {
  const where = whereClause([filerIs(filerId), ...dateConditions(dateFrom, dateTo)]);

  const [[contrib], [expend]] = await Promise.all([
    query<{ total: number; count: number; donors: number; earliest: number | null; latest: number | null }>(`
      SELECT COALESCE(SUM(amount), 0) AS total,
             COUNT(*) AS count,
             COUNT(DISTINCT contributor_name) AS donors,
             MIN(date) AS earliest,
             MAX(date) FILTER (WHERE date <= ${todayInt()}) AS latest
      FROM contributions ${where}
    `),
    query<{ total: number; count: number }>(`
      SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM expenditures ${where}
    `),
  ]);

  return {
    totalRaised: Number(contrib?.total ?? 0),
    contributionCount: Number(contrib?.count ?? 0),
    donorCount: Number(contrib?.donors ?? 0),
    totalSpent: Number(expend?.total ?? 0),
    expenditureCount: Number(expend?.count ?? 0),
    earliest: contrib?.earliest ? Number(contrib.earliest) : null,
    latest: contrib?.latest ? Number(contrib.latest) : null,
  };
}

export interface TopDonor {
  name: string;
  total: number;
  count: number;
}

export async function getTopDonors(filerId: string, limit: number, dateFrom?: string, dateTo?: string): Promise<TopDonor[]> {
  const results = await query<TopDonor>(`
    SELECT COALESCE(contributor_name, 'Unknown') AS name, SUM(amount) AS total, COUNT(*) AS count
    FROM contributions
    ${whereClause([filerIs(filerId), ...dateConditions(dateFrom, dateTo)])}
    GROUP BY contributor_name
    ORDER BY total DESC
    LIMIT ${limit}
  `);
  return results.map((r) => ({ name: r.name, total: Number(r.total), count: Number(r.count) }));
}

export interface MonthlyTotal {
  /** YYYYMM */
  month: number;
  total: number;
  count: number;
}

/** Contributions per calendar month, with empty months filled in so the chart's time axis is even. */
export async function getMonthlyTotals(filerId: string, dateFrom?: string, dateTo?: string): Promise<MonthlyTotal[]> {
  const rows = await query<MonthlyTotal>(`
    SELECT date // 100 AS month, SUM(amount) AS total, COUNT(*) AS count
    FROM contributions
    ${whereClause([filerIs(filerId), `date <= ${todayInt()}`, ...dateConditions(dateFrom, dateTo)])}
    GROUP BY 1
    ORDER BY 1
  `);
  if (rows.length === 0) return [];

  const byMonth = new Map(rows.map((r) => [Number(r.month), { total: Number(r.total), count: Number(r.count) }]));
  const filled: MonthlyTotal[] = [];
  let month = Number(rows[0].month);
  const last = Number(rows[rows.length - 1].month);
  while (month <= last) {
    filled.push({ month, ...(byMonth.get(month) ?? { total: 0, count: 0 }) });
    month = month % 100 === 12 ? month + 89 : month + 1; // 202412 -> 202501
  }
  return filled;
}
