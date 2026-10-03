import { dateToInt, escapeSql, parseNumber, sqlString } from './sql';

export type FieldType = 'text' | 'number' | 'date';
export type DataSource = 'contributions' | 'expenditures' | 'filers' | 'reports';
export type LogicalOperator = 'AND' | 'OR';
export type Metric = 'sum' | 'count' | 'avg' | 'min' | 'max';

export type Operator =
  | 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with'
  | 'greater_than' | 'less_than' | 'between' | 'in_list' | 'is_empty' | 'is_not_empty' | 'regex';

export interface Condition {
  id: string;
  field: string;
  operator: Operator;
  value: string;
  value2?: string; // upper bound for "between"
}

export interface ConditionGroup {
  id: string;
  logicalOperator: LogicalOperator;
  conditions: (Condition | ConditionGroup)[];
}

export type QueryNode = Condition | ConditionGroup;

export interface AggregationConfig {
  enabled: boolean;
  groupBy: string[];
  metrics: Metric[];
  sortBy: Metric;
  sortDir: 'asc' | 'desc';
}

export interface FieldDef {
  value: string;
  label: string;
  type: FieldType;
}

export const DATA_SOURCES: DataSource[] = ['contributions', 'expenditures', 'filers', 'reports'];

export const FIELDS: Record<DataSource, FieldDef[]> = {
  contributions: [
    { value: 'contributor_name', label: 'Contributor Name', type: 'text' },
    { value: 'filer_name', label: 'Recipient (Filer)', type: 'text' },
    { value: 'filer_id', label: 'Filer ID', type: 'text' },
    { value: 'amount', label: 'Amount', type: 'number' },
    { value: 'date', label: 'Contribution Date', type: 'date' },
    { value: 'contributor_type', label: 'Contributor Type', type: 'text' },
    { value: 'contributor_city', label: 'Contributor City', type: 'text' },
    { value: 'contributor_state', label: 'Contributor State', type: 'text' },
    { value: 'contributor_zip', label: 'Contributor Zip', type: 'text' },
    { value: 'contributor_employer', label: 'Employer', type: 'text' },
    { value: 'contributor_occupation', label: 'Occupation', type: 'text' },
    { value: 'description', label: 'Description', type: 'text' },
    { value: 'received_date', label: 'Report Filed Date', type: 'date' },
  ],
  expenditures: [
    { value: 'payee_name', label: 'Payee Name', type: 'text' },
    { value: 'filer_name', label: 'Payer (Filer)', type: 'text' },
    { value: 'filer_id', label: 'Filer ID', type: 'text' },
    { value: 'amount', label: 'Amount', type: 'number' },
    { value: 'date', label: 'Expenditure Date', type: 'date' },
    { value: 'category', label: 'Category', type: 'text' },
    { value: 'payee_city', label: 'Payee City', type: 'text' },
    { value: 'payee_state', label: 'Payee State', type: 'text' },
    { value: 'payee_zip', label: 'Payee Zip', type: 'text' },
    { value: 'description', label: 'Description', type: 'text' },
    { value: 'received_date', label: 'Report Filed Date', type: 'date' },
  ],
  filers: [
    { value: 'name', label: 'Filer Name', type: 'text' },
    { value: 'id', label: 'Filer ID', type: 'text' },
    { value: 'type', label: 'Filer Type', type: 'text' },
    { value: 'party', label: 'Party', type: 'text' },
    { value: 'office_held', label: 'Office Held', type: 'text' },
    { value: 'office_sought', label: 'Office Sought', type: 'text' },
    { value: 'office_district', label: 'Office/District', type: 'text' },
    { value: 'status', label: 'Status', type: 'text' },
    { value: 'city', label: 'City', type: 'text' },
    { value: 'state', label: 'State', type: 'text' },
  ],
  reports: [
    { value: 'filer_name', label: 'Filer Name', type: 'text' },
    { value: 'filer_id', label: 'Filer ID', type: 'text' },
    { value: 'report_type', label: 'Report Type', type: 'text' },
    { value: 'period_start', label: 'Period Start', type: 'date' },
    { value: 'period_end', label: 'Period End', type: 'date' },
    { value: 'filed_date', label: 'Filed Date', type: 'date' },
    { value: 'total_contributions', label: 'Total Contributions', type: 'number' },
    { value: 'total_expenditures', label: 'Total Expenditures', type: 'number' },
    { value: 'cash_on_hand', label: 'Cash on Hand', type: 'number' },
    { value: 'loan_balance', label: 'Loan Balance', type: 'number' },
  ],
};

