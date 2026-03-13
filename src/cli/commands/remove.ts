import { Command } from "commander"
import { readConfig, writeConfig } from "../../config/index"
import { sendIpcCommand } from "../../daemon/ipc"
import { isDaemonRunning } from "../../daemon/lifecycle"

export function removeCommand(): Command {
  return new Command("remove")
    .description("Remove a schedule by ID")
    .argument("<id>", "Schedule ID")
    .action(async (id: string) => {
      const config = readConfig()
      const idx = config.schedules.findIndex((s) => s.id === id)
      if (idx === -1) {
        console.error(
          `Schedule "${id}" not found. Valid IDs: ${config.schedules.map((s) => s.id).join(", ")}`
        )
        process.exit(1)
      }
      config.schedules.splice(idx, 1)
      writeConfig(config)
      console.log(`Schedule "${id}" removed.`)
      if (isDaemonRunning()) {
        try {
          await sendIpcCommand({ command: "reload" })
        } catch {
          /* ignore */
        }
      }
    })
}
