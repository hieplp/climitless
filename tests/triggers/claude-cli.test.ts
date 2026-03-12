import { describe, expect, it, mock } from "bun:test"

describe("claudeCliTrigger", () => {
  // Capture original ONCE so both finally blocks restore to the same value
  const originalSpawn = Bun.spawn

  it("spawns claude process with --print and the prompt", async () => {
    const mockSpawn = mock(() => ({ exited: Promise.resolve(0), stdout: null, stderr: null }))
    ;(Bun as unknown as Record<string, unknown>).spawn = mockSpawn
    try {
      const { claudeCliTrigger } = await import("../../src/triggers/claude-cli")
      await claudeCliTrigger("Hello Claude")
      expect(mockSpawn).toHaveBeenCalledWith(
        ["claude", "--print", "Hello Claude"],
        expect.objectContaining({ stderr: "pipe" })
      )
    } finally {
      ;(Bun as unknown as Record<string, unknown>).spawn = originalSpawn
    }
  })

  it("throws on non-zero exit code", async () => {
    ;(Bun as unknown as Record<string, unknown>).spawn = mock(() => ({
      exited: Promise.resolve(1),
      stdout: null,
      stderr: { text: async () => "error output" },
    }))
    try {
      const { claudeCliTrigger } = await import("../../src/triggers/claude-cli")
      await expect(claudeCliTrigger("Hello")).rejects.toThrow("claude CLI exited with code 1")
    } finally {
      ;(Bun as unknown as Record<string, unknown>).spawn = originalSpawn
    }
  })
})
