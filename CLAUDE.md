# CLAUDE.md — Climitless Codebase Guide

This document describes the architecture, conventions, and workflows for the **Climitless** project — a cross-platform CLI daemon that schedules and auto-fires Claude sessions via cron expressions.

---

## Project Overview

**Climitless** lets users schedule automated Claude prompts using cron expressions. It runs a background daemon that watches cron schedules and fires them via three backends: the `claude` CLI, the Anthropic API, or a browser tab. All config is stored in `~/.climitless/config.toml`.

---

## Technology Stack

| Concern | Tool | Notes |
|---|---|---|
| Runtime | **Bun** | Native TypeScript, no compilation step needed |
| Language | **TypeScript 5.9** | Strict mode; bundler module resolution |
| CLI framework | **commander 14** | Command routing and help text |
| Interactive UI | **@clack/prompts 1.1** | Multi-step wizard in the terminal |
| Cron engine | **croner 10** | Bun-compatible, supports timezones |
| Config format | **TOML** via `smol-toml` | Human-readable, file-based persistence |
| Schema validation | **zod 4** | Runtime validation with clear error messages |
| Logging | **pino 10** | Structured JSON written to `~/.climitless/logs/climitless.log` |
| Tests | **bun:test** | Built-in; no external runner needed |

---

## Repository Layout

```
src/
  cli/
    index.ts            # Commander router; entry point for `climitless` binary
    commands/
      add.ts            # Interactive wizard or non-interactive schedule creation
      daemon.ts         # start/stop/restart/status/install/uninstall sub-commands
      list.ts           # List schedules with next fire times
      remove.ts         # Delete schedule by ID
      enable.ts         # Re-enable a disabled schedule
      disable.ts        # Disable without deleting
      fire.ts           # Manually fire a schedule (--dry-run supported)
      config.ts         # show/edit config file
      prompts.ts        # Manage random prompt pool
      logs.ts           # View/tail/filter daemon logs
      uninstall.ts      # Remove autostart + optional purge
  daemon/
    index.ts            # Daemon entry point; runs as detached process
    ipc.ts              # IPC server/client (Unix socket / Windows named pipe)
    lifecycle.ts        # PID file management and process detection
    autostart.ts        # macOS launchd / Linux systemd / Windows Registry
  scheduler/
    index.ts            # SchedulerManager class wrapping croner
    types.ts            # IPC message type definitions
  prompts/
    index.ts            # Routes to fixed | random | dynamic strategy
    fixed.ts            # Returns an exact string
    random.ts           # Picks randomly from prompt pool
    dynamic.ts          # Template substitution ({{date}}, {{day_of_week}}, etc.)
  triggers/
    index.ts            # Routes to claude-cli | claude-api | browser
    claude-cli.ts       # Spawns `claude --print <prompt>`
    claude-api.ts       # HTTP POST to Anthropic API
    browser.ts          # Opens URL via xdg-open / open / start
  config/
    index.ts            # Read/write config; permission enforcement; .env loading
    schema.ts           # Zod schema for Config, ScheduleEntry, etc.
    paths.ts            # All ~/.climitless/* path constants
    id.ts               # Schedule ID generation and validation
    migrate.ts          # Version-based config migration functions
  wizard/
    index.ts            # @clack/prompts multi-step wizard
  notifications/
    index.ts            # NotificationAdapter interface (stub in v1)
  logs/
    index.ts            # Pino JSON log reader and pretty-printer

tests/                  # Mirrors src/ layout; files named <module>.test.ts
docs/
  superpowers/
    specs/              # Design specs (2026-03-12-climitless-cli-design.md)
    plans/              # Implementation plans
```

---

## Common Commands

```bash
# Development
bun run src/cli/index.ts       # Run CLI directly (no build step)
bun run src/daemon/index.ts    # Start daemon directly

# Testing
bun test                       # Run all tests
npm test                       # Alias for bun test

# Type checking (no emit)
bunx tsc --noEmit
npm run lint                   # Alias for tsc --noEmit
```

---

## CLI Commands Reference

```bash
# Schedule management (interactive wizard when no args given)
climitless add [cron] [--trigger <type>] [--prompt-type <type>] [--prompt <text>] [--id <id>]
climitless list
climitless remove <id>
climitless enable <id>
climitless disable <id>
climitless fire <id> [--dry-run]

# Daemon management
climitless daemon start
climitless daemon stop
climitless daemon restart
climitless daemon status
climitless daemon install       # Register for auto-start on login
climitless daemon uninstall

# Config & prompts
climitless config show
climitless config edit          # Opens in $EDITOR
climitless prompts list
climitless prompts add <text>
climitless prompts remove <index>

# Logs
climitless logs [--lines N] [--schedule <id>] [--follow] [--clear]

# Uninstall
climitless uninstall [--purge]  # --purge removes all data in ~/.climitless
```

---

## Config Schema

