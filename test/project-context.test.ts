import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  clearProjectContextCache,
  formatProjectContext,
  readProjectContext,
  resolveProjectDirectory,
} from "../src/project-context.js"

describe("formatProjectContext", () => {
  it("formats package, rules, branch, and files", () => {
    const result = formatProjectContext(
      {
        packageSummary: "name: demo\ndependencies: react, vite",
        rules: "Use TypeScript.",
        branch: "feat/statusbar",
        files: ["src/app.ts", "src/status.ts"],
      },
      2048,
    )

    expect(result).toContain("技术栈")
    expect(result).toContain("react")
    expect(result).toContain("Use TypeScript.")
    expect(result).toContain("feat/statusbar")
    expect(result).toContain("src/status.ts")
  })

  it("respects the budget", () => {
    const result = formatProjectContext(
      {
        packageSummary: "x".repeat(1000),
        rules: "y".repeat(2000),
        branch: "main",
        files: ["a.ts"],
      },
      100,
    )

    expect(Array.from(result).length).toBeLessThanOrEqual(100)
  })

  it("returns empty for a zero budget", () => {
    expect(formatProjectContext({ branch: "main" }, 0)).toBe("")
  })
})

describe("resolveProjectDirectory", () => {
  it("prefers the session directory over the request and plugin directories", () => {
    expect(
      resolveProjectDirectory({
        sessionDirectory: "D:/project",
        requestDirectory: "D:/request",
        pluginDirectory: "C:/Users/me",
      }),
    ).toBe("D:/project")
  })

  it("uses the request directory when there is no session", () => {
    expect(
      resolveProjectDirectory({
        requestDirectory: "D:/draft-project",
        pluginDirectory: "C:/Users/me",
      }),
    ).toBe("D:/draft-project")
  })
})

describe("readProjectContext", () => {
  it("reads package.json and rule files from a directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "prompt-expand-"))
    try {
      await writeFile(
        join(directory, "package.json"),
        JSON.stringify({
          name: "demo",
          description: "demo project",
          dependencies: { react: "^19.0.0", vite: "^7.0.0" },
        }),
      )
      await writeFile(join(directory, "AGENTS.md"), "Use TypeScript. Keep changes small.")
      await writeFile(join(directory, ".env"), "SECRET=should-not-be-read")

      clearProjectContextCache()
      const context = await readProjectContext(directory, 2048, {
        branch: "feat/statusbar",
        files: ["src/app.ts", "node_modules/pkg/index.js"],
      })

      expect(context).toContain("demo")
      expect(context).toContain("react")
      expect(context).toContain("Use TypeScript.")
      expect(context).toContain("feat/statusbar")
      expect(context).toContain("src/app.ts")
      expect(context).not.toContain("node_modules/pkg")
      expect(context).not.toContain("SECRET")
    } finally {
      await rm(directory, { recursive: true, force: true })
      clearProjectContextCache()
    }
  })
})
