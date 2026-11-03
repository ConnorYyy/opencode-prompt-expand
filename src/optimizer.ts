import type { Config } from "./config.js"

export type SkipReason =
  | "empty"
  | "command"
  | "too_short"
  | "too_long"
  | "confirmation"
  | "pattern"
  | "mention"

export type SkipDecision = {
  skip: boolean
  reason?: SkipReason
  notify: boolean
  structured: boolean
}

const STRUCTURE_MARKERS = [/目标/, /范围/, /要求/, /验收/]

const CONFIRMATION = /^(继续|好的|收到|谢谢|可以|ok|okay|yes|no|go|continue|thanks?)[。.!！]?$/i
const MENTION = /(^|\s)@[\w./\\-]{2,}/

export function detectMention(text: string): boolean {
  return MENTION.test(text)
}

export function countStructureMarkers(text: string): number {
  return STRUCTURE_MARKERS.filter((pattern) => pattern.test(text)).length
}

export function hasStructure(text: string): boolean {
  return countStructureMarkers(text) >= 3
}

export function shouldSkip(text: string, config: Config): SkipDecision {
  const trimmed = text.trim()
  const structured = hasStructure(trimmed)

  if (!trimmed) return { skip: true, reason: "empty", notify: false, structured }
  if (/^\s*[\/!]/.test(trimmed)) {
    return { skip: true, reason: "command", notify: false, structured }
  }
  if (CONFIRMATION.test(trimmed)) {
    return { skip: true, reason: "confirmation", notify: false, structured }
  }
  if (countChars(trimmed) < config.minChars) {
    return { skip: true, reason: "too_short", notify: true, structured }
  }
  if (countChars(trimmed) > config.maxPromptChars) {
    return { skip: true, reason: "too_long", notify: false, structured }
  }
  if (config.skipPatterns.some((pattern) => pattern.test(trimmed))) {
    return { skip: true, reason: "pattern", notify: false, structured }
  }
  if (config.skipOnMentions && detectMention(trimmed)) {
    return { skip: true, reason: "mention", notify: true, structured }
  }

  return { skip: false, notify: false, structured }
}

export function countChars(text: string): number {
  return Array.from(text).length
}

function stripCodeFences(text: string): string {
  if (!text.includes("```")) return text
  return text
    .replace(/^\s*```[^\n]*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .replace(/^\s*```[^\n]*$/gm, "")
    .trim()
}

function stripLeadingLabel(text: string): string {
  return text.replace(
    /^(优化后的提示词|增强后的提示词|改写后的提示词|增强结果|优化结果|expanded prompt|optimized prompt)\s*[:：]\s*/i,
    "",
  )
}

function stripWrappingQuotes(text: string): string {
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"],
    ["「", "」"],
    ["『", "』"],
  ]
  for (const [open, close] of pairs) {
    if (text.startsWith(open) && text.endsWith(close) && text.length >= open.length + close.length) {
      return text.slice(open.length, -close.length).trim()
    }
  }
  return text
}

export function cleanOutput(text: string): string {
  let result = text.trim()
  result = stripCodeFences(result)
  result = stripLeadingLabel(result)
  result = stripWrappingQuotes(result)
  return result.trim()
}

export type Validation = { ok: true } | { ok: false; reason: "empty" | "unchanged" | "too_large" }

export function validateOutput(output: string, original: string, config: Config): Validation {
  const cleaned = output.trim()
  if (!cleaned) return { ok: false, reason: "empty" }
  if (cleaned === original.trim()) return { ok: false, reason: "unchanged" }
  if (countChars(cleaned) > countChars(original) * config.maxGrowth && countChars(cleaned) > 2000) {
    return { ok: false, reason: "too_large" }
  }
  return { ok: true }
}
