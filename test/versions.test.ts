import { describe, expect, it } from "vitest"
import { RunStore } from "../src/gui/state.js"

describe("RunStore", () => {
  it("resets when the composer text changes", () => {
    const store = new RunStore(5)
    store.start("s1", "original")
    store.push("s1", "original", "v1")

    const run = store.sync("s1", "edited")
    expect(run.original).toBe("edited")
    expect(run.versions).toEqual([])
  })

  it("keeps the run while the text matches the written version", () => {
    const store = new RunStore(5)
    store.start("s1", "original")
    store.push("s1", "original", "v1")

    const run = store.sync("s1", "v1")
    expect(run.original).toBe("original")
    expect(run.versions).toEqual(["v1"])
  })

  it("keeps at most five versions", () => {
    const store = new RunStore(5)
    store.start("s1", "original")
    for (let index = 1; index <= 6; index += 1) {
      store.push("s1", "original", `v${index}`)
    }

    const run = store.get("s1")
    expect(run?.versions).toEqual(["v2", "v3", "v4", "v5", "v6"])
    expect(run?.index).toBe(4)
    expect(run?.original).toBe("original")
  })

  it("navigates versions", () => {
    const store = new RunStore(5)
    store.start("s1", "original")
    store.push("s1", "original", "v1")
    store.push("s1", "original", "v2")

    expect(store.setIndex("s1", 0)?.index).toBe(0)
    expect(store.setIndex("s1", 2)).toBeUndefined()
  })
})
