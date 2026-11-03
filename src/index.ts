import { Plugin } from "@opencode/plugin"
import { resolveConfig } from "./config.js"
import { buildPrompt } from "./prompts.js"
import { cleanOutput, shouldSkip, validateOutput } from "./optimizer.js"
import { pickModel } from "./model.js"
import { readProjectContext, resolveProjectDirectory } from "./project-context.js"
import { PromptExpand } from "./rpc.js"
import type { ModelInfoLike, ModelRef, OptimizeInput, OptimizeResult, VcsSummary } from "./types.js"

class TimeoutError extends Error {
  constructor() {
    super("timeout")
    this.name = "TimeoutError"
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function readVcs(ctx: any, directory: string): Promise<VcsSummary | undefined> {
  try {
    const input = { location: { directory } }
    const info = await ctx.vcs.get(input)
    const status = await ctx.vcs.status(input)
    return {
      branch: info?.data?.branch?.current,
      files: Array.isArray(status?.data) ? status.data.map((file: any) => file.file) : [],
    }
  } catch {
    return undefined
  }
}

function modelRefFromSession(session: any): ModelRef | undefined {
  const model = session?.model
  if (!model?.providerID || !model?.id) return undefined
  return {
    providerID: model.providerID,
    id: model.id,
    ...(model.variant ? { variant: model.variant } : {}),
  }
}

export default Plugin.define({
  id: "prompt-expand",
  async setup(ctx) {
    const registration = await ctx.rpc.register(PromptExpand, {
      optimize: async (raw, rpcContext): Promise<OptimizeResult> => {
        const input = raw as OptimizeInput
        const config = resolveConfig(ctx.options, {
          mode: input.mode,
          model: input.modelPreference,
          projectContext: input.projectContext,
        })

        const decision = shouldSkip(input.text, config)
        if (decision.skip) {
          return {
            ok: false,
            code: decision.reason ?? "skipped",
            message: decision.reason ?? "skipped",
          }
        }

        let session: any
        try {
          if (input.sessionID) session = await ctx.session.get({ sessionID: input.sessionID })
        } catch {
          session = undefined
        }

        let models: ModelInfoLike[] = []
        let defaultModel: ModelInfoLike | null = null
        try {
          const listed = (await ctx.model.list()) as unknown as
            | ModelInfoLike[]
            | { data?: ModelInfoLike[] }
          models = Array.isArray(listed) ? listed : Array.isArray(listed?.data) ? listed.data : []

          const selected = (await ctx.model.default()) as unknown as
            | ModelInfoLike
            | { data?: ModelInfoLike | null }
            | null
          defaultModel =
            selected && "data" in selected
              ? (selected.data ?? null)
              : (selected as ModelInfoLike | null)
        } catch {
          models = []
          defaultModel = null
        }

        const sessionModel = modelRefFromSession(session)
        const picked = pickModel({
          preference: config.model,
          composerModel: input.composerModel,
          sessionModel,
          models,
          defaultModel,
        })

        if (!picked) {
          return {
            ok: false,
            code: "no_model",
            message: "No connected chat model is available.",
          }
        }

        let projectContext = ""
        if (config.projectContext) {
          const directory = resolveProjectDirectory({
            sessionDirectory: session?.location?.directory,
            requestDirectory: input.directory,
            pluginDirectory: ctx.location?.directory,
          })

          if (directory) {
            const vcs = await readVcs(ctx, directory)
            try {
              projectContext = await readProjectContext(
                directory,
                config.projectContextBudget,
                vcs,
              )
            } catch {
              projectContext = ""
            }
          }
        }

        const targetModelID = input.composerModel?.modelID ?? sessionModel?.id
        const prompt = buildPrompt({
          text: input.text,
          mode: config.mode,
          structured: decision.structured,
          previous: input.previous,
          round: input.round,
          projectContext,
          targetModelID,
          prompts: config.prompts,
        })

        try {
          const generated = await withTimeout(
            ctx.experimental.generate.text({
              model: picked.model,
              prompt,
            }),
            config.timeoutMs,
          )

          const cleaned = cleanOutput(generated.text)
          const validation = validateOutput(cleaned, input.text, config)
          if (!validation.ok) {
            return {
              ok: false,
              code: `invalid_${validation.reason}`,
              message: "The generated prompt did not pass validation.",
            }
          }

          return {
            ok: true,
            text: cleaned,
            model: `${picked.model.providerID}/${picked.model.id}`,
          }
        } catch (error) {
          if (rpcContext?.signal?.aborted) {
            return { ok: false, code: "aborted", message: "Request aborted." }
          }
          if (error instanceof TimeoutError) {
            return { ok: false, code: "timeout", message: "Expansion timed out." }
          }
          const message = error instanceof Error ? error.message : String(error)
          console.error("[prompt-expand] generate failed:", message)
          return { ok: false, code: "failed", message: `Expansion failed: ${message}` }
        }
      },
    })

    return () => registration.dispose()
  },
})
