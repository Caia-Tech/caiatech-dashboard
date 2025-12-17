export type ModelStatus = 'experimental' | 'staging' | 'production' | 'archived'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]

export type Model = {
  id: number
  name: string
  version: string
  status: ModelStatus

  artifact_uri: string
  checkpoint_sha256?: string | null
  checkpoint_size_bytes?: number | null
  config_sha256?: string | null
  config_size_bytes?: number | null

  run_id?: string | null
  git_commit?: string | null
  created_by?: string | null
  source_host?: string | null

  frozen: boolean

  local_checkpoint_path?: string | null
  local_config_path?: string | null

  d_model?: number | null
  n_layers?: number | null
  n_heads?: number | null
  vocab_size?: number | null
  params?: number | null

  training_step?: number | null
  training_loss?: number | null
  dataset?: string | null

  description?: string | null
  tags?: string[] | null
  metrics?: Record<string, JsonValue> | null

  created_at: string
  updated_at: string
}

export type ModelEvent = {
  id: number
  model_id: number
  event_type: string
  payload?: Record<string, JsonValue> | null
  actor?: string | null
  created_at: string
}

export type RegistryStats = {
  total_models: number
  by_status: Record<string, number>
  by_name: Record<string, number>
}

export type ArtifactResolveResponse = {
  artifact_uri: string
  local_path: string
  sha256: string
  size_bytes: number
  cached: boolean
}

export type DashboardHealth = {
  status: string
  registry: {
    url: string
    reachable: boolean
    auth_configured: boolean
    detail: unknown
  }
  artifact_cache: {
    url: string
    reachable: boolean
    auth_configured: boolean
    detail: unknown
  }
  onyx_api: {
    url: string
    reachable: boolean
    auth_configured: boolean
    detail: unknown
  }
  eval: {
    eval_service_dir: string
    eval_service_present: boolean
    eval_runs_dir: string
  }
}

export type EvalRunResult = {
  eval_run_id: string
  suite: string
  model_id: number
  pass_rate: number
  score?: number
  jsonl_path?: string
  summary_path?: string
  started_at?: string
  finished_at?: string
  [k: string]: JsonValue | undefined
}
