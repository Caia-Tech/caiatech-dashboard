import React from 'react'
import { Link, useParams } from 'react-router-dom'

import { listModels, promoteModel, runEval, evalJsonlUrl, evalSummaryUrl } from '../api/client'
import type { EvalRunResult, Model } from '../types'
import { StatusBadge } from '../components/StatusBadge'

const GATE_SUITE = 'core-v1'
const PASS_THRESHOLD = 1.0

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function suiteEntry(model: Model, suite: string): Record<string, unknown> | null {
  if (!model.metrics || !isRecord(model.metrics)) return null
  const suites = (model.metrics as Record<string, unknown>).suites
  if (!isRecord(suites)) return null
  const entry = (suites as Record<string, unknown>)[suite]
  return isRecord(entry) ? entry : null
}

function suitePassRate(model: Model, suite: string): number | null {
  const entry = suiteEntry(model, suite)
  if (!entry) return null
  const passRate = entry.pass_rate
  return typeof passRate === 'number' ? passRate : null
}

function modelRowKey(m: Model) {
  return `${m.id}:${m.updated_at}`
}

export function ReleaseDetailPage() {
  const params = useParams()
  const name = decodeURIComponent(params.name ?? '')

  const [production, setProduction] = React.useState<Model[] | null>(null)
  const [staging, setStaging] = React.useState<Model[] | null>(null)
  const [experimental, setExperimental] = React.useState<Model[] | null>(null)

  const [lastEval, setLastEval] = React.useState<EvalRunResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)

  const busyModelId = React.useMemo(() => {
    if (!busy) return null
    const parts = busy.split(':')
    if (parts.length < 2) return null
    const n = Number(parts[1])
    return Number.isFinite(n) ? n : null
  }, [busy])

  async function refresh() {
    if (!name) return
    setLoading(true)
    setError(null)
    try {
      const [prod, stage, exp] = await Promise.all([
        listModels({ name, status: 'production', limit: 5, sort: 'updated_at', order: 'desc' }),
        listModels({ name, status: 'staging', limit: 20, sort: 'updated_at', order: 'desc' }),
        listModels({ name, status: 'experimental', limit: 20, sort: 'updated_at', order: 'desc' })
      ])
      setProduction(prod)
      setStaging(stage)
      setExperimental(exp)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setProduction(null)
      setStaging(null)
      setExperimental(null)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  async function doGate(modelId: number) {
    setBusy(`gate:${modelId}`)
    setError(null)
    setLastEval(null)
    try {
      const r = await runEval({ model_id: modelId, suite: GATE_SUITE, max_tokens: 64, temperature: 0.0 })
      setLastEval(r)
      await refresh()
      if (r.pass_rate < PASS_THRESHOLD) {
        setError(`Gate failed: ${GATE_SUITE} pass_rate ${(r.pass_rate * 100).toFixed(1)}% < ${(PASS_THRESHOLD * 100).toFixed(1)}%`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function doPromote(modelId: number, toStatus: 'staging' | 'production') {
    setBusy(`promote:${modelId}:${toStatus}`)
    setError(null)
    try {
      await promoteModel(modelId, toStatus)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function doGateAndPromote(modelId: number, toStatus: 'staging' | 'production') {
    setBusy(`gatepromote:${modelId}:${toStatus}`)
    setError(null)
    setLastEval(null)
    try {
      const r = await runEval({ model_id: modelId, suite: GATE_SUITE, max_tokens: 64, temperature: 0.0 })
      setLastEval(r)
      await refresh()
      if (r.pass_rate < PASS_THRESHOLD) {
        setError(`Gate failed: ${GATE_SUITE} pass_rate ${(r.pass_rate * 100).toFixed(1)}% < ${(PASS_THRESHOLD * 100).toFixed(1)}%`)
        return
      }
      await promoteModel(modelId, toStatus)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const prod = production?.[0] ?? null
  const hasAny = (production?.length ?? 0) + (staging?.length ?? 0) + (experimental?.length ?? 0) > 0

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div style={{ fontWeight: 650 }}>
            <Link to="/releases">Releases</Link> <span className="small">/</span> {name || '—'}
          </div>
          <div className="small">
            {prod ? (
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span>production:</span> <StatusBadge status={prod.status} /> <span>id {prod.id}</span> <span>{prod.version}</span>
              </span>
            ) : (
              'No production model.'
            )}
          </div>
        </div>
        <div className="controls">
          <button className="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="panel-body">
        {error ? <div className="error">{error}</div> : null}

        <div className="small" style={{ marginBottom: 12 }}>
          Gate: <span className="badge">{GATE_SUITE}</span> pass_rate ≥ {(PASS_THRESHOLD * 100).toFixed(1)}%. “Gate+Promote” runs the suite and
          then promotes if it passes.
        </div>

        {lastEval ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span className="badge">gate</span>
              <span className="badge">{lastEval.suite}</span>
              <span className="badge">pass {(lastEval.pass_rate * 100).toFixed(1)}%</span>
              <span className="small">{lastEval.eval_run_id}</span>
              <a className="badge" href={evalSummaryUrl(lastEval.eval_run_id)} target="_blank" rel="noreferrer">
                summary
              </a>
              <a className="badge" href={evalJsonlUrl(lastEval.eval_run_id)} target="_blank" rel="noreferrer">
                jsonl
              </a>
            </div>
          </div>
        ) : null}

        {prod ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 650, marginBottom: 8 }}>Production</div>
            <div className="kv">
              <div className="k">Model</div>
              <div className="v">
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <StatusBadge status={prod.status} />
                  <Link to={`/models/${prod.id}`}>id {prod.id}</Link>
                  <span>{prod.version}</span>
                </span>
              </div>

              <div className="k">{GATE_SUITE} pass</div>
              <div className="v">
                {suitePassRate(prod, GATE_SUITE) === null ? (
                  <span className="small">—</span>
                ) : (
                  `${(suitePassRate(prod, GATE_SUITE)! * 100).toFixed(1)}%`
                )}
              </div>

              <div className="k">Updated</div>
              <div className="v">{prod.updated_at}</div>
            </div>
          </div>
        ) : null}

        {!hasAny ? (
          <div className="small">{loading ? 'Loading…' : 'No models found for this name.'}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 650, marginBottom: 8 }}>Staging candidates</div>
              <div className="small" style={{ marginBottom: 8 }}>
                Use “Gate+Promote” to run {GATE_SUITE} and promote to production.
              </div>
              {!staging ? (
                <div className="small">{loading ? 'Loading…' : 'No data.'}</div>
              ) : staging.length === 0 ? (
                <div className="small">None.</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Version</th>
                      <th>Gate</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staging.map((m) => {
                      const pass = suitePassRate(m, GATE_SUITE)
                      const canPromote = pass !== null && pass >= PASS_THRESHOLD
                      const isBusy = busyModelId === m.id
                      return (
                        <tr key={modelRowKey(m)}>
                          <td>
                            <Link to={`/models/${m.id}`}>{m.id}</Link>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                              <StatusBadge status={m.status} />
                              <span>{m.version}</span>
                            </div>
                            <div className="small">{m.updated_at}</div>
                          </td>
                          <td>{pass === null ? <span className="small">—</span> : `${(pass * 100).toFixed(1)}%`}</td>
                          <td>
                            <div className="controls" style={{ gap: 8 }}>
                              <button className="secondary" onClick={() => void doGate(m.id)} disabled={!!busy}>
                                Gate
                              </button>
                              <button onClick={() => void doGateAndPromote(m.id, 'production')} disabled={!!busy}>
                                Gate+Promote
                              </button>
                              <button className="secondary" onClick={() => void doPromote(m.id, 'production')} disabled={!!busy || !canPromote}>
                                Promote
                              </button>
                              {isBusy ? <span className="small">…</span> : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <div style={{ fontWeight: 650, marginBottom: 8 }}>Experimental candidates</div>
              <div className="small" style={{ marginBottom: 8 }}>
                Use “Gate+Promote” to run {GATE_SUITE} and promote to staging.
              </div>
              {!experimental ? (
                <div className="small">{loading ? 'Loading…' : 'No data.'}</div>
              ) : experimental.length === 0 ? (
                <div className="small">None.</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Version</th>
                      <th>Gate</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {experimental.map((m) => {
                      const pass = suitePassRate(m, GATE_SUITE)
                      const canPromote = pass !== null && pass >= PASS_THRESHOLD
                      const isBusy = busyModelId === m.id
                      return (
                        <tr key={modelRowKey(m)}>
                          <td>
                            <Link to={`/models/${m.id}`}>{m.id}</Link>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                              <StatusBadge status={m.status} />
                              <span>{m.version}</span>
                            </div>
                            <div className="small">{m.updated_at}</div>
                          </td>
                          <td>{pass === null ? <span className="small">—</span> : `${(pass * 100).toFixed(1)}%`}</td>
                          <td>
                            <div className="controls" style={{ gap: 8 }}>
                              <button className="secondary" onClick={() => void doGate(m.id)} disabled={!!busy}>
                                Gate
                              </button>
                              <button onClick={() => void doGateAndPromote(m.id, 'staging')} disabled={!!busy}>
                                Gate+Promote
                              </button>
                              <button className="secondary" onClick={() => void doPromote(m.id, 'staging')} disabled={!!busy || !canPromote}>
                                Promote
                              </button>
                              {isBusy ? <span className="small">…</span> : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
