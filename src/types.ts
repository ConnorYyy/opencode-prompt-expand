export type Mode = "concise" | "full"

export type ModelRef = {
  providerID: string
  id: string
  variant?: string
}

export type ComposerModel = {
  providerID: string
  modelID: string
  variant?: string
}

export type ModelInfoLike = {
  id: string
  modelID?: string
  providerID: string
  name?: string
  type?: string
  enabled?: boolean
  status?: string
  cost?: Array<{
    tier?: { type: "context"; size: number }
    input: number
    output: number
    cache?: { read: number; write: number }
  }>
}

export type VcsSummary = {
  branch?: string
  files?: string[]
}

export type OptimizeInput = {
  text: string
  mode: Mode
  round: number
  previous?: string
  sessionID?: string
  directory?: string
  composerModel?: ComposerModel
  modelPreference?: string
  projectContext?: boolean
}

export type OptimizeResult =
  | { ok: true; text: string; model?: string }
  | { ok: false; code: string; message: string }

export type Run = {
  original: string
  versions: string[]
  index: number
}

export type PluginOptions = Record<string, unknown>
