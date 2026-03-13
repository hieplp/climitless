import { z } from "zod"

const ScheduleEntrySchema = z.object({
  id: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/),
  cron: z.string().min(1),
  enabled: z.boolean().default(true),
  trigger: z.enum(["claude-cli", "claude-api", "browser", "log"]),
  prompt_type: z.enum(["fixed", "random", "dynamic"]),
  prompt: z.string().optional(),
  prompt_template: z.string().optional(),
})

const DaemonConfigSchema = z.object({
  auto_reload: z.boolean().default(true),
  log_level: z.enum(["debug", "info", "warn", "error"]).default("info"),
})

const ClaudeApiTriggerConfigSchema = z.object({
  api_key_env: z.string().default("ANTHROPIC_API_KEY"),
  model: z.string().default("claude-sonnet-4-6"),
})

const BrowserTriggerConfigSchema = z.object({
  url: z.string().url().default("https://claude.ai"),
})

export const ConfigSchema = z.object({
  version: z.number().int().default(1),
  daemon: DaemonConfigSchema.default({ auto_reload: true, log_level: "info" }),
  schedules: z.array(ScheduleEntrySchema).default([]),
  prompts: z.object({ pool: z.array(z.string()).default([]) }).default({ pool: [] }),
  triggers: z
    .object({
      claude_api: ClaudeApiTriggerConfigSchema.optional(),
      browser: BrowserTriggerConfigSchema.optional(),
    })
    .default({}),
  notifications: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
})

export type Config = z.infer<typeof ConfigSchema>
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>
