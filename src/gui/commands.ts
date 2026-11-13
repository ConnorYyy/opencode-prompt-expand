import { Command, type SetupContext } from "@opencode/plugin/gui"
import type { Controller } from "./controller.js"
import type { definition } from "./definition.js"
import type { OutlineApi } from "./outline.js"

type Ctx = SetupContext<typeof definition>

export function registerCommands(ctx: Ctx, controller: Controller, outline: OutlineApi): void {
  ctx.add(Command, (): Command => ({
    id: "expand",
    get title() {
      return ctx.t("command.expand")
    },
    get description() {
      return ctx.t("command.expand.desc")
    },
    keywords: "prompt expand enhance rewrite improve",
    section: "prompt",
    slash: { name: "expand", arguments: true },
    run: (input?: string) => {
      void controller.expand(input)
    },
  }))

  ctx.add(Command, (): Command => ({
    id: "regenerate",
    get title() {
      return ctx.t("command.regenerate")
    },
    get description() {
      return ctx.t("command.regenerate.desc")
    },
    keywords: "prompt regenerate rewrite another version",
    section: "prompt",
    run: () => {
      void controller.regenerate()
    },
  }))

  ctx.add(Command, (): Command => ({
    id: "restore",
    get title() {
      return ctx.t("command.restore")
    },
    get description() {
      return ctx.t("command.restore.desc")
    },
    keywords: "prompt restore original undo",
    section: "prompt",
    run: () => controller.restore(),
  }))

  ctx.add(Command, (): Command => ({
    id: "previous",
    get title() {
      return ctx.t("command.previous")
    },
    keywords: "prompt version previous back",
    section: "prompt",
    run: () => controller.previous(),
  }))

  ctx.add(Command, (): Command => ({
    id: "next",
    get title() {
      return ctx.t("command.next")
    },
    keywords: "prompt version next forward",
    section: "prompt",
    run: () => controller.next(),
  }))

  ctx.add(Command, (): Command => ({
    id: "mode",
    get title() {
      return ctx.t("command.mode")
    },
    keywords: "prompt mode concise full",
    section: "prompt",
    run: () => controller.toggleMode(),
  }))

  ctx.add(Command, (): Command => ({
    id: "settings",
    get title() {
      return ctx.t("command.settings")
    },
    keywords: "prompt expand settings options",
    section: "prompt",
    run: () => ctx.layout.settings("prompt-expand"),
  }))

  ctx.add(Command, (): Command => ({
    id: "outline",
    get title() {
      return ctx.t("outline.command")
    },
    get description() {
      return ctx.t("outline.command.desc")
    },
    keywords: "session outline messages jump navigation",
    section: "navigation",
    run: () => outline.toggle(),
  }))
}
