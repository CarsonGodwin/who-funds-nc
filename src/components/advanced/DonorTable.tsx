import { useMemo, useState } from 'react';
import { SortableHeader, sortData, type SortState } from '../ResultsTable';
import { formatCurrency, formatDate } from '../../lib/format';
import type { AggregatedDonor } from '../../lib/advanced-search';

const nextSort = (prev: SortState, column: string): SortState => {
  if (prev.column !== column) return { column, direction: 'asc' };
  if (prev.direction === 'asc') return { column, direction: 'desc' };
  return { column: null, direction: null };
};

export default function DonorTable({ donors, loading }: { donors: AggregatedDonor[]; loading: boolean }) {
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });
  const sorted = useMemo(() => sortData(donors, sortState), [donors, sortState]);
  const onSort = (column: string) => setSortState((prev) => nextSort(prev, column));

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <SortableHeader label="Donor Name" column="contributor_name" sortState={sortState} onSort={onSort} />
            <SortableHeader label="# Contributions" column="num_contributions" sortState={sortState} onSort={onSort} className="text-right" />
            <SortableHeader label="Total Amount" column="total_amount" sortState={sortState} onSort={onSort} className="text-right" />
            <SortableHeader label="Avg Amount" column="avg_amount" sortState={sortState} onSort={onSort} className="text-right" />
            <SortableHeader label="Date Range" column="first_date" sortState={sortState} onSort={onSort} className="hidden md:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            [1, 2, 3].map((i) => (
              <tr key={i} className="animate-pulse">
                {[1, 2, 3, 4, 5].map((j) => (
                  <td key={j} className="px-4 py-3">
                    <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                  </td>
                ))}
              </tr>
            ))
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                No donors found matching your criteria. Try adjusting your filters.
              </td>
            </tr>
          ) : (
            sorted.map((donor, idx) => (
              <tr key={`${donor.contributor_name}-${idx}`} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <a
                    href={`${import.meta.env.BASE_URL}search/contributors?q=${encodeURIComponent(donor.contributor_name || '')}`}
                    className="font-medium text-nc-blue hover:text-blue-700 text-sm block"
                  >
                    {donor.contributor_name || 'Unknown'}
                  </a>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-medium text-nc-blue text-sm">{Number(donor.num_contributions).toLocaleString()}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-medium text-green-700 text-sm">{formatCurrency(donor.total_amount)}</span>
                </td>
                <td className="px-4 py-3 text-right text-sm text-slate-600">{formatCurrency(donor.avg_amount)}</td>
                <td className="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">
                  {formatDate(donor.first_date)} - {formatDate(donor.last_date)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
