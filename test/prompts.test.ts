import { describe, expect, it } from "vitest"
import { buildPrompt, matchesGlob, selectPrompt } from "../src/prompts.js"
import { DEFAULT_PROMPTS } from "../src/prompts.js"

describe("matchesGlob", () => {
  it("matches model families", () => {
    expect(matchesGlob("*gpt*", "openai/gpt-5")).toBe(true)
    expect(matchesGlob("*claude*", "anthropic/claude-sonnet-5")).toBe(true)
    expect(matchesGlob("*gpt*", "anthropic/claude-sonnet-5")).toBe(false)
  })
})

describe("selectPrompt", () => {
  it("uses the family prompt when it matches", () => {
    expect(selectPrompt("openai/gpt-5", DEFAULT_PROMPTS)).toBe(DEFAULT_PROMPTS["*gpt*"])
  })

  it("falls back to default", () => {
    expect(selectPrompt("unknown/model", DEFAULT_PROMPTS)).toBe(DEFAULT_PROMPTS.default)
  })
})

describe("buildPrompt", () => {
  it("adds project context and the original text", () => {
    const prompt = buildPrompt({
      text: "帮我加个状态栏",
      mode: "concise",
      structured: false,
      round: 1,
      projectContext: "技术栈：React",
      targetModelID: "openai/gpt-5",
      prompts: DEFAULT_PROMPTS,
    })

    expect(prompt).toContain("【项目上下文】")
    expect(prompt).toContain("【待改写】\n帮我加个状态栏")
    expect(prompt).toContain("简洁模式")
  })

  it("adds regeneration instructions", () => {
    const prompt = buildPrompt({
      text: "帮我加个状态栏",
      mode: "full",
      structured: true,
      previous: "上一版内容",
      round: 2,
      targetModelID: "anthropic/claude-sonnet-5",
      prompts: DEFAULT_PROMPTS,
    })

    expect(prompt).toContain("第 2 次生成")
    expect(prompt).toContain("上一版内容")
    expect(prompt).toContain("轻度润色")
  })
})
