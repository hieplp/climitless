# climitless CLI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform Bun/TypeScript CLI daemon that schedules and auto-fires Claude sessions at configured times via cron expressions and an interactive wizard.

**Architecture:** A user-space daemon (Bun process) reads `~/.climitless/config.toml`, registers cron jobs via `croner`, and fires trigger adapters (claude-cli, claude-api, browser) at scheduled times. A CLI (commander) communicates with the running daemon over a local IPC socket (Unix socket on macOS/Linux, named pipe on Windows). Config writes go directly to the TOML file; the daemon is signalled to reload.

**Tech Stack:** Bun, TypeScript, commander, @clack/prompts, croner, smol-toml, zod, pino

---

## File Map

```
src/
  cli/
    index.ts              # Commander entry — registers all commands, calls Bun.main
    commands/
      daemon.ts           # daemon start|stop|restart|install|uninstall|status
      add.ts              # add schedule (flag-mode + wizard routing)
      list.ts             # list schedules
      remove.ts           # remove <id>
      enable.ts           # enable <id>
      disable.ts          # disable <id>
      fire.ts             # fire <id> [--dry-run]
      config.ts           # config edit|show
      prompts.ts          # prompts add|list|remove
      logs.ts             # logs [--follow] [--lines N] [--schedule id] [--clear]
      uninstall.ts        # uninstall [--purge]
  daemon/
    index.ts              # Daemon entry point — loads config, starts scheduler + IPC
    ipc.ts                # IPC server: Bun.listen Unix socket / named pipe
    lifecycle.ts          # PID file management, start/stop helpers
    autostart.ts          # launchd / systemd --user / registry auto-start
  scheduler/
    index.ts              # croner wrapper — register/unregister jobs per schedule
    types.ts              # IpcRequest / IpcResponse only — domain types live in src/config/schema.ts
  triggers/
    index.ts              # triggerFactory(config, schedule) → TriggerAdapter
    claude-cli.ts         # Bun.spawn(["claude", "--print", prompt])
    claude-api.ts         # fetch Anthropic Messages API
    browser.ts            # OS open URL (cmd/open/xdg-open)
  prompts/
    index.ts              # buildPrompt(schedule, pool) → string | null
    fixed.ts              # returns schedule.prompt
    random.ts             # picks random entry from pool
    dynamic.ts            # replaces {{date}} {{time}} {{day_of_week}} {{schedule_id}}
  config/
    index.ts              # readConfig / writeConfig / ensureDirs / checkPermissions
    schema.ts             # zod schema for full config + each sub-section
    paths.ts              # CONFIG_DIR, CONFIG_FILE, SOCKET_PATH, PID_FILE, LOG_FILE
    migrate.ts            # migrateConfig(raw) → Config  (version bumps)
    id.ts                 # generateId / validateId
  wizard/
    index.ts              # clack wizard: collects all fields, returns ScheduleEntry
  notifications/
    index.ts              # NotificationAdapter interface + NoopAdapter (v1 stub)
  logs/
    index.ts              # readLogs(opts) / tailLogs(opts) / clearLogs()
tests/
  config/
    schema.test.ts
    id.test.ts
    migrate.test.ts
  prompts/
    fixed.test.ts
    random.test.ts
    dynamic.test.ts
  triggers/
    claude-cli.test.ts
    claude-api.test.ts
    browser.test.ts
  scheduler/
    index.test.ts
  daemon/
    ipc.test.ts
```

---

## Chunk 1: Project Scaffold + Config Module

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/scheduler/types.ts`

- [ ] **Step 1: Initialise Bun project and install dependencies**

```bash
cd /c/Projects/climitless
bun init -y
bun add commander @clack/prompts croner smol-toml zod pino
bun add -d @types/bun typescript
```

Expected: `node_modules/` created, `package.json` updated.

- [ ] **Step 2: Merge correct metadata into `package.json`**

`bun init` will have created `package.json` with `dependencies` already populated. Only merge/update these top-level keys — do NOT replace the entire file (that would wipe installed dependencies):

```json
{
  "name": "climitless",
  "version": "0.1.0",
  "description": "Schedule and auto-fire Claude sessions",
  "type": "module",
  "bin": {
    "climitless": "./src/cli/index.ts"
  },
  "scripts": {
    "start": "bun run src/cli/index.ts",
    "daemon": "bun run src/daemon/index.ts",
    "test": "bun test",
    "lint": "bunx tsc --noEmit"
  }
}
```

Use the Edit tool to update only the fields above, preserving the `dependencies` and `devDependencies` sections that `bun add` created.
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
.env
*.pid
*.sock
dist/
```

- [ ] **Step 5: Create `src/scheduler/types.ts`**

This file contains **only** IPC types. All other domain types (`Config`, `ScheduleEntry`, etc.) are derived from the zod schema in `src/config/schema.ts` and must be imported from there — not duplicated here.

```typescript
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
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
bun run lint
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore src/scheduler/types.ts
git commit -m "chore: initialise project scaffold and shared types"
```

---

### Task 2: Config Paths

**Files:**
- Create: `src/config/paths.ts`

- [ ] **Step 1: Create `src/config/paths.ts`**

```typescript
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
  process.platform === "win32"
    ? "\\\\.\\pipe\\climitless"
    : join(CONFIG_DIR, "daemon.sock")
```

- [ ] **Step 2: Verify it compiles**

```bash
bun run lint
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/config/paths.ts
git commit -m "feat(config): add file path constants"
```

---

### Task 3: Config Schema

**Files:**
- Create: `src/config/schema.ts`
- Create: `tests/config/schema.test.ts`

- [ ] **Step 1: Write failing tests for config schema**

Create `tests/config/schema.test.ts`:

```typescript
import { describe, expect, it } from "bun:test"
import { ConfigSchema } from "../../src/config/schema"

describe("ConfigSchema", () => {
  it("accepts a valid minimal config", () => {
    const raw = {
      version: 1,
      daemon: { auto_reload: true, log_level: "info" },
      schedules: [],
      prompts: { pool: [] },
      triggers: {},
      notifications: { enabled: false },
    }
    expect(() => ConfigSchema.parse(raw)).not.toThrow()
  })

  it("rejects unknown log_level", () => {
    const raw = {
      version: 1,
      daemon: { auto_reload: true, log_level: "verbose" },
      schedules: [],
      prompts: { pool: [] },
      triggers: {},
      notifications: { enabled: false },
    }
    expect(() => ConfigSchema.parse(raw)).toThrow()
  })

  it("rejects schedule missing required cron field", () => {
    const raw = {
      version: 1,
      daemon: { auto_reload: true, log_level: "info" },
      schedules: [{ id: "test", enabled: true, trigger: "claude-cli", prompt_type: "fixed" }],
      prompts: { pool: [] },
      triggers: {},
      notifications: { enabled: false },
    }
    expect(() => ConfigSchema.parse(raw)).toThrow()
  })

  it("rejects invalid trigger type", () => {
    const raw = {
      version: 1,
      daemon: { auto_reload: true, log_level: "info" },
      schedules: [{ id: "test", cron: "0 4 * * *", enabled: true, trigger: "unknown", prompt_type: "fixed" }],
      prompts: { pool: [] },
      triggers: {},
      notifications: { enabled: false },
    }
    expect(() => ConfigSchema.parse(raw)).toThrow()
  })

  it("fills in defaults for optional fields", () => {
    const raw = {
      version: 1,
      daemon: {},
      schedules: [],
    }
    const config = ConfigSchema.parse(raw)
    expect(config.daemon.auto_reload).toBe(true)
    expect(config.daemon.log_level).toBe("info")
    expect(config.prompts.pool).toEqual([])
    expect(config.notifications.enabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/config/schema.test.ts
```

