# Prompt expansion evaluation

Use these 10 drafts to check whether the expansion preserves the original goal while adding scope, constraints, output, and acceptance criteria.

Run each draft through the pill or `/expand`, then score it:

- **Goal preserved** — no new task, no narrowed task
- **Scope added** — what is in and out
- **Constraints added** — only facts the user already supplied or clearly implied
- **Output specified** — format/structure/length
- **Acceptance specified** — how “done” is judged
- **No invented stack** — no fabricated framework, version, path, or API
- **Language** — same language as the input

| # | Draft | Expected additions |
|---|---|---|
| 1 | 帮我做个数据看板 | Scope: filters, display area, export; output: structured description; acceptance: flows are unambiguous |
| 2 | 修一下登录的 bug | Scope: which login path, reproduction conditions; constraints: do not invent a stack; acceptance: bug no longer reproduces |
| 3 | 把用户模块的登录态改成 JWT | Scope: token lifecycle, storage, refresh, invalid/expired handling; acceptance: old sessions behave as specified |
| 4 | 给设置页加一个深色模式 | Scope: toggle, persistence, initial value, system preference; acceptance: restart keeps the choice |
| 5 | 优化一下这个页面的加载速度 | Scope: what is measured, which page, before/after; output: report with metrics; acceptance: measurable target |
| 6 | 写一个脚本把 CSV 转成 JSON | Scope: input/output paths, delimiter, encoding, empty values; acceptance: sample input round-trips |
| 7 | 给 API 加限流 | Scope: which endpoints, key, window, limit, response on rejection; acceptance: over-limit requests get the specified response |
| 8 | 重构这个组件，太长了 | Scope: behavior must stay the same, file boundaries; output: changed files + rationale; acceptance: tests/build pass |
| 9 | 给项目加单元测试 | Scope: which modules, framework already present, edge cases; output: test files + commands; acceptance: suite runs green |
| 10 | 做一个简单的待办事项应用 | Scope: add/list/complete/delete, persistence, empty state; output: file structure; acceptance: each flow works |

## A/B checks

1. Same 10 drafts with `projectContext: false`, then `true`.
2. Same 10 drafts with the default prompt, then a `*gpt*` or `*claude*` family prompt.
3. Record: latency, character change, whether you kept the result, whether you pressed Regenerate.

The target is not “longer”. The target is “the next model can start without asking a clarifying question that the draft could have answered”.
