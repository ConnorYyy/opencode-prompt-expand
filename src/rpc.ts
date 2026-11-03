import { Rpc } from "@opencode/plugin/rpc"
import type { OptimizeInput } from "./types.js"

const composerModelSchema = {
  type: "object",
  properties: {
    providerID: { type: "string" },
    modelID: { type: "string" },
    variant: { type: "string" },
  },
  required: ["providerID", "modelID"],
  additionalProperties: false,
} as const

export const PromptExpand = Rpc.define({
  id: "prompt-expand",
  events: {},
  methods: {
    optimize: {
      input: {
        type: "object",
        properties: {
          text: { type: "string" },
          mode: { enum: ["concise", "full"] },
          round: { type: "integer", minimum: 1 },
          previous: { type: "string" },
          sessionID: { type: "string" },
          directory: { type: "string" },
          composerModel: composerModelSchema,
          modelPreference: { type: "string" },
          projectContext: { type: "boolean" },
        },
        required: ["text", "mode", "round"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          text: { type: "string" },
          model: { type: "string" },
          code: { type: "string" },
          message: { type: "string" },
        },
        required: ["ok"],
        additionalProperties: false,
      },
    },
  },
})

export type PromptExpandInput = OptimizeInput
