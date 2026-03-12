import { homedir } from "os"
import { join } from "path"
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs"
import { execSync } from "child_process"

// Use import.meta.dir so the path is always relative to this source file,
// not to the working directory the user happened to be in when running the CLI.
const DAEMON_SCRIPT = join(import.meta.dir, "..", "daemon", "index.ts")
const DAEMON_CMD = `bun run ${DAEMON_SCRIPT}`

export function installAutostart(): void {
  if (process.platform === "darwin") {
    // Use DAEMON_SCRIPT (resolved via import.meta.dir) — NOT process.cwd()
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
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
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
