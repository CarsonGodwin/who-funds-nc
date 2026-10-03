import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatCurrency } from '../lib/duckdb';

interface TopDonor {
  name: string;
  total: number;
  count: number;
}

interface TopDonorsChartProps {
  donors: TopDonor[];
  title?: string;
}

const COLORS = ['#002868', '#1a3a7a', '#344d8c', '#4e609e', '#6873b0', '#8286c2'];

export default function TopDonorsChart({ donors, title = 'Top Donors' }: TopDonorsChartProps) {
  if (donors.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
        <p className="text-slate-500 text-center py-8">No donation data available</p>
      </div>
    );
  }

  // Truncate long names
  const chartData = donors.map((donor) => ({
    ...donor,
    displayName: donor.name.length > 25 ? donor.name.slice(0, 22) + '...' : donor.name,
  }));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <XAxis
              type="number"
              tickFormatter={(value) => formatCurrency(value)}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="displayName"
              width={150}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(value) => formatCurrency(Number(value) || 0)}
              labelFormatter={(label, payload) => {
                const first = payload?.[0] as { payload?: { name?: string } } | undefined;
                return first?.payload?.name ?? String(label ?? '');
              }}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 12px',
              }}
            />
            <Bar dataKey="total" radius={[0, 4, 4, 0]}>
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
