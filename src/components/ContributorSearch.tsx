import { useEffect, useState } from 'react';
import ResultsTable from './ResultsTable';
import Pagination from './Pagination';
import DatabaseLoader from './DatabaseLoader';
import SearchBox from './SearchBox';
import ErrorNotice from './ErrorNotice';
import { SelectField, TextField, type Option } from './advanced/FormFields';
import { EXPORT_LIMIT, exportContributions, getDistinctValues, searchContributions, type SearchFilters } from '../lib/queries';
import { getUrlParam, setUrlParam, useDebounced, usePagedSearch } from '../lib/hooks';
import { formatCount, humanize } from '../lib/format';
import { parseNumber } from '../lib/sql';
import { downloadCsv } from '../lib/csv';

const PAGE_SIZE = 50;

interface ContributionFilters {
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  contributorType: string;
}

const NO_FILTERS: ContributionFilters = { dateFrom: '', dateTo: '', amountMin: '', amountMax: '', contributorType: '' };

function toSearchFilters(name: string, f: ContributionFilters): SearchFilters {
  return {
    query: name || undefined,
    dateFrom: f.dateFrom || undefined,
    dateTo: f.dateTo || undefined,
    amountMin: parseNumber(f.amountMin) ?? undefined,
    amountMax: parseNumber(f.amountMax) ?? undefined,
    contributorType: f.contributorType || undefined,
  };
}

function DonorSearchResults() {
  const [input, setInput] = useState(() => getUrlParam('q'));
  const [submitted, setSubmitted] = useState(input);
  const [filters, setFilters] = useState<ContributionFilters>(NO_FILTERS);
  const [typeOptions, setTypeOptions] = useState<Option[]>([]);
  const [exporting, setExporting] = useState(false);

  // Typing an amount shouldn't fire a query per keystroke.
  const appliedFilters = useDebounced(filters);
  const searchFilters = toSearchFilters(submitted, appliedFilters);

  useEffect(() => {
    getDistinctValues('contributions', 'contributor_type')
      .then((types) => setTypeOptions(types.map((value) => ({ value, label: humanize(value) }))))
      .catch((err) => console.warn('Could not load contributor types:', err));
  }, []);

  const search = usePagedSearch(
    (page, sort, knownCount) => searchContributions(searchFilters, { page, pageSize: PAGE_SIZE, sort, knownCount }),
    JSON.stringify(searchFilters)
  );

  const submit = (value: string) => {
    setSubmitted(value);
    setUrlParam('q', value);
  };

  const set = (key: keyof ContributionFilters) => (value: string) => setFilters((prev) => ({ ...prev, [key]: value }));
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await exportContributions(searchFilters, search.sort);
      downloadCsv(rows, submitted ? `nc-contributions-${submitted.replace(/\W+/g, '-').toLowerCase()}` : 'nc-contributions');
    } catch (err) {
      console.error('Export failed:', err);
      alert('Sorry, the export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <SearchBox
        value={input}
        onChange={setInput}
        onSubmit={submit}
        label="Contributor name"
        placeholder="Contributor name, e.g. “Smith”"
      />

      <div className="card grid grid-cols-2 gap-3 p-4 sm:gap-4 lg:grid-cols-5">
        <TextField label="From date" type="date" value={filters.dateFrom} onChange={set('dateFrom')} />
        <TextField label="To date" type="date" value={filters.dateTo} onChange={set('dateTo')} />
        <TextField label="Min amount" value={filters.amountMin} onChange={set('amountMin')} placeholder="$0" numeric />
        <TextField label="Max amount" value={filters.amountMax} onChange={set('amountMax')} placeholder="No limit" numeric />
        {typeOptions.length > 1 ? (
          <div className="col-span-2 lg:col-span-1">
            <SelectField
              label="Contributor type"
              value={filters.contributorType}
              onChange={set('contributorType')}
              allLabel="All types"
              options={typeOptions}
            />
          </div>
        ) : (
          <div className="hidden lg:block" />
        )}
        {hasActiveFilters && (
          <div className="col-span-2 lg:col-span-5">
            <button type="button" onClick={() => setFilters(NO_FILTERS)} className="btn-ghost btn-sm -ml-3">
              Clear filters
            </button>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title" aria-live="polite">
            {search.loading && search.count === 0
              ? 'Searching…'
              : `${formatCount(search.count)} ${search.count === 1 ? 'contribution' : 'contributions'}`}
            {submitted && <span className="font-normal text-slate-500"> from “{submitted}”</span>}
          </h2>
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting || search.count === 0}
            className="btn-secondary btn-sm"
            title={search.count > EXPORT_LIMIT ? `Exports the first ${formatCount(EXPORT_LIMIT)} rows` : undefined}
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
        {search.error ? (
          <ErrorNotice message={search.error} />
        ) : (
          <ResultsTable
            type="contributions"
            data={search.data}
            loading={search.loading}
            sort={search.sort}
            onSortChange={search.setSort}
            emptyMessage="No contributions match your search. Try a shorter name or fewer filters."
          />
        )}
      </div>

      <Pagination
        currentPage={search.page}
        totalResults={search.count}
        pageSize={PAGE_SIZE}
        onPageChange={(page) => {
          search.setPage(page);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
}

export default function ContributorSearch() {
  return (
    <DatabaseLoader>
      <DonorSearchResults />
    </DatabaseLoader>
  );
}
