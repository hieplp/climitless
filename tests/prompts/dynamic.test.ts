import { describe, expect, it } from "bun:test"
import { buildDynamic } from "../../src/prompts/dynamic"

describe("buildDynamic", () => {
  it("replaces {{schedule_id}}", () => {
    const result = buildDynamic("Session {{schedule_id}}", { scheduleId: "morning" })
    expect(result).toBe("Session morning")
  })

  it("replaces {{date}} with YYYY-MM-DD", () => {
    const result = buildDynamic("Date: {{date}}", { scheduleId: "x" })
    expect(result).toMatch(/Date: \d{4}-\d{2}-\d{2}/)
  })

  it("replaces {{time}} with HH:MM", () => {
    const result = buildDynamic("Time: {{time}}", { scheduleId: "x" })
    expect(result).toMatch(/Time: \d{2}:\d{2}/)
  })

  it("replaces {{day_of_week}}", () => {
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
    const result = buildDynamic("Day: {{day_of_week}}", { scheduleId: "x" })
    expect(days.some((d) => result.includes(d))).toBe(true)
  })

  it("throws if prompt_template is undefined", () => {
    expect(() => buildDynamic(undefined, { scheduleId: "x" })).toThrow(
      "dynamic prompt requires a 'prompt_template' field"
    )
  })
})