Expected: FAIL — `ConfigSchema` not found.

- [ ] **Step 3: Create `src/config/schema.ts`**

```typescript
import { z } from "zod"

const ScheduleEntrySchema = z.object({
  id: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/),
  cron: z.string().min(1),
  enabled: z.boolean().default(true),
  trigger: z.enum(["claude-cli", "claude-api", "browser"]),
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
  daemon: DaemonConfigSchema.default({}),
  schedules: z.array(ScheduleEntrySchema).default([]),
  prompts: z.object({ pool: z.array(z.string()).default([]) }).default({}),
  triggers: z
    .object({
      claude_api: ClaudeApiTriggerConfigSchema.optional(),
      browser: BrowserTriggerConfigSchema.optional(),
    })
    .default({}),
  notifications: z.object({ enabled: z.boolean().default(false) }).default({}),
})

export type Config = z.infer<typeof ConfigSchema>
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/config/schema.test.ts
```

Expected: All 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/config/schema.ts tests/config/schema.test.ts
git commit -m "feat(config): add zod schema with defaults and validation"
```

---

### Task 4: Schedule ID Generation

**Files:**
- Create: `src/config/id.ts`
- Create: `tests/config/id.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/config/id.test.ts`:

```typescript
import { describe, expect, it } from "bun:test"
import { generateId, validateId } from "../../src/config/id"
import type { ScheduleEntry } from "../../src/config/schema"

const base: ScheduleEntry = {
  id: "x",
  cron: "0 4 * * 1-5",
  enabled: true,
  trigger: "claude-cli",
  prompt_type: "fixed",
}

describe("generateId", () => {
  it("generates slug from trigger and cron time", () => {
    const id = generateId({ trigger: "claude-cli", cron: "0 4 * * 1-5" }, [])
    expect(id).toBe("claude-cli-04-00")
  })

  it("appends numeric suffix on collision", () => {
    const existing: ScheduleEntry[] = [{ ...base, id: "claude-cli-04-00" }]
    const id = generateId({ trigger: "claude-cli", cron: "0 4 * * 1-5" }, existing)
    expect(id).toBe("claude-cli-04-00-2")
  })

  it("increments suffix past 2", () => {
    const existing: ScheduleEntry[] = [
      { ...base, id: "claude-cli-04-00" },
      { ...base, id: "claude-cli-04-00-2" },
    ]
    const id = generateId({ trigger: "claude-cli", cron: "0 4 * * 1-5" }, existing)
    expect(id).toBe("claude-cli-04-00-3")
  })
})

describe("validateId", () => {
  it("accepts valid id", () => {
    expect(validateId("morning-session")).toBe(true)
  })

  it("rejects uppercase", () => {
    expect(validateId("Morning")).toBe(false)
  })

  it("rejects id shorter than 3 chars", () => {
    expect(validateId("ab")).toBe(false)
  })

  it("rejects id longer than 64 chars", () => {
    expect(validateId("a".repeat(65))).toBe(false)
  })

  it("rejects special characters other than hyphens", () => {
    expect(validateId("bad_id")).toBe(false)
    expect(validateId("bad id")).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/config/id.test.ts
```

Expected: FAIL — `generateId` not found.

- [ ] **Step 3: Create `src/config/id.ts`**

```typescript
import type { ScheduleEntry } from "./schema"

const ID_PATTERN = /^[a-z0-9-]{3,64}$/

export function validateId(id: string): boolean {
  return ID_PATTERN.test(id)
}

export function generateId(
  opts: { trigger: string; cron: string },
  existing: ScheduleEntry[]
): string {
  // Parse HH and MM from cron: "MIN HOUR ..."
  const parts = opts.cron.trim().split(/\s+/)
  const min = parts[0]?.padStart(2, "0") ?? "00"
  const hour = parts[1]?.padStart(2, "0") ?? "00"

  const base = `${opts.trigger}-${hour}-${min}`
  const taken = new Set(existing.map((s) => s.id))

  if (!taken.has(base)) return base

  let suffix = 2
  while (taken.has(`${base}-${suffix}`)) suffix++
  return `${base}-${suffix}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/config/id.test.ts
```

Expected: All 8 pass.

- [ ] **Step 5: Commit**

```bash
git add src/config/id.ts tests/config/id.test.ts
git commit -m "feat(config): add schedule ID generation and validation"
```

---

### Task 5: Config Read / Write / Migrate

**Files:**
- Create: `src/config/migrate.ts`
- Create: `src/config/index.ts`
- Create: `tests/config/migrate.test.ts`

- [ ] **Step 1: Write failing tests for migration**

Create `tests/config/migrate.test.ts`:

```typescript
import { describe, expect, it } from "bun:test"
import { migrateConfig } from "../../src/config/migrate"

describe("migrateConfig", () => {
  it("returns version-1 config unchanged", () => {
    const config = { version: 1, daemon: {}, schedules: [] }
    expect(migrateConfig(config)).toEqual(config)
  })

  it("adds version field if missing (pre-v1 config)", () => {
    const config = { daemon: {}, schedules: [] }
    const result = migrateConfig(config)
    expect(result.version).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/config/migrate.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `src/config/migrate.ts`**

```typescript
// Future migrations go here. For v1, only ensure version field exists.
export function migrateConfig(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.version === undefined) {
    return { ...raw, version: 1 }
  }
  return raw
}
```

- [ ] **Step 4: Create `src/config/index.ts`**

```typescript
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
    try { chmodSync(filePath, 0o600) } catch { /* ignore */ }
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
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "")
    if (key && !(key in process.env)) process.env[key] = val
  }
}
```

- [ ] **Step 5: Run migration tests**

```bash
bun test tests/config/migrate.test.ts
```

Expected: 2 pass.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
bun run lint
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/config/migrate.ts src/config/index.ts tests/config/migrate.test.ts
git commit -m "feat(config): add read/write/migrate config with permission enforcement"
```

---

## Chunk 2: Prompt Builders + Trigger Adapters

### Task 6: Prompt Builders

**Files:**
- Create: `src/prompts/fixed.ts`
- Create: `src/prompts/random.ts`
- Create: `src/prompts/dynamic.ts`
- Create: `src/prompts/index.ts`
- Create: `tests/prompts/fixed.test.ts`
- Create: `tests/prompts/random.test.ts`
- Create: `tests/prompts/dynamic.test.ts`

- [ ] **Step 1: Write failing tests for all three prompt types**

Create `tests/prompts/fixed.test.ts`:
```typescript
import { describe, expect, it } from "bun:test"
import { buildFixed } from "../../src/prompts/fixed"

describe("buildFixed", () => {
  it("returns the prompt string", () => {
    expect(buildFixed("Hello Claude")).toBe("Hello Claude")
  })

  it("throws if prompt is undefined", () => {
    expect(() => buildFixed(undefined)).toThrow("fixed prompt requires a 'prompt' field")
  })
})
```

Create `tests/prompts/random.test.ts`:
```typescript
import { describe, expect, it } from "bun:test"
import { buildRandom } from "../../src/prompts/random"

describe("buildRandom", () => {
  it("returns one item from the pool", () => {
    const pool = ["a", "b", "c"]
    const result = buildRandom(pool)
    expect(pool).toContain(result)
  })

  it("throws if pool is empty", () => {
    expect(() => buildRandom([])).toThrow("prompt pool is empty")
  })
})
```

Create `tests/prompts/dynamic.test.ts`:
```typescript
import { describe, expect, it } from "bun:test"
import { buildDynamic } from "../../src/prompts/dynamic"

describe("buildDynamic", () => {
  it("replaces {{schedule_id}}", () => {
    const result = buildDynamic("Session {{schedule_id}}", { scheduleId: "morning" })
    expect(result).toBe("Session morning")
  })

  it("replaces {{date}} with YYYY-MM-DD", () => {
    const result = buildDynamic("Date: {{date}}", { scheduleId: "x" })
    expect(result).toMatch(/Date: \d{4}-\d{2}-\d{2}/)
  })

  it("replaces {{time}} with HH:MM", () => {
    const result = buildDynamic("Time: {{time}}", { scheduleId: "x" })
    expect(result).toMatch(/Time: \d{2}:\d{2}/)
  })

  it("replaces {{day_of_week}}", () => {
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
    const result = buildDynamic("Day: {{day_of_week}}", { scheduleId: "x" })
    expect(days.some((d) => result.includes(d))).toBe(true)
  })

  it("throws if prompt_template is undefined", () => {
    expect(() => buildDynamic(undefined, { scheduleId: "x" })).toThrow(
      "dynamic prompt requires a 'prompt_template' field"
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they all fail**

```bash
bun test tests/prompts/
```

Expected: All fail — modules not found.

- [ ] **Step 3: Create `src/prompts/fixed.ts`**

```typescript
export function buildFixed(prompt: string | undefined): string {
  if (!prompt) throw new Error("fixed prompt requires a 'prompt' field")
  return prompt
}
```

- [ ] **Step 4: Create `src/prompts/random.ts`**

```typescript
export function buildRandom(pool: string[]): string {
  if (pool.length === 0) throw new Error("prompt pool is empty")
  return pool[Math.floor(Math.random() * pool.length)]!
}
```

- [ ] **Step 5: Create `src/prompts/dynamic.ts`**

```typescript
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]

