import { useEffect, useRef, useState } from 'react';
import ResultsTable from './ResultsTable';
import Pagination from './Pagination';
import DatabaseLoader from './DatabaseLoader';
import ErrorNotice from './ErrorNotice';
import DonorTable from './advanced/DonorTable';
import { QuickButtons, Section, SelectField, TextField, type Option } from './advanced/FormFields';
import {
  DEFAULT_FILTERS,
  filtersFromParams,
  runSearch,
  type AdvancedFilters,
  type AggregatedDonor,
  type SearchOutcome,
} from '../lib/advanced-search';
import { EXPORT_LIMIT, getDistinctValues } from '../lib/queries';
import { loadNcGeo, type NcGeoData } from '../lib/nc-geo';
import { downloadCsv } from '../lib/csv';
import { formatCount, humanize } from '../lib/format';
import type { Contribution, Expenditure, SortParams } from '../lib/types';

const PAGE_SIZE = 50;

type SectionKey =
  | 'transaction' | 'name' | 'amount' | 'date' | 'location'
  | 'contributor' | 'filer' | 'expenditure' | 'aggregation';

const DEFAULT_OPEN: Record<SectionKey, boolean> = {
  transaction: true,
  name: true,
  amount: true,
  date: true,
  location: false,
  contributor: false,
  filer: false,
  expenditure: false,
  aggregation: false,
};

/** Which filter fields each section holds, so a collapsed section can show that it's in use. */
const SECTION_FIELDS: Partial<Record<SectionKey, (keyof AdvancedFilters)[]>> = {
  location: ['county', 'city', 'zipCode', 'state'],
  contributor: ['contributorType', 'employer', 'occupation'],
  filer: ['filerName', 'filerType', 'officeType', 'party'],
  expenditure: ['expenditureCategory'],
  aggregation: ['groupByDonor'],
};

// ---- Dropdown options come from the data, so they can never list values that don't exist ----

interface FilterOptions {
  contributorTypes: Option[];
  filerTypes: Option[];
  parties: Option[];
  offices: Option[];
  states: Option[];
}

const NO_OPTIONS: FilterOptions = { contributorTypes: [], filerTypes: [], parties: [], offices: [], states: [] };

const toOption = (value: string): Option => ({ value, label: humanize(value) });

async function loadFilterOptions(): Promise<FilterOptions> {
  const [contributorTypes, filerTypes, parties, held, sought, contribStates, payeeStates] = await Promise.all([
    getDistinctValues('contributions', 'contributor_type'),
    getDistinctValues('filers', 'type'),
    getDistinctValues('filers', 'party'),
    getDistinctValues('filers', 'office_held'),
    getDistinctValues('filers', 'office_sought'),
    getDistinctValues('contributions', 'contributor_state'),
    getDistinctValues('expenditures', 'payee_state'),
  ]);
  const union = (...lists: string[][]) => [...new Set(lists.flat())].sort();
  return {
    contributorTypes: contributorTypes.map(toOption),
    filerTypes: filerTypes.map(toOption),
    parties: parties.map(toOption),
    offices: union(held, sought).map(toOption),
    // State codes are already readable ("NC"); don't title-case them.
    states: union(contribStates, payeeStates).map((value) => ({ value, label: value })),
  };
}

/** A dropdown is only useful when there is something to choose between. */
const hasChoices = (options: Option[]) => options.length > 1;

/** Counties the city lookup can actually filter by (only some counties have mapped cities). */
const mappedCounties = (geo: NcGeoData | null): string[] => {
  if (!geo) return [];
  const withCities = new Set(Object.values(geo.cities).map((c) => c.county.toLowerCase()));
  return geo.counties.filter((county) => withCities.has(county.toLowerCase()));
};

const isContributionDonorView = (f: AdvancedFilters) => f.groupByDonor && f.transactionType === 'contributions';

