import {
  Command,
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
import { buildOutline, inferRowIndexes, pickActiveId, type OutlineItem, type OutlineSource } from "./outline-data.js"

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
function normalizeText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase()
}

/**
 * Rows are in visual order, so an unmatched row (a delivered message whose row
 * id differs from the store id, common for queued or attachment-only prompts)
 * can be inferred from its matched neighbours.
 */
function rowByIndex(
  scroller: HTMLElement,
  index: number,
  items: readonly OutlineItem[],
): HTMLElement | null {
  if (index < 0) return null

  const byId = new Map(items.map((item, position) => [item.id, position]))
  const rows: HTMLElement[] = []
  const ids: string[] = []
  let lastId = ""

  for (const row of scroller.querySelectorAll<HTMLElement>("[data-message-id]")) {
    const rowId = row.dataset.messageId ?? ""
    if (!rowId || rowId === lastId) continue
    lastId = rowId
    rows.push(row)
    ids.push(rowId)
  }

  const position = inferRowIndexes(ids, byId).indexOf(index)
  return position >= 0 ? (rows[position] ?? null) : null
}

/**
 * The host renders every timeline row with `data-message-id` and gives it the
 * `message-<id>` anchor. Neither is a public API, and a message can carry an id
 * that differs from the row's, so a title match is the last resort.
 */
function findMessageRow(
  id: string,
  root?: HTMLElement | null,
  title?: string,
): HTMLElement | null {
  if (typeof document === "undefined") return null

  const selector = `#message-${cssEscape(id)}, [data-message-id="${cssEscape(id)}"]`
  const scope = root ?? timelineScroller()

  if (scope) {
    const found = scope.querySelector<HTMLElement>(selector)
    if (found) return found
  } else {
    const found = document.querySelector<HTMLElement>(selector)
    if (found) return found
  }

  if (!title) return null

  const probe = normalizeText(title).slice(0, 12)
  if (probe.length < 4) return null

  const candidates = scope ?? document
  for (const row of candidates.querySelectorAll<HTMLElement>("[data-message-id]")) {
    if (normalizeText(row.innerText).includes(probe)) return row
  }

  return null
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

function scrollAncestors(element: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = []
  let node = element.parentElement

  while (node) {
    const style = getComputedStyle(node)
    const overflow = `${style.overflowY}`
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) {
      result.push(node)
    }
    node = node.parentElement
  }

  return result
}

/**
 * The timeline scroller is the scrollable ancestor that holds the most message
 * rows. Taking the nearest one can land on a nested overflow container, such as
 * a code block inside a single message.
 */
function timelineScroller(): HTMLElement | null {
  const candidates = new Set<HTMLElement>()
  for (const row of visibleRows()) {
    for (const node of scrollAncestors(row)) candidates.add(node)
  }

  let best: HTMLElement | null = null
  let bestRows = 0

  for (const candidate of candidates) {
    const rows = candidate.querySelectorAll("[data-message-id]").length
    if (rows > bestRows) {
      best = candidate
      bestRows = rows
    }
  }

  return best ?? (candidates.size > 0 ? [...candidates][0]! : null)
}

