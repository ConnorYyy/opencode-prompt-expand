import type { OptimizeResult } from "../types.js"

export function failureDetail(result: OptimizeResult): string {
  if (result.ok) return ""
  const code = result.code?.trim()
  const message = result.message?.trim()
  const detail = [code ? `[${code}]` : "", message].filter(Boolean).join(" ")
  return detail.length > 300 ? `${detail.slice(0, 297)}...` : detail
}
