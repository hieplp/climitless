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