export function buildDynamic(
  template: string | undefined,
  ctx: { scheduleId: string }
): string {
  if (!template) throw new Error("dynamic prompt requires a 'prompt_template' field")
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const time = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`
  const dayOfWeek = DAYS[now.getDay()]!

  return template
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{time\}\}/g, time)
    .replace(/\{\{day_of_week\}\}/g, dayOfWeek)
    .replace(/\{\{schedule_id\}\}/g, ctx.scheduleId)
}
```

- [ ] **Step 6: Create `src/prompts/index.ts`**

```typescript
import type { ScheduleEntry } from "../config/schema"
import { buildFixed } from "./fixed"
import { buildRandom } from "./random"
import { buildDynamic } from "./dynamic"

export function buildPrompt(schedule: ScheduleEntry, pool: string[]): string | null {
  switch (schedule.prompt_type) {
    case "fixed":   return buildFixed(schedule.prompt)
    case "random":  return buildRandom(pool)
    case "dynamic": return buildDynamic(schedule.prompt_template, { scheduleId: schedule.id })
    default: return null
  }
}
```

- [ ] **Step 7: Run all prompt tests**

```bash
bun test tests/prompts/
```

Expected: All 9 pass.

- [ ] **Step 8: Commit**

```bash
git add src/prompts/ tests/prompts/
git commit -m "feat(prompts): add fixed, random, and dynamic prompt builders"
```

---

### Task 7: Trigger Adapters

**Files:**
- Create: `src/triggers/claude-cli.ts`
- Create: `src/triggers/claude-api.ts`
- Create: `src/triggers/browser.ts`
- Create: `src/triggers/index.ts`
- Create: `tests/triggers/claude-cli.test.ts`
- Create: `tests/triggers/claude-api.test.ts`
- Create: `tests/triggers/browser.test.ts`

- [ ] **Step 1: Write failing tests for all three trigger adapters**

Create `tests/triggers/claude-cli.test.ts`:
```typescript
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
      // Always restore to the original, not to whatever .spawn currently is
      ;(Bun as unknown as Record<string, unknown>).spawn = originalSpawn
    }
  })
})
```

Create `tests/triggers/claude-api.test.ts`:
```typescript
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
```

Create `tests/triggers/browser.test.ts`:
```typescript
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
    // "start" is a cmd.exe built-in — must go via cmd /c, not direct spawn
    expect(mockSpawn).toHaveBeenCalledWith(["cmd", "/c", "start", "", "https://claude.ai"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/triggers/
```

Expected: All fail.

- [ ] **Step 3: Create `src/triggers/claude-cli.ts`**

```typescript
export async function claudeCliTrigger(prompt: string): Promise<void> {
  const proc = Bun.spawn(["claude", "--print", prompt], { stderr: "pipe" })
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    const errText = proc.stderr ? await new Response(proc.stderr).text() : ""
    throw new Error(`claude CLI exited with code ${exitCode}: ${errText}`)
  }
}
```

- [ ] **Step 4: Create `src/triggers/claude-api.ts`**

```typescript
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
```

- [ ] **Step 5: Create `src/triggers/browser.ts`**

```typescript
export async function browserTrigger(url: string): Promise<void> {
  if (process.platform === "win32") {
    Bun.spawn(["cmd", "/c", "start", "", url])
  } else if (process.platform === "darwin") {
    Bun.spawn(["open", url])
  } else {
    Bun.spawn(["xdg-open", url])
  }
}
```

- [ ] **Step 6: Create `src/triggers/index.ts`**

```typescript
import type { ScheduleEntry, Config } from "../config/schema"
import { claudeCliTrigger } from "./claude-cli"
import { claudeApiTrigger } from "./claude-api"
import { browserTrigger } from "./browser"

export async function fireTrigger(
  schedule: ScheduleEntry,
  prompt: string | null,
  config: Config
): Promise<void> {
  switch (schedule.trigger) {
    case "claude-cli":
      if (!prompt) throw new Error("claude-cli trigger requires a prompt")
      await claudeCliTrigger(prompt)
      break

    case "claude-api":
      if (!prompt) throw new Error("claude-api trigger requires a prompt")
      await claudeApiTrigger(prompt, config.triggers.claude_api ?? { api_key_env: "ANTHROPIC_API_KEY", model: "claude-sonnet-4-6" })
      break

    case "browser": {
      const url = config.triggers.browser?.url ?? "https://claude.ai"
      // Warn when a real prompt was configured but will be silently ignored.
      // "random" pool is often used as a default and the warning would be noisy,
      // so only warn for explicitly authored fixed/dynamic prompts.
      if (schedule.prompt_type === "fixed" || schedule.prompt_type === "dynamic") {
        console.warn(`[climitless] Warning: schedule "${schedule.id}" has prompt_type "${schedule.prompt_type}" but uses browser trigger — the prompt is not sent to the browser`)
      }
      await browserTrigger(url)
      break
    }
  }
}
```

- [ ] **Step 7: Run trigger tests**

```bash
bun test tests/triggers/
```

Expected: Core tests pass (some may need adjustment for Bun module caching — re-run if first run fails due to module import caching).

- [ ] **Step 8: Commit**

```bash
git add src/triggers/ tests/triggers/
git commit -m "feat(triggers): add claude-cli, claude-api, and browser trigger adapters"
```

---

## Chunk 3: Scheduler + Daemon

### Task 8: Scheduler (croner wrapper)

**Files:**
- Create: `src/scheduler/index.ts`
- Create: `tests/scheduler/index.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/scheduler/index.test.ts`:
```typescript
import { describe, expect, it, mock } from "bun:test"
import { SchedulerManager } from "../../src/scheduler/index"
import type { ScheduleEntry } from "../../src/config/schema"

const entry: ScheduleEntry = {
  id: "test",
  cron: "* * * * *",
  enabled: true,
  trigger: "claude-cli",
  prompt_type: "fixed",
  prompt: "Hello",
}

describe("SchedulerManager", () => {
  it("registers a schedule and returns its id", () => {
    const sm = new SchedulerManager()
    const handler = mock(async () => {})
    sm.register(entry, handler)
    expect(sm.isRegistered("test")).toBe(true)
    sm.stop()
  })

  it("does not register disabled schedules", () => {
    const sm = new SchedulerManager()
    const handler = mock(async () => {})
    sm.register({ ...entry, enabled: false }, handler)
    expect(sm.isRegistered("test")).toBe(false)
    sm.stop()
  })

  it("unregisters a schedule", () => {
    const sm = new SchedulerManager()
    sm.register(entry, mock(async () => {}))
    sm.unregister("test")
    expect(sm.isRegistered("test")).toBe(false)
    sm.stop()
  })

  it("replaces an existing schedule on re-register", () => {
    const sm = new SchedulerManager()
    const h1 = mock(async () => {})
    const h2 = mock(async () => {})
    sm.register(entry, h1)
    sm.register(entry, h2)
    expect(sm.isRegistered("test")).toBe(true)
    sm.stop()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/scheduler/index.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `src/scheduler/index.ts`**

```typescript
import { Cron } from "croner"
import type { ScheduleEntry } from "../config/schema"

type Handler = () => Promise<void>

export class SchedulerManager {
  private jobs = new Map<string, Cron>()

  register(entry: ScheduleEntry, handler: Handler): void {
    if (!entry.enabled) return
    // Stop existing job if present
    this.unregister(entry.id)
    const job = new Cron(entry.cron, { name: entry.id }, handler)
    this.jobs.set(entry.id, job)
  }

  unregister(id: string): void {
    const job = this.jobs.get(id)
    if (job) { job.stop(); this.jobs.delete(id) }
  }

  isRegistered(id: string): boolean {
    return this.jobs.has(id)
  }

  nextFire(id: string): Date | null {
    return this.jobs.get(id)?.nextRun() ?? null
  }

  stopAll(): void {
    for (const job of this.jobs.values()) job.stop()
    this.jobs.clear()
  }

  /** Alias used in tests */
  stop(): void { this.stopAll() }
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/scheduler/index.test.ts
```

Expected: All 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/scheduler/index.ts tests/scheduler/index.test.ts
git commit -m "feat(scheduler): add croner-based SchedulerManager"
```

---

### Task 9: Daemon IPC Server

**Files:**
- Create: `src/daemon/ipc.ts`
- Create: `tests/daemon/ipc.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/daemon/ipc.test.ts`:
```typescript
import { describe, expect, it, mock } from "bun:test"
import { createIpcServer, sendIpcCommand } from "../../src/daemon/ipc"
import { SOCKET_PATH } from "../../src/config/paths"
import { existsSync, unlinkSync } from "fs"

describe("IPC round-trip", () => {
  it("status command returns ok:true with data", async () => {
    // Clean up any stale socket
    if (process.platform !== "win32" && existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)

    const handlers = {
      status: mock(async () => ({ running: true, schedules: 0 })),
      reload: mock(async () => ({})),
      stop: mock(async () => ({})),
      fire: mock(async (_id: string) => ({})),
    }

    const server = createIpcServer(handlers)

    try {
      const res = await sendIpcCommand({ command: "status" })
      expect(res.ok).toBe(true)
      expect((res.data as Record<string, unknown>).running).toBe(true)
    } finally {
      server.stop()
    }
  })

  it("reload command returns ok:true", async () => {
    if (process.platform !== "win32" && existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
    const handlers = {
      status: mock(async () => ({})),
      reload: mock(async () => ({ reloaded: true })),
      stop: mock(async () => ({})),
      fire: mock(async (_id: string) => ({})),
    }
    const server = createIpcServer(handlers)
    try {
      const res = await sendIpcCommand({ command: "reload" })
      expect(res.ok).toBe(true)
      expect((res.data as Record<string, unknown>).reloaded).toBe(true)
    } finally {
      server.stop()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/daemon/ipc.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `src/daemon/ipc.ts`**

> **Windows note:** `Bun.listen({ unix: ... })` uses `AF_UNIX` sockets which do not map to Win32 named pipes. On Windows, IPC falls back to a TCP loopback on `127.0.0.1` with the port stored in `~/.climitless/daemon.port`. On Unix, the Unix socket is used as designed.

```typescript
import { SOCKET_PATH, CONFIG_DIR } from "../config/paths"
import { join } from "path"
import type { IpcRequest, IpcResponse } from "../scheduler/types"
import { existsSync, unlinkSync, readFileSync, writeFileSync } from "fs"
import { createServer, createConnection } from "net"

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

export function createIpcServer(handlers: IpcHandlers): { stop: () => void } {
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
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number }
      writeFileSync(PORT_FILE, String(addr.port), "utf-8")
    })
    return { stop() { server.close(); if (existsSync(PORT_FILE)) unlinkSync(PORT_FILE) } }
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
    return { stop() { server.stop(); if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH) } }
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
      // Guard on Unix too — gives a friendly error instead of a raw ENOENT
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
```

- [ ] **Step 4: Run IPC tests**

```bash
bun test tests/daemon/ipc.test.ts
```

Expected: Both pass.

- [ ] **Step 5: Commit**

```bash
git add src/daemon/ipc.ts tests/daemon/ipc.test.ts
git commit -m "feat(daemon): add IPC server and client over Unix socket"
```

---

### Task 10: Daemon Lifecycle + Entry Point

**Files:**
- Create: `src/daemon/lifecycle.ts`
- Create: `src/daemon/index.ts`
- Create: `src/notifications/index.ts`

- [ ] **Step 1: Create `src/notifications/index.ts`** (stub)

```typescript
export interface NotificationAdapter {
  notify(event: { scheduleId: string; trigger: string; success: boolean; message?: string }): Promise<void>
}

