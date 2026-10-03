import { useState, useEffect, useCallback, useMemo } from 'react';
import ResultsTable, { SortableHeader, sortData, type SortState } from './ResultsTable';
import Pagination from './Pagination';
import DatabaseLoader from './DatabaseLoader';
import { query as duckdbQuery, waitForInit, formatCurrency, formatDate, type Contribution, type Expenditure } from '../lib/duckdb';
import { loadNcGeo, getCitiesInCounty, type NcGeoData } from '../lib/nc-geo';

type TransactionType = 'contributions' | 'expenditures' | 'both';

interface AdvancedFilters {
  // Transaction type
  transactionType: TransactionType;

  // Name search
  name: string;
  nameSearchType: 'contains' | 'exact' | 'starts_with';
  searchRecipient: boolean;

  // Amount range
  amountMin: string;
  amountMax: string;

  // Date range
  dateFrom: string;
  dateTo: string;

  // Geographic filters
  city: string;
  state: string;
  zipCode: string;
  county: string;

  // Contributor details
  employer: string;
  occupation: string;
  contributorType: string;

  // Filer filters
  filerName: string;
  filerType: string;
  officeType: string;
  party: string;
  district: string;

  // Expenditure specific
  expenditureCategory: string;
  payeeName: string;

  // Aggregation
  groupByDonor: boolean;
  minContributions: string;
  minTotalAmount: string;
}

// Type for aggregated donor results
interface AggregatedDonor {
  contributor_name: string;
  num_contributions: number;
  total_amount: number;
  avg_amount: number;
  first_date: number;
  last_date: number;
}

const DEFAULT_FILTERS: AdvancedFilters = {
  transactionType: 'contributions',
  name: '',
  nameSearchType: 'contains',
  searchRecipient: false,
  amountMin: '',
  amountMax: '',
  dateFrom: '',
  dateTo: '',
  city: '',
  state: '',
  zipCode: '',
  county: '',
  employer: '',
  occupation: '',
  contributorType: '',
  filerName: '',
  filerType: '',
  officeType: '',
  party: '',
  district: '',
  expenditureCategory: '',
  payeeName: '',
  groupByDonor: false,
  minContributions: '',
  minTotalAmount: '',
};

const CONTRIBUTOR_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'ENTITY', label: 'Business/Corporation' },
  { value: 'LAW FIRM', label: 'Law Firm' },
];

const FILER_TYPES = [
  { value: '', label: 'All Filer Types' },
  { value: 'CANDIDATE_COMMITTEE', label: 'Candidate Committee' },
  { value: 'PAC', label: 'Political Action Committee (PAC)' },
  { value: 'PARTY_EXECUTIVE_COMMITTEE', label: 'Party Executive Committee' },
  { value: 'BALLOT_ISSUE_COMMITTEE', label: 'Ballot Issue Committee' },
  { value: 'INDEPENDENT_EXPENDITURE', label: 'Independent Expenditure Committee' },
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

const PARTIES = [
  { value: '', label: 'All Parties' },
  { value: 'REPUBLICAN', label: 'Republican' },
  { value: 'DEMOCRAT', label: 'Democrat' },
  { value: 'LIBERTARIAN', label: 'Libertarian' },
  { value: 'GREEN', label: 'Green' },
  { value: 'CONSTITUTION', label: 'Constitution' },
  { value: 'UNAFFILIATED', label: 'Unaffiliated' },
];

const STATES = [
  { value: '', label: 'All States' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'TX', label: 'Texas' },
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'DC', label: 'District of Columbia' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
];

const EXPENDITURE_CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'ADVERTISING', label: 'Advertising' },
  { value: 'CAMPAIGN_LITERATURE', label: 'Campaign Literature' },
  { value: 'CAMPAIGN_EVENT', label: 'Campaign Event' },
  { value: 'CONSULTING', label: 'Consulting' },
  { value: 'CONTRIBUTION', label: 'Contribution to Another Committee' },
  { value: 'FOOD_BEVERAGE', label: 'Food/Beverage' },
  { value: 'FUNDRAISING', label: 'Fundraising' },
  { value: 'LOAN_REPAYMENT', label: 'Loan Repayment' },
  { value: 'OFFICE', label: 'Office/Overhead' },
  { value: 'POLLING', label: 'Polling/Research' },
  { value: 'SALARIES', label: 'Salaries/Wages' },
  { value: 'TRAVEL', label: 'Travel/Lodging' },
  { value: 'UNKNOWN', label: 'Other/Unknown' },
];

