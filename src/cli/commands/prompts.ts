import { Command } from "commander"
import { readConfig, writeConfig } from "../../config/index"

export function promptsCommand(): Command {
  const cmd = new Command("prompts").description("Manage the random prompt pool")

  cmd
    .command("list")
    .description("List all prompts in the pool")
    .action(() => {
      const config = readConfig()
      if (config.prompts.pool.length === 0) {
        console.log("Pool is empty.")
        return
      }
      config.prompts.pool.forEach((p, i) => console.log(`  [${i}] ${p}`))
    })

  cmd
    .command("add")
    .description("Add a prompt to the pool")
    .argument("<prompt>", "Prompt text")
    .action((prompt: string) => {
      const config = readConfig()
      config.prompts.pool.push(prompt)
      writeConfig(config)
      console.log("Prompt added to pool.")
    })

  cmd
    .command("remove")
    .description("Remove a prompt by index")
    .argument("<index>", "Index from prompts list")
    .action((indexStr: string) => {
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