export class NoopAdapter implements NotificationAdapter {
  async notify(): Promise<void> { /* no-op in v1 */ }
}
```

- [ ] **Step 2: Create `src/daemon/lifecycle.ts`**

```typescript
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs"
import { PID_FILE } from "../config/paths"

export function writePid(): void {
  writeFileSync(PID_FILE, String(process.pid), "utf-8")
}

export function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null
  const raw = readFileSync(PID_FILE, "utf-8").trim()
  const pid = parseInt(raw, 10)
  return isNaN(pid) ? null : pid
}

export function clearPid(): void {
  if (existsSync(PID_FILE)) unlinkSync(PID_FILE)
}

export function isDaemonRunning(): boolean {
  const pid = readPid()
  if (!pid) return false
  try {
    // Signal 0 checks if process exists without killing it
    process.kill(pid, 0)
    return true
  } catch (err) {
    // ESRCH = no such process → daemon is gone, clean up PID file
    // EPERM = process exists but owned by different user → treat as running
    if ((err as NodeJS.ErrnoException).code === "ESRCH") {
      clearPid()
      return false
    }
    return true
  }
}
```

- [ ] **Step 3: Create `src/daemon/index.ts`** (daemon entry point)

```typescript
#!/usr/bin/env bun
import { readConfig, loadEnvFile } from "../config/index"
import { SchedulerManager } from "../scheduler/index"
import { buildPrompt } from "../prompts/index"
import { fireTrigger } from "../triggers/index"
import { createIpcServer } from "./ipc"
import { writePid, clearPid } from "./lifecycle"
import { LOG_FILE } from "../config/paths"
import pino from "pino"

loadEnvFile()

let config = readConfig()

const logger = pino(
  { level: config.daemon.log_level },
  pino.destination(LOG_FILE)
)

const scheduler = new SchedulerManager()

function registerAllSchedules(): void {
  scheduler.stopAll()
  config = readConfig()
  for (const schedule of config.schedules) {
    scheduler.register(schedule, async () => {
      logger.info({ scheduleId: schedule.id, trigger: schedule.trigger }, "Firing schedule")
      try {
        const prompt = buildPrompt(schedule, config.prompts.pool)
        await fireTrigger(schedule, prompt, config)
        logger.info({ scheduleId: schedule.id }, "Schedule fired successfully")
      } catch (err) {
        logger.error({ scheduleId: schedule.id, err }, "Schedule trigger failed")
      }
    })
  }
}