/** Column that sum/avg/min/max aggregate over; sources without one only support COUNT. */
export const AMOUNT_FIELD: Partial<Record<DataSource, string>> = {
  contributions: 'amount',
  expenditures: 'amount',
};

export const OPERATORS: { value: Operator; label: string; types: FieldType[] }[] = [
  { value: 'equals', label: 'equals', types: ['text', 'number', 'date'] },
  { value: 'not_equals', label: 'does not equal', types: ['text', 'number', 'date'] },
  { value: 'contains', label: 'contains', types: ['text'] },
  { value: 'not_contains', label: 'does not contain', types: ['text'] },
  { value: 'starts_with', label: 'starts with', types: ['text'] },
  { value: 'ends_with', label: 'ends with', types: ['text'] },
  { value: 'greater_than', label: 'is greater than', types: ['number', 'date'] },
  { value: 'less_than', label: 'is less than', types: ['number', 'date'] },
  { value: 'between', label: 'is between', types: ['number', 'date'] },
  { value: 'in_list', label: 'is one of (comma-separated)', types: ['text'] },
  { value: 'is_empty', label: 'is empty', types: ['text', 'number', 'date'] },
  { value: 'is_not_empty', label: 'is not empty', types: ['text', 'number', 'date'] },
  { value: 'regex', label: 'matches pattern (regex)', types: ['text'] },
];

export const MAX_LIMIT = 10_000;
export const DEFAULT_LIMIT = 1000;

const DEFAULT_FIELD: Record<DataSource, string> = {
  contributions: 'contributor_name',
  expenditures: 'payee_name',
  filers: 'name',
  reports: 'filer_name',
};

const DEFAULT_ORDER_BY: Record<DataSource, string> = {
  contributions: 'date DESC',
  expenditures: 'date DESC',
  filers: 'name ASC',
  reports: 'period_end DESC',
};

// ---- Tree construction & editing (all immutable) ---------------------------

const generateId = () => Math.random().toString(36).slice(2, 11);

export const isGroup = (node: QueryNode): node is ConditionGroup => 'conditions' in node;

export const createCondition = (dataSource: DataSource): Condition => ({
  id: generateId(),
  field: DEFAULT_FIELD[dataSource],
  operator: 'contains',
  value: '',
});

export const createGroup = (dataSource: DataSource): ConditionGroup => ({
  id: generateId(),
  logicalOperator: 'AND',
  conditions: [createCondition(dataSource)],
});

/** Apply `edit` to the group with this id (the root included). */
function editGroup(root: ConditionGroup, id: string, edit: (g: ConditionGroup) => ConditionGroup): ConditionGroup {
  if (root.id === id) return edit(root);
  return { ...root, conditions: root.conditions.map((n) => (isGroup(n) ? editGroup(n, id, edit) : n)) };
}

export const addChild = (root: ConditionGroup, groupId: string, child: QueryNode) =>
  editGroup(root, groupId, (g) => ({ ...g, conditions: [...g.conditions, child] }));

export const setGroupOperator = (root: ConditionGroup, groupId: string, logicalOperator: LogicalOperator) =>
  editGroup(root, groupId, (g) => ({ ...g, logicalOperator }));

export function updateCondition(root: ConditionGroup, id: string, updates: Partial<Condition>): ConditionGroup {
  return {
    ...root,
    conditions: root.conditions.map((n) =>
      isGroup(n) ? updateCondition(n, id, updates) : n.id === id ? { ...n, ...updates } : n
    ),
  };
}

export function removeNode(root: ConditionGroup, id: string): ConditionGroup {
  return {
    ...root,
    conditions: root.conditions.filter((n) => n.id !== id).map((n) => (isGroup(n) ? removeNode(n, id) : n)),
  };
}

// ---- SQL generation --------------------------------------------------------

export const fieldType = (dataSource: DataSource, field: string): FieldType =>
  FIELDS[dataSource].find((f) => f.value === field)?.type ?? 'text';

export const operatorsFor = (type: FieldType) => OPERATORS.filter((op) => op.types.includes(type));

export const needsValue = (op: Operator) => op !== 'is_empty' && op !== 'is_not_empty';

/** Render a user-entered value as a SQL literal matching the column type. */
function literal(raw: string, type: FieldType, label: string): string {
  if (type === 'number') {
    const n = parseNumber(raw);
    if (n === null) throw new Error(`"${raw}" is not a valid number (${label})`);
    return String(n);
  }
  if (type === 'date') {
    // Dates are stored as YYYYMMDD integers; <input type="date"> yields YYYY-MM-DD.
    const n = dateToInt(raw);
    if (!Number.isInteger(n)) throw new Error(`"${raw}" is not a valid date (${label})`);
    return String(n);
  }
  return sqlString(raw);
}

