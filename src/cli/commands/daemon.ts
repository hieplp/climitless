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
    const proc = Bun.spawn(["bun", "run", daemonScript], { detached: true, stdio: ["ignore", "ignore", "ignore"] })
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
    installAutostart()
    console.log("Auto-start registered.")
  })

  cmd.command("uninstall").description("Remove auto-start registration").action(() => {
    uninstallAutostart()
    console.log("Auto-start removed.")
  })

  return cmd
}
