import { formatCount, formatCurrency } from '../lib/format';
import { donorSearchUrl } from '../lib/url';
import type { TopDonor } from '../lib/queries';

/** Ranked list with inline bars; easier to read on small screens than a bar chart with long names. */
export default function TopDonorsChart({ donors, loading }: { donors: TopDonor[]; loading?: boolean }) {
  const max = donors[0]?.total || 1;

  return (
    <div className="card h-full">
      <div className="card-header">
        <h2 className="card-title">Top donors</h2>
        <span className="text-xs text-slate-500">By total given</span>
      </div>
      {donors.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-slate-500">{loading ? 'Loading…' : 'No contributions in this period.'}</p>
      ) : (
        <ol className={`space-y-3 p-5 ${loading ? 'opacity-50' : ''}`}>
          {donors.map((donor, i) => (
            <li key={donor.name} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <a href={donorSearchUrl(donor.name)} className="min-w-0 truncate text-slate-800 hover:text-nc-blue hover:underline">
                  <span className="mr-2 text-xs text-slate-400 tabular-nums">{i + 1}.</span>
                  {donor.name}
                </a>
                <span className="shrink-0 font-semibold text-slate-900 tabular-nums">{formatCurrency(donor.total)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-nc-blue" style={{ width: `${(donor.total / max) * 100}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right text-xs text-slate-500 tabular-nums">
                  {formatCount(donor.count)} {donor.count === 1 ? 'gift' : 'gifts'}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
