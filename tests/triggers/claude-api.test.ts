import { describe, expect, it, mock } from "bun:test"

describe("claudeApiTrigger", () => {
  it("calls Anthropic API with correct body", async () => {
    const mockFetch = mock(async () =>
      new Response(JSON.stringify({ id: "msg_1" }), { status: 200 })
    )
    globalThis.fetch = mockFetch as unknown as typeof fetch

    const { claudeApiTrigger } = await import("../../src/triggers/claude-api")
    process.env["ANTHROPIC_API_KEY"] = "test-key"
    await claudeApiTrigger("Hello", { api_key_env: "ANTHROPIC_API_KEY", model: "claude-sonnet-4-6" })

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" })
    )
  })

  it("throws if API key env var is not set", async () => {
    const { claudeApiTrigger } = await import("../../src/triggers/claude-api")
    delete process.env["ANTHROPIC_API_KEY"]
    await expect(
      claudeApiTrigger("Hello", { api_key_env: "ANTHROPIC_API_KEY", model: "claude-sonnet-4-6" })
    ).rejects.toThrow("ANTHROPIC_API_KEY")
  })

  it("throws on non-200 response", async () => {
    globalThis.fetch = mock(async () => new Response("Unauthorized", { status: 401 })) as unknown as typeof fetch
    process.env["ANTHROPIC_API_KEY"] = "bad-key"
    const { claudeApiTrigger } = await import("../../src/triggers/claude-api")
    await expect(
      claudeApiTrigger("Hello", { api_key_env: "ANTHROPIC_API_KEY", model: "claude-sonnet-4-6" })
    ).rejects.toThrow("API request failed: 401")
  })
})
