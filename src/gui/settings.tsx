import { SettingsPage, usePlugin, type SetupContext } from "@opencode/plugin/gui"
import type { definition } from "./definition.js"

type Ctx = SetupContext<typeof definition>

const row: Record<string, string | number> = {
  display: "flex",
  "flex-direction": "column",
  gap: "6px",
  "margin-bottom": "20px",
  "max-width": "560px",
}

const label: Record<string, string | number> = {
  "font-size": "13px",
  "font-weight": "600",
}

const help: Record<string, string | number> = {
  "font-size": "12px",
  opacity: "0.65",
}

const control: Record<string, string | number> = {
  "font-size": "13px",
  padding: "6px 8px",
  "border-radius": "6px",
  border: "1px solid rgba(127, 127, 127, 0.35)",
  background: "transparent",
  color: "inherit",
}

function Settings() {
  const ctx = usePlugin<typeof definition>()
  const prefs = ctx.stores.prefs

  return (
    <div style={{ padding: "8px 0" }}>
      <h2 style={{ "font-size": "16px", "margin-bottom": "8px" }}>{ctx.t("settings.title")}</h2>
      <p style={help}>{ctx.t("settings.description")}</p>

      <div style={row}>
        <span style={label}>{ctx.t("settings.mode")}</span>
        <select
          style={control}
          value={prefs.value.mode ?? "concise"}
          onChange={(event) => {
            const mode = event.currentTarget.value === "full" ? "full" : "concise"
            prefs.update((draft) => {
              draft.mode = mode
            })
          }}
        >
          <option value="concise">{ctx.t("settings.mode.concise")}</option>
          <option value="full">{ctx.t("settings.mode.full")}</option>
        </select>
      </div>

      <div style={row}>
        <span style={label}>{ctx.t("settings.model")}</span>
        <input
          style={control}
          value={prefs.value.model ?? ""}
          spellcheck={false}
          onInput={(event) => {
            const model = event.currentTarget.value
            prefs.update((draft) => {
              draft.model = model
            })
          }}
        />
        <span style={help}>{ctx.t("settings.model.help")}</span>
      </div>

      <div style={row}>
        <label style={{ ...label, display: "flex", "align-items": "center", gap: "8px" }}>
          <input
            type="checkbox"
            checked={prefs.value.projectContext ?? true}
            onChange={(event) => {
              const enabled = event.currentTarget.checked
              prefs.update((draft) => {
                draft.projectContext = enabled
              })
            }}
          />
          {ctx.t("settings.projectContext")}
        </label>
        <span style={help}>{ctx.t("settings.projectContext.help")}</span>
      </div>

      <p style={help}>{ctx.t("settings.note")}</p>
    </div>
  )
}

export function createSettingsPage(ctx: Ctx): SettingsPage {
  return {
    id: "prompt-expand",
    get title() {
      return ctx.t("settings.title")
    },
    get entries() {
      return [
        {
          id: "prompt-expand",
          title: ctx.t("settings.title"),
          description: ctx.t("settings.description"),
        },
      ]
    },
    render: () => <Settings />,
  }
}
