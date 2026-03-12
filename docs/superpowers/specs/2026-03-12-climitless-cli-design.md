# climitless — CLI Design Spec

**Date:** 2026-03-12
**Status:** Draft
**Author:** Design session via Claude Code

---

## Overview

`climitless` is a cross-platform CLI tool that schedules and auto-fires Claude sessions at configured times. The primary use case is pre-starting Claude Code context windows before the user's workday begins — e.g., firing at 4am and 9am so fresh sessions are ready when work begins. The system is designed to be extensible toward other automated Claude workflows in the future.

---

## Goals

- Schedule Claude session triggers using cron expressions or a guided wizard
- Support multiple trigger backends: Claude Code CLI, Claude API, browser (URL open)
- Default behavior is fire-and-forget; notification/logging system is extensible
- Cross-platform: Windows, macOS, Linux
- No OS-level scheduler dependency — runs as a user-space daemon

---

## Non-Goals (v1)

- GUI or web dashboard
- Multi-machine sync
- Built-in notification delivery (stubbed for future)
- Cloud hosting or remote daemon access
- Browser automation / injecting prompts into the Claude.ai web UI

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | **Bun** | Native TypeScript, fast startup, built-in test runner, no build step |
| Language | **TypeScript** | Type safety, IDE support, maintainability |
| CLI framework | **commander** | Mature, well-typed, familiar ergonomics |
| Interactive prompts | **clack** (`@clack/prompts`) | Modern, beautiful, Bun-compatible wizard UI |
| Cron engine | **croner** | Bun-compatible, no Node.js dependency, timezone support |
| Config format | **TOML** via `smol-toml` | Human-readable, great for config files |
| Schema validation | **zod** | Runtime config validation with clear error messages |
| IPC (CLI ↔ daemon) | **Bun.listen()** Unix socket / named pipe | Cross-platform, Bun-native |
| Process management | **Bun.spawn()** | Bun-native subprocess control |
| Testing | **bun test** | Built-in, no extra dependencies |
| Logging | **pino** | Structured JSON logging, fast, cross-platform |

---

## Architecture

```
climitless/
├── src/
│   ├── cli/              # Entry point — parses argv, routes to commands
│   ├── daemon/           # Background process: scheduler loop + IPC server
│   ├── scheduler/        # Cron evaluation engine (croner wrapper)
│   ├── triggers/         # Trigger adapters (claude-cli, claude-api, browser)
│   ├── prompts/          # Prompt builders (fixed, random-pool, dynamic-template)
│   ├── config/           # Config read/write (TOML), zod schema validation
│   ├── wizard/           # Interactive clack-based setup wizard
│   └── notifications/    # Notification adapter interface (stubs for v1)
├── tests/
├── docs/
└── config/
```

### Data Flow

```
User: climitless add
        │
        ▼
   wizard/ or cron arg + flags
        │
        ▼
   config/ ──── writes ──── ~/.climitless/config.toml
        │
        ▼
   daemon/ ──── reads config on start
        │
        ▼
   scheduler/ ── registers cron jobs (croner)
        │
        ▼ (at scheduled time)
   prompts/ ──── builds message (fixed / random / dynamic)
        │
        ▼
   triggers/ ─── fires session (claude-cli / claude-api / browser)
        │
        ▼
   notifications/ ── (stub in v1, extensible later)
        │
        ▼
   ~/.climitless/logs/  ── structured JSON log (pretty-printed to terminal)
```

### IPC (CLI ↔ Daemon)

The CLI communicates with a running daemon via a local Unix socket (`~/.climitless/daemon.sock`) or named pipe on Windows (`\\.\pipe\climitless`). All messages are newline-delimited JSON.

**Request envelope:**
```json
{ "command": "status" | "reload" | "stop" | "fire", "scheduleId": "<optional>" }
```

**Response envelope:**
```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": "human-readable message" }
```

If the daemon socket is unreachable, the CLI falls back to reading config directly (read-only) and prints a warning. Write operations (`add`, `remove`, etc.) always go through the config file directly and signal the daemon to reload via IPC.

---

## CLI Commands

### Daemon Management

```bash
climitless daemon start          # Start the background daemon
climitless daemon stop           # Stop the daemon
climitless daemon restart        # Restart the daemon
climitless daemon install        # Register daemon to auto-start on login
climitless daemon uninstall      # Remove auto-start registration
climitless daemon status         # Show daemon health + next scheduled fire times
```

### Schedule Management

```bash
# Non-interactive add — all required fields as flags:
climitless add "0 4 * * 1-5" \
  --trigger claude-cli \
  --prompt-type fixed \
  --prompt "Start a new session" \
  --id morning-session          # optional; auto-generated if omitted

# Interactive wizard (no cron arg):
climitless add

climitless list                  # List all schedules with next fire times
climitless remove <id>           # Remove a schedule by ID
climitless enable <id>           # Enable a disabled schedule
climitless disable <id>          # Disable without deleting
```

**Non-interactive `add` flags:**

