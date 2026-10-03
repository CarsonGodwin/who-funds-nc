const currencyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const dateFormatOptions: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

export function formatCurrency(amount: number): string {
  return currencyFormat.format(amount);
}

/** Format a YYYYMMDD integer as "Jan 5, 2020". */
export function formatDateInt(dateInt: number): string {
  if (!dateInt) return '';
  const str = dateInt.toString();
  if (str.length !== 8) return str;
  const date = new Date(Number(str.slice(0, 4)), Number(str.slice(4, 6)) - 1, Number(str.slice(6, 8)));
  return date.toLocaleDateString('en-US', dateFormatOptions);
}

/** Format a YYYYMMDD integer or any Date-parsable string. */
export function formatDate(dateVal: string | number): string {
  if (!dateVal) return '';
  if (typeof dateVal === 'number' || /^\d{8}$/.test(dateVal)) {
    return formatDateInt(Number(dateVal));
  }
  return new Date(dateVal).toLocaleDateString('en-US', dateFormatOptions);
}
