import * as p from "@clack/prompts"
import type { Config, ScheduleEntry } from "../config/schema"
import { generateId, validateId } from "../config/id"

export async function runWizard(config: Config): Promise<ScheduleEntry> {
  p.intro("climitless — Add Schedule")

  const trigger = await p.select<string>({
    message: "Trigger type",
    options: [
      { value: "claude-cli", label: "Claude CLI (requires `claude` on PATH)" },
      { value: "claude-api", label: "Claude API (requires ANTHROPIC_API_KEY)" },
      { value: "browser", label: "Browser (opens Claude.ai URL)" },
      { value: "log", label: "Log only (for testing — no Claude invoked)" },
    ],
  })
  if (p.isCancel(trigger)) {
    p.cancel("Cancelled")
    process.exit(0)
  }

  const scheduleMode = await p.select<string>({
    message: "How would you like to set the schedule?",
    options: [
      { value: "simple", label: "Simple time (e.g. 04:00 daily)" },
      { value: "cron", label: "Cron expression (advanced)" },
    ],
  })
  if (p.isCancel(scheduleMode)) {
    p.cancel("Cancelled")
    process.exit(0)
  }

  let cron: string
  if (scheduleMode === "simple") {
    const time = await p.text({
      message: "Enter time (HH:MM)",
      placeholder: "04:00",
      validate: (v) =>
        /^\d{1,2}:\d{2}$/.test(v)
          ? undefined
          : "Please enter a valid time in HH:MM format (e.g. 04:00)",
    })
    if (p.isCancel(time)) {
      p.cancel("Cancelled")
      process.exit(0)
    }
    const [hh, mm] = (time as string).split(":")
    const recurrence = await p.select<string>({
      message: "Recurrence",
      options: [
        { value: "daily", label: "Every day" },
        { value: "weekdays", label: "Weekdays only (Mon-Fri)" },
        { value: "once", label: "One-shot (runs once, then you remove it)" },
      ],
    })
    if (p.isCancel(recurrence)) {
      p.cancel("Cancelled")
      process.exit(0)
    }
    const days = recurrence === "weekdays" ? "1-5" : "*"
    cron = `${mm || "0"} ${hh || "0"} * * ${days}`
  } else {
    const cronRaw = await p.text({ message: "Enter cron expression", placeholder: "0 4 * * 1-5" })
    if (p.isCancel(cronRaw)) {
      p.cancel("Cancelled")
      process.exit(0)
    }
    cron = cronRaw as string
  }

  const promptType = await p.select<string>({
    message: "Prompt type",
    options: [
      { value: "fixed", label: "Fixed — always the same message" },
      { value: "random", label: "Random — pick from your prompt pool" },
      { value: "dynamic", label: "Dynamic — template with {{date}}, {{day_of_week}}, etc." },
    ],
  })
  if (p.isCancel(promptType)) {
    p.cancel("Cancelled")
    process.exit(0)
  }

  let promptValue: string | undefined
  let promptTemplate: string | undefined
  if (promptType === "fixed") {
    const txt = await p.text({
      message: "Enter your prompt",
      placeholder: "Start a new work session.",
    })
    if (p.isCancel(txt)) {
      p.cancel("Cancelled")
      process.exit(0)
    }
    promptValue = txt as string
  } else if (promptType === "dynamic") {
    const tpl = await p.text({
      message: "Enter prompt template",
      placeholder: "Session on {{day_of_week}} {{date}}.",
    })
    if (p.isCancel(tpl)) {
      p.cancel("Cancelled")
      process.exit(0)
    }
    promptTemplate = tpl as string
  }

  const autoId = generateId({ trigger: trigger as string, cron }, config.schedules)
  const idRaw = await p.text({
    message: "Schedule ID (leave blank to auto-generate)",
    placeholder: autoId,
  })
  if (p.isCancel(idRaw)) {
    p.cancel("Cancelled")
    process.exit(0)
  }
  const id = (idRaw as string).trim() || autoId
  if (!validateId(id)) {
    p.cancel(`Invalid ID "${id}"`)
    process.exit(1)
  }

  const confirm = await p.confirm({
    message: `Add schedule "${id}" → ${trigger} at "${cron}"?`,
  })
  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Cancelled")
    process.exit(0)
  }

  p.outro(`Schedule "${id}" ready to save.`)

  return {
    id,
    cron,
    enabled: true,
    trigger: trigger as ScheduleEntry["trigger"],
    prompt_type: promptType as ScheduleEntry["prompt_type"],
    ...(promptValue && { prompt: promptValue }),
    ...(promptTemplate && { prompt_template: promptTemplate }),
  }
}
