import { useState } from 'react';

export interface FilterValues {
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  contributorType: string;
  party: string;
  officeType: string;
  filerType: string;
}

interface FacetedFiltersProps {
  filters: FilterValues;
  onChange: (filters: FilterValues) => void;
  showContributorFilters?: boolean;
  showCandidateFilters?: boolean;
}

const CONTRIBUTOR_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'ENTITY', label: 'Business/Organization' },
  { value: 'LAW FIRM', label: 'Law Firm' },
];

const PARTIES = [
  { value: '', label: 'All Parties' },
  { value: 'REPUBLICAN', label: 'Republican' },
  { value: 'DEMOCRAT', label: 'Democrat' },
  { value: 'LIBERTARIAN', label: 'Libertarian' },
  { value: 'GREEN', label: 'Green' },
  { value: 'CONSTITUTION', label: 'Constitution' },
  { value: 'UNAFFILIATED', label: 'Unaffiliated' },
];

const OFFICE_TYPES = [
  { value: '', label: 'All Offices' },
  { value: 'US_SENATE', label: 'U.S. Senate' },
  { value: 'US_HOUSE', label: 'U.S. House' },
  { value: 'GOVERNOR', label: 'Governor' },
  { value: 'LIEUTENANT_GOVERNOR', label: 'Lieutenant Governor' },
  { value: 'ATTORNEY_GENERAL', label: 'Attorney General' },
  { value: 'AUDITOR', label: 'State Auditor' },
  { value: 'COMMISSIONER_OF_AGRICULTURE', label: 'Commissioner of Agriculture' },
  { value: 'COMMISSIONER_OF_INSURANCE', label: 'Commissioner of Insurance' },
  { value: 'COMMISSIONER_OF_LABOR', label: 'Commissioner of Labor' },
  { value: 'SECRETARY_OF_STATE', label: 'Secretary of State' },
  { value: 'STATE_TREASURER', label: 'State Treasurer' },
  { value: 'SUPERINTENDENT_PUBLIC_INSTRUCTION', label: 'Superintendent of Public Instruction' },
  { value: 'NC_SENATE', label: 'NC Senate' },
  { value: 'NC_HOUSE', label: 'NC House' },
  { value: 'SUPREME_COURT', label: 'NC Supreme Court' },
  { value: 'COURT_OF_APPEALS', label: 'NC Court of Appeals' },
  { value: 'SUPERIOR_COURT', label: 'Superior Court Judge' },
  { value: 'DISTRICT_COURT', label: 'District Court Judge' },
  { value: 'DISTRICT_ATTORNEY', label: 'District Attorney' },
  { value: 'SHERIFF', label: 'Sheriff' },
  { value: 'COUNTY_COMMISSIONER', label: 'County Commissioner' },
  { value: 'SCHOOL_BOARD', label: 'School Board' },
  { value: 'MAYOR', label: 'Mayor' },
  { value: 'CITY_COUNCIL', label: 'City Council' },
];

const FILER_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'CANDIDATE_COMMITTEE', label: 'Candidate Committee' },
  { value: 'PAC', label: 'Political Action Committee (PAC)' },
  { value: 'PARTY_EXECUTIVE_COMMITTEE', label: 'Party Executive Committee' },
  { value: 'BALLOT_ISSUE_COMMITTEE', label: 'Ballot Issue Committee' },
  { value: 'INDEPENDENT_EXPENDITURE', label: 'Independent Expenditure Committee' },
];

export default function FacetedFilters({
  filters,
  onChange,
  showContributorFilters = true,
  showCandidateFilters = false,
}: FacetedFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleChange = (key: keyof FilterValues, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onChange({
      dateFrom: '',
      dateTo: '',
      amountMin: '',
      amountMax: '',
      contributorType: '',
      party: '',
      officeType: '',
      filerType: '',
    });
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Filters</h3>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-nc-red hover:text-red-700"
            >
              Clear all
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-nc-blue hover:text-blue-700 md:hidden"
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        </div>
      </div>

      <div className={`grid gap-4 ${isExpanded || 'md:grid'} md:grid-cols-2 lg:grid-cols-4`}>
        {/* Date Range */}
        <div className={!isExpanded ? 'hidden md:block' : ''}>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Date From
          </label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleChange('dateFrom', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue focus:border-transparent"
          />
        </div>

        <div className={!isExpanded ? 'hidden md:block' : ''}>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Date To
          </label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleChange('dateTo', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue focus:border-transparent"
          />
        </div>

        {/* Amount Range */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Min Amount
          </label>
          <input
            type="number"
            value={filters.amountMin}
            onChange={(e) => handleChange('amountMin', e.target.value)}
            placeholder="$0"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Max Amount
          </label>
          <input
            type="number"
            value={filters.amountMax}
            onChange={(e) => handleChange('amountMax', e.target.value)}
            placeholder="No limit"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue focus:border-transparent"
          />
        </div>

        {/* Contributor Type */}
        {showContributorFilters && (
          <div className={!isExpanded ? 'hidden md:block' : ''}>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Contributor Type
            </label>
            <select
              value={filters.contributorType}
              onChange={(e) => handleChange('contributorType', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue focus:border-transparent bg-white"
            >
              {CONTRIBUTOR_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Party Filter (for candidates) */}
        {showCandidateFilters && (
          <>
            <div className={!isExpanded ? 'hidden md:block' : ''}>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Party
              </label>
              <select
                value={filters.party}
                onChange={(e) => handleChange('party', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue focus:border-transparent bg-white"
              >
                {PARTIES.map((party) => (
                  <option key={party.value} value={party.value}>
                    {party.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={!isExpanded ? 'hidden md:block' : ''}>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Office
              </label>
              <select
                value={filters.officeType}
                onChange={(e) => handleChange('officeType', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue focus:border-transparent bg-white"
              >
                {OFFICE_TYPES.map((office) => (
                  <option key={office.value} value={office.value}>
                    {office.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={!isExpanded ? 'hidden md:block' : ''}>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Filer Type
              </label>
              <select
                value={filters.filerType}
                onChange={(e) => handleChange('filerType', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue focus:border-transparent bg-white"
              >
                {FILER_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
