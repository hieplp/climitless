#!/usr/bin/env bun
import { readConfig, loadEnvFile, ensureDirs } from "../config/index"
import { SchedulerManager } from "../scheduler/index"
import { buildPrompt } from "../prompts/index"
import { fireTrigger } from "../triggers/index"
import { createIpcServer } from "./ipc"
import { writePid, clearPid } from "./lifecycle"
import { LOG_FILE } from "../config/paths"
import pino from "pino"

ensureDirs()
loadEnvFile()

let config = readConfig()

const logger = pino(
  { level: config.daemon.log_level },
  pino.destination(LOG_FILE)
)

const scheduler = new SchedulerManager()

function registerAllSchedules(): void {
  scheduler.stopAll()
  config = readConfig()
  for (const schedule of config.schedules) {
    scheduler.register(schedule, async () => {
      logger.info({ scheduleId: schedule.id, trigger: schedule.trigger }, "Firing schedule")
      try {
        const prompt = buildPrompt(schedule, config.prompts.pool)
        await fireTrigger(schedule, prompt, config)
        logger.info({ scheduleId: schedule.id }, "Schedule fired successfully")
      } catch (err) {
        logger.error({ scheduleId: schedule.id, err }, "Schedule trigger failed")
      }
    })
  }
}

registerAllSchedules()
writePid()

const ipcServer = createIpcServer({
  status: async () => ({
    running: true,
    pid: process.pid,
    schedules: config.schedules.filter((s) => s.enabled).map((s) => ({
      id: s.id,
      cron: s.cron,
      nextFire: scheduler.nextFire(s.id)?.toISOString() ?? null,
    })),
  }),
  reload: async () => {
    registerAllSchedules()
    return { reloaded: true }
  },
  stop: async () => {
    scheduler.stopAll()
    ipcServer.stop()
    clearPid()
    process.exit(0)
  },
  fire: async (scheduleId: string) => {
    const schedule = config.schedules.find((s) => s.id === scheduleId)
    if (!schedule) throw new Error(`Schedule not found: ${scheduleId}`)
    const prompt = buildPrompt(schedule, config.prompts.pool)
    await fireTrigger(schedule, prompt, config)
    return { fired: scheduleId }
  },
})

logger.info({ pid: process.pid }, "climitless daemon started")

process.on("SIGINT", () => { scheduler.stopAll(); ipcServer.stop(); clearPid(); process.exit(0) })
process.on("SIGTERM", () => { scheduler.stopAll(); ipcServer.stop(); clearPid(); process.exit(0) })
