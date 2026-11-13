export type OutlineSource = {
  id: string
  type: string
  text?: string
}

export type OutlineItem = {
  id: string
  title: string
  /** 1-based position among the user turns. */
  position: number
}

export type RowBox = {
  id: string
  top: number
  bottom: number
}

const MAX_TITLE = 60
const ATTACHMENT_ONLY = "[附件]"

/**
 * Turns the first meaningful line of a user message into a short title.
 * Markdown markers are stripped so the panel reads like a table of contents
 * rather than raw source.
 */
export function messageTitle(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.length > 0)

  if (!line) return ""

  const title = line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`{1,3}/g, "")
    .replace(/\*\*|__|~~/g, "")
    .replace(/\s+/g, " ")
    .trim()

  if (!title) return ""

  const chars = [...title]
  if (chars.length <= MAX_TITLE) return title
  return `${chars.slice(0, MAX_TITLE).join("").trimEnd()}…`
}

/**
 * Maps rendered row ids to outline indexes, inferring a gap from the matched
 * neighbours. The timeline can render a row whose `data-message-id` differs
 * from the store id, which otherwise leaves a hole in the mapping.
 */
export function inferRowIndexes(
  rowIds: readonly string[],
  byId: ReadonlyMap<string, number>,
): number[] {
  const result: number[] = []
  let expected = -1
  let lastId = ""

  for (const rowId of rowIds) {
    if (!rowId || rowId === lastId) continue
    lastId = rowId

    const mapped = byId.get(rowId)
    const inferred = mapped ?? (expected >= 0 ? expected + 1 : -1)
    result.push(inferred)
    expected = inferred
  }

  return result
}

/** The position of the closest index, preferring the next turn over the previous one. */
export function nearestPosition(indexes: readonly number[], target: number): number {
  let after = -1
  let afterDiff = Number.POSITIVE_INFINITY
  let before = -1
  let beforeDiff = Number.POSITIVE_INFINITY

  for (let position = 0; position < indexes.length; position += 1) {
    const value = indexes[position]
    if (value === undefined || value < 0) continue

    const diff = value - target
    if (diff >= 0 && diff < afterDiff) {
      after = position
      afterDiff = diff
    }
    if (diff < 0 && -diff < beforeDiff) {
      before = position
      beforeDiff = -diff
    }
  }

  return after >= 0 ? after : before
}

/** Lists the user turns of a session in order. */
export function buildOutline(messages: readonly OutlineSource[]): OutlineItem[] {
  const items: OutlineItem[] = []

  for (const message of messages) {
    if (message.type !== "user") continue

    const title = messageTitle(message.text ?? "")
    items.push({
      id: message.id,
      title: title || ATTACHMENT_ONLY,
      position: items.length + 1,
    })
  }

  return items
}

/**
 * The message whose row is closest above the reading line. Rows must be
 * sorted top to bottom, as the timeline renders them.
 */
export function pickActiveId(rows: readonly RowBox[], line: number): string | undefined {
  let active: string | undefined

  for (const row of rows) {
    if (row.top <= line) active = row.id
    else break
  }

  return active ?? rows[0]?.id
}
