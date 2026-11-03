import type { ComposerPillView, SetupContext } from "@opencode/plugin/gui"
import { createStore } from "solid-js/store"
import { resolveConfig } from "../config.js"
import { countChars, shouldSkip } from "../optimizer.js"
import { PromptExpand } from "../rpc.js"
import type { OptimizeResult } from "../types.js"
import type { definition } from "./definition.js"
import { DRAFT_KEY, type DraftComposer, type TargetComposer } from "./draft.js"
import { failureDetail } from "./failure.js"
import { RunStore } from "./state.js"

type Ctx = SetupContext<typeof definition>
type Target = { key: string; composer: TargetComposer; directory?: string }

export type Controller = {
  expand(input?: string, sessionID?: string): Promise<void>
  regenerate(sessionID?: string): Promise<void>
  restore(sessionID?: string): void
  previous(sessionID?: string): void
  next(sessionID?: string): void
  toggleMode(): void
  busy(sessionID: string): boolean
  pill(sessionID: string): ComposerPillView
}

export function createController(ctx: Ctx, draft: DraftComposer): Controller {
  const store = new RunStore(5)
  const [busy, setBusy] = createStore<Record<string, boolean>>({})

  function currentConfig() {
    const prefs = ctx.stores.prefs.value
    const storedModel = prefs.model?.trim()

    // The settings store must not silently override opencode.jsonc with its
    // old default "auto". Empty or "auto" means "use the configured model".
    return resolveConfig(ctx.options as Record<string, unknown>, {
      mode: prefs.mode,
      model: storedModel && storedModel !== "auto" ? storedModel : undefined,
      projectContext: prefs.projectContext,
    })
  }

  function info(titleKey: string, descriptionKey?: string, description?: string) {
    ctx.toast.show({
      title: ctx.t(titleKey),
      ...(descriptionKey ? { description: ctx.t(descriptionKey) } : description ? { description } : {}),
      variant: "default",
    })
  }

  function error(titleKey: string, descriptionKey?: string, detail?: string) {
    const base = descriptionKey ? ctx.t(descriptionKey) : ""
    const extra = detail?.trim().slice(0, 300)
    const description = [base, extra].filter(Boolean).join(" ")
    ctx.toast.show({
      title: ctx.t(titleKey),
      ...(description ? { description } : {}),
      variant: "error",
    })
  }

  function currentDirectory(): string | undefined {
    try {
      const session = ctx.sessions.current()
      if (session?.directory) return session.directory

      const server =
        ctx.servers.get("sidecar") ??
        ctx.servers
          .list()
          .map((id) => ctx.servers.get(id))
          .find((entry) => entry !== undefined)

      return server?.data.location.default().directory
    } catch {
      return undefined
    }
  }

  function target(sessionID?: string): Target | undefined {
    const session = ctx.sessions.current()

    if (session) {
      if (sessionID && sessionID !== session.id) return undefined

      const screen = ctx.screen.current()
      if (!screen) {
        error("toast.noComposer", "toast.noComposerDesc")
        return undefined
      }

      return {
        key: session.id,
        composer: screen.composer,
        directory: currentDirectory(),
      }
    }

    // Home and draft sessions have no official composer API. The bottom
    // "Expand" button is only rendered outside plugin pages; use the DOM
    // adapter there, and never write a draft result into another session.
    if (sessionID && sessionID !== DRAFT_KEY) return undefined
    if (ctx.options.draftFallback === false) {
      error("toast.noComposer", "toast.noComposerDesc")
      return undefined
    }
    const path = ctx.router.path()
    if (path.startsWith("/settings") || path.startsWith("/plugins")) {
      error("toast.noComposer", "toast.noComposerDesc")
      return undefined
    }
    if (!draft.available()) {
      error("toast.noComposer", "toast.noComposerDesc")
      return undefined
    }

    return { key: DRAFT_KEY, composer: draft.composer, directory: currentDirectory() }
  }

  function notifySkip(reason: string | undefined, notify: boolean) {
    if (!notify) return
    if (reason === "too_short") {
      info("toast.tooShort")
      return
    }
    if (reason === "mention") {
      info("toast.mention")
    }
  }

  function undo(sessionID: string, written: string, original: string) {
    const current = target(sessionID)
    if (!current || current.key !== sessionID) return

    if (current.composer.text() !== written) {
      info("toast.edited")
      return
    }

    try {
      current.composer.setText(original)
      current.composer.focus()
      store.clear(sessionID)
      ctx.toast.show({ title: ctx.t("toast.restored"), variant: "success" })
    } catch {
      error("toast.failed", "toast.failedDesc")
    }
  }

  async function expand(input?: string, sessionID?: string): Promise<void> {
    const current = target(sessionID)
    if (!current) return
    if (busy[current.key]) return

    const config = currentConfig()
    const hasInput = typeof input === "string" && input.trim().length > 0
    const text = hasInput ? input!.trim() : current.composer.text()

    if (!text.trim()) return

    const decision = shouldSkip(text, config)
    if (decision.skip) {
      notifySkip(decision.reason, decision.notify)
      return
    }

    const run = hasInput
      ? store.start(current.key, text)
      : store.sync(current.key, current.composer.text())

    let round = 1
    let previous: string | undefined

    if (!hasInput && run.versions.length > 0 && current.composer.text() === run.versions[run.index]) {
      round = run.versions.length + 1
      previous = run.versions[run.index]
    }

    if (round > config.maxRounds) {
      info("toast.limit")
      return
    }

    setBusy(current.key, true)
    try {
      const result = (await ctx.client.rpc(PromptExpand).optimize({
        text,
        mode: config.mode,
        round,
        ...(previous ? { previous } : {}),
        ...(current.key !== DRAFT_KEY ? { sessionID: current.key } : {}),
        ...(current.directory ? { directory: current.directory } : {}),
        ...(current.composer.model() ? { composerModel: current.composer.model() } : {}),
        modelPreference: config.model,
        projectContext: config.projectContext,
      })) as OptimizeResult

      if (!result.ok) {
        const detail = failureDetail(result)
        console.error("[prompt-expand] optimize failed:", detail)
        if (result.code === "no_model") {
          error("toast.noModel", "toast.noModelDesc", detail)
        } else {
          error("toast.failed", "toast.failedDesc", detail)
        }
        return
      }

      current.composer.setText(result.text)
      current.composer.focus()
      store.push(current.key, run.original, result.text)

      const before = countChars(run.original)
      const after = countChars(result.text)
      ctx.toast.show({
        title: ctx.t("toast.expanded"),
        description: `${before} → ${after} ${ctx.t("toast.chars")}`,
        variant: "success",
        duration: 10_000,
        actions: [
          {
            label: ctx.t("action.undo"),
            run: () => undo(current.key, result.text, run.original),
          },
          {
            label: ctx.t("action.regenerate"),
            run: () => void expand(undefined, current.key),
          },
        ],
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      console.error("[prompt-expand] expand failed:", message)
      error("toast.failed", "toast.failedDesc", message)
    } finally {
      setBusy(current.key, false)
    }
  }

  function regenerate(sessionID?: string): Promise<void> {
    return expand(undefined, sessionID)
  }

  function restore(sessionID?: string): void {
    const current = target(sessionID)
    if (!current) return

    const run = store.get(current.key)
    if (!run || run.versions.length === 0) {
      info("toast.noVersions")
      return
    }

    if (current.composer.text() !== run.versions[run.index]) {
      info("toast.edited")
      return
    }

    try {
      current.composer.setText(run.original)
      current.composer.focus()
      store.clear(current.key)
      ctx.toast.show({ title: ctx.t("toast.restored"), variant: "success" })
    } catch {
      error("toast.failed", "toast.failedDesc")
    }
  }

  function step(delta: -1 | 1, sessionID?: string): void {
    const current = target(sessionID)
    if (!current) return

    const run = store.sync(current.key, current.composer.text())
    if (run.versions.length === 0) {
      info("toast.noVersions")
      return
    }

    const next = run.index + delta
    if (next < 0 || next >= run.versions.length) {
      info("toast.noVersions")
      return
    }

    const text = run.versions[next]
    try {
      current.composer.setText(text)
      current.composer.focus()
      store.setIndex(current.key, next)
    } catch {
      error("toast.failed", "toast.failedDesc")
    }
  }

  function toggleMode(): void {
    const configured = ctx.options.mode === "full" ? "full" : "concise"
    const current = ctx.stores.prefs.value.mode ?? configured
    const next = current === "concise" ? "full" : "concise"
    ctx.stores.prefs.update((draft) => {
      draft.mode = next
    })
    info(next === "concise" ? "toast.modeConcise" : "toast.modeFull")
  }

  function isBusy(sessionID: string): boolean {
    return busy[sessionID] === true
  }

  function pill(sessionID: string): ComposerPillView {
    if (isBusy(sessionID)) {
      return { label: ctx.t("pill.expanding"), tone: "success" }
    }
    return {
      label: ctx.t("pill.expand"),
      run: () => void expand(undefined, sessionID),
    }
  }

  return {
    expand,
    regenerate,
    restore,
    previous: (sessionID?: string) => step(-1, sessionID),
    next: (sessionID?: string) => step(1, sessionID),
    toggleMode,
    busy: isBusy,
    pill,
  }
}
