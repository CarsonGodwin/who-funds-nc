import type { ReactNode } from 'react';
import { formatAmount, formatCount, formatCurrency, formatDate, humanize } from '../lib/format';
import { committeeUrl, donorSearchUrl } from '../lib/url';
import type { FilerWithTotals } from '../lib/queries';
import type { Contribution, Expenditure, SortParams } from '../lib/types';

// ---- Sorting helpers (also used by the donor and Expert Mode tables) --------

export type SortDirection = 'asc' | 'desc' | null;

export interface SortState {
  column: string | null;
  direction: SortDirection;
}

/** Click cycle for a column header: ascending, descending, then back to the default order. */
export function nextSort(current: SortState, column: string): SortState {
  if (current.column !== column) return { column, direction: 'asc' };
  if (current.direction === 'asc') return { column, direction: 'desc' };
  return { column: null, direction: null };
}

function SortIcon({ direction }: { direction: SortDirection }) {
  const path =
    direction === 'asc' ? 'M5 15l7-7 7 7' : direction === 'desc' ? 'M19 9l-7 7-7-7' : 'M8 9l4-4 4 4m0 6l-4 4-4-4';
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 ${direction ? 'text-nc-blue' : 'text-slate-300 group-hover:text-slate-400'}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

export function SortableHeader({
  label,
  column,
  sortState,
  onSort,
  className = '',
  align = 'left',
}: {
  label: string;
  column: string;
  sortState: SortState;
  onSort: (column: string) => void;
  className?: string;
  align?: 'left' | 'right';
}) {
  const direction = sortState.column === column ? sortState.direction : null;
  return (
    <th
      scope="col"
      className={className}
      aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`group inline-flex items-center gap-1 uppercase hover:text-slate-900 ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {label}
        <SortIcon direction={direction} />
      </button>
    </th>
  );
}

/** Client-side sort, for result sets that are already fully loaded. */
export function sortData<T>(data: T[], sortState: SortState): T[] {
  const { column, direction } = sortState;
  if (!column || !direction) return data;
  const sign = direction === 'asc' ? 1 : -1;

  return [...data].sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[column];
    const bVal = (b as Record<string, unknown>)[column];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return -sign;
    if (bVal == null) return sign;

    const aNum = typeof aVal === 'bigint' ? Number(aVal) : aVal;
    const bNum = typeof bVal === 'bigint' ? Number(bVal) : bVal;
    if (typeof aNum === 'number' && typeof bNum === 'number') return (aNum - bNum) * sign;
    return String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' }) * sign;
  });
}

// ---- Column definitions ------------------------------------------------------

interface Column<T> {
  key: string;
  label: string;
  /** Server-side sort column; omit for unsortable columns. */
  sortKey?: string;
  align?: 'left' | 'right';
  /** Extra classes for both th and td, e.g. to hide a column on small screens. */
  className?: string;
  render: (row: T) => ReactNode;
}

const location = (city?: string, state?: string) => [city, state].filter(Boolean).join(', ');

const subtitle = (text: ReactNode) => <div className="mt-0.5 text-xs text-slate-500">{text}</div>;

function contributionColumns(hideRecipient: boolean): Column<Contribution>[] {
  const columns: Column<Contribution>[] = [
    {
      key: 'contributor',
      label: 'Contributor',
      sortKey: 'contributor_name',
      render: (c) => (
        <>
          <a href={donorSearchUrl(c.contributor_name || '')} className="link">
            {c.contributor_name || 'Unknown'}
          </a>
          {(c.contributor_employer || c.contributor_occupation) &&
            subtitle([...new Set([c.contributor_occupation, c.contributor_employer].filter(Boolean))].join(' · '))}
        </>
      ),
    },
    {
      key: 'recipient',
      label: 'Recipient',
      sortKey: 'filer_name',
      render: (c) => (
        <a href={committeeUrl(c.filer_id)} className="text-slate-700 hover:text-nc-blue hover:underline">
          {c.filer_name || c.filer_id}
        </a>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      sortKey: 'amount',
      align: 'right',
      render: (c) => <span className="font-semibold text-emerald-700">{formatAmount(c.amount)}</span>,
    },
    { key: 'date', label: 'Date', sortKey: 'date', className: 'whitespace-nowrap', render: (c) => formatDate(c.date) },
    {
      key: 'location',
      label: 'Location',
      sortKey: 'contributor_city',
      className: 'hidden md:table-cell',
      render: (c) => <span className="text-slate-600">{location(c.contributor_city, c.contributor_state)}</span>,
    },
  ];
  return hideRecipient ? columns.filter((c) => c.key !== 'recipient') : columns;
}

const FILER_COLUMNS: Column<FilerWithTotals>[] = [
  {
    key: 'name',
    label: 'Committee',
    sortKey: 'name',
    render: (f) => {
      const tags = [f.party, f.office_held || f.office_sought].filter(Boolean) as string[];
      return (
        <>
          <a href={committeeUrl(f.id)} className="link">
            {f.name}
          </a>
          {/* Location has its own column on wider screens. */}
          <div className="md:hidden">{subtitle(location(f.city, f.state))}</div>
          {tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span key={tag} className="badge">
                  {humanize(tag)}
                </span>
              ))}
            </div>
          )}
        </>
      );
    },
  },
  {
    key: 'location',
    label: 'Location',
    sortKey: 'city',
    className: 'hidden md:table-cell',
    render: (f) => <span className="text-slate-600">{location(f.city, f.state)}</span>,
  },
  {
    key: 'raised',
    label: 'Raised',
    sortKey: 'total_raised',
    align: 'right',
    render: (f) => <span className="font-semibold text-emerald-700">{formatCurrency(f.total_raised)}</span>,
  },
  {
    key: 'contributions',
    label: 'Contributions',
    sortKey: 'contribution_count',
    align: 'right',
    className: 'hidden sm:table-cell',
    render: (f) => formatCount(f.contribution_count),
  },
  {
    key: 'id',
    label: 'Filer ID',
    className: 'hidden lg:table-cell',
    render: (f) => <span className="font-mono text-xs whitespace-nowrap text-slate-500">{f.id}</span>,
  },
];

const EXPENDITURE_COLUMNS: Column<Expenditure>[] = [
  {
    key: 'payer',
    label: 'Paid by',
    sortKey: 'filer_name',
    render: (e) => (
      <a href={committeeUrl(e.filer_id)} className="link">
        {e.filer_name || e.filer_id}
      </a>
    ),
  },
  {
    key: 'payee',
    label: 'Payee',
    sortKey: 'payee_name',
    render: (e) => (
      <>
        <span className="font-medium text-slate-900">{e.payee_name || 'Unknown'}</span>
        {e.description && <div className="max-w-xs truncate">{subtitle(e.description)}</div>}
      </>
    ),
  },
  {
    key: 'amount',
    label: 'Amount',
    sortKey: 'amount',
    align: 'right',
    render: (e) => <span className="font-semibold text-nc-red">{formatAmount(e.amount)}</span>,
  },
  { key: 'date', label: 'Date', sortKey: 'date', className: 'whitespace-nowrap', render: (e) => formatDate(e.date) },
  {
    key: 'category',
    label: 'Category',
    sortKey: 'category',
    className: 'hidden md:table-cell',
    render: (e) => <span className="text-slate-600">{e.category || '—'}</span>,
  },
];

// ---- Table -------------------------------------------------------------------

interface BaseProps {
  loading?: boolean;
  /** Server-side sort state; headers are only clickable when onSortChange is given. */
  sort?: SortParams;
  onSortChange?: (sort: SortParams | undefined) => void;
  emptyMessage?: string;
}

type ResultsTableProps = BaseProps &
  (
    | { type: 'contributions'; data: Contribution[]; hideRecipient?: boolean }
    | { type: 'filers'; data: FilerWithTotals[] }
    | { type: 'expenditures'; data: Expenditure[] }
  );

const SKELETON_ROWS = 6;

export default function ResultsTable(props: ResultsTableProps) {
  const { loading, sort, onSortChange, emptyMessage = 'No results match your search.' } = props;

  // Each branch pairs columns with rows of the same type; widened here so one renderer serves all three.
  const [columns, rows, rowKey] = (
    props.type === 'contributions'
      ? [contributionColumns(Boolean(props.hideRecipient)), props.data, (r: Contribution) => r.contribution_id]
      : props.type === 'filers'
        ? // Some source rows share a placeholder ID, so include the name to keep keys unique.
          [FILER_COLUMNS, props.data, (r: FilerWithTotals) => `${r.id}|${r.name}`]
        : [EXPENDITURE_COLUMNS, props.data, (r: Expenditure) => r.expenditure_id]
  ) as [Column<unknown>[], unknown[], (row: unknown) => string];

  const sortState: SortState = sort ? { column: sort.column, direction: sort.direction } : { column: null, direction: null };
  const handleSort = (column: string) => {
    const next = nextSort(sortState, column);
    onSortChange?.(next.column && next.direction ? { column: next.column, direction: next.direction } : undefined);
  };

  const cellClass = (col: Column<unknown>) => `${col.align === 'right' ? 'text-right' : ''} ${col.className ?? ''}`;

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) =>
              col.sortKey && onSortChange ? (
                <SortableHeader
                  key={col.key}
                  label={col.label}
                  column={col.sortKey}
                  sortState={sortState}
                  onSort={handleSort}
                  align={col.align}
                  className={cellClass(col)}
                />
              ) : (
                <th key={col.key} scope="col" className={cellClass(col)}>
                  {col.label}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody className={loading && rows.length > 0 ? 'opacity-50 transition-opacity' : 'transition-opacity'} aria-busy={loading}>
          {loading && rows.length === 0 ? (
            Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key} className={cellClass(col)}>
                    <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => (
                  <td key={col.key} className={cellClass(col)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
