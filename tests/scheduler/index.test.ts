import { describe, expect, it, mock } from "bun:test"
import { SchedulerManager } from "../../src/scheduler/index"
import type { ScheduleEntry } from "../../src/config/schema"

const entry: ScheduleEntry = {
  id: "test",
  cron: "* * * * *",
  enabled: true,
  trigger: "claude-cli",
  prompt_type: "fixed",
  prompt: "Hello",
}

describe("SchedulerManager", () => {
  it("registers a schedule and returns its id", () => {
    const sm = new SchedulerManager()
    const handler = mock(async () => {})
    sm.register(entry, handler)
    expect(sm.isRegistered("test")).toBe(true)
    sm.stop()
  })

  it("does not register disabled schedules", () => {
    const sm = new SchedulerManager()
    const handler = mock(async () => {})
    sm.register({ ...entry, enabled: false }, handler)
    expect(sm.isRegistered("test")).toBe(false)
    sm.stop()
  })

  it("unregisters a schedule", () => {
    const sm = new SchedulerManager()
    sm.register(entry, mock(async () => {}))
    sm.unregister("test")
    expect(sm.isRegistered("test")).toBe(false)
    sm.stop()
  })

  it("replaces an existing schedule on re-register", () => {
    const sm = new SchedulerManager()
    const h1 = mock(async () => {})
    const h2 = mock(async () => {})
    sm.register(entry, h1)
    sm.register(entry, h2)
    expect(sm.isRegistered("test")).toBe(true)
    sm.stop()
  })
})
