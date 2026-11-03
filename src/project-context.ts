import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { VcsSummary } from "./types.js"

export const RULE_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursorrules",
  ".windsurfrules",
  "CONVENTIONS.md",
  ".github/copilot-instructions.md",
]

const SENSITIVE = /(^|[\\/])(\.env|.*\.pem|.*\.key|credentials.*)$/i

type CacheEntry = { value: string; expires: number }
const cache = new Map<string, CacheEntry>()
const CACHE_MS = 5 * 60 * 1000

export function clearProjectContextCache(): void {
  cache.clear()
}

function truncate(value: string, limit: number): string {
  if (limit <= 0) return ""
  return Array.from(value).slice(0, limit).join("")
}

function isSensitive(path: string): boolean {
  return SENSITIVE.test(path)
}

function packageSummary(packageJson: unknown): string {
  if (!packageJson || typeof packageJson !== "object") return ""
  const data = packageJson as Record<string, unknown>
  const lines: string[] = []
  if (typeof data.name === "string") lines.push(`name: ${data.name}`)
  if (typeof data.description === "string") lines.push(`description: ${data.description}`)

  const dependencies = data.dependencies
  if (dependencies && typeof dependencies === "object" && !Array.isArray(dependencies)) {
    const names = Object.keys(dependencies as Record<string, unknown>)
    if (names.length > 0) lines.push(`dependencies: ${names.join(", ")}`)
  }

  return lines.join("\n")
}

async function readPackageSummary(directory: string): Promise<string> {
  const path = join(directory, "package.json")
  if (isSensitive(path)) return ""
  try {
    const raw = await readFile(path, "utf8")
    return packageSummary(JSON.parse(raw))
  } catch {
    return ""
  }
}

async function readRules(directory: string): Promise<string> {
  const chunks: string[] = []
  for (const file of RULE_FILES) {
    const path = join(directory, file)
    if (isSensitive(path)) continue
    try {
      const content = await readFile(path, "utf8")
      const trimmed = content.trim()
      if (trimmed) chunks.push(`# ${file}\n${trimmed}`)
    } catch {
      // Missing rule file is expected.
    }
  }
  return chunks.join("\n\n")
}

export type ProjectContextParts = {
  packageSummary?: string
  rules?: string
  branch?: string
  files?: string[]
}

export function resolveProjectDirectory(input: {
  sessionDirectory?: string
  requestDirectory?: string
  pluginDirectory?: string
}): string {
  return (
    input.sessionDirectory?.trim() ||
    input.requestDirectory?.trim() ||
    input.pluginDirectory?.trim() ||
    ""
  )
}

export function formatProjectContext(parts: ProjectContextParts, budget: number): string {
  if (budget <= 0) return ""
  const sections: string[] = []

  if (parts.packageSummary?.trim()) {
    sections.push(`- 技术栈：\n${truncate(parts.packageSummary.trim(), 400)}`)
  }

  if (parts.rules?.trim()) {
    sections.push(`- 规则摘要：\n${truncate(parts.rules.trim(), 1200)}`)
  }

  const gitLines: string[] = []
  if (parts.branch) gitLines.push(`- 当前分支：${parts.branch}`)
  if (parts.files && parts.files.length > 0) {
    gitLines.push(`- 改动文件：${parts.files.slice(0, 12).join(", ")}`)
  }
  if (gitLines.length > 0) {
    sections.push(truncate(gitLines.join("\n"), 300))
  }

  return truncate(sections.join("\n"), budget).trim()
}

export async function readProjectContext(
  directory: string,
  budget: number,
  vcs?: VcsSummary,
): Promise<string> {
  if (budget <= 0) return ""

  const files = (vcs?.files ?? []).filter((file) => !file.includes("node_modules/")).slice(0, 12)
  const key = [directory, budget, vcs?.branch ?? "", files.join(",")].join("\0")
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expires > now) return cached.value

  const [packageSummary, rules] = await Promise.all([
    readPackageSummary(directory),
    readRules(directory),
  ])

  const value = formatProjectContext(
    {
      packageSummary,
      rules,
      branch: vcs?.branch,
      files,
    },
    budget,
  )

  cache.set(key, { value, expires: now + CACHE_MS })
  return value
}
