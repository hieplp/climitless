import { Command } from "commander"
import { CONFIG_FILE } from "../../config/paths"
import { readConfig } from "../../config/index"
import { stringify } from "smol-toml"

export function configCommand(): Command {
  const cmd = new Command("config").description("Manage configuration")

  cmd
    .command("show")
    .description("Print current config")
    .action(() => {
      const config = readConfig()
      console.log(stringify(config as Record<string, unknown>))
    })

  cmd
    .command("edit")
    .description("Open config in $EDITOR")
    .action(async () => {
      const editor = process.env["EDITOR"] ?? (process.platform === "win32" ? "notepad" : "nano")
      // Await exited so the CLI does not return to the shell mid-edit
      const proc = Bun.spawn([editor, CONFIG_FILE], { stdio: ["inherit", "inherit", "inherit"] })
      await proc.exited
    })

  return cmd
}