| Flag | Required | Default | Description |
|---|---|---|---|
| `<cron>` (positional) | yes | — | Cron expression |
| `--trigger` | yes | — | `claude-cli` \| `claude-api` \| `browser` |
| `--prompt-type` | yes | — | `fixed` \| `random` \| `dynamic` |
| `--prompt` | if `--prompt-type fixed` | — | The fixed prompt string (writes to `prompt` in TOML) |
| `--prompt-template` | if `--prompt-type dynamic` | — | The dynamic template string (writes to `prompt_template` in TOML) |
| `--id` | no | auto-generated slug | Human-readable schedule ID |

### Testing & Debugging

```bash
climitless fire <id>             # Manually fire a schedule now
climitless fire --dry-run <id>   # Preview what would be triggered, no actual fire
```

### Config & Prompts

```bash
climitless config edit           # Open config file in $EDITOR
climitless config show           # Print current config to stdout
climitless prompts add           # Add a prompt to the random pool
climitless prompts list          # List all prompts in the pool
climitless prompts remove <id>   # Remove a prompt from the pool
```

### Logs

```bash
climitless logs                  # Show last 50 trigger events (pretty-printed, snapshot)
climitless logs --follow         # Live-tail logs (like tail -f)
climitless logs --lines 100      # Show last N events (default: 50)
climitless logs --schedule <id>  # Filter to a specific schedule
climitless logs --clear          # Clear all logs
```

Logs are stored as newline-delimited JSON via pino. The `climitless logs` command pretty-prints them into a human-readable table format.

### Uninstall

```bash
climitless uninstall             # Remove auto-start + stop daemon (keeps config/logs)
climitless uninstall --purge     # Remove everything: auto-start, daemon, config, logs
```

---

## Interactive Wizard Flow

`climitless add` with no arguments launches the wizard:

1. **Trigger type** — choose: `claude-cli` | `claude-api` | `browser`
2. **Schedule** — choose: simple time (`04:00 daily`) or cron expression
3. **Recurrence** — daily / weekdays only / custom days / one-shot
4. **Prompt type** — choose: fixed string | random from pool | dynamic template
5. **Prompt content** — enter the message or template string (skipped for `random`)
6. **Schedule ID** — auto-generate slug or enter a custom ID
7. **Confirm** — preview summary, confirm and save

---

## Config Schema (`~/.climitless/config.toml`)

```toml
version = 1   # bumped on breaking schema changes; triggers migration prompt

[daemon]
auto_reload = true
log_level = "info"

# Fixed prompt example
[[schedules]]
id = "morning-session"
cron = "0 4 * * 1-5"
enabled = true
trigger = "claude-cli"
prompt_type = "fixed"
prompt = "Start a new work session. Review open tasks."

# Dynamic template example
[[schedules]]
id = "midday-session"
cron = "0 9 * * 1-5"
enabled = true
trigger = "claude-api"
prompt_type = "dynamic"
prompt_template = "Starting session for {{day_of_week}} {{date}}. Let's review progress."

# Random pool example — prompt field is ignored; picks from [prompts].pool
[[schedules]]
id = "afternoon-session"
cron = "0 13 * * 1-5"
enabled = true
trigger = "browser"
prompt_type = "random"
# prompt field not used for browser trigger; browser opens the URL only

[prompts]
pool = [
  "Start a new work session. What should we focus on today?",
  "Good morning. Let's pick up where we left off.",
  "New session. Review open tasks and plan the next block.",
]

[triggers.claude_api]
api_key_env = "ANTHROPIC_API_KEY"   # env var name — key is never stored in config
model = "claude-sonnet-4-6"

[triggers.browser]
url = "https://claude.ai"

[notifications]
enabled = false
# Future: type = "desktop" | "email" | "slack"
```

### Config Versioning & Migration

- The top-level `version` field tracks the config schema version (integer, starts at `1`)
- On startup, if the tool detects a config with a lower version number, it prints a migration notice and either auto-migrates (for non-breaking changes) or prompts the user to run `climitless config migrate`
- Breaking changes increment `version`; a migration script transforms the old format to the new one

### Schedule ID Generation

- If the user supplies `--id <name>` (CLI) or enters a custom ID in the wizard, that string is used
- If omitted, an ID is auto-generated as a kebab-case slug: `<trigger>-<HH>-<mm>` (e.g., `claude-cli-04-00`), with a numeric suffix appended if a collision exists (e.g., `claude-cli-04-00-2`)
- ID constraints: lowercase alphanumeric and hyphens only, 3–64 characters, unique within the config

---

## Prompt Types

| Type | Config key | Behavior |
|---|---|---|
| `fixed` | `prompt = "..."` | Always sends the exact string |
| `random` | *(none — uses pool)* | Picks one entry from `[prompts.pool]` at random |
| `dynamic` | `prompt_template = "..."` | Processes template variables: `{{date}}`, `{{time}}`, `{{day_of_week}}`, `{{schedule_id}}` |

