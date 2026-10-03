import { useMemo, useState } from 'react';
import { query, waitForInit } from '../lib/duckdb';
import { downloadCsv } from '../lib/csv';
import {
  DATA_SOURCES,
  FIELDS,
  MAX_LIMIT,
  DEFAULT_LIMIT,
  addChild,
  buildQuery,
  clampLimit,
  createCondition,
  createGroup,
  removeNode,
  setGroupOperator,
  updateCondition,
  type AggregationConfig,
  type ConditionGroup,
  type DataSource,
} from '../lib/query-builder';
import DatabaseLoader from './DatabaseLoader';
import ConditionGroupEditor, { type GroupActions } from './query-builder/ConditionGroupEditor';
import AggregationPanel from './query-builder/AggregationPanel';
import ResultsPanel, { type QueryResult } from './query-builder/ResultsPanel';

const DEFAULT_AGGREGATION: AggregationConfig = {
  enabled: false,
  groupBy: [],
  metrics: ['sum', 'count'],
  sortBy: 'sum',
  sortDir: 'desc',
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function QueryBuilder() {
  const [dataSource, setDataSource] = useState<DataSource>('contributions');
  const [rootGroup, setRootGroup] = useState<ConditionGroup>(() => createGroup('contributions'));
  const [aggregation, setAggregation] = useState<AggregationConfig>(DEFAULT_AGGREGATION);
  const [limitText, setLimitText] = useState(String(DEFAULT_LIMIT));
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = FIELDS[dataSource];
  const limit = clampLimit(limitText);

  // Single source of truth for the preview and for execution.
  const built = useMemo(() => {
    try {
      return { query: buildQuery({ dataSource, root: rootGroup, aggregation, limit }), error: null };
    } catch (err) {
      return { query: null, error: err instanceof Error ? err.message : 'Invalid query' };
    }
  }, [dataSource, rootGroup, aggregation, limit]);

  const actions: GroupActions = {
    updateCondition: (id, updates) => setRootGroup((g) => updateCondition(g, id, updates)),
    remove: (id) => setRootGroup((g) => removeNode(g, id)),
    addCondition: (groupId) => setRootGroup((g) => addChild(g, groupId, createCondition(dataSource))),
    addGroup: (groupId) => setRootGroup((g) => addChild(g, groupId, createGroup(dataSource))),
    setOperator: (groupId, operator) => setRootGroup((g) => setGroupOperator(g, groupId, operator)),
  };

  const selectDataSource = (source: DataSource) => {
    setDataSource(source);
    setRootGroup(createGroup(source));
    setAggregation((prev) => ({ ...prev, groupBy: [] }));
    setResult(null);
    setError(null);
  };

  const executeQuery = async () => {
    if (!built.query) {
      setError(built.error);
      return;
    }
    const { sql, countSql, aggregated, metrics } = built.query;

    setLoading(true);
    setError(null);
    const start = performance.now();

    try {
      await waitForInit();
      const [rows, countRows] = await Promise.all([query<Record<string, any>>(sql), query<{ count: number }>(countSql)]);

      setResult({
        rows,
        dataSource,
        aggregated,
        groupBy: aggregated ? aggregation.groupBy : [],
        metrics,
        totalCount: Number(countRows[0]?.count || 0),
        elapsedMs: Math.round(performance.now() - start),
      });
    } catch (err) {
      console.error('Query error:', err);
      setError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DatabaseLoader>
      <div className="space-y-6">
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Table</h2>
              </div>
              <div className="flex flex-wrap gap-2 p-4" role="group" aria-label="Table to query">
                {DATA_SOURCES.map((source) => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => selectDataSource(source)}
                    aria-pressed={dataSource === source}
                    className="chip"
                  >
                    {capitalize(source)}
                  </button>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Conditions</h2>
                <span className="text-xs text-slate-500">Empty conditions are ignored</span>
              </div>
              <div className="p-4">
                <ConditionGroupEditor group={rootGroup} dataSource={dataSource} fields={fields} actions={actions} />
              </div>
            </section>

            <AggregationPanel aggregation={aggregation} onChange={setAggregation} dataSource={dataSource} fields={fields} />

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={executeQuery} disabled={loading} className="btn-primary px-6 py-2.5">
                {loading ? 'Running…' : 'Run query'}
              </button>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Limit
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={limitText}
                  onChange={(e) => setLimitText(e.target.value.replace(/\D/g, ''))}
                  onBlur={() => setLimitText(String(limit))}
                  className="input w-24 py-1.5"
                />
                <span className="text-slate-400">max {MAX_LIMIT.toLocaleString()}</span>
              </label>
              {result && result.rows.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadCsv(result.rows, `nc-${result.dataSource}`)}
                  className="btn-secondary ml-auto"
                >
                  Export CSV
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4 lg:sticky lg:top-4">
            <section className="overflow-hidden rounded-xl bg-slate-900 shadow-xs">
              <h2 className="border-b border-white/10 px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                SQL preview
              </h2>
              <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap text-emerald-300">
                {built.query ? built.query.sql : `-- ${built.error}`}
              </pre>
            </section>

            {error && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <p className="font-semibold">The query failed</p>
                <p className="mt-1 break-words">{error}</p>
              </div>
            )}

            {result && !error && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" aria-live="polite">
                {result.totalCount.toLocaleString()} {result.totalCount === 1 ? 'match' : 'matches'} in {result.elapsedMs.toLocaleString()} ms
                {result.totalCount > result.rows.length && ` · showing the first ${result.rows.length.toLocaleString()}`}
              </p>
            )}
          </div>
        </div>

        {result && result.rows.length > 0 && <ResultsPanel result={result} />}
      </div>
    </DatabaseLoader>
  );
}
