import { describe, expect, it } from "bun:test"
import { buildFixed } from "../../src/prompts/fixed"

describe("buildFixed", () => {
  it("returns the prompt string", () => {
    expect(buildFixed("Hello Claude")).toBe("Hello Claude")
  })

  it("throws if prompt is undefined", () => {
    expect(() => buildFixed(undefined)).toThrow("fixed prompt requires a 'prompt' field")
  })
})
