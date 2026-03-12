import { SOCKET_PATH, CONFIG_DIR } from "../config/paths"
import { join } from "path"
import type { IpcRequest, IpcResponse } from "../scheduler/types"
import { existsSync, unlinkSync, readFileSync, writeFileSync } from "fs"
import { createServer, createConnection } from "net"
import { ensureDirs } from "../config/index"

const PORT_FILE = join(CONFIG_DIR, "daemon.port")
const IS_WIN = process.platform === "win32"

export interface IpcHandlers {
  status: () => Promise<unknown>
  reload: () => Promise<unknown>
  stop: () => Promise<unknown>
  fire: (scheduleId: string) => Promise<unknown>
}

async function handleLine(line: string, handlers: IpcHandlers): Promise<IpcResponse> {
  try {
    const req = JSON.parse(line) as IpcRequest
    let result: unknown
    if (req.command === "status") result = await handlers.status()
    else if (req.command === "reload") result = await handlers.reload()
    else if (req.command === "stop") result = await handlers.stop()
    else if (req.command === "fire") result = await handlers.fire(req.scheduleId ?? "")
    else throw new Error(`Unknown command: ${req.command}`)
    return { ok: true, data: result }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function createIpcServer(handlers: IpcHandlers): { stop: () => void; ready: Promise<void> } {
  if (IS_WIN) {
    // Windows: TCP loopback, ephemeral port stored in PORT_FILE
    const server = createServer((socket) => {
      let buf = ""
      socket.on("data", async (chunk) => {
        buf += chunk.toString()
        const lines = buf.split("\n"); buf = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          const res = await handleLine(line, handlers)
          socket.write(JSON.stringify(res) + "\n")
        }
      })
    })
    const ready = new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        ensureDirs()
        const addr = server.address() as { port: number }
        writeFileSync(PORT_FILE, String(addr.port), "utf-8")
        resolve()
      })
    })
    return { ready, stop() { server.close(); if (existsSync(PORT_FILE)) unlinkSync(PORT_FILE) } }
  } else {
    // Unix: AF_UNIX socket
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
    const server = Bun.listen<{ buf: string }>({
      unix: SOCKET_PATH,
      socket: {
        open(s) { s.data = { buf: "" } },
        async data(s, data) {
          s.data.buf += new TextDecoder().decode(data)
          const lines = s.data.buf.split("\n"); s.data.buf = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.trim()) continue
            const res = await handleLine(line, handlers)
            s.write(JSON.stringify(res) + "\n")
          }
        },
      },
    })
    return {
      ready: Promise.resolve(),
      stop() { server.stop(); if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH) },
    }
  }
}

export async function sendIpcCommand(req: IpcRequest, timeoutMs = 5000): Promise<IpcResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("IPC timeout — is the daemon running?")), timeoutMs)
    let buf = ""

    let socket: ReturnType<typeof createConnection>

    if (IS_WIN) {
      if (!existsSync(PORT_FILE)) { clearTimeout(timer); reject(new Error("Daemon is not running")); return }
      const port = parseInt(readFileSync(PORT_FILE, "utf-8").trim(), 10)
      socket = createConnection({ host: "127.0.0.1", port })
    } else {
      if (!existsSync(SOCKET_PATH)) { clearTimeout(timer); reject(new Error("Daemon is not running")); return }
      socket = createConnection({ path: SOCKET_PATH })
    }

    socket.on("connect", () => socket.write(JSON.stringify(req) + "\n"))
    socket.on("data", (chunk) => {
      buf += chunk.toString()
      const lines = buf.split("\n"); buf = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        clearTimeout(timer)
        try { resolve(JSON.parse(line) as IpcResponse) }
        catch { reject(new Error("Invalid IPC response")) }
      }
    })
    socket.on("error", (err) => { clearTimeout(timer); reject(err) })
  })
}
