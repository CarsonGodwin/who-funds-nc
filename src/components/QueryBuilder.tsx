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
        <div className="bg-gradient-to-r from-nc-blue to-blue-900 text-white rounded-xl p-6">
          <h1 className="text-2xl font-bold mb-2">Advanced</h1>
          <p className="text-blue-200">
            Build complex, multi-condition queries with boolean logic to analyze campaign finance data
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr_400px] gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 mb-3">Data Source</h3>
              <div className="flex gap-2 flex-wrap">
                {DATA_SOURCES.map((source) => (
                  <button
                    key={source}
                    onClick={() => selectDataSource(source)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      dataSource === source ? 'bg-nc-blue text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {capitalize(source)}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 mb-3">Query Conditions</h3>
              <ConditionGroupEditor group={rootGroup} dataSource={dataSource} fields={fields} actions={actions} />
            </div>

            <AggregationPanel aggregation={aggregation} onChange={setAggregation} dataSource={dataSource} fields={fields} />

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-4">
                <label className="font-semibold text-slate-900">Result Limit:</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={limitText}
                  onChange={(e) => setLimitText(e.target.value.replace(/\D/g, ''))}
                  onBlur={() => setLimitText(String(limit))}
                  className="w-24 px-2 py-1 border border-slate-300 rounded text-sm"
                />
                <span className="text-sm text-slate-500">(max {MAX_LIMIT.toLocaleString()})</span>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={executeQuery}
                disabled={loading}
                className="flex-1 py-3 bg-nc-blue text-white font-semibold rounded-xl hover:bg-blue-900 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Executing...' : 'Execute Query'}
              </button>
              {result && result.rows.length > 0 && (
                <button
                  onClick={() => downloadCsv(result.rows, `nc-${result.dataSource}`)}
                  className="px-6 py-3 border border-nc-blue text-nc-blue font-semibold rounded-xl hover:bg-blue-50 transition-colors"
                >
                  Export CSV
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-900 text-green-400 rounded-xl p-4 font-mono text-sm">
              <h3 className="text-slate-400 mb-2">Query Preview</h3>
              <pre className="whitespace-pre-wrap">{built.query ? built.query.sql : `-- ${built.error}`}</pre>
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 rounded-xl p-4 border border-red-200">
                <strong>Error:</strong> {error}
              </div>
            )}

            {result && (
              <div className="bg-green-50 text-green-700 rounded-xl p-4 border border-green-200">
                Query executed in {result.elapsedMs}ms • {result.totalCount.toLocaleString()} results found
              </div>
            )}
          </div>
        </div>

        {result && result.rows.length > 0 && <ResultsPanel result={result} />}
      </div>
    </DatabaseLoader>
  );
}
