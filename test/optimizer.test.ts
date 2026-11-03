import { describe, expect, it } from "vitest"
import { resolveConfig } from "../src/config.js"
import {
  cleanOutput,
  countStructureMarkers,
  detectMention,
  shouldSkip,
  validateOutput,
} from "../src/optimizer.js"

const config = resolveConfig({})

describe("shouldSkip", () => {
  it("skips empty input silently", () => {
    const result = shouldSkip("   ", config)
    expect(result.skip).toBe(true)
    expect(result.notify).toBe(false)
  })

  it("skips short input with a notice", () => {
    const result = shouldSkip("跑一下测试", config)
    expect(result.skip).toBe(true)
    expect(result.reason).toBe("too_short")
    expect(result.notify).toBe(true)
  })

  it("skips commands silently", () => {
    expect(shouldSkip("/expand something", config).reason).toBe("command")
    expect(shouldSkip("!ls", config).reason).toBe("command")
  })

  it("skips confirmation words", () => {
    expect(shouldSkip("继续", config).reason).toBe("confirmation")
  })

  it("detects mentions but not email addresses", () => {
    expect(detectMention("看下 @src/app.ts")).toBe(true)
    expect(detectMention("发到 a@b.com")).toBe(false)
  })

  it("notifies on mentions", () => {
    const result = shouldSkip("请检查 @src/app.ts 的实现", config)
    expect(result.skip).toBe(true)
    expect(result.reason).toBe("mention")
    expect(result.notify).toBe(true)
  })

  it("allows a normal prompt through", () => {
    const result = shouldSkip("把用户模块的登录态改成 JWT", config)
    expect(result.skip).toBe(false)
  })

  it("allows an empty user skip pattern list", () => {
    const custom = resolveConfig({ skipPatterns: [] })
    expect(custom.skipPatterns).toHaveLength(0)
  })
})

describe("structure markers", () => {
  it("counts target/scope/requirements/acceptance", () => {
    expect(countStructureMarkers("目标：A 范围：B 要求：C 验收：D")).toBe(4)
  })
})

describe("cleanOutput", () => {
  it("strips code fences", () => {
    expect(cleanOutput("```md\n目标：做一个看板\n```")).toBe("目标：做一个看板")
  })

  it("strips leading labels and quotes", () => {
    expect(cleanOutput("优化后的提示词：\n“目标：做一个看板”")).toBe("目标：做一个看板")
  })
})

describe("validateOutput", () => {
  it("rejects empty output", () => {
    expect(validateOutput("   ", "原文", config).ok).toBe(false)
  })

  it("rejects unchanged output", () => {
    expect(validateOutput("原文", "原文", config).ok).toBe(false)
  })

  it("rejects extreme growth", () => {
    const original = "做一个看板"
    const output = "内容".repeat(1200)
    expect(validateOutput(output, original, config).ok).toBe(false)
  })

  it("accepts a reasonable expansion", () => {
    expect(validateOutput("目标：做一个数据看板，包含筛选和导出。", "帮我做个数据看板", config).ok).toBe(
      true,
    )
  })
})
