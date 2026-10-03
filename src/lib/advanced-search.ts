import { query } from './duckdb';
import { paginatedQuery, type SearchResult } from './queries';
import { getCitiesInCounty } from './nc-geo';
import type { Contribution, Expenditure } from './types';
import { dateToInt, escapeSql, nameCondition, parseNumber, whereClause, type NameMatchMode } from './sql';

export type TransactionType = 'contributions' | 'expenditures';

export interface AdvancedFilters {
  transactionType: TransactionType;

  name: string;
  nameSearchType: NameMatchMode;

  amountMin: string;
  amountMax: string;
  dateFrom: string;
  dateTo: string;

  city: string;
  state: string;
  zipCode: string;
  county: string;

  // contributions only
  employer: string;
  occupation: string;
  contributorType: string;

  // expenditures only
  expenditureCategory: string;

  // filer-level
  filerName: string;
  filerType: string;
  officeType: string;
  party: string;

  // group contributions by donor
  groupByDonor: boolean;
  minContributions: string;
  minTotalAmount: string;
}

export const DEFAULT_FILTERS: AdvancedFilters = {
  transactionType: 'contributions',
  name: '',
  nameSearchType: 'contains',
  amountMin: '',
  amountMax: '',
  dateFrom: '',
  dateTo: '',
  city: '',
  state: '',
  zipCode: '',
  county: '',
  employer: '',
  occupation: '',
  contributorType: '',
  expenditureCategory: '',
  filerName: '',
  filerType: '',
  officeType: '',
  party: '',
  groupByDonor: false,
  minContributions: '',
  minTotalAmount: '',
};

export interface AggregatedDonor {
  contributor_name: string;
  num_contributions: number;
  total_amount: number;
  avg_amount: number;
  first_date: number;
  last_date: number;
}

export type SearchOutcome =
  | { kind: 'transactions'; data: (Contribution | Expenditure)[]; count: number }
  | { kind: 'donors'; data: AggregatedDonor[]; count: number };

/** URL query params that pre-fill the form and run a search (used by links from the home page). */
const URL_PARAM_KEYS = [
  'party', 'contributorType', 'amountMin', 'amountMax', 'minContributions', 'minTotalAmount', 'filerType', 'name',
] as const;

export function filtersFromParams(params: URLSearchParams): AdvancedFilters | null {
  const filters = { ...DEFAULT_FILTERS };
  let found = false;

  for (const key of URL_PARAM_KEYS) {
    const value = params.get(key);
    if (value) {
      filters[key] = value;
      found = true;
    }
  }
  if (params.get('groupByDonor') === 'true') {
    filters.groupByDonor = true;
    found = true;
  }
  return found ? filters : null;
}

const sqlText = (s: string) => `'${escapeSql(s)}'`;

