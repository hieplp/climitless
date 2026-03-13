const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export function buildDynamic(template: string | undefined, ctx: { scheduleId: string }): string {
  if (!template) throw new Error("dynamic prompt requires a 'prompt_template' field")
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  const dayOfWeek = DAYS[now.getDay()]!

  return template
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{time\}\}/g, time)
    .replace(/\{\{day_of_week\}\}/g, dayOfWeek)
    .replace(/\{\{schedule_id\}\}/g, ctx.scheduleId)
}
