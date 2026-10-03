import { useState, useMemo } from 'react';
import { formatCurrency, formatDate } from '../lib/format';
import type { Contribution, Filer, Expenditure, SortParams } from '../lib/types';

// ============================================
// EXPORTED SORTING UTILITIES
// These can be imported by other components
// ============================================

export type SortDirection = 'asc' | 'desc' | null;

export interface SortState {
  column: string | null;
  direction: SortDirection;
}

// Sort indicator arrow component
export function SortIndicator({ direction }: { direction: SortDirection }) {
  if (!direction) {
    return (
      <svg className="w-4 h-4 text-slate-300 ml-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  return direction === 'asc' ? (
    <svg className="w-4 h-4 text-nc-blue ml-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-nc-blue ml-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// Sortable header component
export function SortableHeader({
  label,
  column,
  sortState,
  onSort,
  className = ''
}: {
  label: string;
  column: string;
  sortState: SortState;
  onSort: (column: string) => void;
  className?: string;
}) {
  const isActive = sortState.column === column;
  return (
    <th
      className={`px-4 py-3 text-sm font-semibold text-slate-900 cursor-pointer hover:bg-slate-100 select-none transition-colors ${className}`}
      onClick={() => onSort(column)}
    >
      <span className="flex items-center">
        {label}
        <SortIndicator direction={isActive ? sortState.direction : null} />
      </span>
    </th>
  );
}

// Generic sort function for client-side sorting
export function sortData<T>(data: T[], sortState: SortState): T[] {
  if (!sortState.column || !sortState.direction) return data;

  return [...data].sort((a, b) => {
    const aVal = (a as any)[sortState.column!];
    const bVal = (b as any)[sortState.column!];

    // Handle null/undefined
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return sortState.direction === 'asc' ? -1 : 1;
    if (bVal == null) return sortState.direction === 'asc' ? 1 : -1;

    // Handle numbers (including BigInt from DuckDB)
    const aNum = typeof aVal === 'bigint' ? Number(aVal) : aVal;
    const bNum = typeof bVal === 'bigint' ? Number(bVal) : bVal;
    if (typeof aNum === 'number' && typeof bNum === 'number') {
      return sortState.direction === 'asc' ? aNum - bNum : bNum - aNum;
    }

    // Handle strings (case-insensitive)
    const aStr = String(aVal).toLowerCase();
    const bStr = String(bVal).toLowerCase();
    const comparison = aStr.localeCompare(bStr);
    return sortState.direction === 'asc' ? comparison : -comparison;
  });
}

// ============================================
// RESULTS TABLE COMPONENT
// ============================================

// Base props shared by all table types
interface BaseTableProps {
  loading?: boolean;
  // Server-side sorting: parent controls sort state
  sortState?: SortParams | null;
  onSortChange?: (sort: SortParams | null) => void;
}

interface ContributionsTableProps extends BaseTableProps {
  type: 'contributions';
  data: Contribution[];
}

interface FilersTableProps extends BaseTableProps {
  type: 'filers';
  data: Filer[];
}

interface ExpendituresTableProps extends BaseTableProps {
  type: 'expenditures';
  data: Expenditure[];
}

type ResultsTableProps = ContributionsTableProps | FilersTableProps | ExpendituresTableProps;

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-200 rounded w-3/4"></div>
        </td>
      ))}
    </tr>
  );
}

