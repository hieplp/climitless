// IPC message types only — domain types live in src/config/schema.ts
export interface IpcRequest {
  command: "status" | "reload" | "stop" | "fire"
  scheduleId?: string
}

export interface IpcResponse {
  ok: boolean
  data?: unknown
  error?: string
}
