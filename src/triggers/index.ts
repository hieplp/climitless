import type { ScheduleEntry, Config } from "../config/schema"
import { claudeCliTrigger } from "./claude-cli"
import { claudeApiTrigger } from "./claude-api"
import { browserTrigger } from "./browser"
import { logTrigger } from "./log"

export async function fireTrigger(
  schedule: ScheduleEntry,
  prompt: string | null,
  config: Config
): Promise<void> {
  switch (schedule.trigger) {
    case "claude-cli":
      if (!prompt) throw new Error("claude-cli trigger requires a prompt")
      await claudeCliTrigger(prompt)
      break

    case "claude-api":
      if (!prompt) throw new Error("claude-api trigger requires a prompt")
      await claudeApiTrigger(prompt, config.triggers.claude_api ?? { api_key_env: "ANTHROPIC_API_KEY", model: "claude-sonnet-4-6" })
      break

    case "browser": {
      const url = config.triggers.browser?.url ?? "https://claude.ai"
      if (schedule.prompt_type === "fixed" || schedule.prompt_type === "dynamic") {
        console.warn(`[climitless] Warning: schedule "${schedule.id}" has prompt_type "${schedule.prompt_type}" but uses browser trigger — the prompt is not sent to the browser`)
      }
      await browserTrigger(url)
      break
    }

    case "log":
      await logTrigger(schedule.id, schedule.cron, prompt)
      break
  }
}
