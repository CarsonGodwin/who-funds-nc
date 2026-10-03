/**
 * Prefix an app path with the configured base (SITE_BASE in astro.config.mjs),
 * so links keep working when the site is served from a sub-path.
 */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}

export const committeeUrl = (filerId: string) => withBase(`candidate?id=${encodeURIComponent(filerId)}`);

export const donorSearchUrl = (name: string) => withBase(`search/contributors?q=${encodeURIComponent(name)}`);
