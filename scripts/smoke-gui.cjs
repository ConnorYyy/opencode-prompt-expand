/*
 * Runtime smoke test for the built GUI bundle without the Electron host.
 * It stubs the host modules, runs plugin setup, and exercises the expand flow.
 */
const Module = require("node:module")
const path = require("node:path")

const registered = []
const toasts = []
const rpcInputs = []

const commandToken = { kind: "command" }
const pillToken = { kind: "pill" }
const settingsToken = { kind: "settings" }
const slotToken = { kind: "slot" }
const panelToken = { kind: "panel" }
const menuToken = { kind: "menu" }
const styleToken = { kind: "style" }
const hostStub = {
  Command: commandToken,
  ComposerPill: pillToken,
  SettingsPage: settingsToken,
  Slot: slotToken,
  Panel: panelToken,
  MenuItem: menuToken,
  Style: styleToken,
  Plugin: { define: (value) => value },
  Store: {
    global: (schema, initial) => ({ scope: "global", schema, initial }),
    session: (schema, initial) => ({ scope: "session", schema, initial }),
  },
  usePlugin: () => null,
}

const webStub = {
  template: () => ({}),
  delegateEvents: () => {},
  insert: () => {},
  setAttribute: () => {},
  effect: () => {},
  createComponent: () => null,
}

const storeStub = {
  createStore: (initial) => {
    const state = { ...initial }
    const set = (key, value) => {
      if (typeof key === "function") key(state)
      else state[key] = value
    }
    return [state, set]
  },
}

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === "@opencode/plugin/gui") return hostStub
  if (request === "@opencode/plugin/rpc") return { Rpc: { define: (value) => value } }
  if (request === "solid-js/web") return webStub
  if (request === "solid-js/store") return storeStub
  return originalLoad.call(this, request, parent, isMain)
}

const plugin = require(path.join(__dirname, "..", "dist", "gui-experimental.cjs")).default

let composerText = "帮我做一个数据看板，包含筛选和导出"
const prefs = { mode: "concise", model: "auto", projectContext: false }

const composer = {
  text: () => composerText,
  setText: (value) => {
    composerText = value
  },
  focus: () => {},
  model: () => ({ providerID: "opencode-go", modelID: "deepseek-v4.1-flash" }),
}

const ctx = {
  options: { model: "opencode-go/deepseek-v4.1-flash" },
  t: (key) => key,
  toast: {
    show: (options) => {
      toasts.push(options)
      return { dismiss: () => {} }
    },
  },
  sessions: { current: () => ({ id: "ses_test", key: "ses_test", directory: "D:/example-project" }) },
  screen: { current: () => ({ composer }) },
  stores: {
    prefs: {
      value: prefs,
      update: (mutate) => mutate(prefs),
      set: (value) => Object.assign(prefs, value),
    },
  },
  client: {
    rpc: () => ({
      optimize: async (input) => {
        rpcInputs.push(input)
        return { ok: true, text: input.round === 1 ? "EXPANDED_V1" : `EXPANDED_V${input.round}` }
      },
    }),
  },
  layout: {
    settings: () => {},
    toggle: () => {},
    open: () => {},
    state: () => "closed",
  },
  add: (token, item) => {
    const value = typeof item === "function" ? item() : item
    registered.push({ token, value })
  },
}

plugin.setup(ctx)

const commands = registered.filter((entry) => entry.token === commandToken).map((entry) => entry.value)
const pill = registered.find((entry) => entry.token === pillToken)?.value
const settings = registered.find((entry) => entry.token === settingsToken)?.value
const slot = registered.find((entry) => entry.token === slotToken)?.value
const panel = registered.find((entry) => entry.token === panelToken)?.value

function command(id) {
  const found = commands.find((entry) => entry.id === id)
  if (!found) throw new Error(`missing command: ${id}`)
  return found
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

async function main() {
  if (commands.length !== 8) throw new Error(`expected 8 commands, got ${commands.length}`)
  if (!pill || pill.id !== "expand") throw new Error("missing composer pill")
  if (!settings || settings.id !== "prompt-expand") throw new Error("missing settings page")
  if (!slot || slot.at !== "window.bottom" || typeof slot.render !== "function") {
    throw new Error("missing draft fallback slot")
  }
  if (!panel || panel.id !== "outline" || panel.region !== "side") {
    throw new Error("missing session outline panel")
  }

  const menu = registered.find((entry) => entry.token === menuToken)?.value
  if (!menu || menu.id !== "outline" || menu.menu !== "session.panel") {
    throw new Error("missing session outline menu item")
  }

  const panelInput = { session: { key: "ses_test", id: "ses_test" }, screen: {}, open: [] }
  if (panel.list(panelInput).length !== 0) throw new Error("outline should be off by default")

  prefs.outline = true
  if (panel.list(panelInput).length !== 0) {
    throw new Error("outline should only list a stored tab")
  }

  const outlineTabs = panel.list({ ...panelInput, open: ["outline"] })
  if (outlineTabs.length !== 1 || outlineTabs[0].id !== "outline") {
    throw new Error("outline panel did not list its stored tab once enabled")
  }

  // The + menu must be able to open the tab before the host stores its id.
  menu.run()
  if (panel.list({ ...panelInput, open: [] }).length !== 1) {
    throw new Error("outline menu item did not request the tab")
  }

  prefs.outline = false
  if (panel.list({ ...panelInput, open: ["outline"] }).length !== 0) {
    throw new Error("disabling the outline should hide its tab")
  }

  await command("expand").run()
  await tick()
  if (composerText !== "EXPANDED_V1") throw new Error(`unexpected text: ${composerText}`)
  if (rpcInputs[0].round !== 1) throw new Error("first run should be round 1")
  if (rpcInputs[0].composerModel.providerID !== "opencode-go") {
    throw new Error("composer model was not forwarded")
  }
  if (rpcInputs[0].projectContext !== false) throw new Error("prefs.projectContext was not forwarded")
  if (rpcInputs[0].modelPreference !== "opencode-go/deepseek-v4.1-flash") {
    throw new Error(`settings default overrode the configured model: ${rpcInputs[0].modelPreference}`)
  }

  await command("regenerate").run()
  await tick()
  if (composerText !== "EXPANDED_V2") throw new Error(`unexpected v2 text: ${composerText}`)
  if (rpcInputs[1].round !== 2) throw new Error("regenerate should be round 2")
  if (rpcInputs[1].previous !== "EXPANDED_V1") throw new Error("previous version was not forwarded")

  const undo = toasts.at(-1).actions.find((action) => action.label === "action.undo")
  undo.run()
  if (composerText !== "帮我做一个数据看板，包含筛选和导出") {
    throw new Error(`undo failed: ${composerText}`)
  }

  const idlePill = pill.show({ session: { id: "ses_test" }, screen: { composer } })
  if (idlePill.label !== "pill.expand" || typeof idlePill.run !== "function") {
    throw new Error("pill should be an expand action when idle")
  }

  console.log("GUI smoke test passed")
  console.log(JSON.stringify({ commands: commands.map((entry) => entry.id), rpcInputs, toasts }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
