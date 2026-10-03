import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompactCurrency, formatCount, formatCurrency } from '../lib/format';
import type { MonthlyTotal } from '../lib/queries';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthLabel = (yyyymm: number, long = false) =>
  `${MONTHS[(yyyymm % 100) - 1]} ${long ? Math.floor(yyyymm / 100) : `'${String(Math.floor(yyyymm / 100)).slice(2)}`}`;

function ChartTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
  const point = payload?.[0]?.payload as MonthlyTotal | undefined;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-slate-900">{monthLabel(point.month, true)}</p>
      <p className="text-slate-700 tabular-nums">{formatCurrency(point.total)}</p>
      <p className="text-xs text-slate-500 tabular-nums">
        {formatCount(point.count)} {point.count === 1 ? 'contribution' : 'contributions'}
      </p>
    </div>
  );
}

/** Contributions received per month; a single series, so the card title names it and there's no legend. */
export default function MonthlyChart({ data, loading }: { data: MonthlyTotal[]; loading?: boolean }) {
  return (
    <div className="card flex h-full flex-col">
      <div className="card-header">
        <h2 className="card-title">Raised by month</h2>
        <span className="text-xs text-slate-500">Itemized contributions</span>
      </div>
      {data.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-slate-500">{loading ? 'Loading…' : 'No contributions in this period.'}</p>
      ) : (
        <div className={`min-h-72 flex-1 p-4 pl-0 ${loading ? 'opacity-50' : ''}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="month"
                tickFormatter={(m: number) => monthLabel(m)}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={formatCompactCurrency}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip content={(props) => <ChartTooltip active={props.active} payload={props.payload} />} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="total" fill="#002868" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
