function csvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const text = String(val);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Download an array of flat objects as a CSV file (columns taken from the first row). */
export function downloadCsv(rows: object[], filenamePrefix: string): void {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => csvCell((row as Record<string, unknown>)[h])).join(',')),
  ];

  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
