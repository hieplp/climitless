import { parse, stringify } from "smol-toml"
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "fs"
import { CONFIG_DIR, CONFIG_FILE, ENV_FILE, LOG_DIR } from "./paths"
import { ConfigSchema, type Config } from "./schema"
import { migrateConfig } from "./migrate"

export function ensureDirs(): void {
  for (const dir of [CONFIG_DIR, LOG_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
}

function applyPermissions(filePath: string): void {
  if (process.platform !== "win32") {
    try {
      chmodSync(filePath, 0o600)
    } catch {
      /* ignore */
    }
  }
}

export function readConfig(): Config {
  ensureDirs()
  if (!existsSync(CONFIG_FILE)) return ConfigSchema.parse({})

  const raw = parse(readFileSync(CONFIG_FILE, "utf-8")) as Record<string, unknown>
  const migrated = migrateConfig(raw)
  return ConfigSchema.parse(migrated)
}

export function writeConfig(config: Config): void {
  ensureDirs()
  writeFileSync(CONFIG_FILE, stringify(config as Record<string, unknown>), "utf-8")
  applyPermissions(CONFIG_FILE)
}

export function loadEnvFile(): void {
  if (!existsSync(ENV_FILE)) return
  const lines = readFileSync(ENV_FILE, "utf-8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "")
    if (key && !(key in process.env)) process.env[key] = val
  }
}
