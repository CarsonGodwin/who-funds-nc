import { useEffect, useState } from 'react';
import ResultsTable from './ResultsTable';
import Pagination from './Pagination';
import DatabaseLoader from './DatabaseLoader';
import SearchBox from './SearchBox';
import ErrorNotice from './ErrorNotice';
import { SelectField, type Option } from './advanced/FormFields';
import { getDistinctValues, searchFilers } from '../lib/queries';
import { getUrlParam, setUrlParam, usePagedSearch } from '../lib/hooks';
import { formatCount, humanize } from '../lib/format';

const PAGE_SIZE = 50;

interface FilerFilters {
  party: string;
  officeType: string;
  filerType: string;
}

const NO_FILTERS: FilerFilters = { party: '', officeType: '', filerType: '' };

interface FilterOptions {
  parties: Option[];
  offices: Option[];
  filerTypes: Option[];
}

const toOptions = (values: string[]): Option[] => values.map((value) => ({ value, label: humanize(value) }));

/**
 * Dropdown options come from the data. In the current NC export party, office and filer type are
 * blank or identical for every committee, so these filters stay hidden until the data has them.
 */
async function loadFilterOptions(): Promise<FilterOptions> {
  const [parties, held, sought, filerTypes] = await Promise.all([
    getDistinctValues('filers', 'party'),
    getDistinctValues('filers', 'office_held'),
    getDistinctValues('filers', 'office_sought'),
    getDistinctValues('filers', 'type'),
  ]);
  return {
    parties: toOptions(parties),
    offices: toOptions([...new Set([...held, ...sought])].sort()),
    filerTypes: toOptions(filerTypes),
  };
}

function CommitteeSearchResults() {
  const [input, setInput] = useState(() => getUrlParam('q'));
  const [submitted, setSubmitted] = useState(input);
  const [filters, setFilters] = useState<FilerFilters>(NO_FILTERS);
  const [options, setOptions] = useState<FilterOptions | null>(null);

  useEffect(() => {
    loadFilterOptions().then(setOptions).catch((err) => console.warn('Could not load filter options:', err));
  }, []);

  const search = usePagedSearch(
    (page, sort, knownCount) =>
      searchFilers(
        {
          query: submitted || undefined,
          party: filters.party || undefined,
          officeType: filters.officeType || undefined,
          filerType: filters.filerType || undefined,
        },
        { page, pageSize: PAGE_SIZE, sort, knownCount }
      ),
    JSON.stringify([submitted, filters])
  );

  const submit = (value: string) => {
    setSubmitted(value);
    setUrlParam('q', value);
  };

  const set = (key: keyof FilerFilters) => (value: string) => setFilters((prev) => ({ ...prev, [key]: value }));
  const visibleFilters = [
    { key: 'party' as const, label: 'Party', allLabel: 'All parties', options: options?.parties ?? [] },
    { key: 'officeType' as const, label: 'Office', allLabel: 'All offices', options: options?.offices ?? [] },
    { key: 'filerType' as const, label: 'Committee type', allLabel: 'All types', options: options?.filerTypes ?? [] },
  ].filter((f) => f.options.length > 1);
  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-5">
      <SearchBox
        value={input}
        onChange={setInput}
        onSubmit={submit}
        label="Committee or candidate name"
        placeholder="Search by committee or candidate name"
      />

      {visibleFilters.length > 0 && (
        <div className="card flex flex-wrap items-end gap-4 p-4">
          {visibleFilters.map((f) => (
            <div key={f.key} className="w-full sm:w-56">
              <SelectField label={f.label} value={filters[f.key]} onChange={set(f.key)} allLabel={f.allLabel} options={f.options} />
            </div>
          ))}
          {hasActiveFilters && (
            <button type="button" onClick={() => setFilters(NO_FILTERS)} className="btn-ghost">
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title" aria-live="polite">
            {search.loading && search.count === 0
              ? 'Searching…'
              : `${formatCount(search.count)} ${search.count === 1 ? 'committee' : 'committees'}`}
            {submitted && <span className="font-normal text-slate-500"> matching “{submitted}”</span>}
          </h2>
          <p className="text-sm text-slate-500">Totals are itemized contributions since 2020.</p>
        </div>
        {search.error ? (
          <ErrorNotice message={search.error} />
        ) : (
          <ResultsTable
            type="filers"
            data={search.data}
            loading={search.loading}
            sort={search.sort}
            onSortChange={search.setSort}
            emptyMessage="No committees match your search. Try a shorter or different name."
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

export default function CandidateSearch() {
  return (
    <DatabaseLoader>
      <CommitteeSearchResults />
    </DatabaseLoader>
  );
}
