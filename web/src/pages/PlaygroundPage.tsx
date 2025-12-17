import React from 'react'

import { listModels, onyxGenerate } from '../api/client'
import type { Model } from '../types'

function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return ''
  return Intl.NumberFormat().format(n)
}

export function PlaygroundPage() {
  const [models, setModels] = React.useState<Model[] | null>(null)
  const [modelId, setModelId] = React.useState<number | null>(null)
  const [prompt, setPrompt] = React.useState<string>('Write a one-paragraph explanation of what a model registry is.')
  const [maxTokens, setMaxTokens] = React.useState<number>(256)
  const [temperature, setTemperature] = React.useState<number>(0.7)

  const [output, setOutput] = React.useState<string>('')
  const [meta, setMeta] = React.useState<Record<string, unknown> | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [sending, setSending] = React.useState(false)

  async function refreshModels() {
    setLoading(true)
    setError(null)
    try {
      const m = await listModels({ limit: 200, sort: 'updated_at', order: 'desc' })
      setModels(m)
      if (modelId === null && m.length > 0) setModelId(m[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setModels(null)
    } finally {
      setLoading(false)
    }
  }

  async function generate() {
    if (modelId === null) return
    setSending(true)
    setError(null)
    setOutput('')
    setMeta(null)
    try {
      const resp = await onyxGenerate({
        prompt,
        model_id: modelId,
        max_tokens: maxTokens,
        temperature
      })
      const text = typeof resp.text === 'string' ? resp.text : JSON.stringify(resp, null, 2)
      setOutput(text)
      setMeta(resp)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  React.useEffect(() => {
    void refreshModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selected = models?.find((m) => m.id === modelId) ?? null

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div style={{ fontWeight: 650 }}>Playground</div>
          <div className="small">Calls `onyx-api` via the dashboard API.</div>
        </div>
        <div className="controls">
          <button className="secondary" onClick={() => void refreshModels()} disabled={loading}>
            {loading ? 'Loading…' : 'Reload models'}
          </button>
        </div>
      </div>

      <div className="panel-body">
        {error ? <div className="error">{error}</div> : null}

        <div className="kv" style={{ marginBottom: 16 }}>
          <div className="k">Model</div>
          <div className="v">
            {!models ? (
              <span className="small">{loading ? 'Loading…' : 'No models loaded.'}</span>
            ) : (
              <select
                value={modelId ?? ''}
                onChange={(e) => setModelId(e.target.value ? Number(e.target.value) : null)}
                style={{ minWidth: 360 }}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} · {m.name}:{m.version} · {m.status} {m.params ? `· ${formatNum(m.params)} params` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="k">Max tokens</div>
          <div className="v">
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              style={{ width: 120 }}
              min={1}
              max={4096}
            />
          </div>

          <div className="k">Temperature</div>
          <div className="v">
            <input
              type="number"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              style={{ width: 120 }}
              min={0}
              max={2}
              step={0.05}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 650, marginBottom: 8 }}>Prompt</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={{
                width: '100%',
                minHeight: 120,
                resize: 'vertical',
                background: 'rgba(0,0,0,0.28)',
                color: 'rgba(255,255,255,0.92)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12,
                padding: 12,
                fontFamily: 'ui-sans-serif, system-ui'
              }}
            />
            <div className="controls" style={{ marginTop: 10 }}>
              <button onClick={() => void generate()} disabled={sending || modelId === null || !prompt.trim()}>
                {sending ? 'Generating…' : 'Generate'}
              </button>
              {selected ? <span className="small">Using model {selected.id} ({selected.status})</span> : null}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 650, marginBottom: 8 }}>Output</div>
            <pre className="pre">{output || (sending ? '…' : '')}</pre>
            {meta ? (
              <div className="small" style={{ marginTop: 8 }}>
                {typeof meta.tokens_generated === 'number' ? `${meta.tokens_generated} tokens` : null}
                {typeof meta.tokens_per_second === 'number' ? ` · ${meta.tokens_per_second.toFixed(2)} tok/s` : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

