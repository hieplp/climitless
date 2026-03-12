import { Command } from "commander"
import { readConfig, writeConfig } from "../../config/index"
import { sendIpcCommand } from "../../daemon/ipc"
import { isDaemonRunning } from "../../daemon/lifecycle"

export function disableCommand(): Command {
  return new Command("disable")
    .description("Disable a schedule without deleting it")
    .argument("<id>", "Schedule ID")
    .action(async (id: string) => {
      const config = readConfig()
      const schedule = config.schedules.find((s) => s.id === id)
      if (!schedule) { console.error(`Schedule "${id}" not found`); process.exit(1) }
      schedule.enabled = false
      writeConfig(config)
      console.log(`Schedule "${id}" disabled.`)
      if (isDaemonRunning()) { try { await sendIpcCommand({ command: "reload" }) } catch { /* ignore */ } }
    })
}
