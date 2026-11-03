import { ComposerPill, type ComposerPillProps, type SetupContext } from "@opencode/plugin/gui"
import type { Controller } from "./controller.js"
import type { definition } from "./definition.js"

type Ctx = SetupContext<typeof definition>

export function createPill(ctx: Ctx, controller: Controller) {
  return {
    id: "expand",
    show: (input: ComposerPillProps) => controller.pill(input.session.id),
  }
}
