import React from 'react'

import { listModels, listEvalRuns, runEval, evalJsonlUrl, evalSummaryUrl } from '../api/client'
import type { EvalRunResult, Model } from '../types'
import { JsonView } from '../components/JsonView'

function formatPct(x: number | null | undefined): string {
  if (x === null || x === undefined) return ''
  return `${(x * 100).toFixed(1)}%`
}

export function EvalsPage() {
  const [models, setModels] = React.useState<Model[] | null>(null)
  const [modelId, setModelId] = React.useState<number | null>(null)
  const [suite, setSuite] = React.useState<string>('smoke-v1')
  const [maxTokens, setMaxTokens] = React.useState<number>(64)
  const [temperature, setTemperature] = React.useState<number>(0.0)

  const [recent, setRecent] = React.useState<EvalRunResult[] | null>(null)
  const [lastRun, setLastRun] = React.useState<EvalRunResult | null>(null)

  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [running, setRunning] = React.useState(false)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [m, r] = await Promise.all([
        listModels({ limit: 200, sort: 'updated_at', order: 'desc' }),
        listEvalRuns({ limit: 50 })
      ])
      setModels(m)
      if (modelId === null && m.length > 0) setModelId(m[0].id)
      setRecent(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setModels(null)
      setRecent(null)
    } finally {
      setLoading(false)
    }
  }

  async function run() {
    if (modelId === null) return
    setRunning(true)
    setError(null)
    setLastRun(null)
    try {
      const result = await runEval({
        model_id: modelId,
        suite,
        max_tokens: maxTokens,
        temperature
      })
      setLastRun(result)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  React.useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div style={{ fontWeight: 650 }}>Evals</div>
          <div className="small">Runs `caiatech-eval-service` and writes summary metrics to the model registry.</div>
        </div>
        <div className="controls">
          <button className="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="panel-body">
        {error ? <div className="error">{error}</div> : null}

        <div style={{ fontWeight: 650, marginBottom: 8 }}>Run an eval</div>
        <div className="controls" style={{ marginBottom: 14 }}>
          <select value={suite} onChange={(e) => setSuite(e.target.value)}>
            <option value="smoke-v1">smoke-v1</option>
            <option value="core-v1">core-v1</option>
            <option value="math-corpus-v1">math-corpus-v1</option>
          </select>

          <select
            value={modelId ?? ''}
            onChange={(e) => setModelId(e.target.value ? Number(e.target.value) : null)}
            style={{ minWidth: 360 }}
          >
            {!models ? (
              <option value="">Loading models…</option>
            ) : (
              models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} · {m.name}:{m.version} · {m.status}
                </option>
              ))
            )}
          </select>

          <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            max_tokens
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              style={{ width: 110 }}
              min={1}
              max={512}
            />
          </label>

          <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            temperature
            <input
              type="number"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              style={{ width: 110 }}
              min={0}
              max={2}
              step={0.05}
            />
          </label>

          <button onClick={() => void run()} disabled={running || modelId === null}>
            {running ? 'Running…' : 'Run'}
          </button>
        </div>

        {lastRun ? (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span className="badge">last run</span>
              <span className="small">{lastRun.eval_run_id}</span>
              <span className="badge">{lastRun.suite}</span>
              <span className="badge">pass {formatPct(lastRun.pass_rate)}</span>
              <a className="badge" href={evalSummaryUrl(lastRun.eval_run_id)} target="_blank" rel="noreferrer">
                summary
              </a>
              <a className="badge" href={evalJsonlUrl(lastRun.eval_run_id)} target="_blank" rel="noreferrer">
                jsonl
              </a>
            </div>
            <div style={{ marginTop: 10 }}>
              <JsonView value={lastRun} />
            </div>
          </div>
        ) : null}

        <div style={{ fontWeight: 650, marginBottom: 8 }}>Recent runs</div>
        {!recent ? (
          <div className="small">{loading ? 'Loading…' : 'No data.'}</div>
        ) : recent.length === 0 ? (
          <div className="small">No eval runs found in the dashboard eval directory.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Suite</th>
                <th>Model</th>
                <th>Pass</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.eval_run_id}>
                  <td className="small">{r.eval_run_id}</td>
                  <td>{r.suite}</td>
                  <td>{r.model_id}</td>
                  <td>{formatPct(r.pass_rate)}</td>
                  <td>
                    <a className="badge" href={evalSummaryUrl(r.eval_run_id)} target="_blank" rel="noreferrer">
                      summary
                    </a>{' '}
                    <a className="badge" href={evalJsonlUrl(r.eval_run_id)} target="_blank" rel="noreferrer">
                      jsonl
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

