import { useState, useEffect, useCallback } from 'react';
import TopDonorsChart from './TopDonorsChart';
import ReportTimeline from './ReportTimeline';
import ResultsTable from './ResultsTable';
import Pagination from './Pagination';
import DatabaseLoader from './DatabaseLoader';
import { formatCurrency, formatDateInt } from '../lib/format';
import { getFilerById, getLatestReport, getTopDonorsFiltered, getReportTimeline, getFilerStatsFiltered, searchContributions } from '../lib/queries';
import type { Filer, Contribution } from '../lib/types';
import type { LatestReport, ReportTimelinePoint } from '../lib/queries';

interface CandidateProfileProps {
  filerId: string;
}

interface TopDonor {
  name: string;
  total: number;
  count: number;
}

type DatePreset = 'all' | '2025' | '2024' | '2023' | '2022' | 'custom';

export default function CandidateProfile({ filerId }: CandidateProfileProps) {
  const [filer, setFiler] = useState<Filer | null>(null);
  const [latestReport, setLatestReport] = useState<LatestReport | null>(null);
  const [topDonors, setTopDonors] = useState<TopDonor[]>([]);
  const [reportTimeline, setReportTimeline] = useState<ReportTimelinePoint[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [contributionsTotal, setContributionsTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 25;

  // Stats from itemized data
  const [totalContributions, setTotalContributions] = useState(0);
  const [totalExpended, setTotalExpended] = useState(0);
  const [contributionCount, setContributionCount] = useState(0);
  const [dataDateRange, setDataDateRange] = useState<{ earliest: number | null; latest: number | null }>({
    earliest: null,
    latest: null,
  });

  // Date filtering
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [filterLoading, setFilterLoading] = useState(false);
  const [filtersApplied, setFiltersApplied] = useState(false);

  const getDateRange = useCallback((): { from?: string; to?: string } => {
    switch (datePreset) {
      case '2025':
        return { from: '2025-01-01', to: '2025-12-31' };
      case '2024':
        return { from: '2024-01-01', to: '2024-12-31' };
      case '2023':
        return { from: '2023-01-01', to: '2023-12-31' };
      case '2022':
        return { from: '2022-01-01', to: '2022-12-31' };
      case 'custom':
        return {
          from: customDateFrom || undefined,
          to: customDateTo || undefined,
        };
      default:
        return {};
    }
  }, [datePreset, customDateFrom, customDateTo]);

  // Load filer info and latest report (doesn't change with date filter)
  useEffect(() => {
    async function loadFiler() {
      setLoading(true);
      try {
        const [profileData, report] = await Promise.all([
          getFilerById(filerId),
          getLatestReport(filerId),
        ]);
        if (profileData) {
          setFiler(profileData.filer);
        }
        setLatestReport(report);
      } catch (error) {
        console.error('Error loading filer:', error);
      } finally {
        setLoading(false);
      }
    }
    loadFiler();
  }, [filerId]);

  const displayParty = filer?.party;

  // Function to apply filters and load all filtered data
  const applyFilters = useCallback(async () => {
    if (!filer) return;

    setFilterLoading(true);
    setCurrentPage(1);

    try {
      const { from, to } = getDateRange();

      const [stats, donors, timeline, contribResult] = await Promise.all([
        getFilerStatsFiltered(filerId, from, to),
        getTopDonorsFiltered(filerId, 10, from, to),
        getReportTimeline(filerId, from, to),
        searchContributions(
          { filerId, dateFrom: from, dateTo: to },
          { page: 1, pageSize }
        ),
      ]);

      setTotalContributions(stats.totalContributions);
      setTotalExpended(stats.totalExpended);
      setContributionCount(stats.contributionCount);
      setDataDateRange(stats.dateRange);
      setTopDonors(donors);
      setReportTimeline(timeline);
      setContributions(contribResult.data);
      setContributionsTotal(contribResult.count);
      setFiltersApplied(true);
    } catch (error) {
      console.error('Error applying filters:', error);
    } finally {
      setFilterLoading(false);
    }
  }, [filer, filerId, getDateRange, pageSize]);

  // Load initial data when filer is loaded (with default "all" filter)
  useEffect(() => {
    if (filer && !filtersApplied) {
      applyFilters();
    }
  }, [filer, filtersApplied, applyFilters]);

  // Load contributions for table when page changes (not filter changes)
  useEffect(() => {
    async function loadContributionsPage() {
      if (!filer || !filtersApplied || currentPage === 1) return;

      try {
        const { from, to } = getDateRange();
        const result = await searchContributions(
          { filerId, dateFrom: from, dateTo: to },
          { page: currentPage, pageSize }
        );
        setContributions(result.data);
        setContributionsTotal(result.count);
      } catch (error) {
        console.error('Error loading contributions:', error);
      }
    }
    loadContributionsPage();
  }, [filerId, filer, currentPage, filtersApplied, getDateRange, pageSize]);

  // Format date range for display
  const getDateRangeLabel = () => {
    if (dataDateRange.earliest && dataDateRange.latest) {
      const from = formatDateInt(dataDateRange.earliest);
      const to = formatDateInt(dataDateRange.latest);
      return `${from} - ${to}`;
    }
    return 'Since 2020';
  };

  // Format report period
  const formatReportPeriod = (dateStr: string) => {
    if (!dateStr || dateStr.length !== 8) return dateStr;
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-8 animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-slate-200 rounded w-1/4 mb-8"></div>
          <div className="grid grid-cols-3 gap-6">
            <div className="h-20 bg-slate-200 rounded"></div>
            <div className="h-20 bg-slate-200 rounded"></div>
            <div className="h-20 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!filer) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-slate-500">Candidate not found</p>
      </div>
    );
  }

  return (
    <DatabaseLoader>
      <div className="space-y-6">
        {/* Header Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{filer.name}</h1>
              <div className="flex flex-wrap gap-2 mt-2">
                {filer.type && (
                  <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-800">
                    {filer.type}
                  </span>
                )}
                {/* Party Badge - official data only */}
                {displayParty && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                      displayParty === 'REPUBLICAN'
                        ? 'bg-red-100 text-red-800'
                        : displayParty === 'DEMOCRAT'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {displayParty}
                  </span>
                )}
                {filer.office_held && (
                  <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                    {filer.office_held}
                    {filer.office_district && ` - District ${filer.office_district}`}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Filer ID</p>
              <p className="text-sm font-mono text-slate-700">{filer.id}</p>
            </div>
          </div>

          {/* Latest Report Summary */}
          {latestReport && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-semibold text-slate-700">Latest Report</h3>
                <span className="text-xs text-slate-500">
                  (Period: {formatReportPeriod(latestReport.periodStart)} - {formatReportPeriod(latestReport.periodEnd)})
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-slate-500 mb-1">Raised (this period)</p>
                  <p className="text-xl font-bold text-green-700">{formatCurrency(latestReport.totalContributions)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 mb-1">Spent (this period)</p>
                  <p className="text-xl font-bold text-nc-red">{formatCurrency(latestReport.totalExpenditures)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 mb-1">Cash on Hand</p>
                  {latestReport.cashOnHand != null ? (
                    <p className={`text-xl font-bold ${latestReport.cashOnHand >= 0 ? 'text-nc-blue' : 'text-red-600'}`}>
                      {formatCurrency(latestReport.cashOnHand)}
                    </p>
                  ) : (
                    <p className="text-xl font-bold text-slate-400">N/A</p>
                  )}
                </div>
                {latestReport.loanBalance != null && latestReport.loanBalance > 0 && (
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Loan Balance</p>
                    <p className="text-xl font-bold text-amber-600">{formatCurrency(latestReport.loanBalance)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Date Filter */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-slate-700">Filter Data:</span>
              <div className="flex flex-wrap gap-2">
                {(['all', '2025', '2024', '2023', '2022', 'custom'] as DatePreset[]).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setDatePreset(preset)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      datePreset === preset
                        ? 'bg-nc-blue text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {preset === 'all' ? 'All Time' : preset === 'custom' ? 'Custom' : preset}
                  </button>
                ))}
              </div>
              {datePreset === 'custom' && (
                <div className="flex items-center gap-2 ml-2">
                  <input
                    type="date"
                    value={customDateFrom}
                    onChange={(e) => setCustomDateFrom(e.target.value)}
                    className="px-2 py-1 text-sm border border-slate-300 rounded-lg"
                    placeholder="From"
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    type="date"
                    value={customDateTo}
                    onChange={(e) => setCustomDateTo(e.target.value)}
                    className="px-2 py-1 text-sm border border-slate-300 rounded-lg"
                    placeholder="To"
                  />
                </div>
              )}
              <button
                onClick={applyFilters}
                disabled={filterLoading}
                className="px-4 py-1.5 text-sm font-medium bg-nc-blue text-white rounded-lg hover:bg-blue-900 disabled:opacity-50 transition-colors"
              >
                {filterLoading ? 'Loading...' : 'Apply Filters'}
              </button>
            </div>
          </div>

          {/* Itemized Data Stats */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold text-slate-700">Itemized Records</h3>
              <span className="text-xs text-slate-500">({getDateRangeLabel()})</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-slate-500 mb-1">Total Contributions</p>
                <p className="text-xl font-bold text-green-700">{formatCurrency(totalContributions)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Total Expenditures</p>
                <p className="text-xl font-bold text-nc-red">{formatCurrency(totalExpended)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1"># of Contributions</p>
                <p className="text-xl font-bold text-slate-900">{contributionCount.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid md:grid-cols-2 gap-6">
          <TopDonorsChart donors={topDonors} />
          <ReportTimeline data={reportTimeline} title="Financial History (from reports)" />
        </div>

        {/* Contributions Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">
              Contributions
              {datePreset !== 'all' && (
                <span className="text-sm font-normal text-slate-500 ml-2">
                  ({datePreset === 'custom' ? 'Custom range' : datePreset})
                </span>
              )}
            </h2>
          </div>
          <ResultsTable type="contributions" data={contributions} />
          <div className="p-6 border-t border-slate-200">
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(contributionsTotal / pageSize)}
              totalResults={contributionsTotal}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </div>
    </DatabaseLoader>
  );
}
