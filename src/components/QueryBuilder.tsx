import { useState, useCallback, useMemo } from 'react';
import { query as duckdbQuery, formatCurrency, formatDate, waitForInit } from '../lib/duckdb';
import DatabaseLoader from './DatabaseLoader';
import { SortableHeader, sortData, type SortState } from './ResultsTable';

// Query condition types
type Operator = 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' |
  'greater_than' | 'less_than' | 'between' | 'in_list' | 'is_empty' | 'is_not_empty' | 'regex';

type LogicalOperator = 'AND' | 'OR';

interface Condition {
  id: string;
  field: string;
  operator: Operator;
  value: string;
  value2?: string; // For "between" operator
}

interface ConditionGroup {
  id: string;
  logicalOperator: LogicalOperator;
  conditions: (Condition | ConditionGroup)[];
}

interface AggregationConfig {
  enabled: boolean;
  groupBy: string[];
  metrics: ('sum' | 'count' | 'avg' | 'min' | 'max')[];
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

type DataSource = 'contributions' | 'expenditures' | 'filers' | 'reports';

const FIELDS: Record<DataSource, { value: string; label: string; type: 'text' | 'number' | 'date' }[]> = {
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
    { value: 'loans_outstanding', label: 'Loans Outstanding (alias)', type: 'number' },
  ],
};

