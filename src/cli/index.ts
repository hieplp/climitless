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