> **Note:** For the `browser` trigger, the prompt field is present in config for consistency but is not sent anywhere — the browser trigger opens the configured URL only. A log warning is emitted if a non-`random` prompt is configured on a `browser` trigger, since the prompt is silently unused.

---

## Trigger Adapters

### `claude-cli`
Spawns a `claude` subprocess via `Bun.spawn()` with the prompt passed via `--print`.

```ts
const proc = Bun.spawn(["claude", "--print", prompt], { stderr: "pipe" })
const exitCode = await proc.exited
// exitCode != 0 → log error with stderr content, mark trigger as failed
```

> **Note:** Validated against Claude Code CLI as of 2026-03. The `--print` flag causes Claude to process the prompt non-interactively and exit. If the Claude Code CLI changes its interface, update the adapter and bump the minimum supported version in `package.json`.

stdout and stderr are captured and written to the log. A non-zero exit code is logged as a trigger failure but does not crash the daemon.

### `claude-api`
Makes an HTTP POST to the Anthropic Messages API (`https://api.anthropic.com/v1/messages`). Reads the API key from the environment variable named in `triggers.claude_api.api_key_env` (default: `ANTHROPIC_API_KEY`). The key is never read from config or written to disk.

```ts
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": Bun.env[apiKeyEnv] ?? "",
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: "user", content: prompt }] }),
})
```

If the env var is not set, the trigger is skipped and an error is logged — the daemon does not crash.

### `browser`
Opens the configured URL in the default system browser. The prompt is not used.

```ts
if (process.platform === "win32") {
  // "start" is a cmd.exe built-in, not a standalone executable — must invoke via shell
  Bun.spawn(["cmd", "/c", "start", "", url])
} else if (process.platform === "darwin") {
  Bun.spawn(["open", url])
} else {
  Bun.spawn(["xdg-open", url])
}
```

---

## Auto-start on Login

`climitless daemon install` registers the daemon as a login item:

| Platform | Method |
|---|---|
| macOS | `launchd` plist in `~/Library/LaunchAgents/com.climitless.daemon.plist` |
| Linux | `systemd --user` service unit at `~/.config/systemd/user/climitless.service` |
| Windows | Registry key at `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\climitless` |

The daemon inherits the user's login environment on macOS/Linux. For `claude-api` triggers, the `ANTHROPIC_API_KEY` env var must be set in the shell profile (`.zshrc`, `.bash_profile`, etc.) or in a `.env` file at `~/.climitless/.env` which the daemon explicitly loads on startup (never committed to any repo).

---

## Security

- **Config file permissions:** `~/.climitless/config.toml` is created with mode `600` (owner read/write only). The CLI warns and refuses to start if permissions are wider.
- **Daemon socket permissions:** The socket file is created with mode `600`. Only the owning user can connect — no authentication token is required because OS-level permissions enforce isolation.
- **API key:** Never stored in the config file. Read from an environment variable at trigger execution time. The daemon can also load from `~/.climitless/.env` (mode `600`) which is explicitly gitignored.
- **No network listener:** The daemon binds only to a local socket, never a TCP port — there is no remote attack surface.
- **Input validation:** All config values are validated via zod on load. Prompt templates are rendered with a strict allowlist of variables — no arbitrary code execution.
- **Path sanitization:** Log file paths and config paths are resolved against a fixed base directory (`~/.climitless/`) — no user-supplied paths are used directly for file operations.

---

## Error Handling

- Config validation errors (zod) surface a clear message with the offending field and expected type
- Trigger failures are logged with full error detail; daemon continues running other schedules
- If daemon socket is unreachable, CLI commands fall back to reading config directly (read-only) and print a warning
- Missing API key env var logs a clear error and skips the fire — does not crash daemon
- Unknown schedule ID in `remove`/`enable`/`disable`/`fire` prints a clear error and lists valid IDs

---

## Testing Strategy

- **Unit tests** (`bun test`): scheduler cron evaluation, prompt builders, config parsing/validation, ID generation
- **Integration tests**: trigger adapters with mocked subprocess / HTTP (`mock fetch`, mock `Bun.spawn`)
- **E2E tests**: wizard flow with simulated stdin input; full daemon start/stop/fire cycle
- All tests live in `tests/` mirroring `src/` structure

---

## File Locations (User Data)

| File | Path | Permissions |
|---|---|---|
| Config | `~/.climitless/config.toml` | `600` |
| Env file | `~/.climitless/.env` | `600` |
| Daemon socket | `~/.climitless/daemon.sock` (Unix) / `\\.\pipe\climitless` (Windows) | `600` |
| Daemon PID | `~/.climitless/daemon.pid` | `644` |
| Logs | `~/.climitless/logs/climitless.log` | `644` |

---

## Future Extensions (Out of Scope for v1)

- Desktop / email / Slack notifications
- Multiple named profiles (work, personal)
- Session outcome tracking (did Claude respond? what was the response?)
- Browser automation trigger — inject prompt into Claude.ai via Playwright
- Web dashboard to manage schedules visually
- Plugin system for custom trigger adapters
- Cloud sync of config across machines
