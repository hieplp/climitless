export async function browserTrigger(url: string): Promise<void> {
  if (process.platform === "win32") {
    // "start" is a cmd.exe built-in, not a standalone executable — must invoke via shell
    Bun.spawn(["cmd", "/c", "start", "", url])
  } else if (process.platform === "darwin") {
    Bun.spawn(["open", url])
  } else {
    Bun.spawn(["xdg-open", url])
  }
}
