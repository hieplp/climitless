import { existsSync, readFileSync, writeFileSync } from "fs"
import { LOG_FILE } from "../config/paths"

export interface LogEntry {
  time: number
  level: number
  msg: string
  scheduleId?: string
  trigger?: string
  err?: unknown
}

const LEVEL_LABELS: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
}

function formatEntry(entry: LogEntry): string {
  const time = new Date(entry.time).toLocaleString()
  const level = LEVEL_LABELS[entry.level] ?? String(entry.level)
  const id = entry.scheduleId ? ` [${entry.scheduleId}]` : ""
  return `${time}  ${level.padEnd(5)}${id}  ${entry.msg}`
}

function parseEntries(scheduleId?: string): LogEntry[] {
  if (!existsSync(LOG_FILE)) return []
  return readFileSync(LOG_FILE, "utf-8")
    .trim()
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l) as LogEntry
      } catch {
        return null
      }
    })
    .filter((e): e is LogEntry => e !== null)
    .filter((e) => !scheduleId || e.scheduleId === scheduleId)
}

export function readLogs(
  opts: { lines?: number; scheduleId?: string; offsetLines?: number } = {}
): string[] {
  const entries = parseEntries(opts.scheduleId)
  const sliced = opts.offsetLines ? entries.slice(opts.offsetLines) : entries
  const limited = opts.lines ? sliced.slice(-opts.lines) : sliced.slice(-50)
  return limited.map(formatEntry)
}

export function countLogLines(scheduleId?: string): number {
  return parseEntries(scheduleId).length
}

export function clearLogs(): void {
  writeFileSync(LOG_FILE, "", "utf-8")
}
