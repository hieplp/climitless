import { describe, expect, it } from "bun:test"
import { buildRandom } from "../../src/prompts/random"

describe("buildRandom", () => {
  it("returns one item from the pool", () => {
    const pool = ["a", "b", "c"]
    const result = buildRandom(pool)
    expect(pool).toContain(result)
  })

  it("throws if pool is empty", () => {
    expect(() => buildRandom([])).toThrow("prompt pool is empty")
  })
})
