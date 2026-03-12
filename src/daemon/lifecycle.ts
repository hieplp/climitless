import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs"
import { PID_FILE } from "../config/paths"

export function writePid(): void {
  writeFileSync(PID_FILE, String(process.pid), "utf-8")
}

export function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null
  const raw = readFileSync(PID_FILE, "utf-8").trim()
  const pid = parseInt(raw, 10)
  return isNaN(pid) ? null : pid
}

export function clearPid(): void {
  if (existsSync(PID_FILE)) unlinkSync(PID_FILE)
}

export function isDaemonRunning(): boolean {
  const pid = readPid()
  if (!pid) return false
  try {
    // Signal 0 checks if process exists without killing it
    process.kill(pid, 0)
    return true
  } catch (err) {
    // ESRCH = no such process → daemon is gone, clean up PID file
    // EPERM = process exists but owned by different user → treat as running
    if ((err as NodeJS.ErrnoException).code === "ESRCH") {
      clearPid()
      return false
    }
    return true
  }
}
