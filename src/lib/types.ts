// Row shapes for the four parquet-backed tables (see NC_SCHEMA_CONTRACT in duckdb.ts).
// Dates are YYYYMMDD integers.

export interface Filer {
  id: string;
  name: string;
  type: string;
  party?: string;
  office_held?: string;
  office_sought?: string;
  office_district?: string;
  city?: string;
  state?: string;
  status?: string;
}

export interface Contribution {
  contribution_id: string;
  id?: string;
  filer_id: string;
  filer_name?: string;
  contributor_name: string;
  contributor_type?: string;
  contributor_city?: string;
  contributor_state?: string;
  contributor_zip?: string;
  contributor_employer?: string;
  contributor_occupation?: string;
  amount: number;
  date: number;
  received_date: number;
  description?: string;
}

export interface Expenditure {
  expenditure_id: string;
  id?: string;
  filer_id: string;
  filer_name?: string;
  payee_name: string;
  payee_city?: string;
  payee_state?: string;
  payee_zip?: string;
  amount: number;
  date: number;
  received_date: number;
  category?: string;
  category_code?: string;
  description?: string;
}

export interface SortParams {
  column: string;
  direction: 'asc' | 'desc';
}
