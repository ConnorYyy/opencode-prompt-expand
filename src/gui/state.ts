import type { Run } from "../types.js"

export class RunStore {
  private readonly runs = new Map<string, Run>()
  private readonly maxVersions: number

  constructor(maxVersions = 5) {
    this.maxVersions = Math.max(1, maxVersions)
  }

  get(sessionID: string): Run | undefined {
    return this.runs.get(sessionID)
  }

  start(sessionID: string, original: string): Run {
    const run: Run = { original, versions: [], index: -1 }
    this.runs.set(sessionID, run)
    return run
  }

  sync(sessionID: string, current: string): Run {
    const run = this.runs.get(sessionID)
    if (!run || current !== run.versions[run.index]) {
      return this.start(sessionID, current)
    }
    return run
  }

  push(sessionID: string, original: string, text: string): Run {
    const run = this.runs.get(sessionID) ?? this.start(sessionID, original)
    run.original = run.versions.length === 0 ? original : run.original

    if (run.versions.length >= this.maxVersions) {
      run.versions.shift()
      if (run.index >= 0) run.index -= 1
    }

    run.versions.push(text)
    run.index = run.versions.length - 1
    return run
  }

  setIndex(sessionID: string, index: number): Run | undefined {
    const run = this.runs.get(sessionID)
    if (!run || index < 0 || index >= run.versions.length) return undefined
    run.index = index
    return run
  }

  clear(sessionID: string): void {
    this.runs.delete(sessionID)
  }

  clearAll(): void {
    this.runs.clear()
  }
}
