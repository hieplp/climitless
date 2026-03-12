import type { ScheduleEntry } from "./schema"

const ID_PATTERN = /^[a-z0-9-]{3,64}$/

export function validateId(id: string): boolean {
  return ID_PATTERN.test(id)
}

export function generateId(
  opts: { trigger: string; cron: string },
  existing: ScheduleEntry[]
): string {
  // Cron format: MIN HOUR DAY MONTH DOW
  const parts = opts.cron.trim().split(/\s+/)
  const min = parts[0]?.padStart(2, "0") ?? "00"
  const hour = parts[1]?.padStart(2, "0") ?? "00"

  const base = `${opts.trigger}-${hour}-${min}`
  const taken = new Set(existing.map((s) => s.id))

  if (!taken.has(base)) return base

  let suffix = 2
  while (taken.has(`${base}-${suffix}`)) suffix++
  return `${base}-${suffix}`
}
