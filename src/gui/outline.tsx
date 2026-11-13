import {
  MenuItem,
  Panel,
  Style,
  usePlugin,
  type PanelProps,
  type PanelTab,
  type SetupContext,
} from "@opencode/plugin/gui"
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { definition } from "./definition.js"
import { buildOutline, pickActiveId, type OutlineSource } from "./outline-data.js"

type Ctx = SetupContext<typeof definition>

export type OutlineApi = {
  enabled(): boolean
  toggle(): void
}

const PANEL_ID = "outline"

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
function findMessageRow(id: string): HTMLElement | null {
  if (typeof document === "undefined") return null

  const selector = `#message-${cssEscape(id)}, [data-message-id="${cssEscape(id)}"]`
  const scroller = timelineScroller()
  const scoped = scroller?.querySelector<HTMLElement>(selector)
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

  const jump = async (id: string) => {
    const row = findMessageRow(id)
    if (row) {
      scrollToRow(row)
      setActive(id)
      return
    }

    if (!hasMore() || busy()) {
      notMounted()
      return
    }

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

      const loaded = findMessageRow(id)
      if (loaded) {
        scrollToRow(loaded)
        setActive(id)
        return
      }

      notMounted()
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

    ctx.layout.toggle(`${ctx.id}:${PANEL_ID}`, current)
  }

  const tab: PanelTab = {
    id: PANEL_ID,
    get title() {
      return ctx.t("outline.title")
    },
    closable: "hover",
  }

  ctx.add(Style, CSS)

  ctx.add(MenuItem, () =>
    enabled()
      ? {
          menu: "session.panel" as const,
          id: PANEL_ID,
          title: ctx.t("outline.menu"),
          icon: "bullet-list" as const,
          run: toggle,
        }
      : undefined,
  )

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
    list: () => (enabled() ? [tab] : []),
    render: (props) => <OutlineView {...props} />,
  })

  return { enabled, toggle }
}

