# climitless

A cross-platform CLI daemon that schedules and auto-fires Claude sessions via cron expressions.

## Overview

Climitless lets you schedule automated Claude prompts using standard cron expressions. It runs a background daemon that watches your schedules and fires them using one of three backends: the `claude` CLI, the Anthropic API, or a browser tab. All configuration is stored in `~/.climitless/config.toml`.

## Requirements

- [Bun](https://bun.sh) runtime

## Installation

```bash
git clone https://github.com/hieplp/climitless
cd climitless
bun install
```

## Usage

### Schedule Management

```bash
# Interactive wizard (no arguments)
climitless add

# Non-interactive
climitless add [cron] [--trigger <type>] [--prompt-type <type>] [--prompt <text>] [--id <id>]

climitless list
climitless remove <id>
climitless enable <id>
climitless disable <id>
climitless fire <id> [--dry-run]
```

### Daemon Management

```bash
climitless daemon start
climitless daemon stop
climitless daemon restart
climitless daemon status
climitless daemon install     # Register for auto-start on login
climitless daemon uninstall
```

### Config & Prompts

```bash
climitless config show
climitless config edit        # Opens in $EDITOR

climitless prompts list
climitless prompts add <text>
climitless prompts remove <index>
```

### Logs

```bash
climitless logs [--lines N] [--schedule <id>] [--follow] [--clear]
```

### Uninstall

```bash
climitless uninstall [--purge]  # --purge removes all data in ~/.climitless
```

## Configuration

Config is stored at `~/.climitless/config.toml`. Example:

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

API keys are never stored in config — set them as environment variables or in `~/.climitless/.env`.

## Trigger Backends

| Trigger | Description |
|---|---|
| `claude-cli` | Spawns `claude --print <prompt>` |
| `claude-api` | HTTP POST to the Anthropic API |
| `browser` | Opens a URL via `xdg-open` / `open` / `start` |

## Prompt Strategies

| Strategy | Description |
|---|---|
| `fixed` | Returns an exact string |
| `random` | Picks randomly from the prompt pool |
| `dynamic` | Template substitution (`{{date}}`, `{{day_of_week}}`, etc.) |

## Development

```bash
# Run CLI directly
bun run src/cli/index.ts

# Run daemon directly
bun run src/daemon/index.ts

# Run tests
bun test

# Type check
bunx tsc --noEmit
```

## License

MIT
