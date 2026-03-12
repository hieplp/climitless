export function buildFixed(prompt: string | undefined): string {
  if (!prompt) throw new Error("fixed prompt requires a 'prompt' field")
  return prompt
}
