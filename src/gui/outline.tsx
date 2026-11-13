import {
  MenuItem,
  Panel,
  Style,
  usePlugin,
  type PanelProps,
  type PanelTab,
  type SessionRef,
  type SetupContext,
} from "@opencode/plugin/gui"
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { definition } from "./definition.js"
import { buildOutline, pickActiveId, type OutlineSource } from "./outline-data.js"

type Ctx = SetupContext<typeof definition>

export type OutlineApi = {
  enabled(): boolean
  toggle(): void
  open(): void
}

const PANEL_ID = "outline"

// The host stores a tab id only for a tab its panel lists, and list() is the
// source of truth. Remember requested opens so the first one works before the
// id is stored; closing a tab forgets it. Keyed by plugin and session.
const requested = new Set<string>()

function requestKey(ctx: Ctx, session: { key: string }): string {
  return `${ctx.id}:${session.key}`
}

/** Opens the outline tab for a session, regardless of where the host stores it. */
export function requestOutlineOpen(ctx: Ctx, session: SessionRef): void {
  requested.add(requestKey(ctx, session))
  ctx.layout.open(`${ctx.id}:${PANEL_ID}`, session, { tab: "select" })
}

const CSS = `
.okpe-outline{display:flex;flex-direction:column;height:100%;font-size:12px}
.okpe-outline__head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-bottom:1px solid rgba(127,127,127,.18)}
.okpe-outline__count{opacity:.6;font-variant-numeric:tabular-nums}
.okpe-outline__actions{display:flex;gap:4px}
.okpe-outline__action{font:inherit;font-size:11px;padding:2px 6px;border-radius:5px;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;cursor:pointer}
.okpe-outline__action:disabled{opacity:.5;cursor:default}
.okpe-outline__list{flex:1;overflow:auto;padding:4px}
.okpe-outline__empty{opacity:.6;padding:8px;margin:0}
.okpe-outline__item{display:flex;gap:6px;width:100%;text-align:left;padding:5px 6px;border-radius:6px;border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;line-height:1.35}
.okpe-outline__item:hover{background:rgba(127,127,127,.12)}
.okpe-outline__item[aria-current="true"]{background:rgba(127,127,127,.18)}
.okpe-outline__pos{opacity:.45;min-width:1.5em;text-align:right;font-variant-numeric:tabular-nums}
.okpe-outline__title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`.trim()