export default function ResultsTable(props: ResultsTableProps) {
  const { type, data, loading, sortState: parentSortState, onSortChange } = props;

  // Use local state for client-side sorting, or controlled state for server-side
  const [localSortState, setLocalSortState] = useState<SortState>({ column: null, direction: null });

  // Determine if we're in server-side sorting mode
  const isServerSide = !!onSortChange;

  // Convert parent sort state to local format for display
  const effectiveSortState: SortState = isServerSide && parentSortState
    ? { column: parentSortState.column, direction: parentSortState.direction }
    : localSortState;

  const handleSort = (column: string) => {
    if (isServerSide) {
      // Server-side sorting: notify parent
      if (parentSortState?.column !== column) {
        onSortChange({ column, direction: 'asc' });
      } else if (parentSortState.direction === 'asc') {
        onSortChange({ column, direction: 'desc' });
      } else {
        onSortChange(null); // Reset to default
      }
    } else {
      // Client-side sorting: use local state
      setLocalSortState(prev => {
        if (prev.column !== column) {
          return { column, direction: 'asc' };
        }
        if (prev.direction === 'asc') {
          return { column, direction: 'desc' };
        }
        return { column: null, direction: null };
      });
    }
  };

  // Only sort client-side if NOT in server-side mode
  const sortedContributions = useMemo(
    () => type === 'contributions'
      ? (isServerSide ? data as Contribution[] : sortData(data as Contribution[], localSortState))
      : [],
    [type, data, localSortState, isServerSide]
  );
  const sortedFilers = useMemo(
    () => type === 'filers'
      ? (isServerSide ? data as Filer[] : sortData(data as Filer[], localSortState))
      : [],
    [type, data, localSortState, isServerSide]
  );
  const sortedExpenditures = useMemo(
    () => type === 'expenditures'
      ? (isServerSide ? data as Expenditure[] : sortData(data as Expenditure[], localSortState))
      : [],
    [type, data, localSortState, isServerSide]
  );

  if (type === 'contributions') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <SortableHeader label="Contributor" column="contributor_name" sortState={effectiveSortState} onSort={handleSort} />
              <SortableHeader label="Recipient" column="filer_name" sortState={effectiveSortState} onSort={handleSort} />
              <SortableHeader label="Amount" column="amount" sortState={effectiveSortState} onSort={handleSort} className="text-right" />
              <SortableHeader label="Date" column="date" sortState={effectiveSortState} onSort={handleSort} />
              <SortableHeader label="Location" column="contributor_city" sortState={effectiveSortState} onSort={handleSort} className="hidden md:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <>
                <LoadingRow cols={5} />
                <LoadingRow cols={5} />
                <LoadingRow cols={5} />
              </>
            ) : sortedContributions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  No contributions found. Try adjusting your search criteria.
                </td>
              </tr>
            ) : (
              sortedContributions.map((contribution) => (
                <tr key={contribution.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <a
                      href={`/search/contributors?q=${encodeURIComponent(contribution.contributor_name || '')}${contribution.contributor_city ? `&city=${encodeURIComponent(contribution.contributor_city)}` : ''}`}
                      className="font-medium text-nc-blue hover:text-blue-700 text-sm block"
                    >
                      {contribution.contributor_name || 'Unknown'}
                    </a>
                    {contribution.contributor_employer && (
                      <div className="text-xs text-slate-500">
                        {contribution.contributor_employer}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/candidate?id=${contribution.filer_id}`}
                      className="text-sm text-nc-blue hover:text-blue-700"
                    >
                      {contribution.filer_name || contribution.filer_id}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-medium text-green-700 text-sm">
                      {formatCurrency(contribution.amount)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatDate(contribution.date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">
                    {contribution.contributor_city}
                    {contribution.contributor_state && `, ${contribution.contributor_state}`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'filers') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <SortableHeader label="Name" column="name" sortState={effectiveSortState} onSort={handleSort} />
              <SortableHeader label="Type" column="type" sortState={effectiveSortState} onSort={handleSort} />
              <SortableHeader label="Office" column="office_held" sortState={effectiveSortState} onSort={handleSort} />
              <SortableHeader label="Party" column="party" sortState={effectiveSortState} onSort={handleSort} />
              <SortableHeader label="Status" column="status" sortState={effectiveSortState} onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <>
                <LoadingRow cols={5} />
                <LoadingRow cols={5} />
                <LoadingRow cols={5} />
              </>
            ) : sortedFilers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  No filers found. Try adjusting your search criteria.
                </td>
              </tr>
            ) : (
              sortedFilers.map((filer) => (
                <tr key={filer.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <a
                      href={`/candidate?id=${filer.id}`}
                      className="font-medium text-nc-blue hover:text-blue-700 text-sm"
                    >
                      {filer.name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {filer.type || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {filer.office_held || '—'}
                    {filer.office_district && ` - District ${filer.office_district}`}
                  </td>
                  <td className="px-4 py-3">
                    {filer.party && (
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                        filer.party === 'REPUBLICAN' ? 'bg-red-100 text-red-800' :
                        filer.party === 'DEMOCRAT' ? 'bg-blue-100 text-blue-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {filer.party}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {filer.status || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // Expenditures table
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <SortableHeader label="Payer" column="filer_name" sortState={effectiveSortState} onSort={handleSort} />
            <SortableHeader label="Payee" column="payee_name" sortState={effectiveSortState} onSort={handleSort} />
            <SortableHeader label="Amount" column="amount" sortState={effectiveSortState} onSort={handleSort} className="text-right" />
            <SortableHeader label="Date" column="date" sortState={effectiveSortState} onSort={handleSort} />
            <SortableHeader label="Category" column="category" sortState={effectiveSortState} onSort={handleSort} className="hidden md:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <>
              <LoadingRow cols={5} />
              <LoadingRow cols={5} />
              <LoadingRow cols={5} />
            </>
          ) : sortedExpenditures.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                No expenditures found. Try adjusting your search criteria.
              </td>
            </tr>
          ) : (
            sortedExpenditures.map((expenditure) => (
              <tr key={expenditure.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <a
                    href={`/candidate?id=${expenditure.filer_id}`}
                    className="text-sm text-nc-blue hover:text-blue-700"
                  >
                    {expenditure.filer_name || expenditure.filer_id}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 text-sm">
                    {expenditure.payee_name || 'Unknown'}
                  </div>
                  {expenditure.description && (
                    <div className="text-xs text-slate-500 truncate max-w-xs">
                      {expenditure.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-medium text-nc-red text-sm">
                    {formatCurrency(expenditure.amount)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {formatDate(expenditure.date)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">
                  {expenditure.category || '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
