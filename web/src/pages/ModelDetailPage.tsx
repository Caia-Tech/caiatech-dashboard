import React from 'react'
import { Link, useParams } from 'react-router-dom'

import { getModel, getModelEvents, getModelMetrics, promoteModel, resolveModelCheckpoint, runEval, evalJsonlUrl, evalSummaryUrl } from '../api/client'
import type { Model, ModelEvent, ArtifactResolveResponse, EvalRunResult } from '../types'
import { JsonView } from '../components/JsonView'
import { StatusBadge } from '../components/StatusBadge'

function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return ''
  return Intl.NumberFormat().format(n)
}

export function ModelDetailPage() {
  const params = useParams()
  const modelId = Number(params.id)

  const [model, setModel] = React.useState<Model | null>(null)
  const [metrics, setMetrics] = React.useState<Record<string, unknown> | null>(null)
  const [events, setEvents] = React.useState<ModelEvent[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [promoting, setPromoting] = React.useState(false)
  const [resolving, setResolving] = React.useState(false)
  const [resolved, setResolved] = React.useState<ArtifactResolveResponse | null>(null)
  const [evalRunning, setEvalRunning] = React.useState(false)
  const [evalResult, setEvalResult] = React.useState<EvalRunResult | null>(null)

  async function refresh() {
    if (!Number.isFinite(modelId)) return
    setLoading(true)
    setError(null)
    try {
      const [m, met, ev] = await Promise.all([
        getModel(modelId),
        getModelMetrics(modelId),
        getModelEvents(modelId, { limit: 200 })
      ])
      setModel(m)
      setMetrics(met)
      setEvents(ev)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setModel(null)
      setMetrics(null)
      setEvents(null)
    } finally {
      setLoading(false)
    }
  }

  async function doResolve() {
    setResolving(true)
    setError(null)
    setResolved(null)
    try {
      const r = await resolveModelCheckpoint(modelId)
      setResolved(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setResolving(false)
    }
  }

  async function doEval(suite: string) {
    setEvalRunning(true)
    setError(null)
    setEvalResult(null)
    try {
      const r = await runEval({ model_id: modelId, suite })
      setEvalResult(r)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setEvalRunning(false)
    }
  }

  async function doPromote(toStatus: string) {
    setPromoting(true)
    setError(null)
    try {
      const updated = await promoteModel(modelId, toStatus)
      setModel(updated)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPromoting(false)
    }
  }

  React.useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId])

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div style={{ fontWeight: 650 }}>
            <Link to="/models">Models</Link> <span className="small">/</span> Model {Number.isFinite(modelId) ? modelId : '—'}
          </div>
          <div className="small">{loading ? 'Loading…' : model ? `${model.name}:${model.version}` : ''}</div>
        </div>

        <div className="controls">
          <button className="secondary" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </button>
          <button className="secondary" onClick={() => void doResolve()} disabled={!model || resolving}>
            {resolving ? 'Resolving…' : 'Resolve artifact'}
          </button>
          <button className="secondary" onClick={() => void doEval('smoke-v1')} disabled={!model || evalRunning}>
            {evalRunning ? 'Running…' : 'Run smoke'}
          </button>
          <button className="secondary" onClick={() => void doEval('core-v1')} disabled={!model || evalRunning}>
            {evalRunning ? 'Running…' : 'Run core'}
          </button>
          <button onClick={() => void doPromote('staging')} disabled={!model || promoting}>
            Promote → staging
          </button>
          <button onClick={() => void doPromote('production')} disabled={!model || promoting}>
            Promote → production
          </button>
          <button className="danger" onClick={() => void doPromote('archived')} disabled={!model || promoting}>
            Archive
          </button>
        </div>
      </div>

      <div className="panel-body">
        {error ? <div className="error">{error}</div> : null}

        {!model ? (
          <div className="small">{loading ? 'Loading…' : 'Model not found.'}</div>
        ) : (
          <>
            <div className="kv" style={{ marginBottom: 16 }}>
              <div className="k">Status</div>
              <div className="v">
                <StatusBadge status={model.status} />
                {model.frozen ? <span className="badge" style={{ marginLeft: 8 }}>frozen</span> : null}
              </div>

              <div className="k">Artifact URI</div>
              <div className="v">{model.artifact_uri}</div>

              <div className="k">Checkpoint sha/size</div>
              <div className="v">
                {model.checkpoint_sha256 ? model.checkpoint_sha256.slice(0, 12) + '…' : ''}
                {model.checkpoint_size_bytes ? ` (${formatNum(model.checkpoint_size_bytes)} bytes)` : ''}
              </div>

              <div className="k">Params</div>
              <div className="v">{model.params ? formatNum(model.params) : ''}</div>

              <div className="k">Training</div>
              <div className="v">
                {model.training_step !== null && model.training_step !== undefined ? `step ${formatNum(model.training_step)}` : ''}
                {model.training_loss !== null && model.training_loss !== undefined ? ` · loss ${model.training_loss}` : ''}
                {model.dataset ? ` · ${model.dataset}` : ''}
              </div>

              <div className="k">Updated</div>
              <div className="v">{model.updated_at}</div>
            </div>

            {resolved ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="badge">artifact</span>
                  <span className="small">{resolved.cached ? 'cached' : 'downloaded'}</span>
                  <span className="small">· {resolved.local_path}</span>
                </div>
              </div>
            ) : null}

            {evalResult ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="badge">eval</span>
                  <span className="badge">{evalResult.suite}</span>
                  <span className="badge">pass {(evalResult.pass_rate * 100).toFixed(1)}%</span>
                  <a className="badge" href={evalSummaryUrl(evalResult.eval_run_id)} target="_blank" rel="noreferrer">
                    summary
                  </a>
                  <a className="badge" href={evalJsonlUrl(evalResult.eval_run_id)} target="_blank" rel="noreferrer">
                    jsonl
                  </a>
                </div>
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 650, marginBottom: 8 }}>Suite Metrics</div>
                {metrics ? <JsonView value={metrics} /> : <div className="small">No metrics.</div>}
              </div>
              <div>
                <div style={{ fontWeight: 650, marginBottom: 8 }}>Audit Events</div>
                {events ? (
                  <div className="pre">
                    {events.length === 0 ? (
                      <div className="small">No events.</div>
                    ) : (
                      events.map((ev) => (
                        <div key={ev.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                            <span className="badge">{ev.event_type}</span>
                            <span className="small">{ev.created_at}</span>
                            {ev.actor ? <span className="small">· {ev.actor}</span> : null}
                          </div>
                          {ev.payload ? (
                            <pre className="small" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
                              {JSON.stringify(ev.payload, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="small">No events.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