/** SQL for one condition, or null when it has no value yet and should be ignored. */
function conditionSql(cond: Condition, dataSource: DataSource): string | null {
  const { field, operator, value, value2 } = cond;
  const type = fieldType(dataSource, field);
  const label = FIELDS[dataSource].find((f) => f.value === field)?.label ?? field;

  if (operator === 'is_empty') {
    return type === 'text' ? `(${field} IS NULL OR ${field} = '')` : `${field} IS NULL`;
  }
  if (operator === 'is_not_empty') {
    return type === 'text' ? `(${field} IS NOT NULL AND ${field} <> '')` : `${field} IS NOT NULL`;
  }
  if (!value) return null;

  const lit = () => literal(value, type, label);
  const text = escapeSql(value);

  switch (operator) {
    case 'equals': return `${field} = ${lit()}`;
    case 'not_equals': return `${field} <> ${lit()}`;
    case 'contains': return `${field} ILIKE '%${text}%'`;
    case 'not_contains': return `${field} NOT ILIKE '%${text}%'`;
    case 'starts_with': return `${field} ILIKE '${text}%'`;
    case 'ends_with': return `${field} ILIKE '%${text}'`;
    case 'greater_than': return `${field} > ${lit()}`;
    case 'less_than': return `${field} < ${lit()}`;
    case 'between':
      return value2 ? `${field} BETWEEN ${lit()} AND ${literal(value2, type, label)}` : null;
    case 'in_list': {
      const items = value.split(',').map((v) => v.trim()).filter(Boolean).map(sqlString);
      return items.length > 0 ? `${field} IN (${items.join(', ')})` : null;
    }
    case 'regex': return `regexp_matches(${field}, '${text}')`;
  }
}

function groupSql(group: ConditionGroup, dataSource: DataSource): string {
  const parts: string[] = [];
  for (const item of group.conditions) {
    if (isGroup(item)) {
      const nested = groupSql(item, dataSource);
      if (nested) parts.push(`(${nested})`);
    } else {
      const sql = conditionSql(item, dataSource);
      if (sql) parts.push(sql);
    }
  }
  return parts.join(` ${group.logicalOperator} `);
}

export interface QueryConfig {
  dataSource: DataSource;
  root: ConditionGroup;
  aggregation: AggregationConfig;
  limit: number;
}

export interface BuiltQuery {
  sql: string;
  countSql: string;
  aggregated: boolean;
  /** Metrics actually computed (only meaningful when aggregated). */
  metrics: Metric[];
}

export const clampLimit = (text: string): number => {
  const n = parseInt(text, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_LIMIT) : DEFAULT_LIMIT;
};

/** Build the results query and a matching count query. Throws on invalid user input. */
export function buildQuery({ dataSource, root, aggregation, limit }: QueryConfig): BuiltQuery {
  const where = groupSql(root, dataSource);
  const whereStr = where ? `WHERE ${where}` : '';

  if (!aggregation.enabled || aggregation.groupBy.length === 0) {
    return {
      sql: `SELECT *\nFROM ${dataSource}\n${whereStr}\nORDER BY ${DEFAULT_ORDER_BY[dataSource]}\nLIMIT ${limit}`,
      countSql: `SELECT COUNT(*) AS count FROM ${dataSource} ${whereStr}`,
      aggregated: false,
      metrics: [],
    };
  }

  const amount = AMOUNT_FIELD[dataSource];
  const metrics = aggregation.metrics.filter((m) => m === 'count' || amount);
  const metricSql: Record<Metric, string> = {
    count: 'COUNT(*)',
    sum: `SUM(${amount})`,
    avg: `AVG(${amount})`,
    min: `MIN(${amount})`,
    max: `MAX(${amount})`,
  };

  const groupBy = aggregation.groupBy.join(', ');
  const select = [groupBy, ...metrics.map((m) => `${metricSql[m]} AS _${m}`)].join(', ');
  // Sort by the requested metric if it was computed, else the first metric, else the first group column.
  const sortMetric = metrics.includes(aggregation.sortBy) ? aggregation.sortBy : metrics[0];
  const orderBy = sortMetric ? `_${sortMetric} ${aggregation.sortDir.toUpperCase()}` : aggregation.groupBy[0];

  return {
    sql: `SELECT ${select}\nFROM ${dataSource}\n${whereStr}\nGROUP BY ${groupBy}\nORDER BY ${orderBy}\nLIMIT ${limit}`,
    countSql: `SELECT COUNT(*) AS count FROM (SELECT 1 FROM ${dataSource} ${whereStr} GROUP BY ${groupBy})`,
    aggregated: true,
    metrics,
  };
}
