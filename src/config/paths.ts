import { homedir } from "os"
import { join } from "path"

export const CONFIG_DIR = join(homedir(), ".climitless")
export const CONFIG_FILE = join(CONFIG_DIR, "config.toml")
export const ENV_FILE = join(CONFIG_DIR, ".env")
export const LOG_DIR = join(CONFIG_DIR, "logs")
export const LOG_FILE = join(LOG_DIR, "climitless.log")
export const PID_FILE = join(CONFIG_DIR, "daemon.pid")

// Platform-appropriate IPC path
export const SOCKET_PATH =
  process.platform === "win32" ? "\\\\.\\pipe\\climitless" : join(CONFIG_DIR, "daemon.sock")
