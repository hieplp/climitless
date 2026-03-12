export async function claudeCliTrigger(prompt: string): Promise<void> {
  const proc = Bun.spawn(["claude", "--print", prompt], { stderr: "pipe" })
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    const errText = proc.stderr ? await new Response(proc.stderr).text() : ""
    throw new Error(`claude CLI exited with code ${exitCode}: ${errText}`)
  }
}
