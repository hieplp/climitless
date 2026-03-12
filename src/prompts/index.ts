import type { ScheduleEntry } from "../config/schema"
import { buildFixed } from "./fixed"
import { buildRandom } from "./random"
import { buildDynamic } from "./dynamic"

export function buildPrompt(schedule: ScheduleEntry, pool: string[]): string | null {
  switch (schedule.prompt_type) {
    case "fixed":   return buildFixed(schedule.prompt)
    case "random":  return buildRandom(pool)
    case "dynamic": return buildDynamic(schedule.prompt_template, { scheduleId: schedule.id })
    default: return null
  }
}
