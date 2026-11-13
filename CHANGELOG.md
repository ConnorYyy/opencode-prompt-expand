# Changelog

## 0.2.0

- Add an experimental **session outline** panel: user messages on the right, click to scroll, active entry highlight, load-earlier and jump-to-latest controls.
- Add the `outline` option and a settings toggle; it is off by default.
- Add the `prompt-expand.outline` command and a side panel `+` menu entry.
- Enabling the outline opens its tab immediately; the `+` menu entry and command work before the host stores the tab id, and closing the tab keeps it closed.
- Message lookup uses the timeline's `data-message-id` rows and `message-<id>` anchors; a miss shows a toast instead of guessing.
- Unrendered messages are located by bisecting the virtualised timeline's scroll offset, loading a page when the search reaches the oldest loaded message.
- Add tests for title extraction, outline building, and active-row selection.

## 0.1.1

- Fix the npm package README so the English README is primary.
- Move the Chinese README to `docs/README.zh-CN.md`.
- Update the npm install instructions after the first publish.

## 0.1.0

- Initial OpenCode Desktop GUI plugin.
- Expand, regenerate, undo, restore, and version navigation commands.
- Composer pill for mounted sessions.
- Best-effort bottom button and DOM fallback for Home / new-session drafts.
- Settings page for mode, model, and project context.
- Project context from package.json, rule files, and git status.
- OpenAI/Claude-family prompt variants.
- Unit tests and a stubbed GUI smoke test.
