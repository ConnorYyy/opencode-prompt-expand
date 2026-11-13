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