function cssEscape(value: string): string {
  const escape = (globalThis as { CSS?: { escape?: (input: string) => string } }).CSS?.escape
  return escape ? escape(value) : value.replace(/["\\]/g, "\\$&")
}

/**
 * The host renders every timeline row with `data-message-id` and gives it the
 * `message-<id>` anchor. Neither is a public API, so both lookups are tried and
 * a miss degrades to a toast instead of a wrong scroll.
 */
function findMessageRow(id: string, root?: HTMLElement | null): HTMLElement | null {
  if (typeof document === "undefined") return null

  const selector = `#message-${cssEscape(id)}, [data-message-id="${cssEscape(id)}"]`
  const scoped = (root ?? timelineScroller())?.querySelector<HTMLElement>(selector)
  if (scoped) return scoped

  return document.querySelector<HTMLElement>(selector)
}

function visibleRows(): HTMLElement[] {
  if (typeof document === "undefined") return []

  const rows = [...document.querySelectorAll<HTMLElement>("[data-message-id]")].filter(
    (row) => row.getClientRects().length > 0,
  )

  // A cached timeline stays mounted while hidden, so prefer rows that are
  // actually on screen and fall back to anything laid out.
  const onScreen = rows.filter((row) => {
    const box = row.getBoundingClientRect()
    return box.bottom > 0 && box.top < window.innerHeight
  })

  return onScreen.length > 0 ? onScreen : rows
}

function scrollParent(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement

  while (node) {
    const style = getComputedStyle(node)
    const overflow = `${style.overflowY}`
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }

  return null
}

function timelineScroller(): HTMLElement | null {
  const row = visibleRows()[0]
  return row ? scrollParent(row) : null
}

function scrollToRow(element: HTMLElement): void {
  const scroller = scrollParent(element)

  if (!scroller) {
    element.scrollIntoView({ block: "center", behavior: "smooth" })
    return
  }

  const rootBox = scroller.getBoundingClientRect()
  const rowBox = element.getBoundingClientRect()
  const sticky = scroller.querySelector<HTMLElement>("[data-session-title]")
  const inset = sticky?.offsetHeight ?? 0
  const top = Math.max(0, rowBox.top - rootBox.top + scroller.scrollTop - inset - 8)

  scroller.scrollTo({ top, behavior: "smooth" })
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

function OutlineView(props: PanelProps) {
  const ctx = usePlugin<typeof definition>()
  const [active, setActive] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)

  const items = createMemo(() => {
    const session = props.session
    const messages = session.server.data.session.message.list(
      session.id,
    ) as unknown as readonly OutlineSource[]

    return buildOutline(messages)
  })

  const count = createMemo(() => items().length)

  const hasMore = () => {
    try {
      return props.session.server.data.session.message.more(props.session.id)
    } catch {
      return false
    }
  }

  let detach: (() => void) | undefined
  let retryFrame = 0

  const bindScroll = (attempt = 0) => {
    detach?.()
    detach = undefined
    if (retryFrame) cancelAnimationFrame(retryFrame)
    retryFrame = 0

    const scroller = timelineScroller()
    if (!scroller) {
      if (attempt < 10) retryFrame = requestAnimationFrame(() => bindScroll(attempt + 1))
      return
    }

    let frame = 0

    const update = () => {
      frame = 0
      const rootBox = scroller.getBoundingClientRect()
      const line = rootBox.top + 100
      const rows = [...scroller.querySelectorAll<HTMLElement>("[data-message-id]")]
        .map((row) => {
          const box = row.getBoundingClientRect()
          return { id: row.dataset.messageId ?? "", top: box.top, bottom: box.bottom }
        })
        .filter((row) => row.id)
        .sort((left, right) => left.top - right.top)

      setActive(pickActiveId(rows, line))
    }

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }

    scroller.addEventListener("scroll", onScroll, { passive: true })
    update()

    detach = () => {
      scroller.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }

  // A cached timeline stays mounted while hidden, so re-bind when the routed
  // session changes, when the first rows appear, and after the panel's paint.
  createEffect(() => {
    props.session.id
    count()
    const frame = requestAnimationFrame(bindScroll)
    onCleanup(() => cancelAnimationFrame(frame))
  })

  onCleanup(() => {
    detach?.()
    if (retryFrame) cancelAnimationFrame(retryFrame)
  })

  const notMounted = () => {
    ctx.toast.show({
      title: ctx.t("outline.notMounted"),
      description: ctx.t("outline.notMountedDesc"),
      variant: "default",
    })
  }

  /**
   * The timeline renders only a window of rows, so an older message can be in
   * the store without an element. Binary-search the scroll offset: compare the
   * outline indices of the rendered rows with the target and move to the middle
   * of the range that is still unchecked. When the search reaches the top and
   * more history exists, load a page and restart.
   */
  const reveal = async (id: string): Promise<boolean> => {
    const scroller = timelineScroller()
    if (!scroller) return false

    const message = props.session.server.data.session.message
    const sessionID = props.session.id

    const indexOfId = () => items().findIndex((item) => item.id === id)

    const renderedIndices = () => {
      const byId = new Map(items().map((item, index) => [item.id, index]))
      const indices: number[] = []

      for (const row of scroller.querySelectorAll<HTMLElement>("[data-message-id]")) {
        const rowId = row.dataset.messageId
        if (!rowId) continue
        const index = byId.get(rowId)
        if (index !== undefined) indices.push(index)
      }

      return indices
    }

    let lower = 0
    let upper = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    let pages = 0

    for (let step = 0; step < 18; step += 1) {
      const row = findMessageRow(id, scroller)
      if (row) {
        scrollToRow(row)
        setActive(id)
        return true
      }

      const target = indexOfId()
      if (target < 0) return false

      const rendered = renderedIndices()
      if (rendered.length === 0) return false

      const min = Math.min(...rendered)
      const max = Math.max(...rendered)

      if (target < min) {
        upper = Math.min(upper, scroller.scrollTop)

        if (upper <= lower) {
          if (pages >= 8 || !message.more(sessionID)) return false
          pages += 1
          await message.loadMore(sessionID, { signal: ctx.signal })
          await nextFrame()
          lower = 0
          upper = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
          scroller.scrollTo({ top: 0, behavior: "auto" })
          await nextFrame()
          continue
        }
      } else if (target > max) {
        lower = Math.max(lower, scroller.scrollTop)
        if (lower >= upper) return false
      } else {
        // The target index is rendered but no row carries its id.
        return false
      }

      scroller.scrollTo({ top: (lower + upper) / 2, behavior: "auto" })
      await nextFrame()
    }

    return false
  }

  const jump = async (id: string) => {
    if (busy()) return

    const row = findMessageRow(id)
    if (row) {
      scrollToRow(row)
      setActive(id)
      return
    }

    setBusy(true)
    const handle = ctx.toast.show({
      title: ctx.t("outline.locating"),
      variant: "loading",
      persistent: true,
    })

    try {
      if (!(await reveal(id))) notMounted()
    } catch {
      notMounted()
    } finally {
      handle.dismiss()
      setBusy(false)
    }
  }

  const loadEarlier = async () => {
    if (!hasMore() || busy()) return

    setBusy(true)
    const handle = ctx.toast.show({
      title: ctx.t("outline.loading"),
      variant: "loading",
      persistent: true,
    })

    try {
      await props.session.server.data.session.message.loadMore(props.session.id, {
        signal: ctx.signal,
      })
      await nextFrame()
      bindScroll()
    } catch {
      // Keep the button usable; a failed page is not worth a second toast.
    } finally {
      handle.dismiss()
      setBusy(false)
    }
  }

  const jumpToLatest = () => {
    const scroller = timelineScroller()
    if (!scroller) return
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" })
  }

  return (
    <div class="okpe-outline">
      <div class="okpe-outline__head">
        <span class="okpe-outline__count">{count()}</span>
        <div class="okpe-outline__actions">
          <Show when={hasMore()}>
            <button
              type="button"
              class="okpe-outline__action"
              disabled={busy()}
              onClick={() => void loadEarlier()}
            >
              {ctx.t("outline.more")}
            </button>
          </Show>
          <button type="button" class="okpe-outline__action" onClick={jumpToLatest}>
            {ctx.t("outline.latest")}
          </button>
        </div>
      </div>

      <div class="okpe-outline__list">
        <Show
          when={count() > 0}
          fallback={<p class="okpe-outline__empty">{ctx.t("outline.empty")}</p>}
        >
          <For each={items()}>
            {(item) => (
              <button
                type="button"
                class="okpe-outline__item"
                title={item.title}
                aria-current={active() === item.id ? "true" : undefined}
                onClick={() => void jump(item.id)}
              >
                <span class="okpe-outline__pos">{item.position}</span>
                <span class="okpe-outline__title">{item.title}</span>
              </button>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

export function registerOutline(ctx: Ctx): OutlineApi {
  const enabled = () => ctx.stores.prefs.value.outline ?? ctx.options.outline === true

  const session = () => ctx.sessions.current()

  const toggle = () => {
    const current = session()
    if (!current) {
      ctx.toast.show({ title: ctx.t("outline.noSession"), variant: "default" })
      return
    }

    if (!enabled()) {
      ctx.toast.show({
        title: ctx.t("outline.disabled"),
        description: ctx.t("outline.disabledDesc"),
        variant: "default",
      })
      return
    }

    const key = `${ctx.id}:${PANEL_ID}`
    if (ctx.layout.state(key, current) === "closed") requested.add(requestKey(ctx, current))
    ctx.layout.toggle(key, current)
  }

  const open = () => {
    const current = session()
    if (!current) {
      ctx.toast.show({ title: ctx.t("outline.noSession"), variant: "default" })
      return
    }

    if (!enabled()) {
      ctx.toast.show({
        title: ctx.t("outline.disabled"),
        description: ctx.t("outline.disabledDesc"),
        variant: "default",
      })
      return
    }

    requestOutlineOpen(ctx, current)
  }

  const tab: PanelTab = {
    id: PANEL_ID,
    get title() {
      return ctx.t("outline.title")
    },
    closable: "hover",
  }

  ctx.add(Style, CSS)

  // Always present: the registry keeps the item the plugin contributed at
  // setup, so a conditional item would never appear after enabling the panel.
  ctx.add(MenuItem, {
    menu: "session.panel",
    id: PANEL_ID,
    get title() {
      return ctx.t("outline.menu")
    },
    icon: "bullet-list",
    run: open,
  })

  ctx.add(Panel, {
    id: PANEL_ID,
    region: "side",
    mobile: {
      kind: "drawer",
      get title() {
        return ctx.t("outline.title")
      },
      icon: "bullet-list",
      order: 20,
    },
    list: (input) =>
      enabled() &&
      (input.open.includes(PANEL_ID) || requested.has(requestKey(ctx, input.session)))
        ? [tab]
        : [],
    render: (props) => <OutlineView {...props} />,
    close: (props) => {
      requested.delete(requestKey(ctx, props.session))
    },
  })

  return { enabled, toggle, open }
}

