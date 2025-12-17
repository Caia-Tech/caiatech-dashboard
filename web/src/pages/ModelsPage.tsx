import React from 'react'
import { Link } from 'react-router-dom'

import { getStats, listModels } from '../api/client'
import type { Model, RegistryStats } from '../types'
import { StatusBadge } from '../components/StatusBadge'

function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return ''
  return Intl.NumberFormat().format(n)
}

export function ModelsPage() {
  const [stats, setStats] = React.useState<RegistryStats | null>(null)
  const [models, setModels] = React.useState<Model[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const [status, setStatus] = React.useState<string>('')
  const [q, setQ] = React.useState<string>('')

  const [loading, setLoading] = React.useState(false)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [s, m] = await Promise.all([
        getStats(),
        listModels({ status: status || undefined, q: q || undefined, limit: 100, sort: 'updated_at', order: 'desc' })
      ])
      setStats(s)
      setModels(m)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setModels(null)
    } finally {
      setLoading(false)
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
          <div style={{ fontWeight: 650 }}>Models</div>
          <div className="small">
            {stats ? `${formatNum(stats.total_models)} total` : 'Loading registry stats…'}
          </div>
        </div>

        <div className="controls">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="production">production</option>
            <option value="staging">staging</option>
            <option value="experimental">experimental</option>
            <option value="archived">archived</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name/version/description"
            style={{ width: 320 }}
          />
          <button onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="panel-body">
        {error ? <div className="error">{error}</div> : null}

        {!models ? (
          <div className="small">Loading…</div>
        ) : models.length === 0 ? (
          <div className="small">No models found.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Version</th>
                <th>Status</th>
                <th>Step</th>
                <th>Params</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id}>
                  <td>{m.id}</td>
                  <td>
                    <Link to={`/models/${m.id}`}>{m.name}</Link>
                  </td>
                  <td>{m.version}</td>
                  <td>
                    <StatusBadge status={m.status} />
                  </td>
                  <td>{m.training_step ?? ''}</td>
                  <td>{m.params ? formatNum(m.params) : ''}</td>
                  <td className="small">{m.updated_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
