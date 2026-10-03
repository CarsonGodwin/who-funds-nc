import { useMemo, useState } from 'react';
import { SortableHeader, nextSort, sortData, type SortState } from '../ResultsTable';
import { formatAmount, formatCount, formatCurrency, formatDate } from '../../lib/format';
import { FIELDS, type DataSource, type FieldDef, type Metric } from '../../lib/query-builder';

type Row = Record<string, any>;

export interface QueryResult {
  rows: Row[];
  /** Everything below describes the query that produced `rows`, not the current form state. */
  dataSource: DataSource;
  aggregated: boolean;
  groupBy: string[];
  metrics: Metric[];
  totalCount: number;
  elapsedMs: number;
}

/** Rendering thousands of rows is slow; the CSV export always contains every row. */
const MAX_RENDERED_ROWS = 1000;

const METRIC_COLUMNS: Record<Metric, { label: string; format: (v: any) => string }> = {
  sum: { label: 'Total Amount', format: formatCurrency },
  count: { label: 'Count', format: (v) => (v == null ? '—' : formatCount(v)) },
  avg: { label: 'Average', format: formatCurrency },
  min: { label: 'Min', format: formatCurrency },
  max: { label: 'Max', format: formatCurrency },
};

interface Column {
  key: string;
  label: string;
  align: 'left' | 'right';
  render: (value: any) => string;
  cellClass: string;
}

function fieldColumn(field: FieldDef): Column {
  // Every numeric field in this data is a dollar amount.
  const render =
    field.type === 'number' ? (v: any) => (v == null ? '—' : formatAmount(v))
    : field.type === 'date' ? (v: any) => (v ? formatDate(v) : '—')
    : (v: any) => v?.toString() || '—';
  return { key: field.value, label: field.label, align: field.type === 'number' ? 'right' : 'left', render, cellClass: 'text-slate-900' };
}

function columnsFor(result: QueryResult): Column[] {
  const fields = FIELDS[result.dataSource];
  if (!result.aggregated) return fields.map(fieldColumn);

  const groupColumns = result.groupBy.map((key) =>
    fieldColumn(fields.find((f) => f.value === key) ?? { value: key, label: key, type: 'text' })
  );
  const metricColumns = result.metrics.map((m): Column => ({
    key: `_${m}`,
    label: METRIC_COLUMNS[m].label,
    align: 'right',
    render: METRIC_COLUMNS[m].format,
    cellClass: m === 'sum' ? 'font-semibold text-emerald-700' : 'text-slate-900',
  }));
  return [...groupColumns, ...metricColumns];
}

export default function ResultsPanel({ result }: { result: QueryResult }) {
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });

  const handleSort = (column: string) => setSortState((prev) => nextSort(prev, column));

  const columns = useMemo(() => columnsFor(result), [result]);
  const sortedRows = useMemo(() => sortData(result.rows, sortState), [result.rows, sortState]);
  const visibleRows = sortedRows.slice(0, MAX_RENDERED_ROWS);

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <h2 className="card-title">
          {result.aggregated ? 'Aggregated results' : 'Results'}
          <span className="ml-2 text-sm font-normal text-slate-500">
            ({result.rows.length.toLocaleString()} rows
            {result.rows.length > MAX_RENDERED_ROWS && `, showing first ${MAX_RENDERED_ROWS.toLocaleString()} — export CSV for all`})
          </span>
        </h2>
      </div>

      <div className="max-h-[600px] overflow-auto">
        <table className="data-table">
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <SortableHeader
                  key={col.key}
                  label={col.label}
                  column={col.key}
                  sortState={sortState}
                  onSort={handleSort}
                  align={col.align}
                  className={col.align === 'right' ? 'text-right' : 'text-left'}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`whitespace-nowrap ${col.align === 'right' ? 'text-right' : ''} ${col.cellClass}`}
                  >
                    {col.render(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
