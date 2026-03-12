import { describe, expect, it } from "bun:test"
import { migrateConfig } from "../../src/config/migrate"

describe("migrateConfig", () => {
  it("returns version-1 config unchanged", () => {
    const config = { version: 1, daemon: {}, schedules: [] }
    expect(migrateConfig(config)).toEqual(config)
  })

  it("adds version field if missing (pre-v1 config)", () => {
    const config = { daemon: {}, schedules: [] }
    const result = migrateConfig(config)
    expect(result.version).toBe(1)
  })
})
