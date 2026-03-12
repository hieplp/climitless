import { describe, expect, it } from "bun:test"
import { ConfigSchema } from "../../src/config/schema"

describe("ConfigSchema", () => {
  it("accepts a valid minimal config", () => {
    const raw = {
      version: 1,
      daemon: { auto_reload: true, log_level: "info" },
      schedules: [],
      prompts: { pool: [] },
      triggers: {},
      notifications: { enabled: false },
    }
    expect(() => ConfigSchema.parse(raw)).not.toThrow()
  })

  it("rejects unknown log_level", () => {
    const raw = {
      version: 1,
      daemon: { auto_reload: true, log_level: "verbose" },
      schedules: [],
      prompts: { pool: [] },
      triggers: {},
      notifications: { enabled: false },
    }
    expect(() => ConfigSchema.parse(raw)).toThrow()
  })

  it("rejects schedule missing required cron field", () => {
    const raw = {
      version: 1,
      daemon: { auto_reload: true, log_level: "info" },
      schedules: [{ id: "test", enabled: true, trigger: "claude-cli", prompt_type: "fixed" }],
      prompts: { pool: [] },
      triggers: {},
      notifications: { enabled: false },
    }
    expect(() => ConfigSchema.parse(raw)).toThrow()
  })

  it("rejects invalid trigger type", () => {
    const raw = {
      version: 1,
      daemon: { auto_reload: true, log_level: "info" },
      schedules: [{ id: "test", cron: "0 4 * * *", enabled: true, trigger: "unknown", prompt_type: "fixed" }],
      prompts: { pool: [] },
      triggers: {},
      notifications: { enabled: false },
    }
    expect(() => ConfigSchema.parse(raw)).toThrow()
  })

  it("fills in defaults for optional fields", () => {
    const raw = {
      version: 1,
      daemon: {},
      schedules: [],
    }
    const config = ConfigSchema.parse(raw)
    expect(config.daemon.auto_reload).toBe(true)
    expect(config.daemon.log_level).toBe("info")
    expect(config.prompts.pool).toEqual([])
    expect(config.notifications.enabled).toBe(false)
  })
})
