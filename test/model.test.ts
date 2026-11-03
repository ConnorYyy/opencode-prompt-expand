import { describe, expect, it } from "vitest"
import { composerToRef, isCheapChat, parseExplicitModel, pickModel } from "../src/model.js"
import type { ModelInfoLike } from "../src/types.js"

const models: ModelInfoLike[] = [
  {
    id: "expensive",
    providerID: "acme",
    type: "chat",
    cost: [{ input: 15, output: 60 }],
  },
  {
    id: "cheap",
    providerID: "acme",
    type: "chat",
    cost: [{ input: 0.1, output: 0.4 }],
  },
  {
    id: "vision",
    providerID: "acme",
    type: "image",
    cost: [{ input: 0.1, output: 0.4 }],
  },
]

describe("composerToRef", () => {
  it("maps modelID to id", () => {
    expect(composerToRef({ providerID: "openai", modelID: "gpt-5", variant: "high" })).toEqual({
      providerID: "openai",
      id: "gpt-5",
      variant: "high",
    })
  })
})

describe("parseExplicitModel", () => {
  it("parses provider/model", () => {
    expect(parseExplicitModel("openai/gpt-5")).toEqual({ providerID: "openai", id: "gpt-5" })
  })

  it("rejects malformed values", () => {
    expect(parseExplicitModel("gpt-5")).toBeNull()
    expect(parseExplicitModel("/gpt-5")).toBeNull()
  })
})

describe("isCheapChat", () => {
  it("accepts cheap chat models", () => {
    expect(isCheapChat(models[1])).toBe(true)
  })

  it("rejects expensive and non-chat models", () => {
    expect(isCheapChat(models[0])).toBe(false)
    expect(isCheapChat(models[2])).toBe(false)
  })
})

describe("pickModel", () => {
  it("uses an explicit model", () => {
    const result = pickModel({ preference: "acme/cheap", models })
    expect(result?.model).toEqual({ providerID: "acme", id: "cheap" })
    expect(result?.source).toBe("explicit")
  })

  it("uses the composer model when it is cheap", () => {
    const result = pickModel({
      preference: "composer",
      composerModel: { providerID: "acme", modelID: "cheap" },
      models,
    })
    expect(result?.model.id).toBe("cheap")
    expect(result?.source).toBe("composer")
  })

  it("avoids an expensive composer model in auto mode", () => {
    const result = pickModel({
      preference: "auto",
      composerModel: { providerID: "acme", modelID: "expensive" },
      models,
    })
    expect(result?.model.id).toBe("cheap")
    expect(result?.source).toBe("cheap")
  })

  it("falls back to the default model", () => {
    const result = pickModel({
      preference: "auto",
      models: [],
      defaultModel: { id: "default", providerID: "acme", type: "chat" },
    })
    expect(result?.model).toEqual({ providerID: "acme", id: "default" })
  })

  it("prefers the default over a cheap model when there is no composer or session", () => {
    const result = pickModel({
      preference: "auto",
      models,
      defaultModel: { id: "default", providerID: "acme", type: "chat" },
    })
    expect(result?.model).toEqual({ providerID: "acme", id: "default" })
    expect(result?.source).toBe("default")
  })

  it("returns null without any model", () => {
    expect(pickModel({ preference: "auto", models: [] })).toBeNull()
  })
})
