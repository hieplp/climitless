import { Command } from "commander"
import { readConfig, writeConfig } from "../../config/index"
import { sendIpcCommand } from "../../daemon/ipc"
import { isDaemonRunning } from "../../daemon/lifecycle"

export function enableCommand(): Command {
  return new Command("enable")
    .description("Enable a schedule")
    .argument("<id>", "Schedule ID")
    .action(async (id: string) => {
      const config = readConfig()
      const schedule = config.schedules.find((s) => s.id === id)
      if (!schedule) { console.error(`Schedule "${id}" not found`); process.exit(1) }
      schedule.enabled = true
      writeConfig(config)
      console.log(`Schedule "${id}" enabled.`)
      if (isDaemonRunning()) { try { await sendIpcCommand({ command: "reload" }) } catch { /* ignore */ } }
    })
}
