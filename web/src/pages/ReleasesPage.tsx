import React from 'react'
import { Link } from 'react-router-dom'

import { getStats, listModels } from '../api/client'
import type { Model, RegistryStats } from '../types'
import { StatusBadge } from '../components/StatusBadge'

type ReleaseRow = {
  name: string
  total: number
  production: Model | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function suitePassRate(model: Model, suite: string): number | null {
  if (!model.metrics || !isRecord(model.metrics)) return null
  const suites = (model.metrics as Record<string, unknown>).suites
  if (!isRecord(suites)) return null
  const entry = (suites as Record<string, unknown>)[suite]
  if (!isRecord(entry)) return null
  const passRate = entry.pass_rate
  return typeof passRate === 'number' ? passRate : null
}

export function ReleasesPage() {
  const [stats, setStats] = React.useState<RegistryStats | null>(null)
  const [production, setProduction] = React.useState<Model[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const [q, setQ] = React.useState('')

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [s, prod] = await Promise.all([
        getStats(),
        listModels({ status: 'production', limit: 500, sort: 'updated_at', order: 'desc' })
      ])
      setStats(s)
      setProduction(prod)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStats(null)
      setProduction(null)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void refresh()
  }, [])

  const rows: ReleaseRow[] = React.useMemo(() => {
    if (!stats) return []
    const prodByName = new Map<string, Model>()
    for (const m of production ?? []) {
      if (!prodByName.has(m.name)) prodByName.set(m.name, m)
    }
    const names = Object.keys(stats.by_name ?? {}).sort((a, b) => a.localeCompare(b))
    const query = q.trim().toLowerCase()
    const filtered = query ? names.filter((n) => n.toLowerCase().includes(query)) : names
    return filtered.map((name) => ({
      name,
      total: stats.by_name[name] ?? 0,
      production: prodByName.get(name) ?? null
    }))
  }, [stats, production, q])

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div style={{ fontWeight: 650 }}>Releases</div>
          <div className="small">Model lifecycle view by model name (production/staging/experimental).</div>
        </div>
        <div className="controls">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter names" style={{ width: 260 }} />
          <button className="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="panel-body">
        {error ? <div className="error">{error}</div> : null}

        {!stats ? (
          <div className="small">{loading ? 'Loading…' : 'No data.'}</div>
        ) : rows.length === 0 ? (
          <div className="small">No model names found.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Total</th>
                <th>Production</th>
                <th>Core pass</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const core = r.production ? suitePassRate(r.production, 'core-v1') : null
                return (
                  <tr key={r.name}>
                    <td>
                      <Link to={`/releases/${encodeURIComponent(r.name)}`}>{r.name}</Link>
                    </td>
                    <td>{r.total}</td>
                    <td>
                      {r.production ? (
                        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <StatusBadge status={r.production.status} />
                          <span className="small">id {r.production.id}</span>
                          <span>{r.production.version}</span>
                        </span>
                      ) : (
                        <span className="small">—</span>
                      )}
                    </td>
                    <td>{core === null ? <span className="small">—</span> : `${(core * 100).toFixed(1)}%`}</td>
                    <td className="small">{r.production?.updated_at ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