export default function AdvancedSearch() {
  const [filters, setFilters] = useState<AdvancedFilters>(DEFAULT_FILTERS);
  const [results, setResults] = useState<(Contribution | Expenditure)[]>([]);
  const [aggregatedResults, setAggregatedResults] = useState<AggregatedDonor[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [autoSearch, setAutoSearch] = useState(false);
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });
  const [expandedSections, setExpandedSections] = useState({
    transaction: true,
    name: true,
    amount: true,
    date: true,
    location: false,
    contributor: false,
    filer: false,
    expenditure: false,
    aggregation: false,
  });
  const [ncGeo, setNcGeo] = useState<NcGeoData | null>(null);
  const pageSize = 50;

  // Load NC geographic data on mount
  useEffect(() => {
    loadNcGeo().then(setNcGeo).catch(() => setNcGeo(null));
  }, []);

  const getStateCondition = (column: string, state: string): string => {
    const escapedState = escapeSql(state);
    if (state === 'NC') {
      return `(${column} = 'NC' OR UPPER(${column}) = 'NORTH CAROLINA')`;
    }
    return `${column} = '${escapedState}'`;
  };

  const handleSort = (column: string) => {
    setSortState(prev => {
      if (prev.column !== column) {
        return { column, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { column, direction: 'desc' };
      }
      return { column: null, direction: null };
    });
  };

  // Memoize sorted aggregated results
  const sortedAggregatedResults = useMemo(() => sortData(aggregatedResults, sortState), [aggregatedResults, sortState]);

  // Parse URL parameters on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const newFilters = { ...DEFAULT_FILTERS };
    let hasParams = false;
    let needsAggregation = false;
    let needsFiler = false;

    // Map URL params to filters
    if (params.get('party')) {
      newFilters.party = params.get('party')!;
      hasParams = true;
      needsFiler = true;
    }
    if (params.get('contributorType')) {
      newFilters.contributorType = params.get('contributorType')!;
      hasParams = true;
    }
    if (params.get('amountMin')) {
      newFilters.amountMin = params.get('amountMin')!;
      hasParams = true;
    }
    if (params.get('amountMax')) {
      newFilters.amountMax = params.get('amountMax')!;
      hasParams = true;
    }
    if (params.get('groupByDonor') === 'true') {
      newFilters.groupByDonor = true;
      hasParams = true;
      needsAggregation = true;
    }
    if (params.get('minContributions')) {
      newFilters.minContributions = params.get('minContributions')!;
      hasParams = true;
      needsAggregation = true;
    }
    if (params.get('minTotalAmount')) {
      newFilters.minTotalAmount = params.get('minTotalAmount')!;
      hasParams = true;
      needsAggregation = true;
    }
    if (params.get('filerType')) {
      newFilters.filerType = params.get('filerType')!;
      hasParams = true;
      needsFiler = true;
    }
    if (params.get('name')) {
      newFilters.name = params.get('name')!;
      hasParams = true;
    }

    if (hasParams) {
      setFilters(newFilters);
      // Expand relevant sections
      if (needsAggregation) {
        setExpandedSections(prev => ({ ...prev, aggregation: true }));
      }
      if (needsFiler) {
        setExpandedSections(prev => ({ ...prev, filer: true }));
      }
      // Auto-run search with URL params
      setAutoSearch(true);
    }
  }, []);

  // Auto-search when URL params are present (runs after filters are set)
  useEffect(() => {
    if (autoSearch) {
      setAutoSearch(false);
      // Small delay to ensure filters state is set
      const timer = setTimeout(() => {
        setCurrentPage(1);
        // Trigger search - the performSearch will pick up the filters
        setHasSearched(true);
        setLoading(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoSearch]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const updateFilter = <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setResults([]);
    setAggregatedResults([]);
    setTotalCount(0);
    setHasSearched(false);
  };

  const escapeSql = (str: string): string => str.replace(/'/g, "''");

  const dateToInt = (dateStr: string): number => parseInt(dateStr.replace(/-/g, ''), 10);

  const performSearch = useCallback(async () => {
    setLoading(true);
    setHasSearched(true);

    try {
      await waitForInit();

      const { transactionType } = filters;
      const offset = (currentPage - 1) * pageSize;

      if (transactionType === 'contributions' || transactionType === 'both') {
        const conditions: string[] = [];

        // Determine if we need to join with filers table (for party, filerType, officeType filters)
        const needsJoin = filters.party || filters.filerType || filters.officeType;
        const colPrefix = needsJoin ? 'c.' : '';

        // Apply name filter
        if (filters.name) {
          const escapedName = escapeSql(filters.name);
          if (filters.nameSearchType === 'exact') {
            conditions.push(`${colPrefix}contributor_name ILIKE '${escapedName}'`);
          } else if (filters.nameSearchType === 'starts_with') {
            conditions.push(`${colPrefix}contributor_name ILIKE '${escapedName}%'`);
          } else {
            conditions.push(`${colPrefix}contributor_name ILIKE '%${escapedName}%'`);
          }
        }

        // Apply amount filters
        if (filters.amountMin) {
          conditions.push(`${colPrefix}amount >= ${parseFloat(filters.amountMin)}`);
        }
        if (filters.amountMax) {
          conditions.push(`${colPrefix}amount <= ${parseFloat(filters.amountMax)}`);
        }

        // Apply date filters (convert YYYY-MM-DD to YYYYMMDD integer)
        if (filters.dateFrom) {
          conditions.push(`${colPrefix}date >= ${dateToInt(filters.dateFrom)}`);
        }
        if (filters.dateTo) {
          conditions.push(`${colPrefix}date <= ${dateToInt(filters.dateTo)}`);
        }

        // Apply location filters
        if (filters.city) {
          conditions.push(`${colPrefix}contributor_city ILIKE '%${escapeSql(filters.city)}%'`);
        }
        if (filters.state) {
          conditions.push(getStateCondition(`${colPrefix}contributor_state`, filters.state));
        }

        // Apply ZIP code filter (supports partial match)
        if (filters.zipCode) {
          conditions.push(`${colPrefix}contributor_zip LIKE '${escapeSql(filters.zipCode)}%'`);
        }

        // Apply county filter (match cities in that county)
        if (filters.county) {
          const citiesInCounty = getCitiesInCounty(filters.county);
          if (citiesInCounty.length > 0) {
            const cityList = citiesInCounty.map(c => `'${escapeSql(c)}'`).join(', ');
            conditions.push(`UPPER(${colPrefix}contributor_city) IN (${cityList})`);
          }
        }

        // Apply contributor filters
        if (filters.employer) {
          conditions.push(`${colPrefix}contributor_employer ILIKE '%${escapeSql(filters.employer)}%'`);
        }
        if (filters.occupation) {
          conditions.push(`${colPrefix}contributor_occupation ILIKE '%${escapeSql(filters.occupation)}%'`);
        }
        if (filters.contributorType) {
          conditions.push(`${colPrefix}contributor_type = '${escapeSql(filters.contributorType)}'`);
        }

        // Apply filer name filter
        if (filters.filerName) {
          conditions.push(`${colPrefix}filer_name ILIKE '%${escapeSql(filters.filerName)}%'`);
        }

        // Apply filer-level filters (require join)
        if (filters.party) {
          conditions.push(`f.party = '${escapeSql(filters.party)}'`);
        }
        if (filters.filerType) {
          conditions.push(`f.type = '${escapeSql(filters.filerType)}'`);
        }
        if (filters.officeType) {
          conditions.push(`(f.office_sought = '${escapeSql(filters.officeType)}' OR f.office_held = '${escapeSql(filters.officeType)}')`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Build the FROM clause
        const fromClause = needsJoin
          ? `contributions c JOIN filers f ON c.filer_id = f.id`
          : `contributions`;

        // Handle aggregated vs non-aggregated results
        if (filters.groupByDonor) {
          // Build HAVING clause for aggregate filters
          const havingConditions: string[] = [];
          if (filters.minContributions) {
            havingConditions.push(`COUNT(*) > ${parseInt(filters.minContributions, 10)}`);
          }
          if (filters.minTotalAmount) {
            havingConditions.push(`SUM(${colPrefix}amount) >= ${parseFloat(filters.minTotalAmount)}`);
          }
          const havingClause = havingConditions.length > 0 ? `HAVING ${havingConditions.join(' AND ')}` : '';

          // Get count of unique donors matching criteria
          const countResult = await duckdbQuery<{ count: number }>(`
            SELECT COUNT(*) as count FROM (
              SELECT ${colPrefix}contributor_name
              FROM ${fromClause}
              ${whereClause}
              GROUP BY ${colPrefix}contributor_name
              ${havingClause}
            ) subquery
          `);
          const count = Number(countResult[0]?.count || 0);

          // Get aggregated donor data
          const data = await duckdbQuery<AggregatedDonor>(`
            SELECT
              ${colPrefix}contributor_name,
              COUNT(*) as num_contributions,
              SUM(${colPrefix}amount) as total_amount,
              AVG(${colPrefix}amount) as avg_amount,
              MIN(${colPrefix}date) as first_date,
              MAX(${colPrefix}date) as last_date
            FROM ${fromClause}
            ${whereClause}
            GROUP BY ${colPrefix}contributor_name
            ${havingClause}
            ORDER BY num_contributions DESC, total_amount DESC
            LIMIT ${pageSize} OFFSET ${offset}
          `);

          setAggregatedResults(data || []);
          setResults([]);
          setTotalCount(count);
        } else {
          // Non-aggregated: get individual contributions
          setAggregatedResults([]);

          // Get count
          const countResult = await duckdbQuery<{ count: number }>(`
            SELECT COUNT(*) as count FROM ${fromClause} ${whereClause}
          `);
          const count = Number(countResult[0]?.count || 0);

          // Get data - need to select from contributions with proper column names
          const selectCols = needsJoin ? 'c.*' : '*';
          const data = await duckdbQuery<Contribution>(`
            SELECT ${selectCols} FROM ${fromClause}
            ${whereClause}
            ORDER BY ${colPrefix}date DESC
            LIMIT ${pageSize} OFFSET ${offset}
          `);

          setResults(data || []);
          setTotalCount(count);
        }
      }

      if (transactionType === 'expenditures') {
        const conditions: string[] = [];

        // Determine if we need to join with filers table (for party, filerType, officeType filters)
        const needsJoin = filters.party || filters.filerType || filters.officeType;
        const colPrefix = needsJoin ? 'e.' : '';

        // Apply payee name filter
        if (filters.payeeName || filters.name) {
          const searchName = escapeSql(filters.payeeName || filters.name);
          if (filters.nameSearchType === 'exact') {
            conditions.push(`${colPrefix}payee_name ILIKE '${searchName}'`);
          } else if (filters.nameSearchType === 'starts_with') {
            conditions.push(`${colPrefix}payee_name ILIKE '${searchName}%'`);
          } else {
            conditions.push(`${colPrefix}payee_name ILIKE '%${searchName}%'`);
          }
        }

        // Apply amount filters
        if (filters.amountMin) {
          conditions.push(`${colPrefix}amount >= ${parseFloat(filters.amountMin)}`);
        }
        if (filters.amountMax) {
          conditions.push(`${colPrefix}amount <= ${parseFloat(filters.amountMax)}`);
        }

        // Apply date filters
        if (filters.dateFrom) {
          conditions.push(`${colPrefix}date >= ${dateToInt(filters.dateFrom)}`);
        }
        if (filters.dateTo) {
          conditions.push(`${colPrefix}date <= ${dateToInt(filters.dateTo)}`);
        }

        // Apply location filters
        if (filters.city) {
          conditions.push(`${colPrefix}payee_city ILIKE '%${escapeSql(filters.city)}%'`);
        }
        if (filters.state) {
          conditions.push(getStateCondition(`${colPrefix}payee_state`, filters.state));
        }

        // Apply ZIP code filter (supports partial match)
        if (filters.zipCode) {
          conditions.push(`${colPrefix}payee_zip LIKE '${escapeSql(filters.zipCode)}%'`);
        }

        // Apply county filter (match cities in that county)
        if (filters.county) {
          const citiesInCounty = getCitiesInCounty(filters.county);
          if (citiesInCounty.length > 0) {
            const cityList = citiesInCounty.map(c => `'${escapeSql(c)}'`).join(', ');
            conditions.push(`UPPER(${colPrefix}payee_city) IN (${cityList})`);
          }
        }

        // Apply category filter
        if (filters.expenditureCategory) {
          conditions.push(`${colPrefix}category = '${escapeSql(filters.expenditureCategory)}'`);
        }

        // Apply filer name filter
        if (filters.filerName) {
          conditions.push(`${colPrefix}filer_name ILIKE '%${escapeSql(filters.filerName)}%'`);
        }

        // Apply filer-level filters (require join)
        if (filters.party) {
          conditions.push(`f.party = '${escapeSql(filters.party)}'`);
        }
        if (filters.filerType) {
          conditions.push(`f.type = '${escapeSql(filters.filerType)}'`);
        }
        if (filters.officeType) {
          conditions.push(`(f.office_sought = '${escapeSql(filters.officeType)}' OR f.office_held = '${escapeSql(filters.officeType)}')`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Build the FROM clause
        const fromClause = needsJoin
          ? `expenditures e JOIN filers f ON e.filer_id = f.id`
          : `expenditures`;

        // Get count
        const countResult = await duckdbQuery<{ count: number }>(`
          SELECT COUNT(*) as count FROM ${fromClause} ${whereClause}
        `);
        const count = Number(countResult[0]?.count || 0);

        // Get data - need to select from expenditures with proper column names
        const selectCols = needsJoin ? 'e.*' : '*';
        const data = await duckdbQuery<Expenditure>(`
          SELECT ${selectCols} FROM ${fromClause}
          ${whereClause}
          ORDER BY ${colPrefix}date DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `);

        setResults(data || []);
        setTotalCount(count);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, currentPage]);

  const handleSearch = () => {
    setCurrentPage(1);
    performSearch();
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  useEffect(() => {
    if (hasSearched && currentPage > 1) {
      performSearch();
    }
  }, [currentPage, hasSearched, performSearch]);

  // Auto-search from URL params (page 1)
  useEffect(() => {
    if (autoSearch && hasSearched) {
      performSearch();
    }
  }, [autoSearch, hasSearched, performSearch]);

  const handleExportCSV = () => {
    const dataToExport = filters.groupByDonor && filters.transactionType === 'contributions'
      ? aggregatedResults
      : results;
    if (dataToExport.length === 0) return;

    const headers = Object.keys(dataToExport[0]);
    const csvContent = [
      headers.join(','),
      ...dataToExport.map(row =>
        headers.map(h => {
          const val = (row as unknown as Record<string, unknown>)[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nc-campaign-finance-${filters.transactionType}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SectionHeader = ({
    title,
    section,
    icon,
  }: {
    title: string;
    section: keyof typeof expandedSections;
    icon: string;
  }) => (
    <button
      type="button"
      onClick={() => toggleSection(section)}
      className="flex items-center justify-between w-full px-4 py-3 text-left font-semibold text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
    >
      <span className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        {title}
      </span>
      <svg
        className={`w-5 h-5 transition-transform ${expandedSections[section] ? 'rotate-180' : ''}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

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

          <div className="p-4 space-y-4">
            {/* Transaction Type */}
            <div>
              <SectionHeader title="Transaction Type" section="transaction" icon="📊" />
              {expandedSections.transaction && (
                <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={filters.transactionType === 'contributions'}
                        onChange={() => updateFilter('transactionType', 'contributions')}
                        className="w-4 h-4 text-nc-blue"
                      />
                      <span className="text-sm">Contributions</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={filters.transactionType === 'expenditures'}
                        onChange={() => updateFilter('transactionType', 'expenditures')}
                        className="w-4 h-4 text-nc-blue"
                      />
                      <span className="text-sm">Expenditures</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Name Search */}
            <div>
              <SectionHeader title="Name Search" section="name" icon="👤" />
              {expandedSections.name && (
                <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      {filters.transactionType === 'expenditures' ? 'Payee Name' : 'Contributor Name'}
                    </label>
                    <input
                      type="text"
                      value={filters.name}
                      onChange={(e) => updateFilter('name', e.target.value)}
                      placeholder="Enter name..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Search Mode</label>
                    <select
                      value={filters.nameSearchType}
                      onChange={(e) => updateFilter('nameSearchType', e.target.value as 'contains' | 'exact' | 'starts_with')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue bg-white"
                    >
                      <option value="contains">Contains</option>
                      <option value="exact">Exact Match</option>
                      <option value="starts_with">Starts With</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Amount Range */}
            <div>
              <SectionHeader title="Amount Range" section="amount" icon="💰" />
              {expandedSections.amount && (
                <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Min Amount</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*\.?[0-9]*"
                        value={filters.amountMin}
                        onChange={(e) => updateFilter('amountMin', e.target.value)}
                        placeholder="$0"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Max Amount</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*\.?[0-9]*"
                        value={filters.amountMax}
                        onChange={(e) => updateFilter('amountMax', e.target.value)}
                        placeholder="No limit"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => { updateFilter('amountMin', '1000'); updateFilter('amountMax', ''); }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      $1,000+
                    </button>
                    <button
                      type="button"
                      onClick={() => { updateFilter('amountMin', '5000'); updateFilter('amountMax', ''); }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      $5,000+
                    </button>
                    <button
                      type="button"
                      onClick={() => { updateFilter('amountMin', '10000'); updateFilter('amountMax', ''); }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      $10,000+
                    </button>
                    <button
                      type="button"
                      onClick={() => { updateFilter('amountMin', '100000'); updateFilter('amountMax', ''); }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      $100,000+
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Date Range */}
            <div>
              <SectionHeader title="Date Range" section="date" icon="📅" />
              {expandedSections.date && (
                <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">From Date</label>
                      <input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => updateFilter('dateFrom', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">To Date</label>
                      <input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => updateFilter('dateTo', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const lastYear = new Date(now.setFullYear(now.getFullYear() - 1));
                        updateFilter('dateFrom', lastYear.toISOString().split('T')[0]);
                        updateFilter('dateTo', new Date().toISOString().split('T')[0]);
                      }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      Last Year
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateFilter('dateFrom', '2025-01-01');
                        updateFilter('dateTo', '2025-12-31');
                      }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      2025
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateFilter('dateFrom', '2024-01-01');
                        updateFilter('dateTo', '2024-12-31');
                      }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      2024
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateFilter('dateFrom', '2022-01-01');
                        updateFilter('dateTo', '2022-12-31');
                      }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      2022
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateFilter('dateFrom', '2020-01-01');
                        updateFilter('dateTo', '2020-12-31');
                      }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      2020
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Location Filters */}
            <div>
              <SectionHeader title="Location" section="location" icon="📍" />
              {expandedSections.location && (
                <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                  {/* NC County Dropdown */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">County</label>
                    <select
                      value={filters.county}
                      onChange={(e) => updateFilter('county', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue bg-white"
                    >
                      <option value="">All Counties</option>
                      {ncGeo?.counties.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* City Input */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                    <input
                      type="text"
                      value={filters.city}
                      onChange={(e) => updateFilter('city', e.target.value)}
                      placeholder="e.g., Raleigh, Charlotte"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue"
                    />
                  </div>

                  {/* ZIP Code Input */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ZIP Code</label>
                    <input
                      type="text"
                      value={filters.zipCode}
                      onChange={(e) => updateFilter('zipCode', e.target.value)}
                      placeholder="e.g., 27601, 28202"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue"
                    />
                    <p className="text-xs text-slate-400 mt-1">Partial match supported (e.g., "276" for Raleigh area)</p>
                  </div>

                  {/* State Dropdown */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                    <select
                      value={filters.state}
                      onChange={(e) => updateFilter('state', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue bg-white"
                    >
                      {STATES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>

                  <p className="text-xs text-slate-400">City/county data from public geographic lookup sources</p>
                </div>
              )}
            </div>

            {/* Contributor Details (for contributions) */}
            {filters.transactionType !== 'expenditures' && (
              <div>
                <SectionHeader title="Contributor Details" section="contributor" icon="🏢" />
                {expandedSections.contributor && (
                  <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Contributor Type</label>
                      <select
                        value={filters.contributorType}
                        onChange={(e) => updateFilter('contributorType', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue bg-white"
                      >
                        {CONTRIBUTOR_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Employer</label>
                      <input
                        type="text"
                        value={filters.employer}
                        onChange={(e) => updateFilter('employer', e.target.value)}
                        placeholder="e.g., ExxonMobil, AT&T"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Occupation</label>
                      <input
                        type="text"
                        value={filters.occupation}
                        onChange={(e) => updateFilter('occupation', e.target.value)}
                        placeholder="e.g., Attorney, CEO"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filer (Recipient) Filters */}
            <div>
              <SectionHeader title="Recipient/Filer" section="filer" icon="🏛️" />
              {expandedSections.filer && (
                <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Filer Name</label>
                    <input
                      type="text"
                      value={filters.filerName}
                      onChange={(e) => updateFilter('filerName', e.target.value)}
                      placeholder="Candidate or committee name"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Filer Type</label>
                    <select
                      value={filters.filerType}
                      onChange={(e) => updateFilter('filerType', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue bg-white"
                    >
                      {FILER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Office Type</label>
                    <select
                      value={filters.officeType}
                      onChange={(e) => updateFilter('officeType', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue bg-white"
                    >
                      {OFFICE_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Party</label>
                    <select
                      value={filters.party}
                      onChange={(e) => updateFilter('party', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue bg-white"
                    >
                      {PARTIES.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Expenditure-specific filters */}
            {filters.transactionType === 'expenditures' && (
              <div>
                <SectionHeader title="Expenditure Details" section="expenditure" icon="💸" />
                {expandedSections.expenditure && (
                  <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Spending Category</label>
                      <select
                        value={filters.expenditureCategory}
                        onChange={(e) => updateFilter('expenditureCategory', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue bg-white"
                      >
                        {EXPENDITURE_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Aggregation / Group by Donor (only for contributions) */}
            {filters.transactionType === 'contributions' && (
              <div>
                <SectionHeader title="Group & Aggregate" section="aggregation" icon="📈" />
                {expandedSections.aggregation && (
                  <div className="p-4 space-y-3 border border-slate-200 rounded-lg mt-2">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.groupByDonor}
                          onChange={(e) => updateFilter('groupByDonor', e.target.checked)}
                          className="w-4 h-4 text-nc-blue rounded"
                        />
                        <span className="text-sm font-medium text-slate-700">Group by Donor</span>
                      </label>
                    </div>
                    <p className="text-xs text-slate-500">
                      Aggregate contributions by donor name to see total amounts and contribution counts.
                    </p>

                    {filters.groupByDonor && (
                      <div className="space-y-3 pt-2 border-t border-slate-200">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Min # of Contributions (more than)
                          </label>
                          <input
                            type="number"
                            value={filters.minContributions}
                            onChange={(e) => updateFilter('minContributions', e.target.value)}
                            placeholder="e.g., 5"
                            min="0"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Min Total Amount
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={filters.minTotalAmount}
                            onChange={(e) => updateFilter('minTotalAmount', e.target.value)}
                            placeholder="e.g., 10000"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nc-blue"
                          />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => { updateFilter('minContributions', '5'); updateFilter('minTotalAmount', ''); }}
                            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                          >
                            5+ donations
                          </button>
                          <button
                            type="button"
                            onClick={() => { updateFilter('minContributions', ''); updateFilter('minTotalAmount', '10000'); }}
                            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                          >
                            $10K+ total
                          </button>
                          <button
                            type="button"
                            onClick={() => { updateFilter('minContributions', ''); updateFilter('minTotalAmount', '100000'); }}
                            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                          >
                            $100K+ total
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="p-4 border-t border-slate-200 space-y-2">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="w-full py-3 bg-nc-blue text-white font-semibold rounded-lg hover:bg-blue-900 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            <button
              onClick={clearFilters}
              className="w-full py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        </div>
      </div>

      {/* Results Panel */}
      <div className="space-y-4">
        {/* Results Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {!hasSearched
              ? 'Configure your search filters'
              : loading
              ? 'Searching...'
              : `${totalCount.toLocaleString()} results found`}
          </h2>
          {hasSearched && totalCount > 0 && (
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 text-sm font-medium text-nc-blue border border-nc-blue rounded-lg hover:bg-blue-50 transition-colors"
            >
              Export CSV
            </button>
          )}
        </div>

        {/* Results Table */}
        {hasSearched && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {filters.groupByDonor && filters.transactionType === 'contributions' ? (
              /* Aggregated Donors Table */
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <SortableHeader label="Donor Name" column="contributor_name" sortState={sortState} onSort={handleSort} />
                      <SortableHeader label="# Contributions" column="num_contributions" sortState={sortState} onSort={handleSort} className="text-right" />
                      <SortableHeader label="Total Amount" column="total_amount" sortState={sortState} onSort={handleSort} className="text-right" />
                      <SortableHeader label="Avg Amount" column="avg_amount" sortState={sortState} onSort={handleSort} className="text-right" />
                      <SortableHeader label="Date Range" column="first_date" sortState={sortState} onSort={handleSort} className="hidden md:table-cell" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <>
                        {[1, 2, 3].map((i) => (
                          <tr key={i} className="animate-pulse">
                            {[1, 2, 3, 4, 5].map((j) => (
                              <td key={j} className="px-4 py-3">
                                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </>
                    ) : sortedAggregatedResults.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                          No donors found matching your criteria. Try adjusting your filters.
                        </td>
                      </tr>
                    ) : (
                      sortedAggregatedResults.map((donor, idx) => (
                        <tr key={`${donor.contributor_name}-${idx}`} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <a
                              href={`/search/contributors?q=${encodeURIComponent(donor.contributor_name || '')}`}
                              className="font-medium text-nc-blue hover:text-blue-700 text-sm block"
                            >
                              {donor.contributor_name || 'Unknown'}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-medium text-nc-blue text-sm">
                              {donor.num_contributions.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-medium text-green-700 text-sm">
                              {formatCurrency(donor.total_amount)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-600">
                            {formatCurrency(donor.avg_amount)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">
                            {formatDate(donor.first_date)} - {formatDate(donor.last_date)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <ResultsTable
                type={filters.transactionType === 'expenditures' ? 'expenditures' : 'contributions'}
                data={results as any}
                loading={loading}
              />
            )}
          </div>
        )}

        {/* Pagination */}
        {hasSearched && totalCount > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(totalCount / pageSize)}
            totalResults={totalCount}
            pageSize={pageSize}
            onPageChange={handlePageChange}
          />
        )}

        {/* Empty State */}
        {!hasSearched && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-nc-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
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
