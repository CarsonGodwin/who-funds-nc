import { useEffect, useRef, useState } from 'react';
import ResultsTable from './ResultsTable';
import Pagination from './Pagination';
import DatabaseLoader from './DatabaseLoader';
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
import { getDistinctValues } from '../lib/queries';
import { waitForInit } from '../lib/duckdb';
import { loadNcGeo, type NcGeoData } from '../lib/nc-geo';
import { downloadCsv } from '../lib/csv';
import type { Contribution, Expenditure } from '../lib/types';

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

// ---- Dropdown options come from the data, so they can never list values that don't exist ----

interface FilterOptions {
  contributorTypes: Option[];
  filerTypes: Option[];
  parties: Option[];
  offices: Option[];
  states: Option[];
}

const NO_OPTIONS: FilterOptions = { contributorTypes: [], filerTypes: [], parties: [], offices: [], states: [] };

/** "CANDIDATE_COMMITTEE" -> "Candidate Committee"; values that are already readable pass through. */
const toOption = (value: string): Option => ({
  value,
  label: value.includes('_') ? value.toLowerCase().replace(/(^|_)(\w)/g, (_, sep, c) => `${sep ? ' ' : ''}${c.toUpperCase()}`) : value,
});

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
    states: union(contribStates, payeeStates).map(toOption),
  };
}

/** A dropdown is only useful when there is something to choose between. */
const hasChoices = (options: Option[]) => options.length > 1;

const isContributionDonorView = (f: AdvancedFilters) => f.groupByDonor && f.transactionType === 'contributions';

