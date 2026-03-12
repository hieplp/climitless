import type { Config } from "../config/schema"

type ClaudeApiTriggerConfig = NonNullable<Config["triggers"]["claude_api"]>

export async function claudeApiTrigger(
  prompt: string,
  config: ClaudeApiTriggerConfig
): Promise<void> {
  const apiKey = process.env[config.api_key_env]
  if (!apiKey) throw new Error(`Env var ${config.api_key_env} is not set — cannot fire claude-api trigger`)

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  })

  if (!response.ok) throw new Error(`API request failed: ${response.status}`)
}
