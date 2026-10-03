const wholeDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const withCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const compactDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const dateFormatOptions: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

/** DuckDB returns BIGINT columns as bigint; everything in this app fits in a double. */
type Numeric = number | bigint | null | undefined;

/** Rounded to whole dollars; for totals and averages. */
export function formatCurrency(amount: Numeric): string {
  return wholeDollars.format(Number(amount ?? 0));
}

/** A single transaction: shows cents only when there are any. */
export function formatAmount(amount: Numeric): string {
  const n = Number(amount ?? 0);
  return Number.isInteger(n) ? wholeDollars.format(n) : withCents.format(n);
}

/** "$1.2M", "$140K"; for chart axes. */
export function formatCompactCurrency(amount: Numeric): string {
  return compactDollars.format(Number(amount ?? 0));
}

export function formatCount(n: Numeric): string {
  return Number(n ?? 0).toLocaleString('en-US');
}

/** Format a YYYYMMDD integer as "Jan 5, 2020". */
export function formatDateInt(dateInt: Numeric): string {
  if (!dateInt) return '';
  const str = dateInt.toString();
  if (str.length !== 8) return str;
  const date = new Date(Number(str.slice(0, 4)), Number(str.slice(4, 6)) - 1, Number(str.slice(6, 8)));
  return date.toLocaleDateString('en-US', dateFormatOptions);
}

/** Format a YYYYMMDD integer or any Date-parsable string. */
export function formatDate(dateVal: string | Numeric): string {
  if (!dateVal) return '';
  if (typeof dateVal !== 'string' || /^\d{8}$/.test(dateVal)) {
    return formatDateInt(Number(dateVal));
  }
  return new Date(dateVal).toLocaleDateString('en-US', dateFormatOptions);
}

/** "CANDIDATE_COMMITTEE" or "INDIVIDUAL" -> "Candidate Committee" / "Individual"; mixed-case text passes through. */
export function humanize(value: string): string {
  if (value !== value.toUpperCase()) return value;
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