function scrollToRow(element: HTMLElement): void {
  const timeline = timelineScroller()
  const scroller = timeline?.contains(element) ? timeline : (scrollAncestors(element)[0] ?? null)

  if (!scroller) {
    element.scrollIntoView({ block: "center", behavior: "auto" })
    return
  }

  const rootBox = scroller.getBoundingClientRect()
  const rowBox = element.getBoundingClientRect()
  const sticky = scroller.querySelector<HTMLElement>("[data-session-title]")
  const inset = sticky?.offsetHeight ?? 0
  const top = Math.max(0, rowBox.top - rootBox.top + scroller.scrollTop - inset - 8)

  // Instant rather than smooth: the host's follow logic can cancel a smooth
  // scroll that is still animating, and a navigation jump should be reliable.
  scroller.scrollTo({ top, behavior: "auto" })

  requestAnimationFrame(() => {
    const afterBox = element.getBoundingClientRect()
    const viewBox = scroller.getBoundingClientRect()
    if (afterBox.top < viewBox.top || afterBox.bottom > viewBox.bottom) {
      element.scrollIntoView({ block: "center", behavior: "auto" })
    }
  })
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

  const notMounted = (detail?: string) => {
    const description = [ctx.t("outline.notMountedDesc"), detail].filter(Boolean).join(" ")
    ctx.toast.show({
      title: ctx.t("outline.notMounted"),
      description,
      variant: "default",
    })
  }

  /**
   * The timeline renders only a window of rows, so an older message can be in
   * the store without an element. Prefer the app's own "previous/next message"
   * commands, which unpin auto-follow and reveal the target for us; fall back to
   * bisecting the virtualised scroll offset when those commands are unavailable.
   */
  const reveal = async (id: string): Promise<{ ok: boolean; detail: string }> => {
    const scroller = timelineScroller()
    if (!scroller) return { ok: false, detail: "no scroller" }

    const message = props.session.server.data.session.message
    const sessionID = props.session.id

    const indexOfId = () => items().findIndex((item) => item.id === id)
  const titleOf = () => items().find((item) => item.id === id)?.title ?? ""
  const title = titleOf()
  const locate = () =>
    findMessageRow(id, scroller, title) ?? rowByIndex(scroller, indexOfId(), items())

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

    const detail = () => {
      const rendered = renderedIndices()
      const range = rendered.length
        ? `${Math.min(...rendered)}-${Math.max(...rendered)}`
        : "none"
      const label = String(scroller.className).trim().split(/\s+/)[0] || scroller.tagName
      return `target ${indexOfId()}, rendered ${range}, steps ${stepped}, scroll ${Math.round(
        scroller.scrollTop,
      )}/${Math.round(scroller.scrollHeight - scroller.clientHeight)}, ${label}`
    }

    const currentIndex = () => {
      const byId = new Map(items().map((item, index) => [item.id, index]))
      const line = scroller.getBoundingClientRect().top + 100
      const rows = [...scroller.querySelectorAll<HTMLElement>("[data-message-id]")]
        .map((row) => {
          const box = row.getBoundingClientRect()
          return { id: row.dataset.messageId ?? "", top: box.top, bottom: box.bottom }
        })
        .filter((row) => row.id)
        .sort((left, right) => left.top - right.top)

      let activeId: string | undefined
      for (const row of rows) {
        if (row.top <= line) activeId = row.id
        else break
      }

      const found = activeId ?? rows[0]?.id
      const index = found ? byId.get(found) : undefined
      return index ?? -1
    }

    const hostStep = (direction: 1 | -1) =>
      ctx.commands.run(direction < 0 ? "message.previous" : "message.next")

    const targetIndex = indexOfId()
    const fromIndex = currentIndex()
    let stepped = 0

    if (targetIndex >= 0) {
      let direction: 1 | -1 = fromIndex >= 0 && targetIndex > fromIndex ? 1 : -1
      let lastMin = Number.NaN
      let lastMax = Number.NaN
      let stalled = 0

      for (let step = 0; step < 80; step += 1) {
        if (locate()) break

        const rendered = renderedIndices()
        if (rendered.length > 0) {
          const min = Math.min(...rendered)
          const max = Math.max(...rendered)

          if (targetIndex < min) direction = -1
          else if (targetIndex > max) direction = 1

          // Several commands can land on the same position while the timeline
          // settles, so stop only when the rendered window stops moving.
          if (min === lastMin && max === lastMax) stalled += 1
          else stalled = 0
          lastMin = min
          lastMax = max
          if (stalled > 6) break
        }

        if (!hostStep(direction)) break
        stepped += 1

        // The host reveals and scrolls asynchronously; give it time to settle
        // before deciding the next direction.
        await nextFrame()
        await nextFrame()
      }

      const row = locate()
      if (row) {
        scrollToRow(row)
        setActive(id)
        return { ok: true, detail: "" }
      }
    }

    let lower = 0
    let upper = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    let pages = 0

    for (let step = 0; step < 18; step += 1) {
      const row = locate()
      if (row) {
        scrollToRow(row)
        setActive(id)
        return { ok: true, detail: "" }
      }

      const target = indexOfId()
      if (target < 0) return { ok: false, detail: "not in outline" }

      const rendered = renderedIndices()
      if (rendered.length === 0) return { ok: false, detail: detail() }

      const min = Math.min(...rendered)
      const max = Math.max(...rendered)

      if (target < min) {
        upper = Math.min(upper, scroller.scrollTop)

        if (upper <= lower) {
          if (pages >= 8 || !message.more(sessionID)) return { ok: false, detail: detail() }
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
        if (lower >= upper) return { ok: false, detail: detail() }
      } else {
        // The target index is rendered but no row carries its id.
        return { ok: false, detail: detail() }
      }

      scroller.scrollTo({ top: (lower + upper) / 2, behavior: "auto" })
      await nextFrame()
    }

    return { ok: false, detail: detail() }
  }

  const jump = async (id: string) => {
    if (busy()) return

    const scroller = timelineScroller()
    const title = items().find((item) => item.id === id)?.title
    const index = items().findIndex((item) => item.id === id)
    const row =
      (scroller ? findMessageRow(id, scroller, title) : findMessageRow(id, undefined, title)) ??
      (scroller ? rowByIndex(scroller, index, items()) : null)
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
      const result = await reveal(id)
      if (!result.ok) notMounted(result.detail)
    } catch {
      notMounted("exception")
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

/** A compact report for bug reports: message ids, rendered rows, and the scroller. */
export function outlineDiagnostics(ctx: Ctx): string {
  const session = ctx.sessions.current()
  if (!session) return "no routed session"

  const messages = session.server.data.session.message.list(
    session.id,
  ) as unknown as readonly OutlineSource[]
  const items = buildOutline(messages)
  const scroller = timelineScroller()
  const rows = [...document.querySelectorAll<HTMLElement>("[data-message-id]")]
  const ids = rows.map((row) => row.dataset.messageId ?? "").filter(Boolean)
  const known = new Set(items.map((item) => item.id))
  const matched = ids.filter((id) => known.has(id))
  const scoped = scroller
    ? [...scroller.querySelectorAll<HTMLElement>("[data-message-id]")]
        .map((row) => row.dataset.messageId ?? "")
        .filter(Boolean)
    : []

  let canScroll = false
  if (scroller) {
    const before = scroller.scrollTop
    scroller.scrollTop = Math.max(0, before - 40)
    canScroll = scroller.scrollTop !== before
    scroller.scrollTop = before
  }

  const candidates = new Set<HTMLElement>()
  for (const row of visibleRows()) {
    for (const node of scrollAncestors(row)) candidates.add(node)
  }

  return JSON.stringify(
    {
      app: ctx.app.version,
      platform: ctx.app.platform,
      session: session.id,
      outlineCount: items.length,
      outlineSample: items.slice(0, 3).map((item) => item.id),
      dom: {
        rows: rows.length,
        matched: matched.length,
        first: ids.slice(0, 3),
        last: ids.slice(-3),
      },
      scroller: scroller
        ? {
            tag: scroller.tagName,
            class: String(scroller.className).slice(0, 120),
            overflowY: getComputedStyle(scroller).overflowY,
            scrollTop: Math.round(scroller.scrollTop),
            scrollHeight: scroller.scrollHeight,
            clientHeight: scroller.clientHeight,
            scopedRows: scoped.length,
            canScroll,
          }
        : null,
      candidates: [...candidates].map((node) => ({
        tag: node.tagName,
        class: String(node.className).slice(0, 80),
        rows: node.querySelectorAll("[data-message-id]").length,
        scrollTop: Math.round(node.scrollTop),
        maxScroll: Math.round(node.scrollHeight - node.clientHeight),
      })),
      anchors: items.slice(0, 3).map((item) => ({
        id: item.id,
        found: Boolean(findMessageRow(item.id, scroller)),
      })),
    },
    null,
    2,
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

  ctx.add(Command, {
    id: "outline.diagnostics",
    get title() {
      return ctx.t("outline.diagnostics")
    },
    keywords: "outline session diagnostics debug copy",
    section: "navigation",
    run: async () => {
      const text = outlineDiagnostics(ctx)
      try {
        await ctx.system.copy(text)
        ctx.toast.show({
          title: ctx.t("outline.diagnostics.copied"),
          description: ctx.t("outline.diagnostics.copiedDesc"),
          variant: "success",
        })
      } catch {
        ctx.toast.show({
          title: ctx.t("outline.diagnostics"),
          description: text.slice(0, 300),
          variant: "error",
        })
      }
    },
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

