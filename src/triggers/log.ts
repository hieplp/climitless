export async function logTrigger(scheduleId: string, cron: string, prompt: string | null): Promise<void> {
  console.log(JSON.stringify({
    level: "info",
    time: new Date().toISOString(),
    scheduleId,
    cron,
    prompt,
    msg: "schedule fired (log-only)",
  }))
}
