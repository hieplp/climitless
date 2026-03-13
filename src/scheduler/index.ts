import { Cron } from "croner"
import type { ScheduleEntry } from "../config/schema"

type Handler = () => Promise<void>

export class SchedulerManager {
  private jobs = new Map<string, Cron>()

  register(entry: ScheduleEntry, handler: Handler): void {
    if (!entry.enabled) return
    // Stop existing job if present
    this.unregister(entry.id)
    const job = new Cron(entry.cron, { name: entry.id }, handler)
    this.jobs.set(entry.id, job)
  }

  unregister(id: string): void {
    const job = this.jobs.get(id)
    if (job) {
      job.stop()
      this.jobs.delete(id)
    }
  }

  isRegistered(id: string): boolean {
    return this.jobs.has(id)
  }

  nextFire(id: string): Date | null {
    return this.jobs.get(id)?.nextRun() ?? null
  }

  stopAll(): void {
    for (const job of this.jobs.values()) job.stop()
    this.jobs.clear()
  }

  /** Alias used in tests */
  stop(): void {
    this.stopAll()
  }
}
