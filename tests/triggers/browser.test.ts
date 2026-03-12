import { afterEach, describe, expect, it, mock } from "bun:test"

describe("browserTrigger", () => {
  const originalSpawn = Bun.spawn
  const originalPlatform = process.platform

  afterEach(() => {
    ;(Bun as unknown as Record<string, unknown>).spawn = originalSpawn
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
  })

  it("calls xdg-open on linux", async () => {
    const mockSpawn = mock(() => ({}))
    ;(Bun as unknown as Record<string, unknown>).spawn = mockSpawn
    Object.defineProperty(process, "platform", { value: "linux", configurable: true })
    const { browserTrigger } = await import("../../src/triggers/browser")
    await browserTrigger("https://claude.ai")
    expect(mockSpawn).toHaveBeenCalledWith(["xdg-open", "https://claude.ai"])
  })

  it("calls open on macOS", async () => {
    const mockSpawn = mock(() => ({}))
    ;(Bun as unknown as Record<string, unknown>).spawn = mockSpawn
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true })
    const { browserTrigger } = await import("../../src/triggers/browser")
    await browserTrigger("https://claude.ai")
    expect(mockSpawn).toHaveBeenCalledWith(["open", "https://claude.ai"])
  })

  it("routes through cmd /c start on Windows (shell built-in)", async () => {
    const mockSpawn = mock(() => ({}))
    ;(Bun as unknown as Record<string, unknown>).spawn = mockSpawn
    Object.defineProperty(process, "platform", { value: "win32", configurable: true })
    const { browserTrigger } = await import("../../src/triggers/browser")
    await browserTrigger("https://claude.ai")
    expect(mockSpawn).toHaveBeenCalledWith(["cmd", "/c", "start", "", "https://claude.ai"])
  })
})
