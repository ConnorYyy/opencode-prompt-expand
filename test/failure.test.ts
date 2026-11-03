import { describe, expect, it } from "vitest"
import { failureDetail } from "../src/gui/failure.js"

describe("failureDetail", () => {
  it("keeps the RPC code and message", () => {
    expect(failureDetail({ ok: false, code: "timeout", message: "Expansion timed out." })).toBe(
      "[timeout] Expansion timed out.",
    )
  })

  it("returns an empty string for success", () => {
    expect(failureDetail({ ok: true, text: "expanded" })).toBe("")
  })

  it("truncates long provider messages", () => {
    const detail = failureDetail({ ok: false, code: "failed", message: "x".repeat(500) })
    expect(detail.length).toBeLessThanOrEqual(300)
    expect(detail.endsWith("...")).toBe(true)
  })
})