registerAllSchedules()
writePid()

const ipcServer = createIpcServer({
  status: async () => ({
    running: true,
    pid: process.pid,
    schedules: config.schedules.filter((s) => s.enabled).map((s) => ({
      id: s.id,
      cron: s.cron,
      nextFire: scheduler.nextFire(s.id)?.toISOString() ?? null,
    })),
  }),
  reload: async () => {
    registerAllSchedules()
    return { reloaded: true }
  },
  stop: async () => {
    scheduler.stopAll()
    ipcServer.stop()
    clearPid()
    process.exit(0)
  },
  fire: async (scheduleId: string) => {
    const schedule = config.schedules.find((s) => s.id === scheduleId)
    if (!schedule) throw new Error(`Schedule not found: ${scheduleId}`)
    const prompt = buildPrompt(schedule, config.prompts.pool)
    await fireTrigger(schedule, prompt, config)
    return { fired: scheduleId }
  },
})

logger.info({ pid: process.pid }, "climitless daemon started")

process.on("SIGINT", () => { scheduler.stopAll(); ipcServer.stop(); clearPid(); process.exit(0) })
process.on("SIGTERM", () => { scheduler.stopAll(); ipcServer.stop(); clearPid(); process.exit(0) })
```

- [ ] **Step 4: Verify compilation**

```bash
bun run lint
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/daemon/ src/notifications/
git commit -m "feat(daemon): add lifecycle management and daemon entry point"
```

---

## Chunk 4: CLI Commands

### Task 11: CLI Entry Point + Daemon Commands

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/cli/commands/daemon.ts`
- Create: `src/daemon/autostart.ts`

- [ ] **Step 1: Create `src/daemon/autostart.ts`**

