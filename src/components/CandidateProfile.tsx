import { useEffect, useRef, useState } from 'react';
import DatabaseLoader from './DatabaseLoader';
import ErrorNotice from './ErrorNotice';
import MonthlyChart from './MonthlyChart';
import Pagination from './Pagination';
import ResultsTable from './ResultsTable';
import TopDonorsChart from './TopDonorsChart';
import {
  EXPORT_LIMIT,
  exportContributions,
  getContributionYears,
  getFiler,
  getFilerStats,
  getMonthlyTotals,
  getTopDonors,
  searchContributions,
  type FilerStats,
  type MonthlyTotal,
  type TopDonor,
} from '../lib/queries';
import { getUrlParam, usePagedSearch } from '../lib/hooks';
import { formatCount, formatCurrency, formatDateInt, humanize } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { withBase } from '../lib/url';
import type { Filer } from '../lib/types';

const PAGE_SIZE = 25;

/** The period every number on the page is computed for. */
interface Period {
  label: string;
  from?: string;
  to?: string;
}

const ALL_TIME: Period = { label: 'All time' };
const yearPeriod = (year: number): Period => ({ label: String(year), from: `${year}-01-01`, to: `${year}-12-31` });

interface Summary {
  stats: FilerStats;
  donors: TopDonor[];
  monthly: MonthlyTotal[];
}

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="card p-5">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function PeriodPicker({ years, period, onChange }: { years: number[]; period: Period; onChange: (p: Period) => void }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const isCustom = customOpen || period.label === 'Custom';

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Time period">
      {[ALL_TIME, ...years.map(yearPeriod)].map((p) => (
        <button
          key={p.label}
          type="button"
          className="chip"
          aria-pressed={!isCustom && period.label === p.label}
          onClick={() => {
            setCustomOpen(false);
            onChange(p);
          }}
        >
          {p.label}
        </button>
      ))}
      <button type="button" className="chip" aria-pressed={isCustom} onClick={() => setCustomOpen(true)}>
        Custom…
      </button>
      {isCustom && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onChange({ label: 'Custom', from: from || undefined, to: to || undefined });
          }}
        >
          <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="input w-auto py-1.5" />
          <span className="text-sm text-slate-500">to</span>
          <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="input w-auto py-1.5" />
          <button type="submit" className="btn-primary btn-sm">
            Apply
          </button>
        </form>
      )}
    </div>
  );
}

