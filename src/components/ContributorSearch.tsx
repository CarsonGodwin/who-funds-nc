import { useState, useEffect, useCallback } from 'react';
import FacetedFilters, { type FilterValues } from './FacetedFilters';
import ResultsTable from './ResultsTable';
import Pagination from './Pagination';
import DatabaseLoader from './DatabaseLoader';
import { searchContributions, type SearchFilters, type Contribution, type SortParams } from '../lib/duckdb';

interface ContributorSearchProps {
  initialQuery?: string;
}

export default function ContributorSearch({ initialQuery = '' }: ContributorSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<FilterValues>({
    dateFrom: '',
    dateTo: '',
    amountMin: '',
    amountMax: '',
    contributorType: '',
    party: '',
    officeType: '',
    filerType: '',
  });
  const [results, setResults] = useState<Contribution[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [sortState, setSortState] = useState<SortParams | null>(null);
  const pageSize = 50;

  // Read URL parameters client-side on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlQuery = params.get('q');
      if (urlQuery) {
        setQuery(urlQuery);
      }
      setInitialized(true);
    }
  }, []);

  const performSearch = useCallback(async () => {
    setLoading(true);
    try {
      const searchFilters: SearchFilters = {
        query: query || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        amountMin: filters.amountMin ? parseFloat(filters.amountMin) : undefined,
        amountMax: filters.amountMax ? parseFloat(filters.amountMax) : undefined,
        contributorType: filters.contributorType || undefined,
      };

      const result = await searchContributions(searchFilters, {
        page: currentPage,
        pageSize,
        sort: sortState || undefined,
      });

      setResults(result.data);
      setTotalCount(result.count);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [query, filters, currentPage, sortState]);

  // Run search when initialized (after URL params are read) or when page/filters/sort change
  useEffect(() => {
    if (initialized) {
      performSearch();
    }
  }, [initialized, currentPage, filters, sortState]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSortChange = (newSort: SortParams | null) => {
    setSortState(newSort);
    setCurrentPage(1); // Reset to page 1 when sort changes
  };

  const handleExportCSV = () => {
    // TODO: Implement CSV export
    alert('CSV export coming soon!');
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    performSearch();
  };

  return (
    <DatabaseLoader>
    <div className="space-y-6">
      {/* Search Input */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by contributor name..."
            className="w-full px-4 py-3 pr-12 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-nc-blue focus:border-transparent"
          />
          <svg
            className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          type="submit"
          className="px-6 py-3 bg-nc-blue text-white font-medium rounded-xl hover:bg-blue-800 transition-colors"
        >
          Search
        </button>
      </form>

      {/* Filters */}
      <FacetedFilters
        filters={filters}
        onChange={handleFilterChange}
        showContributorFilters={true}
      />

      {/* Results Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {loading ? 'Searching...' : `${totalCount.toLocaleString()} contributions found`}
        </h2>
        <button
          onClick={handleExportCSV}
          className="px-4 py-2 text-sm font-medium text-nc-blue border border-nc-blue rounded-lg hover:bg-blue-50 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <ResultsTable
          type="contributions"
          data={results}
          loading={loading}
          sortState={sortState}
          onSortChange={handleSortChange}
        />
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={Math.ceil(totalCount / pageSize)}
        totalResults={totalCount}
        pageSize={pageSize}
        onPageChange={handlePageChange}
      />
    </div>
    </DatabaseLoader>
  );
}
