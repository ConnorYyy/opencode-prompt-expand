# Contributing

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run smoke:gui
```

`npm run verify` runs all of the above.

## Pull requests

- Keep the server, RPC, and GUI boundaries intact: the window process must not call a model directly, and the server process must not touch the composer.
- Add or update tests when changing bypass rules, model selection, prompt building, version state, or RPC error handling.
- Do not add telemetry, remote logging, or author-operated proxies.
- Keep project-context reads inside the whitelist in `src/project-context.ts`.
- Update `README.md` and `CHANGELOG.md` for user-visible behavior.

## Compatibility

The Desktop GUI plugin API is experimental. State the OpenCode Desktop version you tested when changing `@opencode/plugin`, the GUI entry, or the composer adapter.
