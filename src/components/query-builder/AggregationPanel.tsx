import { AMOUNT_FIELD, type AggregationConfig, type DataSource, type FieldDef, type Metric } from '../../lib/query-builder';

interface Props {
  aggregation: AggregationConfig;
  onChange: (updater: (prev: AggregationConfig) => AggregationConfig) => void;
  dataSource: DataSource;
  fields: FieldDef[];
}

const toggle = <T,>(list: T[], item: T, on: boolean) => (on ? [...list, item] : list.filter((x) => x !== item));

const METRIC_LABELS: Record<Metric, string> = { sum: 'Sum', count: 'Count', avg: 'Average', min: 'Min', max: 'Max' };

export default function AggregationPanel({ aggregation, onChange, dataSource, fields }: Props) {
  // Only sources with an amount column can sum/average; everything else just counts.
  const metrics: Metric[] = AMOUNT_FIELD[dataSource] ? ['sum', 'count', 'avg', 'min', 'max'] : ['count'];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3 mb-3">
        <input
          type="checkbox"
          id="enableAggregation"
          checked={aggregation.enabled}
          onChange={(e) => onChange((prev) => ({ ...prev, enabled: e.target.checked }))}
          className="w-4 h-4 text-nc-blue"
        />
        <label htmlFor="enableAggregation" className="font-semibold text-slate-900">
          Enable Aggregation / Group By
        </label>
      </div>

      {aggregation.enabled && (
        <div className="space-y-4 pt-3 border-t border-slate-200">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Group By Fields</label>
            <div className="flex flex-wrap gap-2">
              {fields.map((f) => (
                <label key={f.value} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={aggregation.groupBy.includes(f.value)}
                    onChange={(e) => onChange((prev) => ({ ...prev, groupBy: toggle(prev.groupBy, f.value, e.target.checked) }))}
                    className="w-3 h-3"
                  />
                  <span className="text-sm">{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Metrics</label>
              <div className="flex flex-wrap gap-2">
                {metrics.map((metric) => (
                  <label key={metric} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={aggregation.metrics.includes(metric)}
                      onChange={(e) => onChange((prev) => ({ ...prev, metrics: toggle(prev.metrics, metric, e.target.checked) }))}
                      className="w-3 h-3"
                    />
                    <span className="text-sm">{METRIC_LABELS[metric]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sort By</label>
              <div className="flex gap-2">
                <select
                  value={aggregation.sortBy}
                  onChange={(e) => onChange((prev) => ({ ...prev, sortBy: e.target.value as Metric }))}
                  className="px-2 py-1 border border-slate-300 rounded text-sm bg-white"
                >
                  {metrics.map((metric) => (
                    <option key={metric} value={metric}>{METRIC_LABELS[metric]}</option>
                  ))}
                </select>
                <select
                  value={aggregation.sortDir}
                  onChange={(e) => onChange((prev) => ({ ...prev, sortDir: e.target.value as 'asc' | 'desc' }))}
                  className="px-2 py-1 border border-slate-300 rounded text-sm bg-white"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
