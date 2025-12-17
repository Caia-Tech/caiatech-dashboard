import type { RegistryStats, Model, ModelEvent, DashboardHealth, ArtifactResolveResponse, EvalRunResult } from '../types'

function cleanBaseUrl(raw: string | undefined): string {
  const v = (raw ?? '').trim()
  if (!v) return ''
  return v.endsWith('/') ? v.slice(0, -1) : v
}

const API_BASE = cleanBaseUrl(import.meta.env.VITE_API_BASE_URL)

function withParams(path: string, params?: Record<string, string | number | undefined | null>) {
  if (!params) return path
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    usp.set(k, String(v))
  }
  const qs = usp.toString()
  return qs ? `${path}?${qs}` : path
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  })

  if (!res.ok) {
    let detail: unknown = await res.text()
    try {
      detail = await res.json()
    } catch {
      // ignore
    }
    throw new Error(`API ${res.status}: ${JSON.stringify(detail)}`)
  }

  return (await res.json()) as T
}

export async function getStats(): Promise<RegistryStats> {
  return apiFetch<RegistryStats>('/api/stats')
}

export async function listModels(params: {
  status?: string
  q?: string
  tag?: string
  name?: string
  limit?: number
  offset?: number
  sort?: string
  order?: string
}): Promise<Model[]> {
  return apiFetch<Model[]>(withParams('/api/models', params))
}

export async function getModel(modelId: number): Promise<Model> {
  return apiFetch<Model>(`/api/models/${modelId}`)
}

export async function getModelMetrics(modelId: number): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>(`/api/models/${modelId}/metrics`)
}

export async function getModelEvents(modelId: number, params?: { limit?: number; offset?: number }): Promise<ModelEvent[]> {
  return apiFetch<ModelEvent[]>(withParams(`/api/models/${modelId}/events`, params))
}

export async function promoteModel(modelId: number, toStatus: string): Promise<Model> {
  return apiFetch<Model>(withParams(`/api/models/${modelId}/promote`, { to_status: toStatus }), { method: 'POST' })
}

export async function getDashboardHealth(): Promise<DashboardHealth> {
  return apiFetch<DashboardHealth>('/health')
}

export async function resolveModelCheckpoint(modelId: number): Promise<ArtifactResolveResponse> {
  return apiFetch<ArtifactResolveResponse>(`/api/models/${modelId}/resolve-checkpoint`, { method: 'POST' })
}

export async function onyxGenerate(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>('/api/onyx/generate', { method: 'POST', body: JSON.stringify(body) })
}

export async function onyxChat(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>('/api/onyx/chat', { method: 'POST', body: JSON.stringify(body) })
}

export async function runEval(body: Record<string, unknown>): Promise<EvalRunResult> {
  return apiFetch<EvalRunResult>('/api/evals/run', { method: 'POST', body: JSON.stringify(body) })
}

export async function listEvalRuns(params?: { limit?: number }): Promise<EvalRunResult[]> {
  return apiFetch<EvalRunResult[]>(withParams('/api/evals/runs', params))
}

export function evalSummaryUrl(evalRunId: string): string {
  return `${API_BASE}/api/evals/runs/${encodeURIComponent(evalRunId)}/summary`
}

export function evalJsonlUrl(evalRunId: string): string {
  return `${API_BASE}/api/evals/runs/${encodeURIComponent(evalRunId)}/jsonl`
}
