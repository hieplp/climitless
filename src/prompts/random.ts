export function buildRandom(pool: string[]): string {
  if (pool.length === 0) throw new Error("prompt pool is empty")
  return pool[Math.floor(Math.random() * pool.length)]!
}
