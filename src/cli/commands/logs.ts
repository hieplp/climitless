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
      if (opts.clear) {
        clearLogs()
        console.log("Logs cleared.")
        return
      }

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