/** FROM clause and WHERE conditions shared by the transaction and donor queries. */
function buildSource(filters: AdvancedFilters) {
  const isContribution = filters.transactionType === 'contributions';
  const table = isContribution ? 'contributions' : 'expenditures';
  const nameCol = isContribution ? 'contributor_name' : 'payee_name';
  const cityCol = isContribution ? 'contributor_city' : 'payee_city';
  const stateCol = isContribution ? 'contributor_state' : 'payee_state';
  const zipCol = isContribution ? 'contributor_zip' : 'payee_zip';

  // Party / filer type / office live on the filers table, so filtering on them needs a join.
  const needsJoin = Boolean(filters.party || filters.filerType || filters.officeType);
  const alias = isContribution ? 'c' : 'e';
  const p = needsJoin ? `${alias}.` : '';
  const from = needsJoin ? `${table} ${alias} JOIN filers f ON ${alias}.filer_id = f.id` : table;

  const conditions: string[] = [];
  const add = (condition: string) => conditions.push(condition);

  if (filters.name) add(nameCondition(`${p}${nameCol}`, filters.name, filters.nameSearchType));

  const min = parseNumber(filters.amountMin);
  const max = parseNumber(filters.amountMax);
  if (min !== null) add(`${p}amount >= ${min}`);
  if (max !== null) add(`${p}amount <= ${max}`);

  if (filters.dateFrom) add(`${p}date >= ${dateToInt(filters.dateFrom)}`);
  if (filters.dateTo) add(`${p}date <= ${dateToInt(filters.dateTo)}`);

  if (filters.city) add(`${p}${cityCol} ILIKE '%${escapeSql(filters.city)}%'`);
  if (filters.state) {
    const col = `${p}${stateCol}`;
    add(
      filters.state === 'NC'
        ? `(${col} = 'NC' OR UPPER(${col}) = 'NORTH CAROLINA')`
        : `${col} = ${sqlText(filters.state)}`
    );
  }
  if (filters.zipCode) add(`${p}${zipCol} LIKE '${escapeSql(filters.zipCode)}%'`);
  if (filters.county) {
    const cities = getCitiesInCounty(filters.county);
    if (cities.length > 0) add(`UPPER(${p}${cityCol}) IN (${cities.map(sqlText).join(', ')})`);
  }

  if (isContribution) {
    if (filters.employer) add(`${p}contributor_employer ILIKE '%${escapeSql(filters.employer)}%'`);
    if (filters.occupation) add(`${p}contributor_occupation ILIKE '%${escapeSql(filters.occupation)}%'`);
    if (filters.contributorType) add(`${p}contributor_type = ${sqlText(filters.contributorType)}`);
  } else if (filters.expenditureCategory) {
    add(`${p}category ILIKE '%${escapeSql(filters.expenditureCategory)}%'`);
  }

  if (filters.filerName) add(`${p}filer_name ILIKE '%${escapeSql(filters.filerName)}%'`);
  if (filters.party) add(`f.party = ${sqlText(filters.party)}`);
  if (filters.filerType) add(`f.type = ${sqlText(filters.filerType)}`);
  if (filters.officeType) {
    const office = sqlText(filters.officeType);
    add(`(f.office_sought = ${office} OR f.office_held = ${office})`);
  }

  return { from, prefix: p, conditions, select: needsJoin ? `${alias}.*` : '*' };
}

/** Run a search. `knownCount` skips the COUNT query when only the page changed. */
export async function runSearch(
  filters: AdvancedFilters,
  page: number,
  pageSize: number,
  knownCount?: number
): Promise<SearchOutcome> {
  const { from, prefix: p, conditions, select } = buildSource(filters);

  if (filters.groupByDonor && filters.transactionType === 'contributions') {
    const where = whereClause(conditions);
    const having: string[] = [];
    const minContributions = parseNumber(filters.minContributions);
    const minTotal = parseNumber(filters.minTotalAmount);
    if (minContributions !== null) having.push(`COUNT(*) > ${Math.trunc(minContributions)}`);
    if (minTotal !== null) having.push(`SUM(${p}amount) >= ${minTotal}`);
    const group = `GROUP BY ${p}contributor_name ${having.length ? `HAVING ${having.join(' AND ')}` : ''}`;

    const countPromise =
      knownCount !== undefined
        ? Promise.resolve(knownCount)
        : query<{ count: number }>(
            `SELECT COUNT(*) AS count FROM (SELECT 1 FROM ${from} ${where} ${group})`
          ).then((r) => Number(r[0]?.count || 0));

    const [count, data] = await Promise.all([
      countPromise,
      query<AggregatedDonor>(`
        SELECT
          ${p}contributor_name AS contributor_name,
          COUNT(*) AS num_contributions,
          SUM(${p}amount) AS total_amount,
          AVG(${p}amount) AS avg_amount,
          MIN(${p}date) AS first_date,
          MAX(${p}date) AS last_date
        FROM ${from}
        ${where}
        ${group}
        ORDER BY num_contributions DESC, total_amount DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `),
    ]);
    return { kind: 'donors', data, count };
  }

  const result: SearchResult<Contribution | Expenditure> = await paginatedQuery(
    from,
    conditions,
    `ORDER BY ${p}date DESC`,
    { page, pageSize, knownCount },
    select
  );
  return { kind: 'transactions', data: result.data, count: result.count };
}