export default function AdvancedSearch() {
  const [filters, setFilters] = useState<AdvancedFilters>(DEFAULT_FILTERS);
  // The filters that produced the current results; pagination and export use these, not the live form.
  const [applied, setApplied] = useState<AdvancedFilters | null>(null);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(DEFAULT_OPEN);
  const [ncGeo, setNcGeo] = useState<NcGeoData | null>(null);
  const [options, setOptions] = useState<FilterOptions>(NO_OPTIONS);
  const latestRequest = useRef(0);

  const totalCount = outcome?.count ?? 0;
  const set = <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));
  const toggleSection = (key: SectionKey) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const search = async (searchFilters: AdvancedFilters, page: number, knownCount?: number) => {
    const requestId = ++latestRequest.current;
    setApplied(searchFilters);
    setCurrentPage(page);
    setLoading(true);

    try {
      await waitForInit();
      const result = await runSearch(searchFilters, page, PAGE_SIZE, knownCount);
      if (requestId === latestRequest.current) setOutcome(result);
    } catch (error) {
      console.error('Search error:', error);
      if (requestId === latestRequest.current) setOutcome(null);
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
        filer: prev.filer || Boolean(fromUrl.party || fromUrl.filerType),
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
    setLoading(false);
  };

  const exportCsv = () => {
    if (!outcome || !applied) return;
    downloadCsv(outcome.data, `nc-campaign-finance-${applied.transactionType}`);
  };

  const isContribution = filters.transactionType === 'contributions';
  const hasSearched = applied !== null;
  const donorView = applied !== null && isContributionDonorView(applied);

  const amountPresets = [1_000, 5_000, 10_000, 100_000].map((amount) => ({
    label: `$${amount.toLocaleString()}+`,
    apply: () => setFilters((prev) => ({ ...prev, amountMin: String(amount), amountMax: '' })),
  }));

  const thisYear = new Date().getFullYear();
  const datePresets = [
    {
      label: 'Last Year',
      apply: () => {
        const to = new Date();
        const from = new Date(to);
        from.setFullYear(to.getFullYear() - 1);
        setFilters((prev) => ({ ...prev, dateFrom: from.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10) }));
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
    { label: '5+ donations', apply: () => setFilters((p) => ({ ...p, minContributions: '4', minTotalAmount: '' })) },
    { label: '$10K+ total', apply: () => setFilters((p) => ({ ...p, minContributions: '', minTotalAmount: '10000' })) },
    { label: '$100K+ total', apply: () => setFilters((p) => ({ ...p, minContributions: '', minTotalAmount: '100000' })) },
  ];

  const showFilerSelects = hasChoices(options.filerTypes) || hasChoices(options.offices) || hasChoices(options.parties);

  return (
    <DatabaseLoader>
      <div className="grid lg:grid-cols-[400px_1fr] gap-6">
        {/* Filters Panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-nc-blue text-white">
              <h2 className="text-lg font-semibold">List Builder</h2>
              <p className="text-sm text-blue-200 mt-1">Build targeted lists with multiple filters</p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                search(filters, 1);
              }}
            >
              <div className="p-4 space-y-4">
                <Section title="Transaction Type" icon="📊" open={open.transaction} onToggle={() => toggleSection('transaction')}>
                  <div className="flex gap-4">
                    {(['contributions', 'expenditures'] as const).map((type) => (
                      <label key={type} className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={filters.transactionType === type}
                          onChange={() => set('transactionType', type)}
                          className="w-4 h-4 text-nc-blue"
                        />
                        <span className="text-sm">{type === 'contributions' ? 'Contributions' : 'Expenditures'}</span>
                      </label>
                    ))}
                  </div>
                </Section>

                <Section title="Name Search" icon="👤" open={open.name} onToggle={() => toggleSection('name')}>
                  <TextField
                    label={isContribution ? 'Contributor Name' : 'Payee Name'}
                    value={filters.name}
                    onChange={(v) => set('name', v)}
                    placeholder="Enter name..."
                  />
                  <SelectField
                    label="Search Mode"
                    value={filters.nameSearchType}
                    onChange={(v) => set('nameSearchType', v as AdvancedFilters['nameSearchType'])}
                    allLabel="Contains"
                    options={[
                      { value: 'exact', label: 'Exact Match' },
                      { value: 'starts_with', label: 'Starts With' },
                    ]}
                  />
                </Section>

                <Section title="Amount Range" icon="💰" open={open.amount} onToggle={() => toggleSection('amount')}>
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Min Amount" value={filters.amountMin} onChange={(v) => set('amountMin', v)} placeholder="$0" numeric />
                    <TextField label="Max Amount" value={filters.amountMax} onChange={(v) => set('amountMax', v)} placeholder="No limit" numeric />
                  </div>
                  <QuickButtons presets={amountPresets} />
                </Section>

                <Section title="Date Range" icon="📅" open={open.date} onToggle={() => toggleSection('date')}>
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="From Date" type="date" value={filters.dateFrom} onChange={(v) => set('dateFrom', v)} />
                    <TextField label="To Date" type="date" value={filters.dateTo} onChange={(v) => set('dateTo', v)} />
                  </div>
                  <QuickButtons presets={datePresets} />
                </Section>

                <Section title="Location" icon="📍" open={open.location} onToggle={() => toggleSection('location')}>
                  <SelectField
                    label="County"
                    value={filters.county}
                    onChange={(v) => set('county', v)}
                    allLabel="All Counties"
                    options={(ncGeo?.counties ?? []).map((c) => ({ value: c, label: c }))}
                  />
                  <TextField label="City" value={filters.city} onChange={(v) => set('city', v)} placeholder="e.g., Raleigh, Charlotte" />
                  <TextField
                    label="ZIP Code"
                    value={filters.zipCode}
                    onChange={(v) => set('zipCode', v)}
                    placeholder="e.g., 27601, 28202"
                    hint='Partial match supported (e.g., "276" for Raleigh area)'
                  />
                  {hasChoices(options.states) && (
                    <SelectField label="State" value={filters.state} onChange={(v) => set('state', v)} allLabel="All States" options={options.states} />
                  )}
                  <p className="text-xs text-slate-400">City/county data from public geographic lookup sources</p>
                </Section>

                {isContribution && (
                  <Section title="Contributor Details" icon="🏢" open={open.contributor} onToggle={() => toggleSection('contributor')}>
                    {hasChoices(options.contributorTypes) && (
                      <SelectField
                        label="Contributor Type"
                        value={filters.contributorType}
                        onChange={(v) => set('contributorType', v)}
                        allLabel="All Types"
                        options={options.contributorTypes}
                      />
                    )}
                    <TextField label="Employer" value={filters.employer} onChange={(v) => set('employer', v)} placeholder="e.g., Duke Energy, AT&T" />
                    <TextField label="Occupation" value={filters.occupation} onChange={(v) => set('occupation', v)} placeholder="e.g., Attorney, CEO" />
                  </Section>
                )}

                <Section title="Recipient/Filer" icon="🏛️" open={open.filer} onToggle={() => toggleSection('filer')}>
                  <TextField label="Filer Name" value={filters.filerName} onChange={(v) => set('filerName', v)} placeholder="Candidate or committee name" />
                  {showFilerSelects && (
                    <>
                      {hasChoices(options.filerTypes) && (
                        <SelectField label="Filer Type" value={filters.filerType} onChange={(v) => set('filerType', v)} allLabel="All Filer Types" options={options.filerTypes} />
                      )}
                      {hasChoices(options.offices) && (
                        <SelectField label="Office Type" value={filters.officeType} onChange={(v) => set('officeType', v)} allLabel="All Offices" options={options.offices} />
                      )}
                      {hasChoices(options.parties) && (
                        <SelectField label="Party" value={filters.party} onChange={(v) => set('party', v)} allLabel="All Parties" options={options.parties} />
                      )}
                    </>
                  )}
                </Section>

                {!isContribution && (
                  <Section title="Expenditure Details" icon="💸" open={open.expenditure} onToggle={() => toggleSection('expenditure')}>
                    <TextField
                      label="Spending Category"
                      value={filters.expenditureCategory}
                      onChange={(v) => set('expenditureCategory', v)}
                      placeholder="e.g., refund, advertising"
                      hint="Categories are free text in the source data, so this matches any part of the category."
                    />
                  </Section>
                )}

                {isContribution && (
                  <Section title="Group & Aggregate" icon="📈" open={open.aggregation} onToggle={() => toggleSection('aggregation')}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.groupByDonor}
                        onChange={(e) => set('groupByDonor', e.target.checked)}
                        className="w-4 h-4 text-nc-blue rounded"
                      />
                      <span className="text-sm font-medium text-slate-700">Group by Donor</span>
                    </label>
                    <p className="text-xs text-slate-500">
                      Aggregate contributions by donor name to see total amounts and contribution counts.
                    </p>

                    {filters.groupByDonor && (
                      <div className="space-y-3 pt-2 border-t border-slate-200">
                        <TextField
                          label="Min # of Contributions (more than)"
                          type="number"
                          value={filters.minContributions}
                          onChange={(v) => set('minContributions', v)}
                          placeholder="e.g., 5"
                        />
                        <TextField
                          label="Min Total Amount"
                          value={filters.minTotalAmount}
                          onChange={(v) => set('minTotalAmount', v)}
                          placeholder="e.g., 10000"
                          numeric
                        />
                        <QuickButtons presets={donorPresets} />
                      </div>
                    )}
                  </Section>
                )}
              </div>

              <div className="p-4 border-t border-slate-200 space-y-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-nc-blue text-white font-semibold rounded-lg hover:bg-blue-900 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Searching...' : 'Search'}
                </button>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="w-full py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Clear All Filters
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Results Panel */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {!hasSearched ? 'Configure your search filters' : loading ? 'Searching...' : `${totalCount.toLocaleString()} results found`}
            </h2>
            {hasSearched && totalCount > 0 && (
              <button
                onClick={exportCsv}
                className="px-4 py-2 text-sm font-medium text-nc-blue border border-nc-blue rounded-lg hover:bg-blue-50 transition-colors"
              >
                Export CSV
              </button>
            )}
          </div>

          {hasSearched && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {donorView ? (
                <DonorTable donors={outcome?.kind === 'donors' ? (outcome.data as AggregatedDonor[]) : []} loading={loading} />
              ) : (
                <ResultsTable
                  type={applied.transactionType}
                  data={(outcome?.kind === 'transactions' ? outcome.data : []) as (Contribution & Expenditure)[]}
                  loading={loading}
                />
              )}
            </div>
          )}

          {hasSearched && totalCount > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(totalCount / PAGE_SIZE)}
              totalResults={totalCount}
              pageSize={PAGE_SIZE}
              onPageChange={(page) => applied && search(applied, page, totalCount)}
            />
          )}

          {!hasSearched && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-nc-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Build Your Search</h3>
              <p className="text-slate-600 max-w-md mx-auto">
                Use the filters on the left to create complex queries. You can search by name, amount,
                date range, location, employer, and more. Combine multiple filters for precise results.
              </p>
            </div>
          )}
        </div>
      </div>
    </DatabaseLoader>
  );
}