function Profile({ filerId }: { filerId: string }) {
  // undefined while loading, null when the id doesn't exist
  const [filer, setFiler] = useState<Filer | null | undefined>(undefined);
  const [years, setYears] = useState<number[]>([]);
  const [period, setPeriod] = useState<Period>(ALL_TIME);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const latestSummary = useRef(0);

  useEffect(() => {
    Promise.all([getFiler(filerId), getContributionYears(filerId)])
      .then(([f, y]) => {
        setFiler(f);
        setYears(y);
        if (f) document.title = `${f.name} · Who Funds NC`;
      })
      .catch((err) => {
        console.error('Failed to load committee:', err);
        setError(err instanceof Error ? err.message : 'Failed to load committee');
      });
  }, [filerId]);

  // Headline numbers and charts follow the selected period.
  useEffect(() => {
    const requestId = ++latestSummary.current;
    setSummaryLoading(true);
    Promise.all([
      getFilerStats(filerId, period.from, period.to),
      getTopDonors(filerId, 10, period.from, period.to),
      getMonthlyTotals(filerId, period.from, period.to),
    ])
      .then(([stats, donors, monthly]) => {
        if (requestId === latestSummary.current) setSummary({ stats, donors, monthly });
      })
      .catch((err) => {
        if (requestId !== latestSummary.current) return;
        console.error('Failed to load committee summary:', err);
        setError(err instanceof Error ? err.message : 'Failed to load committee summary');
      })
      .finally(() => {
        if (requestId === latestSummary.current) setSummaryLoading(false);
      });
  }, [filerId, period]);

  const contributionFilters = { filerId, dateFrom: period.from, dateTo: period.to };
  const contributions = usePagedSearch(
    (page, sort, knownCount) => searchContributions(contributionFilters, { page, pageSize: PAGE_SIZE, sort, knownCount }),
    JSON.stringify(contributionFilters)
  );

  if (error) {
    return (
      <div className="card">
        <ErrorNotice message={error} />
      </div>
    );
  }

  if (filer === undefined) {
    return (
      <div className="card animate-pulse p-6" aria-busy="true">
        <div className="h-8 w-1/3 rounded bg-slate-200" />
        <div className="mt-3 h-4 w-1/4 rounded bg-slate-200" />
      </div>
    );
  }

  if (filer === null) {
    return (
      <div className="card p-10 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Committee not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          There's no committee with the ID <span className="font-mono">{filerId}</span> in this data.
        </p>
        <a href={withBase('search/committees')} className="btn-primary mt-6">
          Browse committees
        </a>
      </div>
    );
  }

  const stats = summary?.stats;
  const tags = [filer.party, filer.office_held || filer.office_sought, filer.type].filter(Boolean) as string[];
  const location = [filer.city, filer.state].filter(Boolean).join(', ');

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await exportContributions(contributionFilters, contributions.sort);
      downloadCsv(rows, `nc-contributions-${filer.id}`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Sorry, the export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{filer.name}</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            {location && <>{location} · </>}
            Filer ID <span className="font-mono">{filer.id}</span>
          </p>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="badge">
                  {humanize(tag)}
                </span>
              ))}
            </div>
          )}
        </div>
        <a href={withBase(`advanced?filerName=${encodeURIComponent(filer.name)}`)} className="btn-secondary self-start">
          Filter in List Builder
        </a>
      </div>

      <div className="space-y-2">
        <PeriodPicker years={years} period={period} onChange={setPeriod} />
        {stats?.earliest && stats.latest && (
          <p className="text-xs text-slate-500">
            Contributions on record from {formatDateInt(stats.earliest)} to {formatDateInt(stats.latest)}
          </p>
        )}
      </div>

      <div
        className={`grid grid-cols-2 gap-4 ${stats && stats.expenditureCount > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} ${summaryLoading ? 'opacity-60' : ''}`}
        aria-busy={summaryLoading}
      >
        <StatTile label="Raised" value={stats ? formatCurrency(stats.totalRaised) : '—'} />
        <StatTile label="Contributions" value={stats ? formatCount(stats.contributionCount) : '—'} />
        <StatTile label="Unique donors" value={stats ? formatCount(stats.donorCount) : '—'} detail="Distinct contributor names" />
        <StatTile
          label="Average gift"
          value={stats && stats.contributionCount > 0 ? formatCurrency(stats.totalRaised / stats.contributionCount) : '—'}
        />
        {stats && stats.expenditureCount > 0 && (
          <StatTile
            label="Expenditures"
            value={formatCurrency(stats.totalSpent)}
            detail={`${formatCount(stats.expenditureCount)} itemized`}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <MonthlyChart data={summary?.monthly ?? []} loading={summaryLoading} />
        </div>
        <div className="lg:col-span-2">
          <TopDonorsChart donors={summary?.donors ?? []} loading={summaryLoading} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">
            Contributions
            {period !== ALL_TIME && <span className="font-normal text-slate-500"> · {period.label}</span>}
          </h2>
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting || contributions.count === 0}
            className="btn-secondary btn-sm"
            title={contributions.count > EXPORT_LIMIT ? `Exports the first ${formatCount(EXPORT_LIMIT)} rows` : undefined}
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
        {contributions.error ? (
          <ErrorNotice message={contributions.error} />
        ) : (
          <ResultsTable
            type="contributions"
            hideRecipient
            data={contributions.data}
            loading={contributions.loading}
            sort={contributions.sort}
            onSortChange={contributions.setSort}
            emptyMessage="No contributions in this period."
          />
        )}
        {contributions.count > PAGE_SIZE && (
          <div className="border-t border-slate-200 px-5 py-3">
            <Pagination
              currentPage={contributions.page}
              totalResults={contributions.count}
              pageSize={PAGE_SIZE}
              onPageChange={contributions.setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileFromUrl() {
  const filerId = getUrlParam('id');
  if (!filerId) {
    return (
      <div className="card p-10 text-center">
        <h1 className="text-lg font-semibold text-slate-900">No committee selected</h1>
        <p className="mt-2 text-sm text-slate-600">Search for a committee to see its profile.</p>
        <a href={withBase('search/committees')} className="btn-primary mt-6">
          Browse committees
        </a>
      </div>
    );
  }
  return <Profile filerId={filerId} />;
}

export default function CandidateProfile() {
  return (
    <DatabaseLoader>
      <ProfileFromUrl />
    </DatabaseLoader>
  );
}
