import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { formatCurrency } from '../lib/duckdb';
import type { ReportTimelinePoint } from '../lib/duckdb';

interface ReportTimelineProps {
  data: ReportTimelinePoint[];
  title?: string;
}

// Format YYYYMMDD date string for display
function formatPeriodDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function ReportTimeline({ data, title = 'Financial History' }: ReportTimelineProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
        <p className="text-slate-500 text-center py-8">No report data available</p>
      </div>
    );
  }

  // Transform data for chart - use period end date as label
  const chartData = data.map(d => ({
    ...d,
    label: formatPeriodDate(d.periodEnd),
  }));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickFormatter={(value) => {
                if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
                return `$${value}`;
              }}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(value, name) => {
                const labels: Record<string, string> = {
                  contributions: 'Raised (period)',
                  expenditures: 'Spent (period)',
                  cashOnHand: 'Cash on Hand',
                };
                return [formatCurrency(Number(value) || 0), labels[name as string] || name];
              }}
              labelFormatter={(_, payload) => {
                if (payload && payload[0]) {
                  const d = payload[0].payload as ReportTimelinePoint;
                  return `Period: ${formatPeriodDate(d.periodStart)} - ${formatPeriodDate(d.periodEnd)}`;
                }
                return '';
              }}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 12px',
              }}
            />
            <Legend
              formatter={(value: string) => {
                const labels: Record<string, string> = {
                  contributions: 'Raised (period)',
                  expenditures: 'Spent (period)',
                  cashOnHand: 'Cash on Hand',
                };
                return labels[value] || value;
              }}
            />
            <Line
              type="monotone"
              dataKey="contributions"
              stroke="#16a34a"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="contributions"
            />
            <Line
              type="monotone"
              dataKey="expenditures"
              stroke="#BF0D3E"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="expenditures"
            />
            <Line
              type="monotone"
              dataKey="cashOnHand"
              stroke="#002868"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="cashOnHand"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
