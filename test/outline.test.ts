import { describe, expect, it } from "vitest"
import { buildOutline, inferRowIndexes, messageTitle, pickActiveId } from "../src/gui/outline-data.js"

describe("messageTitle", () => {
  it("uses the first non-empty line", () => {
    expect(messageTitle("\n\n  帮我做一个数据看板  \n更多细节")).toBe("帮我做一个数据看板")
  })

  it("strips markdown markers", () => {
    expect(messageTitle("## 标题")).toBe("标题")
    expect(messageTitle("- 列表项")).toBe("列表项")
    expect(messageTitle("1. 第一项")).toBe("第一项")
    expect(messageTitle("**加粗** 和 `代码`")).toBe("加粗 和 代码")
    expect(messageTitle("[链接](https://example.com)")).toBe("链接")
  })

  it("collapses whitespace and truncates long titles", () => {
    const title = messageTitle(`第一条    很长${"的".repeat(80)}`)
    expect(title.endsWith("…")).toBe(true)
    expect([...title].length).toBeLessThanOrEqual(61)
    expect(title.includes("  ")).toBe(false)
  })

  it("returns an empty title for blank or marker-only input", () => {
    expect(messageTitle("")).toBe("")
    expect(messageTitle("   \n\t")).toBe("")
    expect(messageTitle("###")).toBe("")
  })
})

describe("buildOutline", () => {
  it("keeps only user messages and numbers them", () => {
    const items = buildOutline([
      { id: "m1", type: "user", text: "第一个问题" },
      { id: "m2", type: "assistant", text: "回答" },
      { id: "m3", type: "user", text: "第二个问题" },
    ])

    expect(items).toEqual([
      { id: "m1", title: "第一个问题", position: 1 },
      { id: "m3", title: "第二个问题", position: 2 },
    ])
  })

  it("labels attachment-only messages", () => {
    const items = buildOutline([{ id: "m1", type: "user", text: "" }])
    expect(items[0]?.title).toBe("[附件]")
  })
})

describe("inferRowIndexes", () => {
  const byId = new Map([
    ["m0", 0],
    ["m1", 1],
    ["m2", 2],
    ["m4", 4],
    ["m5", 5],
  ])

  it("keeps matched indexes", () => {
    expect(inferRowIndexes(["m0", "m1", "m2"], byId)).toEqual([0, 1, 2])
  })

  it("fills a row whose id is not in the store", () => {
    expect(inferRowIndexes(["m2", "row-unknown", "m4"], byId)).toEqual([2, 3, 4])
  })

  it("skips duplicate wrapper rows", () => {
    expect(inferRowIndexes(["m2", "m2", "row-unknown", "m4"], byId)).toEqual([2, 3, 4])
  })

  it("leaves rows before the first match unmapped", () => {
    expect(inferRowIndexes(["unknown", "m1"], byId)).toEqual([-1, 1])
  })
})

describe("pickActiveId", () => {  const rows = [
    { id: "a", top: 0, bottom: 40 },
    { id: "b", top: 40, bottom: 80 },
    { id: "c", top: 80, bottom: 120 },
  ]

  it("picks the row closest above the reading line", () => {
    expect(pickActiveId(rows, 10)).toBe("a")
    expect(pickActiveId(rows, 75)).toBe("b")
    expect(pickActiveId(rows, 500)).toBe("c")
  })

  it("falls back to the first mounted row", () => {
    expect(pickActiveId(rows, -50)).toBe("a")
    expect(pickActiveId([], 10)).toBeUndefined()
  })
})
