import { Command } from "commander"
import { readConfig, writeConfig } from "../../config/index"
import { generateId, validateId } from "../../config/id"
import { sendIpcCommand } from "../../daemon/ipc"
import { isDaemonRunning } from "../../daemon/lifecycle"
import { runWizard } from "../../wizard/index"
import type { ScheduleEntry } from "../../config/schema"

export function addCommand(): Command {
  return new Command("add")
    .description("Add a new schedule (wizard if no cron arg)")
    .argument("[cron]", "Cron expression")
    .option("--trigger <type>", "Trigger type: claude-cli | claude-api | browser | log")
    .option("--prompt-type <type>", "Prompt type: fixed | random | dynamic")
    .option("--prompt <text>", "Fixed prompt text")
    .option("--prompt-template <text>", "Dynamic prompt template")
    .option("--id <id>", "Schedule ID (auto-generated if omitted)")
    .action(async (cron: string | undefined, opts) => {
      const config = readConfig()
      let entry: ScheduleEntry

      if (!cron) {
        entry = await runWizard(config)
      } else {
        if (!opts.trigger) { console.error("--trigger is required"); process.exit(1) }
        if (!opts.promptType) { console.error("--prompt-type is required"); process.exit(1) }
        if (opts.promptType === "fixed" && !opts.prompt) { console.error("--prompt is required for fixed prompt-type"); process.exit(1) }
        if (opts.promptType === "dynamic" && !opts.promptTemplate) { console.error("--prompt-template is required for dynamic prompt-type"); process.exit(1) }

        const id = opts.id ?? generateId({ trigger: opts.trigger, cron }, config.schedules)
        if (!validateId(id)) { console.error(`Invalid ID "${id}" — use lowercase alphanumeric and hyphens, 3-64 chars`); process.exit(1) }
        if (config.schedules.find((s) => s.id === id)) { console.error(`Schedule ID "${id}" already exists`); process.exit(1) }

        entry = {
          id,
          cron,
          enabled: true,
          trigger: opts.trigger,
          prompt_type: opts.promptType,
          ...(opts.prompt && { prompt: opts.prompt }),
          ...(opts.promptTemplate && { prompt_template: opts.promptTemplate }),
        }
      }

      config.schedules.push(entry)
      writeConfig(config)
      console.log(`Schedule "${entry.id}" added.`)

      if (isDaemonRunning()) {
        try { await sendIpcCommand({ command: "reload" }) } catch { /* daemon will reload on next start */ }
      }
    })
}
