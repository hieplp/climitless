import { describe, expect, it, mock, afterEach } from "bun:test"

describe("logTrigger", () => {
  const originalLog = console.log

  afterEach(() => {
    console.log = originalLog
  })

  it("logs a structured JSON entry with all fields", async () => {
    const logged: string[] = []
    console.log = mock((msg: string) => { logged.push(msg) }) as typeof console.log

    const { logTrigger } = await import("../../src/triggers/log")
    await logTrigger("check-cron", "*/5 * * * *", "Heartbeat check")

    expect(logged).toHaveLength(1)
    const entry = JSON.parse(logged[0]!)
    expect(entry.level).toBe("info")
    expect(entry.scheduleId).toBe("check-cron")
    expect(entry.cron).toBe("*/5 * * * *")
    expect(entry.prompt).toBe("Heartbeat check")
    expect(entry.msg).toBe("schedule fired (log-only)")
    expect(typeof entry.time).toBe("string")
  })

  it("logs with null prompt", async () => {
    const logged: string[] = []
    console.log = mock((msg: string) => { logged.push(msg) }) as typeof console.log

    const { logTrigger } = await import("../../src/triggers/log")
    await logTrigger("check-cron", "0 9 * * 1-5", null)

    const entry = JSON.parse(logged[0]!)
    expect(entry.prompt).toBeNull()
    expect(entry.scheduleId).toBe("check-cron")
  })
})
