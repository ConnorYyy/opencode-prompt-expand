import { DEFAULT_PROMPTS } from "./prompts.js"
import type { Mode, PluginOptions } from "./types.js"

export type Config = {
  model: string
  mode: Mode
  maxRounds: number
  timeoutMs: number
  maxGrowth: number
  minChars: number
  maxPromptChars: number
  skipPatterns: RegExp[]
  skipOnMentions: boolean
  projectContext: boolean
  projectContextBudget: number
  draftFallback: boolean
  prompts: Record<string, string>
}

export type ConfigOverrides = {
  mode?: Mode
  model?: string
  projectContext?: boolean
}

export const DEFAULT_SKIP_PATTERNS: RegExp[] = [
  /^\s*(git|npm|pnpm|yarn|bun|docker|kubectl|ls|cd|cat|curl)\b/i,
  /^\s*[\/!]/,
  /^(继续|好的|收到|谢谢|可以|ok|okay|yes|no|go|continue|thanks?)[。.!！]?$/i,
  /^\s*[\d\W]{1,3}\s*$/,
]

export const DEFAULT_CONFIG: Config = {
  model: "auto",
  mode: "concise",
  maxRounds: 5,
  timeoutMs: 30000,
  maxGrowth: 5,
  minChars: 10,
  maxPromptChars: 6000,
  skipPatterns: DEFAULT_SKIP_PATTERNS,
  skipOnMentions: true,
  projectContext: true,
  projectContextBudget: 2048,
  draftFallback: true,
  prompts: DEFAULT_PROMPTS,
}

function numberOption(value: unknown, fallback: number, min: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.floor(value))
}

function booleanOption(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

function compilePatterns(value: unknown): RegExp[] {
  if (!Array.isArray(value)) return DEFAULT_SKIP_PATTERNS
  const patterns: RegExp[] = []
  for (const entry of value) {
    if (typeof entry !== "string") continue
    try {
      patterns.push(new RegExp(entry, "i"))
    } catch {
      // Invalid user pattern: ignore it rather than breaking plugin setup.
    }
  }
  return patterns
}

function mergePrompts(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_PROMPTS
  const merged: Record<string, string> = { ...DEFAULT_PROMPTS }
  for (const [key, prompt] of Object.entries(value)) {
    if (typeof prompt === "string" && prompt.trim()) merged[key] = prompt
  }
  return merged
}

export function resolveConfig(options: PluginOptions = {}, overrides: ConfigOverrides = {}): Config {
  const mode = overrides.mode ?? options.mode
  const model = overrides.model ?? options.model
  const projectContext = overrides.projectContext ?? options.projectContext

  return {
    model: typeof model === "string" && model.trim() ? model.trim() : DEFAULT_CONFIG.model,
    mode: mode === "full" ? "full" : "concise",
    maxRounds: numberOption(options.maxRounds, DEFAULT_CONFIG.maxRounds, 1),
    timeoutMs: numberOption(options.timeoutMs, DEFAULT_CONFIG.timeoutMs, 500),
    maxGrowth: numberOption(options.maxGrowth, DEFAULT_CONFIG.maxGrowth, 1),
    minChars: numberOption(options.minChars, DEFAULT_CONFIG.minChars, 1),
    maxPromptChars: numberOption(options.maxPromptChars, DEFAULT_CONFIG.maxPromptChars, 1),
    skipPatterns: compilePatterns(options.skipPatterns),
    skipOnMentions: booleanOption(options.skipOnMentions, DEFAULT_CONFIG.skipOnMentions),
    projectContext: booleanOption(projectContext, DEFAULT_CONFIG.projectContext),
    projectContextBudget: numberOption(
      options.projectContextBudget,
      DEFAULT_CONFIG.projectContextBudget,
      0,
    ),
    draftFallback: booleanOption(options.draftFallback, DEFAULT_CONFIG.draftFallback),
    prompts: mergePrompts(options.prompts),
  }
}
