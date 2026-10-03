import { query } from './duckdb';
import type { Filer, Contribution, SortParams } from './types';
import { dateToInt, escapeSql, nameCondition, orderByClause, whereClause } from './sql';

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

const DEFAULT_PAGINATION: PaginationParams = { page: 1, pageSize: 25 };

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

const CONTRIBUTION_SORT_COLUMNS = ['contributor_name', 'filer_name', 'amount', 'date', 'contributor_city'] as const;
const FILER_SORT_COLUMNS = ['name', 'type', 'office_held', 'party', 'status'] as const;

export function searchContributions(
  filters: SearchFilters,
  pagination: PaginationParams = DEFAULT_PAGINATION
): Promise<SearchResult<Contribution>> {
  const conditions: string[] = [];
  if (filters.query) conditions.push(nameCondition('contributor_name', filters.query));
  if (filters.dateFrom) conditions.push(`date >= ${dateToInt(filters.dateFrom)}`);
  if (filters.dateTo) conditions.push(`date <= ${dateToInt(filters.dateTo)}`);
  if (filters.amountMin !== undefined) conditions.push(`amount >= ${filters.amountMin}`);
  if (filters.amountMax !== undefined) conditions.push(`amount <= ${filters.amountMax}`);
  if (filters.contributorType) conditions.push(`contributor_type = '${escapeSql(filters.contributorType)}'`);
  if (filters.filerId) conditions.push(`filer_id = '${escapeSql(filters.filerId)}'`);

  const orderBy = orderByClause(pagination.sort, CONTRIBUTION_SORT_COLUMNS, 'date DESC');
  return paginatedQuery('contributions', conditions, orderBy, pagination);
}

