import { Command } from "commander"
import { readConfig } from "../../config/index"
import { sendIpcCommand } from "../../daemon/ipc"
import { isDaemonRunning } from "../../daemon/lifecycle"

export function listCommand(): Command {
  return new Command("list")
    .description("List all schedules")
    .action(async () => {
      const config = readConfig()
      if (config.schedules.length === 0) { console.log("No schedules configured."); return }

      let nextFires: Record<string, string | null> = {}
      if (isDaemonRunning()) {
        try {
          const res = await sendIpcCommand({ command: "status" })
          if (res.ok) {
            const data = res.data as { schedules: Array<{ id: string; nextFire: string | null }> }
            nextFires = Object.fromEntries(data.schedules.map((s) => [s.id, s.nextFire]))
          }
        } catch { /* ignore */ }
      }

      console.log("\nSchedules:\n")
      for (const s of config.schedules) {
        const status = s.enabled ? "✓" : "✗"
        const next = nextFires[s.id] ? `  next: ${nextFires[s.id]}` : ""
        console.log(`  [${status}] ${s.id}  (${s.cron})  trigger: ${s.trigger}  prompt: ${s.prompt_type}${next}`)
      }
      console.log()
    })
}
