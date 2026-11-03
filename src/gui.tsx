import { ComposerPill, Plugin, SettingsPage, Slot } from "@opencode/plugin/gui"
import { Show } from "solid-js"
import { registerCommands } from "./gui/commands.js"
import { createController } from "./gui/controller.js"
import { definition } from "./gui/definition.js"
import { createDraftComposer, DRAFT_KEY } from "./gui/draft.js"
import { createPill } from "./gui/pill.js"
import { createSettingsPage } from "./gui/settings.js"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const draft = createDraftComposer()
  const controller = createController(ctx, draft)

  registerCommands(ctx, controller)
  ctx.add(ComposerPill, createPill(ctx, controller))
  ctx.add(SettingsPage, createSettingsPage(ctx))

  // Home and draft sessions have no official composer API, so the session
  // ComposerPill never renders there. This bottom strip is the fallback entry:
  // it is visible only when there is no mounted session, and uses the DOM
  // adapter in gui/draft.ts.
  ctx.add(Slot, {
    at: "window.bottom",
    render: () => (
      <Show
        when={
          !ctx.screen.current() &&
          !ctx.router.path().startsWith("/settings") &&
          !ctx.router.path().startsWith("/plugins")
        }
      >
        <div
          style={{
            display: "flex",
            "justify-content": "center",
            padding: "6px 0",
          }}
        >
          <button
            type="button"
            disabled={controller.busy(DRAFT_KEY)}
            onClick={() => void controller.expand()}
            style={{
              "font-size": "13px",
              padding: "5px 12px",
              "border-radius": "999px",
              border: "1px solid rgba(127, 127, 127, 0.35)",
              background: "transparent",
              color: "inherit",
              cursor: controller.busy(DRAFT_KEY) ? "default" : "pointer",
              opacity: controller.busy(DRAFT_KEY) ? 0.65 : 1,
            }}
          >
            {controller.busy(DRAFT_KEY) ? ctx.t("pill.expanding") : ctx.t("pill.expand")}
          </button>
        </div>
      </Show>
    ),
  })
}

export default Plugin.define({
  ...definition,
  setup,
})
