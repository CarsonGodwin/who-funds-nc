// Parquet files are served from the site itself (public/parquet) by default.
// Set PUBLIC_DATA_URL to load them from an external CDN/bucket instead.
const configuredDataUrl = (import.meta.env.PUBLIC_DATA_URL || '').trim();
const defaultBundledDataUrl = `${import.meta.env.BASE_URL}parquet`;

export const DATA_BASE_URL = (configuredDataUrl || defaultBundledDataUrl).replace(/\/$/, '');

export const dataUrl = (fileName: string) => `${DATA_BASE_URL}/${fileName}`;