export function searchFilers(
  filters: SearchFilters,
  pagination: PaginationParams = DEFAULT_PAGINATION
): Promise<SearchResult<Filer>> {
  const conditions: string[] = [];
  if (filters.query) conditions.push(nameCondition('name', filters.query));
  if (filters.party) conditions.push(`party = '${escapeSql(filters.party)}'`);
  if (filters.officeType) {
    const office = escapeSql(filters.officeType);
    conditions.push(`(office_held = '${office}' OR office_sought = '${office}')`);
  }
  if (filters.district) conditions.push(`office_district = '${escapeSql(filters.district)}'`);
  if (filters.filerType) conditions.push(`type = '${escapeSql(filters.filerType)}'`);

  const orderBy = orderByClause(pagination.sort, FILER_SORT_COLUMNS, 'name ASC');
  return paginatedQuery('filers', conditions, orderBy, pagination);
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

function dateConditions(dateFrom?: string, dateTo?: string): string[] {
  const conditions: string[] = [];
  if (dateFrom) conditions.push(`date >= ${dateToInt(dateFrom)}`);
  if (dateTo) conditions.push(`date <= ${dateToInt(dateTo)}`);
  return conditions;
}

export interface LatestReport {
  reportId: number;
  formType: string;
  periodStart: string;
  periodEnd: string;
  filedDate: number;
  totalContributions: number;
  totalExpenditures: number;
  cashOnHand: number | null;
  loanBalance: number | null;
}

const nullableNumber = (value: number | null) => (value != null ? Number(value) : null);

export async function getLatestReport(filerId: string): Promise<LatestReport | null> {
  const [r] = await query<{
    report_id: number;
    form_type: string;
    period_start: string;
    period_end: string;
    filed_date: number;
    total_contributions: number;
    total_expenditures: number;
    cash_on_hand: number | null;
    loan_balance: number | null;
  }>(`
    SELECT report_id, form_type, period_start, period_end, filed_date,
           total_contributions, total_expenditures, cash_on_hand, loan_balance
    FROM reports
    WHERE ${filerIs(filerId)}
    ORDER BY period_end DESC, filed_date DESC
    LIMIT 1
  `);

  if (!r) return null;

  return {
    reportId: r.report_id,
    formType: r.form_type || '',
    periodStart: r.period_start || '',
    periodEnd: r.period_end || '',
    filedDate: r.filed_date || 0,
    totalContributions: Number(r.total_contributions || 0),
    totalExpenditures: Number(r.total_expenditures || 0),
    cashOnHand: nullableNumber(r.cash_on_hand),
    loanBalance: nullableNumber(r.loan_balance),
  };
}

export async function getFilerById(filerId: string): Promise<{
  filer: Filer | null;
  totalContributions: number;
  totalExpended: number;
  contributionCount: number;
} | null> {
  const [filers, stats] = await Promise.all([
    query<Filer>(`SELECT * FROM filers WHERE id = '${escapeSql(filerId)}' LIMIT 1`),
    query<{ contrib_total: number; contrib_count: number; expend_total: number }>(`
      SELECT
        (SELECT COALESCE(SUM(amount), 0) FROM contributions WHERE ${filerIs(filerId)}) AS contrib_total,
        (SELECT COUNT(*) FROM contributions WHERE ${filerIs(filerId)}) AS contrib_count,
        (SELECT COALESCE(SUM(amount), 0) FROM expenditures WHERE ${filerIs(filerId)}) AS expend_total
    `),
  ]);

  if (filers.length === 0) return null;

  return {
    filer: filers[0],
    totalContributions: Number(stats[0]?.contrib_total || 0),
    totalExpended: Number(stats[0]?.expend_total || 0),
    contributionCount: Number(stats[0]?.contrib_count || 0),
  };
}

export async function getTopDonorsFiltered(
  filerId: string,
  limit: number = 10,
  dateFrom?: string,
  dateTo?: string
): Promise<{ name: string; total: number; count: number }[]> {
  const where = whereClause([filerIs(filerId), ...dateConditions(dateFrom, dateTo)]);

  const results = await query<{ name: string; total: number; count: number }>(`
    SELECT COALESCE(contributor_name, 'Unknown') AS name, SUM(amount) AS total, COUNT(*) AS count
    FROM contributions
    ${where}
    GROUP BY contributor_name
    ORDER BY total DESC
    LIMIT ${limit}
  `);

  return results.map((r) => ({ name: r.name, total: Number(r.total), count: Number(r.count) }));
}

export async function getFilerStatsFiltered(
  filerId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{
  totalContributions: number;
  totalExpended: number;
  contributionCount: number;
  expenditureCount: number;
  dateRange: { earliest: number | null; latest: number | null };
}> {
  const where = whereClause([filerIs(filerId), ...dateConditions(dateFrom, dateTo)]);

  const [contribStats, expendStats] = await Promise.all([
    query<{ total: number; count: number; earliest: number; latest: number }>(`
      SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count, MIN(date) AS earliest, MAX(date) AS latest
      FROM contributions ${where}
    `),
    query<{ total: number; count: number }>(`
      SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM expenditures ${where}
    `),
  ]);

  return {
    totalContributions: Number(contribStats[0]?.total || 0),
    totalExpended: Number(expendStats[0]?.total || 0),
    contributionCount: Number(contribStats[0]?.count || 0),
    expenditureCount: Number(expendStats[0]?.count || 0),
    dateRange: {
      earliest: contribStats[0]?.earliest || null,
      latest: contribStats[0]?.latest || null,
    },
  };
}

export interface ReportTimelinePoint {
  date: string;
  periodStart: string;
  periodEnd: string;
  contributions: number;
  expenditures: number;
  cashOnHand: number | null;
  loanBalance: number | null;
}

/** Timeline from filed reports (actual reported totals and cash on hand). */
export async function getReportTimeline(
  filerId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<ReportTimelinePoint[]> {
  const conditions = [filerIs(filerId)];
  if (dateFrom) conditions.push(`period_end >= ${dateToInt(dateFrom)}`);
  if (dateTo) conditions.push(`period_end <= ${dateToInt(dateTo)}`);

  const results = await query<{
    period_start: string;
    period_end: string;
    total_contributions: number;
    total_expenditures: number;
    cash_on_hand: number | null;
    loan_balance: number | null;
  }>(`
    SELECT period_start, period_end, total_contributions, total_expenditures, cash_on_hand, loan_balance
    FROM reports
    ${whereClause(conditions)}
    ORDER BY period_end ASC
  `);

  return results.map((r) => ({
    date: r.period_end || '',
    periodStart: r.period_start || '',
    periodEnd: r.period_end || '',
    contributions: Number(r.total_contributions || 0),
    expenditures: Number(r.total_expenditures || 0),
    cashOnHand: nullableNumber(r.cash_on_hand),
    loanBalance: nullableNumber(r.loan_balance),
  }));
}
