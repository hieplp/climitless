// Future migrations go here. For v1, only ensure version field exists.
export function migrateConfig(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw["version"] === undefined) {
    return { ...raw, version: 1 }
  }
  return raw
}
