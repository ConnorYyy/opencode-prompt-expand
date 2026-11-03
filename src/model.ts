import type { ComposerModel, ModelInfoLike, ModelRef } from "./types.js"

export type PickSource = "explicit" | "composer" | "cheap" | "default" | "session"

export type PickResult = {
  model: ModelRef
  source: PickSource
}

export function composerToRef(model: ComposerModel): ModelRef {
  return {
    providerID: model.providerID,
    id: model.modelID,
    ...(model.variant ? { variant: model.variant } : {}),
  }
}

export function modelToRef(model: ModelInfoLike): ModelRef {
  return {
    providerID: model.providerID,
    id: model.id,
  }
}

export function modelLabel(model: ModelRef | ModelInfoLike): string {
  return `${model.providerID}/${model.id}`
}

export function parseExplicitModel(value: string): { providerID: string; id: string } | null {
  const index = value.indexOf("/")
  if (index <= 0 || index === value.length - 1) return null
  return { providerID: value.slice(0, index), id: value.slice(index + 1) }
}

export function findModel(models: ModelInfoLike[], ref: { providerID: string; id: string }): ModelInfoLike | undefined {
  return models.find(
    (model) =>
      model.providerID === ref.providerID && (model.id === ref.id || model.modelID === ref.id),
  )
}

function baseCost(model: ModelInfoLike) {
  if (!model.cost || model.cost.length === 0) return undefined
  return model.cost.find((tier) => !tier.tier) ?? model.cost[0]
}

export function isCheapChat(model: ModelInfoLike): boolean {
  if (model.enabled === false) return false
  if (model.status === "deprecated") return false
  if (model.type && model.type !== "chat") return false
  const cost = baseCost(model)
  if (!cost) return true
  return cost.input < 1 && cost.output < 3
}

function cheapestChat(models: ModelInfoLike[]): ModelInfoLike | undefined {
  return models
    .filter((model) => isCheapChat(model))
    .slice()
    .sort((left, right) => {
      const leftCost = baseCost(left)
      const rightCost = baseCost(right)
      const leftScore = leftCost ? leftCost.input + leftCost.output : 0
      const rightScore = rightCost ? rightCost.input + rightCost.output : 0
      return leftScore - rightScore
    })[0]
}

function anyChat(models: ModelInfoLike[]): ModelInfoLike | undefined {
  return models.find(
    (model) =>
      model.enabled !== false &&
      model.status !== "deprecated" &&
      (!model.type || model.type === "chat"),
  )
}

export type PickModelInput = {
  preference: string
  composerModel?: ComposerModel
  sessionModel?: ModelRef
  models: ModelInfoLike[]
  defaultModel?: ModelInfoLike | null
}

export function pickModel(input: PickModelInput): PickResult | null {
  const preference = input.preference.trim()

  if (preference && preference !== "auto" && preference !== "composer") {
    const explicit = parseExplicitModel(preference)
    if (explicit) {
      const found = findModel(input.models, explicit)
      return { model: found ? modelToRef(found) : explicit, source: "explicit" }
    }
  }

  const composerRef = input.composerModel ? composerToRef(input.composerModel) : undefined

  if (preference === "composer") {
    if (composerRef) return { model: composerRef, source: "composer" }
    if (input.sessionModel) return { model: input.sessionModel, source: "session" }
    if (input.defaultModel) return { model: modelToRef(input.defaultModel), source: "default" }
    const fallback = anyChat(input.models)
    return fallback ? { model: modelToRef(fallback), source: "cheap" } : null
  }

  // auto: composer model first, but avoid expensive models.
  if (composerRef) {
    const info = findModel(input.models, composerRef)
    if (!info || isCheapChat(info)) {
      return { model: composerRef, source: "composer" }
    }
  }

  if (input.sessionModel) {
    const info = findModel(input.models, input.sessionModel)
    if (!info || isCheapChat(info)) {
      return { model: input.sessionModel, source: "session" }
    }
  }

  // With no composer/session model (Home or a draft), the server default is
  // a better guess than the cheapest model: free models often have hard usage
  // limits, which would make the fallback button fail immediately.
  if (input.defaultModel && input.defaultModel.enabled !== false && input.defaultModel.status !== "deprecated") {
    return { model: modelToRef(input.defaultModel), source: "default" }
  }

  const cheap = cheapestChat(input.models)
  if (cheap) return { model: modelToRef(cheap), source: "cheap" }

  const fallback = anyChat(input.models)
  return fallback ? { model: modelToRef(fallback), source: "cheap" } : null
}
