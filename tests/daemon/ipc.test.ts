import { describe, expect, it, mock } from "bun:test"
import { createIpcServer, sendIpcCommand } from "../../src/daemon/ipc"
import { SOCKET_PATH } from "../../src/config/paths"
import { existsSync, unlinkSync } from "fs"

function cleanSocket() {
  if (process.platform !== "win32" && existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
}

describe("IPC round-trip", () => {
  it("status command returns ok:true with data", async () => {
    cleanSocket()
    const handlers = {
      status: mock(async () => ({ running: true, schedules: 0 })),
      reload: mock(async () => ({})),
      stop: mock(async () => ({})),
      fire: mock(async (_id: string) => ({})),
    }
    const server = createIpcServer(handlers)
    await server.ready
    try {
      const res = await sendIpcCommand({ command: "status" })
      expect(res.ok).toBe(true)
      expect((res.data as Record<string, unknown>).running).toBe(true)
    } finally {
      server.stop()
    }
  })

  it("reload command returns ok:true", async () => {
    cleanSocket()
    const handlers = {
      status: mock(async () => ({})),
      reload: mock(async () => ({ reloaded: true })),
      stop: mock(async () => ({})),
      fire: mock(async (_id: string) => ({})),
    }
    const server = createIpcServer(handlers)
    await server.ready
    try {
      const res = await sendIpcCommand({ command: "reload" })
      expect(res.ok).toBe(true)
      expect((res.data as Record<string, unknown>).reloaded).toBe(true)
    } finally {
      server.stop()
    }
  })
})
