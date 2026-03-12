import { Command } from "commander"
import { readConfig } from "../../config/index"
import { buildPrompt } from "../../prompts/index"
import { fireTrigger } from "../../triggers/index"
import { sendIpcCommand } from "../../daemon/ipc"
import { isDaemonRunning } from "../../daemon/lifecycle"

export function fireCommand(): Command {
  return new Command("fire")
    .description("Manually fire a schedule now")
    .argument("<id>", "Schedule ID")
    .option("--dry-run", "Preview without firing")
    .action(async (id: string, opts) => {
      const config = readConfig()
      const schedule = config.schedules.find((s) => s.id === id)
      if (!schedule) { console.error(`Schedule "${id}" not found`); process.exit(1) }

      const prompt = buildPrompt(schedule, config.prompts.pool)

      if (opts.dryRun) {
        console.log("\nDry run preview:")
        console.log(`  ID:      ${schedule.id}`)
        console.log(`  Trigger: ${schedule.trigger}`)
        console.log(`  Prompt:  ${prompt ?? "(none — browser trigger)"}`)
        return
      }

      if (isDaemonRunning()) {
        try {
          const res = await sendIpcCommand({ command: "fire", scheduleId: id })
          if (res.ok) { console.log(`Schedule "${id}" fired.`); return }
          else { console.error(res.error); process.exit(1) }
        } catch { /* fall through to direct fire */ }
      }

      await fireTrigger(schedule, prompt, config)
      console.log(`Schedule "${id}" fired.`)
    })
}