const OPERATORS: { value: Operator; label: string; types: ('text' | 'number' | 'date')[] }[] = [
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

const generateId = () => Math.random().toString(36).substring(2, 11);

// Default fields for each data source
const DEFAULT_FIELDS: Record<DataSource, string> = {
  contributions: 'contributor_name',
  expenditures: 'payee_name',
  filers: 'name',
  reports: 'filer_name',
};

// Default sort columns for each data source
const DEFAULT_ORDER_BY: Record<DataSource, string> = {
  contributions: 'date DESC',
  expenditures: 'date DESC',
  filers: 'name ASC',
  reports: 'period_end DESC',
};

const createCondition = (dataSource: DataSource = 'contributions'): Condition => ({
  id: generateId(),
  field: DEFAULT_FIELDS[dataSource],
  operator: 'contains',
  value: '',
});

const createGroup = (dataSource: DataSource = 'contributions'): ConditionGroup => ({
  id: generateId(),
  logicalOperator: 'AND',
  conditions: [createCondition(dataSource)],
});

export default function QueryBuilder() {
  const [dataSource, setDataSource] = useState<DataSource>('contributions');
  const [rootGroup, setRootGroup] = useState<ConditionGroup>(createGroup());
  const [aggregation, setAggregation] = useState<AggregationConfig>({
    enabled: false,
    groupBy: [],
    metrics: ['sum', 'count'],
    sortBy: 'sum',
    sortDir: 'desc',
  });
  const [limit, setLimit] = useState(1000);
  const [results, setResults] = useState<any[]>([]);
  const [aggregatedResults, setAggregatedResults] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });

  const handleSort = (column: string) => {
    setSortState(prev => {
      if (prev.column !== column) {
        return { column, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { column, direction: 'desc' };
      }
      return { column: null, direction: null };
    });
  };

  // Memoize sorted results
  const sortedResults = useMemo(() => sortData(results, sortState), [results, sortState]);
  const sortedAggregatedResults = useMemo(() => sortData(aggregatedResults, sortState), [aggregatedResults, sortState]);

  const fields = FIELDS[dataSource];

  const getFieldType = (fieldName: string) => {
    const field = fields.find(f => f.value === fieldName);
    return field?.type || 'text';
  };

  const getAvailableOperators = (fieldName: string) => {
    const fieldType = getFieldType(fieldName);
    return OPERATORS.filter(op => op.types.includes(fieldType));
  };

  const updateCondition = (_groupId: string, conditionId: string, updates: Partial<Condition>) => {
    const updateInGroup = (group: ConditionGroup): ConditionGroup => ({
      ...group,
      conditions: group.conditions.map(item => {
        if ('conditions' in item) {
          return updateInGroup(item);
        }
        if (item.id === conditionId) {
          return { ...item, ...updates };
        }
        return item;
      }),
    });
    setRootGroup(updateInGroup(rootGroup));
  };

  const addCondition = (groupId: string) => {
    const addToGroup = (group: ConditionGroup): ConditionGroup => {
      if (group.id === groupId) {
        return {
          ...group,
          conditions: [...group.conditions, createCondition(dataSource)],
        };
      }
      return {
        ...group,
        conditions: group.conditions.map(item =>
          'conditions' in item ? addToGroup(item) : item
        ),
      };
    };
    setRootGroup(addToGroup(rootGroup));
  };

  const addGroup = (parentGroupId: string) => {
    const addToGroup = (group: ConditionGroup): ConditionGroup => {
      if (group.id === parentGroupId) {
        return {
          ...group,
          conditions: [...group.conditions, createGroup(dataSource)],
        };
      }
      return {
        ...group,
        conditions: group.conditions.map(item =>
          'conditions' in item ? addToGroup(item) : item
        ),
      };
    };
    setRootGroup(addToGroup(rootGroup));
  };

  const removeItem = (_groupId: string, itemId: string) => {
    const removeFromGroup = (group: ConditionGroup): ConditionGroup => ({
      ...group,
      conditions: group.conditions
        .filter(item => item.id !== itemId)
        .map(item => ('conditions' in item ? removeFromGroup(item) : item)),
    });
    setRootGroup(removeFromGroup(rootGroup));
  };

  const setGroupOperator = (groupId: string, operator: LogicalOperator) => {
    const updateGroup = (group: ConditionGroup): ConditionGroup => {
      if (group.id === groupId) {
        return { ...group, logicalOperator: operator };
      }
      return {
        ...group,
        conditions: group.conditions.map(item =>
          'conditions' in item ? updateGroup(item) : item
        ),
      };
    };
    setRootGroup(updateGroup(rootGroup));
  };

  // Build query preview
  const buildQueryDescription = useCallback((): string => {
    const describeCondition = (cond: Condition): string => {
      const fieldLabel = fields.find(f => f.value === cond.field)?.label || cond.field;
      const opLabel = OPERATORS.find(o => o.value === cond.operator)?.label || cond.operator;

      if (cond.operator === 'is_empty' || cond.operator === 'is_not_empty') {
        return `${fieldLabel} ${opLabel}`;
      }
      if (cond.operator === 'between') {
        return `${fieldLabel} ${opLabel} "${cond.value}" and "${cond.value2}"`;
      }
      return `${fieldLabel} ${opLabel} "${cond.value}"`;
    };

    const describeGroup = (group: ConditionGroup, depth: number = 0): string => {
      const indent = '  '.repeat(depth);
      const parts = group.conditions.map(item => {
        if ('conditions' in item) {
          return `${indent}(\n${describeGroup(item, depth + 1)}\n${indent})`;
        }
        return `${indent}${describeCondition(item)}`;
      });
      return parts.join(`\n${indent}${group.logicalOperator}\n`);
    };

    let query = `SELECT * FROM ${dataSource}\nWHERE\n${describeGroup(rootGroup, 1)}`;

    if (aggregation.enabled && aggregation.groupBy.length > 0) {
      const groupByLabels = aggregation.groupBy.map(f => fields.find(ff => ff.value === f)?.label || f);
      query = `SELECT ${groupByLabels.join(', ')}, SUM(amount), COUNT(*)\nFROM ${dataSource}\nWHERE\n${describeGroup(rootGroup, 1)}\nGROUP BY ${groupByLabels.join(', ')}`;
    }

    query += `\nLIMIT ${limit}`;
    return query;
  }, [dataSource, rootGroup, aggregation, limit, fields]);

  // Escape SQL string
  const escapeSql = (str: string): string => str.replace(/'/g, "''");

  // Build SQL condition from a single condition
  const buildSqlCondition = (cond: Condition): string => {
    const { field, operator, value, value2 } = cond;
    const escapedValue = escapeSql(value);
    const escapedValue2 = value2 ? escapeSql(value2) : '';

    switch (operator) {
      case 'equals':
        return `${field} = '${escapedValue}'`;
      case 'not_equals':
        return `${field} != '${escapedValue}'`;
      case 'contains':
        return `${field} ILIKE '%${escapedValue}%'`;
      case 'not_contains':
        return `${field} NOT ILIKE '%${escapedValue}%'`;
      case 'starts_with':
        return `${field} ILIKE '${escapedValue}%'`;
      case 'ends_with':
        return `${field} ILIKE '%${escapedValue}'`;
      case 'greater_than':
        return `${field} > '${escapedValue}'`;
      case 'less_than':
        return `${field} < '${escapedValue}'`;
      case 'between':
        return `${field} BETWEEN '${escapedValue}' AND '${escapedValue2}'`;
      case 'in_list':
        const items = value.split(',').map(v => `'${escapeSql(v.trim())}'`).join(', ');
        return `${field} IN (${items})`;
      case 'is_empty':
        return `${field} IS NULL`;
      case 'is_not_empty':
        return `${field} IS NOT NULL`;
      case 'regex':
        return `regexp_matches(${field}, '${escapedValue}')`;
      default:
        return '1=1';
    }
  };

  // Build SQL WHERE clause from condition group (supports nested AND/OR)
  const buildWhereClause = (group: ConditionGroup): string => {
    const parts: string[] = [];

    for (const item of group.conditions) {
      if ('conditions' in item) {
        // Nested group
        const nestedClause = buildWhereClause(item);
        if (nestedClause) {
          parts.push(`(${nestedClause})`);
        }
      } else {
        // Single condition
        if (item.value || item.operator === 'is_empty' || item.operator === 'is_not_empty') {
          parts.push(buildSqlCondition(item));
        }
      }
    }

    if (parts.length === 0) return '';
    return parts.join(` ${group.logicalOperator} `);
  };

  // Execute query
  const executeQuery = async () => {
    setLoading(true);
    setError(null);
    const startTime = Date.now();

    try {
      // Initialize DuckDB
      await waitForInit();

      // Build WHERE clause
      const whereClause = buildWhereClause(rootGroup);
      const whereStr = whereClause ? `WHERE ${whereClause}` : '';

      // Build and execute query
      let sql: string;
      let countSql: string;

      if (aggregation.enabled && aggregation.groupBy.length > 0) {
        // Aggregation query
        const groupByFields = aggregation.groupBy.join(', ');
        const metrics: string[] = [];
        if (aggregation.metrics.includes('sum')) metrics.push('SUM(amount) as _sum');
        if (aggregation.metrics.includes('count')) metrics.push('COUNT(*) as _count');
        if (aggregation.metrics.includes('avg')) metrics.push('AVG(amount) as _avg');
        if (aggregation.metrics.includes('min')) metrics.push('MIN(amount) as _min');
        if (aggregation.metrics.includes('max')) metrics.push('MAX(amount) as _max');

        const metricsStr = metrics.length > 0 ? `, ${metrics.join(', ')}` : '';
        const orderField = `_${aggregation.sortBy}`;
        const orderDir = aggregation.sortDir.toUpperCase();

        sql = `
          SELECT ${groupByFields}${metricsStr}
          FROM ${dataSource}
          ${whereStr}
          GROUP BY ${groupByFields}
          ORDER BY ${orderField} ${orderDir}
          LIMIT ${limit}
        `;

        countSql = `
          SELECT COUNT(DISTINCT (${groupByFields})) as count
          FROM ${dataSource}
          ${whereStr}
        `;
      } else {
        // Regular query
        sql = `
          SELECT *
          FROM ${dataSource}
          ${whereStr}
          ORDER BY ${DEFAULT_ORDER_BY[dataSource]}
          LIMIT ${limit}
        `;

        countSql = `
          SELECT COUNT(*) as count
          FROM ${dataSource}
          ${whereStr}
        `;
      }

      // Execute queries
      const [data, countResult] = await Promise.all([
        duckdbQuery(sql),
        duckdbQuery<{ count: number }>(countSql),
      ]);

      const count = Number(countResult[0]?.count || 0);

      if (aggregation.enabled && aggregation.groupBy.length > 0) {
        setAggregatedResults(data);
        setResults([]);
      } else {
        setResults(data);
        setAggregatedResults([]);
      }

      setTotalCount(count);
      setExecutionTime(Date.now() - startTime);
    } catch (err: any) {
      console.error('Query error:', err);
      setError(err.message || 'Query failed');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    const dataToExport = aggregation.enabled ? aggregatedResults : results;
    if (dataToExport.length === 0) return;

    const headers = Object.keys(dataToExport[0]);
    const csvContent = [
      headers.join(','),
      ...dataToExport.map(row =>
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tec-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderConditionRow = (condition: Condition, groupId: string) => {
    const availableOperators = getAvailableOperators(condition.field);
    const fieldType = getFieldType(condition.field);

    return (
      <div className="flex items-center gap-2 flex-wrap p-2 bg-slate-50 rounded-lg">
        <select
          value={condition.field}
          onChange={(e) => updateCondition(groupId, condition.id, {
            field: e.target.value,
            operator: getAvailableOperators(e.target.value)[0]?.value || 'contains'
          })}
          className="px-2 py-1 border border-slate-300 rounded text-sm bg-white min-w-[160px]"
        >
          {fields.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        <select
          value={condition.operator}
          onChange={(e) => updateCondition(groupId, condition.id, { operator: e.target.value as Operator })}
          className="px-2 py-1 border border-slate-300 rounded text-sm bg-white min-w-[140px]"
        >
          {availableOperators.map(op => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>

        {condition.operator !== 'is_empty' && condition.operator !== 'is_not_empty' && (
          <input
            type={fieldType === 'date' ? 'date' : 'text'}
            inputMode={fieldType === 'number' ? 'decimal' : undefined}
            pattern={fieldType === 'number' ? '[0-9]*\\.?[0-9]*' : undefined}
            value={condition.value}
            onChange={(e) => updateCondition(groupId, condition.id, { value: e.target.value })}
            placeholder={condition.operator === 'in_list' ? 'value1, value2, ...' : 'Enter value...'}
            className="px-2 py-1 border border-slate-300 rounded text-sm flex-1 min-w-[150px]"
          />
        )}

        {condition.operator === 'between' && (
          <>
            <span className="text-slate-500">and</span>
            <input
              type={fieldType === 'date' ? 'date' : 'text'}
              inputMode={fieldType === 'number' ? 'decimal' : undefined}
              pattern={fieldType === 'number' ? '[0-9]*\\.?[0-9]*' : undefined}
              value={condition.value2 || ''}
              onChange={(e) => updateCondition(groupId, condition.id, { value2: e.target.value })}
              className="px-2 py-1 border border-slate-300 rounded text-sm min-w-[120px]"
            />
          </>
        )}

        <button
          onClick={() => removeItem(groupId, condition.id)}
          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
          title="Remove condition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  };

  const renderGroup = (group: ConditionGroup, depth = 0, parentId?: string) => {
    const bgColor = depth % 2 === 0 ? 'bg-white' : 'bg-blue-50';

    return (
      <div className={`${bgColor} border border-slate-200 rounded-lg p-3 ${depth > 0 ? 'ml-4' : ''}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium text-slate-700">Match</span>
          <select
            value={group.logicalOperator}
            onChange={(e) => setGroupOperator(group.id, e.target.value as LogicalOperator)}
            className="px-2 py-1 border border-slate-300 rounded text-sm bg-white font-medium"
          >
            <option value="AND">ALL (AND)</option>
            <option value="OR">ANY (OR)</option>
          </select>
          <span className="text-sm text-slate-500">of the following conditions:</span>

          {parentId && (
            <button
              onClick={() => removeItem(parentId, group.id)}
              className="ml-auto p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
              title="Remove group"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="space-y-2">
          {group.conditions.map(item => (
            'conditions' in item ? (
              <div key={item.id}>{renderGroup(item, depth + 1, group.id)}</div>
            ) : (
              <div key={item.id}>{renderConditionRow(item, group.id)}</div>
            )
          ))}
        </div>

        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
          <button
            onClick={() => addCondition(group.id)}
            className="px-3 py-1 text-sm text-nc-blue hover:bg-blue-50 rounded-lg border border-nc-blue"
          >
            + Add Condition
          </button>
          <button
            onClick={() => addGroup(group.id)}
            className="px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-300"
          >
            + Add Group
          </button>
        </div>
      </div>
    );
  };

  return (
    <DatabaseLoader>
    <div className="space-y-6">
      {/* Advanced Header */}
      <div className="bg-gradient-to-r from-nc-blue to-blue-900 text-white rounded-xl p-6">
        <h1 className="text-2xl font-bold mb-2">Advanced</h1>
        <p className="text-blue-200">
          Build complex, multi-condition queries with boolean logic to analyze campaign finance data
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        {/* Advanced Panel */}
        <div className="space-y-4">
          {/* Data Source Selection */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 mb-3">Data Source</h3>
            <div className="flex gap-2 flex-wrap">
              {(['contributions', 'expenditures', 'filers', 'reports'] as DataSource[]).map(source => (
                <button
                  key={source}
                  onClick={() => {
                    setDataSource(source);
                    setRootGroup(createGroup(source));
                    setAggregation(prev => ({ ...prev, groupBy: [] }));
                    setResults([]);
                    setAggregatedResults([]);
                    setError(null);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    dataSource === source
                      ? 'bg-nc-blue text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {source.charAt(0).toUpperCase() + source.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Conditions Builder */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 mb-3">Query Conditions</h3>
            {renderGroup(rootGroup)}
          </div>

          {/* Aggregation Options */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3 mb-3">
              <input
                type="checkbox"
                id="enableAggregation"
                checked={aggregation.enabled}
                onChange={(e) => setAggregation(prev => ({ ...prev, enabled: e.target.checked }))}
                className="w-4 h-4 text-nc-blue"
              />
              <label htmlFor="enableAggregation" className="font-semibold text-slate-900">
                Enable Aggregation / Group By
              </label>
            </div>

            {aggregation.enabled && (
              <div className="space-y-4 pt-3 border-t border-slate-200">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Group By Fields</label>
                  <div className="flex flex-wrap gap-2">
                    {fields.map(f => (
                      <label key={f.value} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={aggregation.groupBy.includes(f.value)}
                          onChange={(e) => {
                            setAggregation(prev => ({
                              ...prev,
                              groupBy: e.target.checked
                                ? [...prev.groupBy, f.value]
                                : prev.groupBy.filter(g => g !== f.value),
                            }));
                          }}
                          className="w-3 h-3"
                        />
                        <span className="text-sm">{f.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Metrics</label>
                    <div className="flex flex-wrap gap-2">
                      {(['sum', 'count', 'avg', 'min', 'max'] as const).map(metric => (
                        <label key={metric} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={aggregation.metrics.includes(metric)}
                            onChange={(e) => {
                              setAggregation(prev => ({
                                ...prev,
                                metrics: e.target.checked
                                  ? [...prev.metrics, metric]
                                  : prev.metrics.filter(m => m !== metric),
                              }));
                            }}
                            className="w-3 h-3"
                          />
                          <span className="text-sm uppercase">{metric}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Sort By</label>
                    <div className="flex gap-2">
                      <select
                        value={aggregation.sortBy}
                        onChange={(e) => setAggregation(prev => ({ ...prev, sortBy: e.target.value }))}
                        className="px-2 py-1 border border-slate-300 rounded text-sm bg-white"
                      >
                        <option value="sum">Sum</option>
                        <option value="count">Count</option>
                        <option value="avg">Average</option>
                      </select>
                      <select
                        value={aggregation.sortDir}
                        onChange={(e) => setAggregation(prev => ({ ...prev, sortDir: e.target.value as 'asc' | 'desc' }))}
                        className="px-2 py-1 border border-slate-300 rounded text-sm bg-white"
                      >
                        <option value="desc">Descending</option>
                        <option value="asc">Ascending</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Limit */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-4">
              <label className="font-semibold text-slate-900">Result Limit:</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 100)}
                className="w-24 px-2 py-1 border border-slate-300 rounded text-sm"
              />
              <span className="text-sm text-slate-500">(max 10,000)</span>
            </div>
          </div>

          {/* Execute Button */}
          <div className="flex gap-4">
            <button
              onClick={executeQuery}
              disabled={loading}
              className="flex-1 py-3 bg-nc-blue text-white font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Executing...' : 'Execute Query'}
            </button>
            {results.length > 0 && (
              <button
                onClick={exportCSV}
                className="px-6 py-3 border border-nc-blue text-nc-blue font-semibold rounded-xl hover:bg-blue-50 transition-colors"
              >
                Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Query Preview Panel */}
        <div className="space-y-4">
          <div className="bg-slate-900 text-green-400 rounded-xl p-4 font-mono text-sm">
            <h3 className="text-slate-400 mb-2">Query Preview</h3>
            <pre className="whitespace-pre-wrap">{buildQueryDescription()}</pre>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 rounded-xl p-4 border border-red-200">
              <strong>Error:</strong> {error}
            </div>
          )}

          {executionTime !== null && (
            <div className="bg-green-50 text-green-700 rounded-xl p-4 border border-green-200">
              Query executed in {executionTime}ms • {totalCount.toLocaleString()} results found
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {(results.length > 0 || aggregatedResults.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-semibold text-slate-900">
              {aggregation.enabled ? 'Aggregated Results' : 'Query Results'}
              <span className="ml-2 text-sm font-normal text-slate-500">
                ({(aggregation.enabled ? aggregatedResults : results).length} rows)
              </span>
            </h3>
          </div>

          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {aggregation.enabled && aggregatedResults.length > 0 ? (
                    <>
                      {aggregation.groupBy.map(field => (
                        <SortableHeader
                          key={field}
                          label={fields.find(f => f.value === field)?.label || field}
                          column={field}
                          sortState={sortState}
                          onSort={handleSort}
                          className="text-left"
                        />
                      ))}
                      {aggregation.metrics.includes('sum') && (
                        <SortableHeader label="Total Amount" column="_sum" sortState={sortState} onSort={handleSort} className="text-right" />
                      )}
                      {aggregation.metrics.includes('count') && (
                        <SortableHeader label="Count" column="_count" sortState={sortState} onSort={handleSort} className="text-right" />
                      )}
                      {aggregation.metrics.includes('avg') && (
                        <SortableHeader label="Average" column="_avg" sortState={sortState} onSort={handleSort} className="text-right" />
                      )}
                    </>
                  ) : results.length > 0 && (
                    Object.keys(results[0]).filter(k => !k.startsWith('_')).slice(0, 8).map(key => (
                      <SortableHeader
                        key={key}
                        label={fields.find(f => f.value === key)?.label || key}
                        column={key}
                        sortState={sortState}
                        onSort={handleSort}
                        className="text-left"
                      />
                    ))
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {aggregation.enabled ? sortedAggregatedResults.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {aggregation.groupBy.map(field => (
                      <td key={field} className="px-4 py-3 text-sm text-slate-900">
                        {row[field] || '—'}
                      </td>
                    ))}
                    {aggregation.metrics.includes('sum') && (
                      <td className="px-4 py-3 text-sm text-right font-medium text-green-700">
                        {formatCurrency(row._sum)}
                      </td>
                    )}
                    {aggregation.metrics.includes('count') && (
                      <td className="px-4 py-3 text-sm text-right text-slate-900">
                        {row._count?.toLocaleString()}
                      </td>
                    )}
                    {aggregation.metrics.includes('avg') && (
                      <td className="px-4 py-3 text-sm text-right text-slate-600">
                        {formatCurrency(row._avg)}
                      </td>
                    )}
                  </tr>
                )) : sortedResults.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {Object.entries(row).filter(([k]) => !k.startsWith('_')).slice(0, 8).map(([key, val]) => (
                      <td key={key} className="px-4 py-3 text-sm text-slate-900">
                        {key === 'amount' ? formatCurrency(val as number) :
                          key.includes('date') && val ? formatDate(val as string) :
                          val?.toString() || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
    </DatabaseLoader>
  );
}
