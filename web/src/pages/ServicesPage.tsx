import React from 'react'

import { getDashboardHealth } from '../api/client'
import type { DashboardHealth } from '../types'
import { JsonView } from '../components/JsonView'

function Dot({ ok }: { ok: boolean }) {
  const color = ok ? 'rgba(49, 208, 170, 0.95)' : 'rgba(255, 77, 109, 0.95)'
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 99, background: color }} />
}

export function ServicesPage() {
  const [health, setHealth] = React.useState<DashboardHealth | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const h = await getDashboardHealth()
      setHealth(h)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void refresh()
  }, [])

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div style={{ fontWeight: 650 }}>Services</div>
          <div className="small">Connectivity for the local Caia ecosystem.</div>
        </div>
        <div className="controls">
          <button className="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="panel-body">
        {error ? <div className="error">{error}</div> : null}

        {!health ? (
          <div className="small">{loading ? 'Loading…' : 'No data.'}</div>
        ) : (
          <>
            <div className="kv" style={{ marginBottom: 16 }}>
              <div className="k">Model registry</div>
              <div className="v">
                <Dot ok={health.registry.reachable} /> <span style={{ marginLeft: 10 }}>{health.registry.url}</span>{' '}
                {!health.registry.auth_configured ? <span className="badge" style={{ marginLeft: 8 }}>missing API key</span> : null}
              </div>

              <div className="k">Artifact cache</div>
              <div className="v">
                <Dot ok={health.artifact_cache.reachable} /> <span style={{ marginLeft: 10 }}>{health.artifact_cache.url}</span>
              </div>

              <div className="k">Onyx inference</div>
              <div className="v">
                <Dot ok={health.onyx_api.reachable} /> <span style={{ marginLeft: 10 }}>{health.onyx_api.url}</span>
              </div>

              <div className="k">Eval runner</div>
              <div className="v">
                <Dot ok={health.eval.eval_service_present} /> <span style={{ marginLeft: 10 }}>{health.eval.eval_service_dir}</span>
                <span className="badge" style={{ marginLeft: 8 }}>runs: {health.eval.eval_runs_dir}</span>
              </div>
            </div>

            <div style={{ fontWeight: 650, marginBottom: 8 }}>Raw</div>
            <JsonView value={health} />
          </>
        )}
      </div>
    </div>
  )
}

