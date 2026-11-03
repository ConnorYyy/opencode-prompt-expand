import type { ComposerModel } from "../types.js"

export const DRAFT_KEY = "__prompt_expand_draft__"

export type TargetComposer = {
  text(): string
  setText(text: string): void
  focus(): void
  model(): ComposerModel | undefined
}

export type DraftComposer = {
  composer: TargetComposer
  available(): boolean
}

function isEditable(element: HTMLElement): boolean {
  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly
  }
  if (element instanceof HTMLInputElement) {
    return (element.type === "text" || element.type === "") && !element.disabled && !element.readOnly
  }
  return element.isContentEditable
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const style = window.getComputedStyle(element)
  return style.visibility !== "hidden" && style.display !== "none"
}

/**
 * The official composer API is undefined on Home and on a draft session.
 * The draft composer is still a DOM editor, so this adapter finds the
 * bottom-most visible editor and reads/writes it. It is intentionally only
 * used when `ctx.screen.current()` is undefined.
 */
function findEditor(): HTMLElement | null {
  if (typeof document === "undefined") return null

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('textarea, input, [contenteditable="true"]'),
  )
    .filter((element) => isEditable(element) && isVisible(element))
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.bottom > window.innerHeight * 0.35)
    .sort((left, right) => right.rect.bottom - left.rect.bottom)

  return candidates[0]?.element ?? null
}

function read(element: HTMLElement | null): string {
  if (!element) return ""
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value
  }
  return element.innerText ?? element.textContent ?? ""
}

function write(element: HTMLElement | null, text: string): void {
  if (!element || !element.isConnected) throw new Error("No draft composer found")

  element.focus()

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set
    if (setter) setter.call(element, text)
    else element.value = text

    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }))
    element.setSelectionRange(text.length, text.length)
    return
  }

  const selection = window.getSelection()
  if (selection) {
    const range = document.createRange()
    range.selectNodeContents(element)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  const inserted = document.execCommand("insertText", false, text)
  if (!inserted) {
    element.textContent = text
    element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, inputType: "insertText", data: text }))
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }))
  }

  if (!element.isConnected) throw new Error("Draft composer disappeared during write")
  element.focus()
}

export function createDraftComposer(): DraftComposer {
  const composer: TargetComposer = {
    text: () => read(findEditor()),
    setText: (text: string) => write(findEditor(), text),
    focus: () => findEditor()?.focus(),
    model: () => undefined,
  }

  return {
    composer,
    available: () => findEditor() !== null,
  }
}
