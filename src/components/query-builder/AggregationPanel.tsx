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
    <section className="card">
      <label className="flex cursor-pointer items-center gap-3 px-5 py-4">
        <input
          type="checkbox"
          checked={aggregation.enabled}
          onChange={(e) => onChange((prev) => ({ ...prev, enabled: e.target.checked }))}
          className="h-4 w-4 accent-nc-blue"
        />
        <span className="card-title">Group and aggregate</span>
      </label>

      {aggregation.enabled && (
        <div className="space-y-4 border-t border-slate-200 p-5">
          <div>
            <p className="field-label">Group by</p>
            <div className="flex flex-wrap gap-2">
              {fields.map((f) => (
                <label key={f.value} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={aggregation.groupBy.includes(f.value)}
                    onChange={(e) => onChange((prev) => ({ ...prev, groupBy: toggle(prev.groupBy, f.value, e.target.checked) }))}
                    className="h-3.5 w-3.5 accent-nc-blue"
                  />
                  <span className="text-sm text-slate-700">{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="field-label">Metrics</p>
              <div className="flex flex-wrap gap-2">
                {metrics.map((metric) => (
                  <label key={metric} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={aggregation.metrics.includes(metric)}
                      onChange={(e) => onChange((prev) => ({ ...prev, metrics: toggle(prev.metrics, metric, e.target.checked) }))}
                      className="h-3.5 w-3.5 accent-nc-blue"
                    />
                    <span className="text-sm text-slate-700">{METRIC_LABELS[metric]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="field-label">Sort by</p>
              <div className="flex gap-2">
                <select
                  value={aggregation.sortBy}
                  onChange={(e) => onChange((prev) => ({ ...prev, sortBy: e.target.value as Metric }))}
                  aria-label="Sort by metric"
                  className="input w-auto py-1.5"
                >
                  {metrics.map((metric) => (
                    <option key={metric} value={metric}>{METRIC_LABELS[metric]}</option>
                  ))}
                </select>
                <select
                  value={aggregation.sortDir}
                  onChange={(e) => onChange((prev) => ({ ...prev, sortDir: e.target.value as 'asc' | 'desc' }))}
                  aria-label="Sort direction"
                  className="input w-auto py-1.5"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