Config is stored at `~/.climitless/config.toml` (permissions `0o600`). The Zod schema lives in `src/config/schema.ts`.

```toml
version = 1

[daemon]
auto_reload = true
log_level = "info"   # "debug" | "info" | "warn" | "error"

[[schedules]]
id = "morning-session"
cron = "0 9 * * 1-5"
enabled = true
trigger = "claude-cli"     # "claude-cli" | "claude-api" | "browser"
prompt_type = "fixed"      # "fixed" | "random" | "dynamic"
prompt = "Good morning. What should I focus on today?"

[prompts]
pool = ["Think deeply.", "Be creative.", "Focus on clarity."]

[triggers.claude_api]
api_key_env = "ANTHROPIC_API_KEY"
model = "claude-sonnet-4-6"

[triggers.browser]
url = "https://claude.ai"

[notifications]
enabled = false
```

**Security rules:**
- Config file is always written with `0o600` (no group/world read)
- API keys are **never** stored in config; always read from env vars or `~/.climitless/.env` (also `0o600`)
- IPC socket is `0o600` (local user only)

---

## IPC Protocol

The CLI communicates with the daemon via a Unix domain socket (`~/.climitless/daemon.sock`) or a Windows named pipe. Messages are newline-delimited JSON with a 5-second timeout.

```typescript
// Request
{ command: "status" | "reload" | "stop" | "fire", scheduleId?: string }

// Response
{ ok: boolean, data?: unknown, error?: string }
```

---

## Code Conventions

### Naming
- **Files:** kebab-case (`claude-api.ts`, `lifecycle.ts`)
- **Functions:** camelCase (`buildPrompt`, `readConfig`, `fireTrigger`)
- **Types/Interfaces:** PascalCase (`ScheduleEntry`, `IpcRequest`, `Config`)
- **Constants:** UPPER_SNAKE_CASE (`CONFIG_DIR`, `LOG_FILE`, `SOCKET_PATH`)
- **Schedule IDs:** kebab-case, 3–64 chars (`morning-session`, `claude-cli-04-00`)

### TypeScript
- Strict mode is **on** — no implicit `any`, no unchecked index access
- Use Zod for all runtime validation; avoid manual guard clauses
- Use `async/await` throughout; no `.then()` chains
- Exhaustive `switch` statements; add a `default` only when truly needed
- Minimal comments; prefer self-documenting names. Add a comment only when logic is non-obvious
- No barrel `index.ts` re-exports; import directly from the module file

### Error Handling
- **Config errors:** Zod throws with field-level messages — let them propagate to the CLI
- **Trigger failures:** Caught and logged in the daemon; daemon keeps running
- **IPC timeout (5s):** CLI falls back to reading config directly
- **Missing API key:** Log a clear error and skip the trigger (non-fatal)

### Testing
- Mirror `src/` layout in `tests/` with `<module>.test.ts` naming
- Use `bun:test` primitives (`describe`, `it`, `expect`, `mock`)
- Mock external subprocess/HTTP calls; avoid real network calls in unit tests
- Keep each test file focused on one module

### Platform-Specific Code
Guard with `process.platform`:
```typescript
if (process.platform === "win32") { /* Windows path */ }
else if (process.platform === "darwin") { /* macOS path */ }
else { /* Linux/other */ }
```
Platform differences appear in: IPC transport, autostart registration, browser opening.

---

## File Locations at Runtime

```
~/.climitless/
├── config.toml        # Main config (0o600)
├── .env               # Optional env overrides for daemon (0o600)
├── daemon.pid         # Running daemon PID (0o644)
├── daemon.sock        # Unix socket (Unix only, 0o600)
├── daemon.port        # Windows TCP port (Windows only, 0o644)
└── logs/
    └── climitless.log # Pino JSON structured logs (0o644)
```

---

## Adding a New Feature — Checklist

1. **Schema change?** Update `src/config/schema.ts` and bump `version` if breaking. Add a migration in `src/config/migrate.ts`.
2. **New trigger type?** Add `src/triggers/<name>.ts`, register in `src/triggers/index.ts`, add the literal to the Zod union in `schema.ts`.
3. **New prompt strategy?** Add `src/prompts/<name>.ts`, register in `src/prompts/index.ts`.
4. **New CLI command?** Add `src/cli/commands/<name>.ts`, register in `src/cli/index.ts`.
5. **New IPC command?** Add the string literal to `IpcRequest.command` in `src/scheduler/types.ts` and handle it in `src/daemon/ipc.ts`.
6. **Tests:** Add `tests/<module>/<name>.test.ts` mirroring the source path.
7. **Lint:** Run `bunx tsc --noEmit` before committing.

---

## Design Documentation

Full design rationale and architecture diagrams are in:
- `docs/superpowers/specs/2026-03-12-climitless-cli-design.md`
- `docs/superpowers/plans/2026-03-12-climitless-cli.md`