```typescript
import { homedir } from "os"
import { join } from "path"
import { writeFileSync, unlinkSync, existsSync } from "fs"
import { execSync } from "child_process"

// Use import.meta.dir so the path is always relative to this source file,
// not to the working directory the user happened to be in when running the CLI.
const DAEMON_SCRIPT = join(import.meta.dir, "..", "daemon", "index.ts")
const DAEMON_CMD = `bun run ${DAEMON_SCRIPT}`

export function installAutostart(): void {
  if (process.platform === "darwin") {
    // Use DAEMON_SCRIPT (resolved via import.meta.dir) — NOT process.cwd() which is
    // wherever the user ran the command from and will be wrong after install.
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.climitless.daemon</string>
  <key>ProgramArguments</key><array><string>bun</string><string>run</string><string>${DAEMON_SCRIPT}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
</dict></plist>`
    const plistPath = join(homedir(), "Library/LaunchAgents/com.climitless.daemon.plist")
    writeFileSync(plistPath, plist)
    execSync(`launchctl load "${plistPath}"`)
  } else if (process.platform === "linux") {
    const service = `[Unit]\nDescription=climitless daemon\n[Service]\nExecStart=${DAEMON_CMD}\nRestart=no\n[Install]\nWantedBy=default.target\n`
    const dir = join(homedir(), ".config/systemd/user")
    if (!existsSync(dir)) execSync(`mkdir -p "${dir}"`)
    writeFileSync(join(dir, "climitless.service"), service)
    execSync("systemctl --user enable climitless.service")
    execSync("systemctl --user start climitless.service")
  } else if (process.platform === "win32") {
    execSync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v climitless /t REG_SZ /d "${DAEMON_CMD}" /f`)
  }
}

export function uninstallAutostart(): void {
  if (process.platform === "darwin") {
    const plistPath = join(homedir(), "Library/LaunchAgents/com.climitless.daemon.plist")
    if (existsSync(plistPath)) {
      try { execSync(`launchctl unload "${plistPath}"`) } catch { /* ignore */ }
      unlinkSync(plistPath)
    }
  } else if (process.platform === "linux") {
    try { execSync("systemctl --user disable climitless.service") } catch { /* ignore */ }
    try { execSync("systemctl --user stop climitless.service") } catch { /* ignore */ }
    const path = join(homedir(), ".config/systemd/user/climitless.service")
    if (existsSync(path)) unlinkSync(path)
  } else if (process.platform === "win32") {
    try { execSync(`reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v climitless /f`) } catch { /* ignore */ }
  }
}
```

- [ ] **Step 2: Create `src/cli/commands/daemon.ts`**

```typescript
import { Command } from "commander"
import { join } from "path"
import { isDaemonRunning } from "../../daemon/lifecycle"
import { sendIpcCommand } from "../../daemon/ipc"
import { installAutostart, uninstallAutostart } from "../../daemon/autostart"

export function daemonCommand(): Command {
  const cmd = new Command("daemon").description("Manage the climitless daemon")

  cmd.command("start").description("Start the daemon").action(async () => {
    if (isDaemonRunning()) { console.log("Daemon is already running."); return }
    // Use import.meta.dir to resolve path relative to the CLI source file,
    // not the user's current working directory.
    const daemonScript = join(import.meta.dir, "..", "..", "daemon", "index.ts")
    const proc = Bun.spawn(["bun", "run", daemonScript], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
    })
    proc.unref()
    console.log("Daemon started.")
  })

  cmd.command("stop").description("Stop the daemon").action(async () => {
    if (!isDaemonRunning()) { console.log("Daemon is not running."); return }
    try {
      await sendIpcCommand({ command: "stop" })
      console.log("Daemon stopped.")
    } catch { console.error("Could not reach daemon.") }
  })

  cmd.command("restart").description("Restart the daemon").action(async () => {
    if (isDaemonRunning()) {
      try { await sendIpcCommand({ command: "stop" }) } catch { /* ignore */ }
    }
    const daemonScript = join(import.meta.dir, "..", "..", "daemon", "index.ts")
    const proc = Bun.spawn(["bun", "run", daemonScript], { detached: true, stdio: ["ignore","ignore","ignore"] })
    proc.unref()
    console.log("Daemon restarted.")
  })

  cmd.command("status").description("Show daemon status").action(async () => {
    if (!isDaemonRunning()) { console.log("Daemon is not running."); return }
    try {
      const res = await sendIpcCommand({ command: "status" })
      if (res.ok) console.log(JSON.stringify(res.data, null, 2))
      else console.error(res.error)
    } catch (err) { console.error(String(err)) }
  })

  cmd.command("install").description("Register daemon to auto-start on login").action(() => {
    installAutostart(); console.log("Auto-start registered.")
  })

  cmd.command("uninstall").description("Remove auto-start registration").action(() => {
    uninstallAutostart(); console.log("Auto-start removed.")
  })

  return cmd
}
```

- [ ] **Step 3: Create `src/cli/index.ts`**

```typescript
#!/usr/bin/env bun
import { Command } from "commander"
import { daemonCommand } from "./commands/daemon"
import { addCommand } from "./commands/add"
import { listCommand } from "./commands/list"
import { removeCommand } from "./commands/remove"
import { enableCommand } from "./commands/enable"
import { disableCommand } from "./commands/disable"
import { fireCommand } from "./commands/fire"
import { configCommand } from "./commands/config"
import { promptsCommand } from "./commands/prompts"
import { logsCommand } from "./commands/logs"
import { uninstallCommand } from "./commands/uninstall"

const program = new Command()
  .name("climitless")
  .description("Schedule and auto-fire Claude sessions")
  .version("0.1.0")

program.addCommand(daemonCommand())
program.addCommand(addCommand())
program.addCommand(listCommand())
program.addCommand(removeCommand())
program.addCommand(enableCommand())
program.addCommand(disableCommand())
program.addCommand(fireCommand())
program.addCommand(configCommand())
program.addCommand(promptsCommand())
program.addCommand(logsCommand())
program.addCommand(uninstallCommand())

program.parse()
```

- [ ] **Step 4: Verify compilation**

```bash
bun run lint
```

Note: This will fail until all command files are created (next tasks). That is expected at this step.

- [ ] **Step 5: Commit what exists**

```bash
git add src/daemon/autostart.ts src/cli/commands/daemon.ts src/cli/index.ts
git commit -m "feat(cli): add daemon commands and CLI entry point"
```

---

### Task 12: Schedule Management Commands

**Files:**
- Create: `src/cli/commands/add.ts`
- Create: `src/cli/commands/list.ts`
- Create: `src/cli/commands/remove.ts`
- Create: `src/cli/commands/enable.ts`
- Create: `src/cli/commands/disable.ts`

- [ ] **Step 1: Create `src/cli/commands/add.ts`**

```typescript
import { Command } from "commander"
import { readConfig, writeConfig } from "../../config/index"
import { generateId, validateId } from "../../config/id"
import { sendIpcCommand } from "../../daemon/ipc"
import { isDaemonRunning } from "../../daemon/lifecycle"
import { runWizard } from "../../wizard/index"
import type { ScheduleEntry } from "../../config/schema"

export function addCommand(): Command {
  return new Command("add")
    .description("Add a new schedule (wizard if no cron arg)")
    .argument("[cron]", "Cron expression")
    .option("--trigger <type>", "Trigger type: claude-cli | claude-api | browser")
    .option("--prompt-type <type>", "Prompt type: fixed | random | dynamic")
    .option("--prompt <text>", "Fixed prompt text")
    .option("--prompt-template <text>", "Dynamic prompt template")
    .option("--id <id>", "Schedule ID (auto-generated if omitted)")
    .action(async (cron: string | undefined, opts) => {
      const config = readConfig()
      let entry: ScheduleEntry

      if (!cron) {
        // Launch interactive wizard
        entry = await runWizard(config)
      } else {
        // Non-interactive mode — validate all required flags
        if (!opts.trigger) { console.error("--trigger is required"); process.exit(1) }
        if (!opts.promptType) { console.error("--prompt-type is required"); process.exit(1) }
        if (opts.promptType === "fixed" && !opts.prompt) { console.error("--prompt is required for fixed prompt-type"); process.exit(1) }
        if (opts.promptType === "dynamic" && !opts.promptTemplate) { console.error("--prompt-template is required for dynamic prompt-type"); process.exit(1) }

        const id = opts.id ?? generateId({ trigger: opts.trigger, cron }, config.schedules)
        if (!validateId(id)) { console.error(`Invalid ID "${id}" — use lowercase alphanumeric and hyphens, 3-64 chars`); process.exit(1) }
        if (config.schedules.find((s) => s.id === id)) { console.error(`Schedule ID "${id}" already exists`); process.exit(1) }

        entry = {
          id,
          cron,
          enabled: true,
          trigger: opts.trigger,
          prompt_type: opts.promptType,
          ...(opts.prompt && { prompt: opts.prompt }),
          ...(opts.promptTemplate && { prompt_template: opts.promptTemplate }),
        }
      }

      config.schedules.push(entry)
      writeConfig(config)
      console.log(`Schedule "${entry.id}" added.`)

      if (isDaemonRunning()) {
        try { await sendIpcCommand({ command: "reload" }) } catch { /* daemon will reload on next start */ }
      }
    })
}
```

- [ ] **Step 2: Create `src/cli/commands/list.ts`**

```typescript
import { Command } from "commander"
import { readConfig } from "../../config/index"
import { sendIpcCommand } from "../../daemon/ipc"
import { isDaemonRunning } from "../../daemon/lifecycle"

export function listCommand(): Command {
  return new Command("list")
    .description("List all schedules")
    .action(async () => {
      const config = readConfig()
      if (config.schedules.length === 0) { console.log("No schedules configured."); return }

      // Try to get next fire times from daemon
      let nextFires: Record<string, string | null> = {}
      if (isDaemonRunning()) {
        try {
          const res = await sendIpcCommand({ command: "status" })
          if (res.ok) {
            const data = res.data as { schedules: Array<{ id: string; nextFire: string | null }> }
            nextFires = Object.fromEntries(data.schedules.map((s) => [s.id, s.nextFire]))
          }
        } catch { /* ignore */ }
      }

      console.log("\nSchedules:\n")
      for (const s of config.schedules) {
        const status = s.enabled ? "✓" : "✗"
        const next = nextFires[s.id] ? `  next: ${nextFires[s.id]}` : ""
        console.log(`  [${status}] ${s.id}  (${s.cron})  trigger: ${s.trigger}  prompt: ${s.prompt_type}${next}`)
      }
      console.log()
    })
}
```

- [ ] **Step 3: Create `src/cli/commands/remove.ts`**

```typescript
import { Command } from "commander"
import { readConfig, writeConfig } from "../../config/index"
import { sendIpcCommand } from "../../daemon/ipc"
import { isDaemonRunning } from "../../daemon/lifecycle"

export function removeCommand(): Command {
  return new Command("remove")
    .description("Remove a schedule by ID")
    .argument("<id>", "Schedule ID")
    .action(async (id: string) => {
      const config = readConfig()
      const idx = config.schedules.findIndex((s) => s.id === id)
      if (idx === -1) {
        console.error(`Schedule "${id}" not found. Valid IDs: ${config.schedules.map((s) => s.id).join(", ")}`)
        process.exit(1)
      }
      config.schedules.splice(idx, 1)
      writeConfig(config)
      console.log(`Schedule "${id}" removed.`)
      if (isDaemonRunning()) {
        try { await sendIpcCommand({ command: "reload" }) } catch { /* ignore */ }
      }
    })
}
```

- [ ] **Step 4: Create `src/cli/commands/enable.ts` and `disable.ts`**

Create `src/cli/commands/enable.ts`:
```typescript
import { Command } from "commander"
import { readConfig, writeConfig } from "../../config/index"
import { sendIpcCommand } from "../../daemon/ipc"
import { isDaemonRunning } from "../../daemon/lifecycle"

export function enableCommand(): Command {
  return new Command("enable")
    .description("Enable a schedule")
    .argument("<id>", "Schedule ID")
    .action(async (id: string) => {
      const config = readConfig()
      const schedule = config.schedules.find((s) => s.id === id)
      if (!schedule) { console.error(`Schedule "${id}" not found`); process.exit(1) }
      schedule.enabled = true
      writeConfig(config)
      console.log(`Schedule "${id}" enabled.`)
      if (isDaemonRunning()) { try { await sendIpcCommand({ command: "reload" }) } catch { /* ignore */ } }
    })
}
```

Create `src/cli/commands/disable.ts`:
```typescript
import { Command } from "commander"
import { readConfig, writeConfig } from "../../config/index"
import { sendIpcCommand } from "../../daemon/ipc"
import { isDaemonRunning } from "../../daemon/lifecycle"

export function disableCommand(): Command {
  return new Command("disable")
    .description("Disable a schedule without deleting it")
    .argument("<id>", "Schedule ID")
    .action(async (id: string) => {
      const config = readConfig()
      const schedule = config.schedules.find((s) => s.id === id)
      if (!schedule) { console.error(`Schedule "${id}" not found`); process.exit(1) }
      schedule.enabled = false
      writeConfig(config)
      console.log(`Schedule "${id}" disabled.`)
      if (isDaemonRunning()) { try { await sendIpcCommand({ command: "reload" }) } catch { /* ignore */ } }
    })
}
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/add.ts src/cli/commands/list.ts src/cli/commands/remove.ts src/cli/commands/enable.ts src/cli/commands/disable.ts
git commit -m "feat(cli): add list, remove, enable, disable schedule commands"
```

---

### Task 13: Fire, Config, Prompts, Logs, Uninstall Commands

**Files:**
- Create: `src/cli/commands/fire.ts`
- Create: `src/cli/commands/config.ts`
- Create: `src/cli/commands/prompts.ts`
- Create: `src/logs/index.ts`
- Create: `src/cli/commands/logs.ts`
- Create: `src/cli/commands/uninstall.ts`

- [ ] **Step 1: Create `src/cli/commands/fire.ts`**

```typescript
import { Command } from "commander"
import { readConfig } from "../../config/index"
import { buildPrompt } from "../../prompts/index"
import { fireTrigger } from "../../triggers/index"
import { sendIpcCommand } from "../../daemon/ipc"
import { isDaemonRunning } from "../../daemon/lifecycle"

export function fireCommand(): Command {
  return new Command("fire")
    .description("Manually fire a schedule now")
    .argument("<id>", "Schedule ID")
    .option("--dry-run", "Preview without firing")
    .action(async (id: string, opts) => {
      const config = readConfig()
      const schedule = config.schedules.find((s) => s.id === id)
      if (!schedule) { console.error(`Schedule "${id}" not found`); process.exit(1) }

      const prompt = buildPrompt(schedule, config.prompts.pool)

      if (opts.dryRun) {
        console.log("\nDry run preview:")
        console.log(`  ID:      ${schedule.id}`)
        console.log(`  Trigger: ${schedule.trigger}`)
        console.log(`  Prompt:  ${prompt ?? "(none — browser trigger)"}`)
        return
      }

      if (isDaemonRunning()) {
        try {
          const res = await sendIpcCommand({ command: "fire", scheduleId: id })
          if (res.ok) console.log(`Schedule "${id}" fired.`)
          else { console.error(res.error); process.exit(1) }
          return
        } catch { /* fall through to direct fire */ }
      }

      // Fire directly if daemon is not running
      await fireTrigger(schedule, prompt, config)
      console.log(`Schedule "${id}" fired.`)
    })
}
```

- [ ] **Step 2: Create `src/cli/commands/config.ts`**

```typescript
import { Command } from "commander"
import { CONFIG_FILE } from "../../config/paths"
import { readConfig } from "../../config/index"
import { stringify } from "smol-toml"

export function configCommand(): Command {
  const cmd = new Command("config").description("Manage configuration")

  cmd.command("show").description("Print current config").action(() => {
    const config = readConfig()
    console.log(stringify(config as Record<string, unknown>))
  })

  cmd.command("edit").description("Open config in $EDITOR").action(async () => {
    const editor = process.env["EDITOR"] ?? (process.platform === "win32" ? "notepad" : "nano")
    // Await exited so the CLI does not return to the shell mid-edit (which corrupts the TTY)
    const proc = Bun.spawn([editor, CONFIG_FILE], { stdio: ["inherit", "inherit", "inherit"] })
    await proc.exited
  })

  return cmd
}
```

- [ ] **Step 3: Create `src/cli/commands/prompts.ts`**

```typescript
import { Command } from "commander"
import { readConfig, writeConfig } from "../../config/index"

export function promptsCommand(): Command {
  const cmd = new Command("prompts").description("Manage the random prompt pool")

  cmd.command("list").description("List all prompts in the pool").action(() => {
    const config = readConfig()
    if (config.prompts.pool.length === 0) { console.log("Pool is empty."); return }
    config.prompts.pool.forEach((p, i) => console.log(`  [${i}] ${p}`))
  })

  cmd.command("add").description("Add a prompt to the pool").argument("<prompt>", "Prompt text").action((prompt: string) => {
    const config = readConfig()
    config.prompts.pool.push(prompt)
    writeConfig(config)
    console.log("Prompt added to pool.")
  })

  cmd.command("remove").description("Remove a prompt by index").argument("<index>", "Index from prompts list").action((indexStr: string) => {
    const index = parseInt(indexStr, 10)
    const config = readConfig()
    if (isNaN(index) || index < 0 || index >= config.prompts.pool.length) {
      console.error(`Invalid index. Run "climitless prompts list" to see valid indices.`)
      process.exit(1)
    }
    const removed = config.prompts.pool.splice(index, 1)
    writeConfig(config)
    console.log(`Removed: "${removed[0]}"`)
  })

  return cmd
}
```

- [ ] **Step 4: Create `src/logs/index.ts`**

```typescript
import { existsSync, readFileSync, writeFileSync } from "fs"
import { LOG_FILE } from "../config/paths"

export interface LogEntry {
  time: number
  level: number
  msg: string
  scheduleId?: string
  trigger?: string
  err?: unknown
}

const LEVEL_LABELS: Record<number, string> = { 10: "TRACE", 20: "DEBUG", 30: "INFO", 40: "WARN", 50: "ERROR", 60: "FATAL" }

function formatEntry(entry: LogEntry): string {
  const time = new Date(entry.time).toLocaleString()
  const level = LEVEL_LABELS[entry.level] ?? String(entry.level)
  const id = entry.scheduleId ? ` [${entry.scheduleId}]` : ""
  return `${time}  ${level.padEnd(5)}${id}  ${entry.msg}`
}

export function readLogs(opts: { lines?: number; scheduleId?: string; offsetLines?: number } = {}): string[] {
  if (!existsSync(LOG_FILE)) return []
  const raw = readFileSync(LOG_FILE, "utf-8").trim().split("\n")
  const entries = raw
    .filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l) as LogEntry } catch { return null } })
    .filter((e): e is LogEntry => e !== null)
    .filter((e) => !opts.scheduleId || e.scheduleId === opts.scheduleId)

  // offsetLines: skip the first N lines (used by --follow to avoid re-printing)
  const sliced = opts.offsetLines ? entries.slice(opts.offsetLines) : entries
  const limited = opts.lines ? sliced.slice(-opts.lines) : sliced.slice(-50)
  return limited.map(formatEntry)
}

export function countLogLines(scheduleId?: string): number {
  if (!existsSync(LOG_FILE)) return 0
  const raw = readFileSync(LOG_FILE, "utf-8").trim().split("\n")
  return raw
    .filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l) as LogEntry } catch { return null } })
    .filter((e): e is LogEntry => e !== null)
    .filter((e) => !scheduleId || e.scheduleId === scheduleId)
    .length
}

export function clearLogs(): void {
  writeFileSync(LOG_FILE, "", "utf-8")
}
```

- [ ] **Step 5: Create `src/cli/commands/logs.ts`**

```typescript
import { Command } from "commander"
import { readLogs, clearLogs, countLogLines } from "../../logs/index"
import { LOG_FILE } from "../../config/paths"
import { existsSync, watchFile } from "fs"

export function logsCommand(): Command {
  return new Command("logs")
    .description("View trigger logs")
    .option("--follow", "Live-tail logs")
    .option("--lines <n>", "Number of lines to show (default: 50)", "50")
    .option("--schedule <id>", "Filter to a specific schedule")
    .option("--clear", "Clear all logs")
    .action((opts) => {
      if (opts.clear) { clearLogs(); console.log("Logs cleared."); return }

      const lines = readLogs({ lines: parseInt(opts.lines, 10), scheduleId: opts.schedule })
      lines.forEach((l) => console.log(l))

      if (opts.follow) {
        console.log("\n--- following (Ctrl+C to exit) ---")
        // Track how many lines we've already printed so --follow only emits new ones
        let seenCount = countLogLines(opts.schedule)
        if (!existsSync(LOG_FILE)) return
        watchFile(LOG_FILE, { interval: 500 }, () => {
          const fresh = readLogs({ offsetLines: seenCount, scheduleId: opts.schedule })
          fresh.forEach((l) => console.log(l))
          seenCount += fresh.length
        })
      }
    })
}
```

- [ ] **Step 6: Create `src/cli/commands/uninstall.ts`**

```typescript
import { Command } from "commander"
import { isDaemonRunning } from "../../daemon/lifecycle"
import { sendIpcCommand } from "../../daemon/ipc"
import { uninstallAutostart } from "../../daemon/autostart"
import { CONFIG_DIR } from "../../config/paths"
import { rmSync, existsSync } from "fs"

export function uninstallCommand(): Command {
  return new Command("uninstall")
    .description("Remove climitless auto-start and optionally all data")
    .option("--purge", "Also delete config, logs, and all user data")
    .action(async (opts) => {
      if (isDaemonRunning()) {
        try { await sendIpcCommand({ command: "stop" }) } catch { /* ignore */ }
      }
      uninstallAutostart()

      if (opts.purge) {
        if (existsSync(CONFIG_DIR)) rmSync(CONFIG_DIR, { recursive: true, force: true })
        console.log("climitless fully uninstalled. All data removed.")
      } else {
        console.log("climitless auto-start removed. Config and logs preserved.")
      }
    })
}
```

- [ ] **Step 7: Run full lint check**

```bash
bun run lint
```

Expected: No errors.

- [ ] **Step 8: Run all tests**

```bash
bun test
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/cli/commands/ src/logs/
git commit -m "feat(cli): add fire, config, prompts, logs, and uninstall commands"
```

---

## Chunk 5: Interactive Wizard + Integration

### Task 14: Interactive Wizard

**Files:**
- Create: `src/wizard/index.ts`

- [ ] **Step 1: Create `src/wizard/index.ts`**

```typescript
import * as p from "@clack/prompts"
import type { Config, ScheduleEntry } from "../config/schema"
import { generateId, validateId } from "../config/id"

export async function runWizard(config: Config): Promise<ScheduleEntry> {
  p.intro("climitless — Add Schedule")

  const trigger = await p.select<string>({
    message: "Trigger type",
    options: [
      { value: "claude-cli", label: "Claude CLI (requires `claude` on PATH)" },
      { value: "claude-api", label: "Claude API (requires ANTHROPIC_API_KEY)" },
      { value: "browser",    label: "Browser (opens Claude.ai URL)" },
    ],
  })
  if (p.isCancel(trigger)) { p.cancel("Cancelled"); process.exit(0) }

  const scheduleMode = await p.select<string>({
    message: "How would you like to set the schedule?",
    options: [
      { value: "simple", label: "Simple time (e.g. 04:00 daily)" },
      { value: "cron",   label: "Cron expression (advanced)" },
    ],
  })
  if (p.isCancel(scheduleMode)) { p.cancel("Cancelled"); process.exit(0) }

  let cron: string
  if (scheduleMode === "simple") {
    const time = await p.text({ message: "Enter time (HH:MM)", placeholder: "04:00" })
    if (p.isCancel(time)) { p.cancel("Cancelled"); process.exit(0) }
    const [hh, mm] = (time as string).split(":")
    const recurrence = await p.select<string>({
      message: "Recurrence",
      options: [
        { value: "daily",    label: "Every day" },
        { value: "weekdays", label: "Weekdays only (Mon-Fri)" },
        { value: "once",     label: "One-shot (runs once, then you remove it)" },
      ],
    })
    if (p.isCancel(recurrence)) { p.cancel("Cancelled"); process.exit(0) }
    const days = recurrence === "weekdays" ? "1-5" : "*"
    cron = `${mm ?? "0"} ${hh ?? "0"} * * ${days}`
  } else {
    const cronRaw = await p.text({ message: "Enter cron expression", placeholder: "0 4 * * 1-5" })
    if (p.isCancel(cronRaw)) { p.cancel("Cancelled"); process.exit(0) }
    cron = cronRaw as string
  }

  const promptType = await p.select<string>({
    message: "Prompt type",
    options: [
      { value: "fixed",   label: "Fixed — always the same message" },
      { value: "random",  label: "Random — pick from your prompt pool" },
      { value: "dynamic", label: "Dynamic — template with {{date}}, {{day_of_week}}, etc." },
    ],
  })
  if (p.isCancel(promptType)) { p.cancel("Cancelled"); process.exit(0) }

  let promptValue: string | undefined
  let promptTemplate: string | undefined
  if (promptType === "fixed") {
    const txt = await p.text({ message: "Enter your prompt", placeholder: "Start a new work session." })
    if (p.isCancel(txt)) { p.cancel("Cancelled"); process.exit(0) }
    promptValue = txt as string
  } else if (promptType === "dynamic") {
    const tpl = await p.text({ message: "Enter prompt template", placeholder: "Session on {{day_of_week}} {{date}}." })
    if (p.isCancel(tpl)) { p.cancel("Cancelled"); process.exit(0) }
    promptTemplate = tpl as string
  }

  const autoId = generateId({ trigger: trigger as string, cron }, config.schedules)
  const idRaw = await p.text({
    message: "Schedule ID (leave blank to auto-generate)",
    placeholder: autoId,
  })
  if (p.isCancel(idRaw)) { p.cancel("Cancelled"); process.exit(0) }
  const id = (idRaw as string).trim() || autoId
  if (!validateId(id)) { p.cancel(`Invalid ID "${id}"`); process.exit(1) }

  const confirm = await p.confirm({
    message: `Add schedule "${id}" → ${trigger} at "${cron}"?`,
  })
  if (p.isCancel(confirm) || !confirm) { p.cancel("Cancelled"); process.exit(0) }

  p.outro(`Schedule "${id}" ready to save.`)

  return {
    id,
    cron,
    enabled: true,
    trigger: trigger as ScheduleEntry["trigger"],
    prompt_type: promptType as ScheduleEntry["prompt_type"],
    ...(promptValue && { prompt: promptValue }),
    ...(promptTemplate && { prompt_template: promptTemplate }),
  }
}
```

- [ ] **Step 2: Verify lint**

```bash
bun run lint
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/wizard/index.ts
git commit -m "feat(wizard): add interactive clack-based schedule setup wizard"
```

---

### Task 15: Final Wiring + Smoke Test

- [ ] **Step 1: Run the full test suite**

```bash
bun test
```

Expected: All tests pass with no failures.

- [ ] **Step 2: Smoke test — start and stop daemon**

```bash
bun run src/daemon/index.ts &
sleep 2
bun run src/cli/index.ts daemon status
bun run src/cli/index.ts daemon stop
```

Expected: Status shows `running: true`. Stop exits cleanly.

- [ ] **Step 3: Smoke test — add a schedule and list it**

```bash
bun run src/cli/index.ts add "0 4 * * 1-5" --trigger claude-cli --prompt-type fixed --prompt "Start session"
bun run src/cli/index.ts list
```

Expected: Schedule appears in list with next fire time.

- [ ] **Step 4: Smoke test — dry run fire**

```bash
bun run src/cli/index.ts fire --dry-run claude-cli-04-00
```

Expected: Prints trigger type, cron, and prompt without firing.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete climitless v1 implementation"
```

---

## Summary

| Chunk | Tasks | Deliverable |
|---|---|---|
| 1 | 1–5 | Project scaffold, types, config schema, ID generation, read/write |
| 2 | 6–7 | Prompt builders (fixed/random/dynamic), trigger adapters (claude-cli/api/browser) |
| 3 | 8–10 | Scheduler (croner), IPC server, daemon entry point + lifecycle |
| 4 | 11–13 | All CLI commands (daemon, add, list, remove, enable, disable, fire, config, prompts, logs, uninstall) |
| 5 | 14–15 | Interactive wizard, final wiring, smoke tests |
