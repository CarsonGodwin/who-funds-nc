import { SortableHeader, nextSort, type SortState } from '../ResultsTable';
import { formatCount, formatCurrency, formatDate } from '../../lib/format';
import { donorSearchUrl } from '../../lib/url';
import type { AggregatedDonor } from '../../lib/advanced-search';
import type { SortParams } from '../../lib/types';

const COLUMNS = [
  { column: 'contributor_name', label: 'Donor', align: 'left' as const },
  { column: 'num_contributions', label: 'Gifts', align: 'right' as const },
  { column: 'total_amount', label: 'Total', align: 'right' as const },
  { column: 'avg_amount', label: 'Average', align: 'right' as const, className: 'hidden sm:table-cell' },
  { column: 'first_date', label: 'First – last gift', align: 'left' as const, className: 'hidden md:table-cell' },
];

interface DonorTableProps {
  donors: AggregatedDonor[];
  loading: boolean;
  sort?: SortParams;
  onSortChange: (sort: SortParams | undefined) => void;
}

/** Contributions grouped by donor name; sorting runs in the database so it covers every page. */
export default function DonorTable({ donors, loading, sort, onSortChange }: DonorTableProps) {
  const sortState: SortState = sort ? { column: sort.column, direction: sort.direction } : { column: null, direction: null };
  const onSort = (column: string) => {
    const next = nextSort(sortState, column);
    onSortChange(next.column && next.direction ? { column: next.column, direction: next.direction } : undefined);
  };
  const cellClass = (col: (typeof COLUMNS)[number]) =>
    `${col.align === 'right' ? 'text-right' : ''} ${'className' in col ? col.className : ''}`;

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <SortableHeader
                key={col.column}
                label={col.label}
                column={col.column}
                sortState={sortState}
                onSort={onSort}
                align={col.align}
                className={cellClass(col)}
              />
            ))}
          </tr>
        </thead>
        <tbody className={loading && donors.length > 0 ? 'opacity-50' : ''} aria-busy={loading}>
          {loading && donors.length === 0 ? (
            Array.from({ length: 6 }, (_, i) => (
              <tr key={i}>
                {COLUMNS.map((col) => (
                  <td key={col.column} className={cellClass(col)}>
                    <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
                  </td>
                ))}
              </tr>
            ))
          ) : donors.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className="py-12 text-center text-slate-500">
                No donors match these filters.
              </td>
            </tr>
          ) : (
            donors.map((donor) => (
              <tr key={donor.contributor_name ?? ''}>
                <td>
                  <a href={donorSearchUrl(donor.contributor_name || '')} className="link">
                    {donor.contributor_name || 'Unknown'}
                  </a>
                </td>
                <td className="text-right">{formatCount(donor.num_contributions)}</td>
                <td className="text-right font-semibold text-emerald-700">{formatCurrency(donor.total_amount)}</td>
                <td className="hidden text-right text-slate-600 sm:table-cell">{formatCurrency(donor.avg_amount)}</td>
                <td className="hidden whitespace-nowrap text-slate-600 md:table-cell">
                  {formatDate(donor.first_date)} – {formatDate(donor.last_date)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
