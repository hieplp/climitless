import { describe, expect, it } from "bun:test"
import { generateId, validateId } from "../../src/config/id"
import type { ScheduleEntry } from "../../src/config/schema"

const base: ScheduleEntry = {
  id: "x",
  cron: "0 4 * * 1-5",
  enabled: true,
  trigger: "claude-cli",
  prompt_type: "fixed",
}

describe("generateId", () => {
  it("generates slug from trigger and cron time", () => {
    const id = generateId({ trigger: "claude-cli", cron: "0 4 * * 1-5" }, [])
    expect(id).toBe("claude-cli-04-00")
  })

  it("appends numeric suffix on collision", () => {
    const existing: ScheduleEntry[] = [{ ...base, id: "claude-cli-04-00" }]
    const id = generateId({ trigger: "claude-cli", cron: "0 4 * * 1-5" }, existing)
    expect(id).toBe("claude-cli-04-00-2")
  })

  it("increments suffix past 2", () => {
    const existing: ScheduleEntry[] = [
      { ...base, id: "claude-cli-04-00" },
      { ...base, id: "claude-cli-04-00-2" },
    ]
    const id = generateId({ trigger: "claude-cli", cron: "0 4 * * 1-5" }, existing)
    expect(id).toBe("claude-cli-04-00-3")
  })
})

describe("validateId", () => {
  it("accepts valid id", () => {
    expect(validateId("morning-session")).toBe(true)
  })

  it("rejects uppercase", () => {
    expect(validateId("Morning")).toBe(false)
  })

  it("rejects id shorter than 3 chars", () => {
    expect(validateId("ab")).toBe(false)
  })

  it("rejects id longer than 64 chars", () => {
    expect(validateId("a".repeat(65))).toBe(false)
  })

  it("rejects special characters other than hyphens", () => {
    expect(validateId("bad_id")).toBe(false)
    expect(validateId("bad id")).toBe(false)
  })
})
