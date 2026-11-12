export interface OwnWindow {
  id: string;
}

/** Sources that must not be offered to the picker or recorded: this app's own windows (the capsule, the indicator, the main window). */
export function withoutOwn<T extends { id: string }>(sources: readonly T[], own: readonly OwnWindow[]): T[] {
  const ids = new Set(own.map((w) => w.id));
  return sources.filter((s) => !ids.has(s.id));
}
