import { formatCount } from '../lib/format';

interface PaginationProps {
  currentPage: number;
  totalResults: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

type PageItem = number | 'gap';

/** First, last, and the pages around the current one, with gaps between runs. */
function pageItems(current: number, total: number): PageItem[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const start = current <= 4 ? 2 : current >= total - 3 ? total - 4 : current - 1;
  const end = current <= 4 ? 5 : current >= total - 3 ? total - 1 : current + 1;

  const items: PageItem[] = [1];
  if (start > 2) items.push('gap');
  for (let page = start; page <= end; page++) items.push(page);
  if (end < total - 1) items.push('gap');
  items.push(total);
  return items;
}

const navButton =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors';

export default function Pagination({ currentPage, totalResults, pageSize, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(totalResults / pageSize);
  if (totalPages <= 1) return null;

  const first = (currentPage - 1) * pageSize + 1;
  const last = Math.min(currentPage * pageSize, totalResults);

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-slate-600">
        <span className="font-medium text-slate-900">{formatCount(first)}</span>–
        <span className="font-medium text-slate-900">{formatCount(last)}</span> of{' '}
        <span className="font-medium text-slate-900">{formatCount(totalResults)}</span>
      </p>

      <nav aria-label="Pagination" className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
          className={`${navButton} text-slate-600 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40`}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {pageItems(currentPage, totalPages).map((item, i) =>
          item === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-slate-400" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-current={item === currentPage ? 'page' : undefined}
              aria-label={`Page ${item}`}
              className={`${navButton} ${
                item === currentPage ? 'bg-nc-blue text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {formatCount(item)}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next page"
          className={`${navButton} text-slate-600 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40`}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </nav>
    </div>
  );
}