function ListBuilder() {
  const [filters, setFilters] = useState<AdvancedFilters>(DEFAULT_FILTERS);
  // The filters that produced the current results; pagination, sorting and export use these, not the live form.
  const [applied, setApplied] = useState<AdvancedFilters | null>(null);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sort, setSort] = useState<SortParams | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(DEFAULT_OPEN);
  const [ncGeo, setNcGeo] = useState<NcGeoData | null>(null);
  const [options, setOptions] = useState<FilterOptions>(NO_OPTIONS);
  const latestRequest = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  const totalCount = outcome?.count ?? 0;
  const set = <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));
  const toggleSection = (key: SectionKey) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  const sectionActive = (key: SectionKey) => (SECTION_FIELDS[key] ?? []).some((field) => Boolean(filters[field]));

  const search = async (searchFilters: AdvancedFilters, page: number, searchSort?: SortParams, knownCount?: number) => {
    const requestId = ++latestRequest.current;
    setApplied(searchFilters);
    setCurrentPage(page);
    setSort(searchSort);
    setLoading(true);
    setError(null);

    try {
      const result = await runSearch(searchFilters, page, PAGE_SIZE, knownCount, searchSort);
      if (requestId === latestRequest.current) setOutcome(result);
    } catch (err) {
      console.error('Search error:', err);
      if (requestId === latestRequest.current) {
        setOutcome(null);
        setError(err instanceof Error ? err.message : 'Search failed');
      }
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  };

  // Load geo data and dropdown options once, and run the search described by any URL params.
  useEffect(() => {
    loadNcGeo().then(setNcGeo).catch(() => setNcGeo(null));
    loadFilterOptions().then(setOptions).catch(() => setOptions(NO_OPTIONS));

    const fromUrl = filtersFromParams(new URLSearchParams(window.location.search));
    if (fromUrl) {
      setFilters(fromUrl);
      setOpen((prev) => ({
        ...prev,
        contributor: prev.contributor || Boolean(fromUrl.contributorType),
        filer: prev.filer || Boolean(fromUrl.party || fromUrl.filerType || fromUrl.filerName),
        aggregation: prev.aggregation || fromUrl.groupByDonor || Boolean(fromUrl.minContributions || fromUrl.minTotalAmount),
      }));
      search(fromUrl, 1);
    }
  }, []);

  const clearFilters = () => {
    latestRequest.current++;
    setFilters(DEFAULT_FILTERS);
    setApplied(null);
    setOutcome(null);
    setError(null);
    setLoading(false);
  };

  const exportCsv = async () => {
    if (!applied) return;
    setExporting(true);
    try {
      const all = await runSearch(applied, 1, EXPORT_LIMIT, totalCount, sort);
      downloadCsv(all.data, `nc-${isContributionDonorView(applied) ? 'donors' : applied.transactionType}`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Sorry, the export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const isContribution = filters.transactionType === 'contributions';
  const hasSearched = applied !== null;
  const donorView = applied !== null && isContributionDonorView(applied);

  const amountPresets = [1_000, 5_000, 10_000, 100_000].map((amount) => ({
    label: `$${amount.toLocaleString()}+`,
    apply: () => setFilters((prev) => ({ ...prev, amountMin: String(amount), amountMax: '' })),
  }));

  const thisYear = new Date().getFullYear();
  const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const datePresets = [
    {
      label: 'Past 12 months',
      apply: () => {
        const to = new Date();
        const from = new Date(to);
        from.setFullYear(to.getFullYear() - 1);
        setFilters((prev) => ({ ...prev, dateFrom: isoDate(from), dateTo: isoDate(to) }));
      },
    },
    ...[0, 1, 2, 3, 4].map((offset) => {
      const year = thisYear - offset;
      return {
        label: String(year),
        apply: () => setFilters((prev) => ({ ...prev, dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` })),
      };
    }),
  ];

  const donorPresets = [
    { label: '5+ gifts', apply: () => setFilters((p) => ({ ...p, minContributions: '4', minTotalAmount: '' })) },
    { label: '$10K+ total', apply: () => setFilters((p) => ({ ...p, minContributions: '', minTotalAmount: '10000' })) },
    { label: '$100K+ total', apply: () => setFilters((p) => ({ ...p, minContributions: '', minTotalAmount: '100000' })) },
  ];

  const counties = mappedCounties(ncGeo);
  const resultNoun = donorView ? 'donor' : applied?.transactionType === 'expenditures' ? 'expenditure' : 'contribution';

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[300px_1fr] xl:grid-cols-[340px_1fr]">
      {/* Filters */}
      <form
        className="card overflow-hidden lg:sticky lg:top-4"
        aria-label="List filters"
        onSubmit={(e) => {
          e.preventDefault();
          search(filters, 1);
          // On narrow screens the results sit below the long filter form.
          if (window.matchMedia('(max-width: 1023px)').matches) {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }}
      >
        <div className="lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto">
          <Section title="Transaction type" open={open.transaction} onToggle={() => toggleSection('transaction')}>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Transaction type">
              {(['contributions', 'expenditures'] as const).map((type) => (
                <label
                  key={type}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-nc-blue ${
                    filters.transactionType === type ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <input
                    type="radio"
                    name="transactionType"
                    checked={filters.transactionType === type}
                    onChange={() => set('transactionType', type)}
                    className="sr-only"
                  />
                  {type === 'contributions' ? 'Contributions' : 'Expenditures'}
                </label>
              ))}
            </div>
          </Section>

          <Section title="Name" open={open.name} onToggle={() => toggleSection('name')} active={Boolean(filters.name)}>
            <TextField
              label={isContribution ? 'Contributor name' : 'Payee name'}
              value={filters.name}
              onChange={(v) => set('name', v)}
              placeholder="Enter a name"
            />
            <SelectField
              label="Match"
              value={filters.nameSearchType === 'contains' ? '' : filters.nameSearchType}
              onChange={(v) => set('nameSearchType', (v || 'contains') as AdvancedFilters['nameSearchType'])}
              allLabel="Contains"
              options={[
                { value: 'starts_with', label: 'Starts with' },
                { value: 'exact', label: 'Exact match' },
              ]}
            />
          </Section>

          <Section
            title="Amount"
            open={open.amount}
            onToggle={() => toggleSection('amount')}
            active={Boolean(filters.amountMin || filters.amountMax)}
          >
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Min" value={filters.amountMin} onChange={(v) => set('amountMin', v)} placeholder="$0" numeric />
              <TextField label="Max" value={filters.amountMax} onChange={(v) => set('amountMax', v)} placeholder="No limit" numeric />
            </div>
            <QuickButtons presets={amountPresets} />
          </Section>

          <Section title="Date" open={open.date} onToggle={() => toggleSection('date')} active={Boolean(filters.dateFrom || filters.dateTo)}>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="From" type="date" value={filters.dateFrom} onChange={(v) => set('dateFrom', v)} />
              <TextField label="To" type="date" value={filters.dateTo} onChange={(v) => set('dateTo', v)} />
            </div>
            <QuickButtons presets={datePresets} />
          </Section>

          <Section title="Location" open={open.location} onToggle={() => toggleSection('location')} active={sectionActive('location')}>
            {counties.length > 0 && (
              <SelectField
                label="County"
                value={filters.county}
                onChange={(v) => set('county', v)}
                allLabel="All counties"
                options={counties.map((c) => ({ value: c, label: c }))}
                hint="Matches the larger cities in each county; small towns may be missed."
              />
            )}
            <TextField label="City" value={filters.city} onChange={(v) => set('city', v)} placeholder="e.g. Raleigh" />
            <TextField
              label="ZIP code"
              value={filters.zipCode}
              onChange={(v) => set('zipCode', v)}
              placeholder="e.g. 27601"
              hint='Matches the start of the ZIP, so "276" covers the Raleigh area.'
            />
            {hasChoices(options.states) && (
              <SelectField label="State" value={filters.state} onChange={(v) => set('state', v)} allLabel="All states" options={options.states} />
            )}
          </Section>

          {isContribution && (
            <Section title="Contributor" open={open.contributor} onToggle={() => toggleSection('contributor')} active={sectionActive('contributor')}>
              {hasChoices(options.contributorTypes) && (
                <SelectField
                  label="Contributor type"
                  value={filters.contributorType}
                  onChange={(v) => set('contributorType', v)}
                  allLabel="All types"
                  options={options.contributorTypes}
                />
              )}
              <TextField label="Employer" value={filters.employer} onChange={(v) => set('employer', v)} placeholder="e.g. Duke Energy" />
              <TextField label="Occupation" value={filters.occupation} onChange={(v) => set('occupation', v)} placeholder="e.g. Attorney" />
            </Section>
          )}

          <Section
            title={isContribution ? 'Recipient committee' : 'Paying committee'}
            open={open.filer}
            onToggle={() => toggleSection('filer')}
            active={sectionActive('filer')}
          >
            <TextField label="Committee name" value={filters.filerName} onChange={(v) => set('filerName', v)} placeholder="Candidate or committee name" />
            {hasChoices(options.filerTypes) && (
              <SelectField label="Committee type" value={filters.filerType} onChange={(v) => set('filerType', v)} allLabel="All types" options={options.filerTypes} />
            )}
            {hasChoices(options.offices) && (
              <SelectField label="Office" value={filters.officeType} onChange={(v) => set('officeType', v)} allLabel="All offices" options={options.offices} />
            )}
            {hasChoices(options.parties) && (
              <SelectField label="Party" value={filters.party} onChange={(v) => set('party', v)} allLabel="All parties" options={options.parties} />
            )}
          </Section>

          {!isContribution && (
            <Section title="Spending category" open={open.expenditure} onToggle={() => toggleSection('expenditure')} active={sectionActive('expenditure')}>
              <TextField
                label="Category contains"
                value={filters.expenditureCategory}
                onChange={(v) => set('expenditureCategory', v)}
                placeholder="e.g. refund, advertising"
                hint="Categories are free text in the source data."
              />
            </Section>
          )}

          {isContribution && (
            <Section title="Group by donor" open={open.aggregation} onToggle={() => toggleSection('aggregation')} active={sectionActive('aggregation')}>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={filters.groupByDonor}
                  onChange={(e) => set('groupByDonor', e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-nc-blue"
                />
                <span className="text-sm text-slate-700">
                  <span className="font-medium text-slate-900">One row per donor</span>
                  <span className="block text-slate-500">Totals, counts and averages for each contributor name.</span>
                </span>
              </label>

              {filters.groupByDonor && (
                <div className="space-y-3 border-t border-slate-200 pt-3">
                  <TextField
                    label="More than this many gifts"
                    type="number"
                    value={filters.minContributions}
                    onChange={(v) => set('minContributions', v)}
                    placeholder="e.g. 4"
                  />
                  <TextField
                    label="Total given at least"
                    value={filters.minTotalAmount}
                    onChange={(v) => set('minTotalAmount', v)}
                    placeholder="e.g. 10000"
                    numeric
                  />
                  <QuickButtons presets={donorPresets} />
                </div>
              )}
            </Section>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-200 bg-slate-50 p-4">
          <button type="submit" disabled={loading} className="btn-primary flex-1">
            {loading ? 'Searching…' : 'Search'}
          </button>
          <button type="button" onClick={clearFilters} className="btn-secondary">
            Reset
          </button>
        </div>
      </form>

      {/* Results */}
      <div ref={resultsRef} className="min-w-0 scroll-mt-4 space-y-4">
        {!hasSearched ? (
          <div className="card px-6 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-nc-blue-light text-nc-blue">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 10h12M10 16h4" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">Build a list</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              Combine filters for name, amount, date, location, employer and more, then press Search. Turn on “Group by
              donor” to see one row per contributor with their totals.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title" aria-live="polite">
                {loading && !outcome ? 'Searching…' : `${formatCount(totalCount)} ${resultNoun}${totalCount === 1 ? '' : 's'}`}
              </h2>
              <button
                type="button"
                onClick={exportCsv}
                disabled={exporting || loading || totalCount === 0}
                className="btn-secondary btn-sm"
                title={totalCount > EXPORT_LIMIT ? `Exports the first ${formatCount(EXPORT_LIMIT)} rows` : undefined}
              >
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
            {error ? (
              <ErrorNotice message={error} />
            ) : donorView ? (
              <DonorTable
                donors={outcome?.kind === 'donors' ? (outcome.data as AggregatedDonor[]) : []}
                loading={loading}
                sort={sort}
                onSortChange={(next) => search(applied, 1, next, totalCount)}
              />
            ) : (
              <ResultsTable
                type={applied.transactionType}
                data={(outcome?.kind === 'transactions' ? outcome.data : []) as (Contribution & Expenditure)[]}
                loading={loading}
                sort={sort}
                onSortChange={(next) => search(applied, 1, next, totalCount)}
                emptyMessage="Nothing matches these filters. Try removing one."
              />
            )}
          </div>
        )}

        {hasSearched && (
          <Pagination
            currentPage={currentPage}
            totalResults={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={(page) => {
              search(applied, page, sort, totalCount);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function AdvancedSearch() {
  return (
    <DatabaseLoader>
      <ListBuilder />
    </DatabaseLoader>
  );
}
