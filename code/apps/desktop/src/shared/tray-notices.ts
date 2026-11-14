/** A notice stays in the tray menu this long if the window is not opened. */
export const NOTICE_TTL_MS = 10 * 60_000;
const MAX_CHARS = 60;

/** The one-line notice for something that went wrong while nobody was looking; null for activity that is not a problem. */
export function noticeText(a: { kind: string; title: string }): string | null {
  if (a.kind !== "error") return null;
  const t = a.title.replaceAll(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > MAX_CHARS ? `${t.slice(0, MAX_CHARS - 1).trimEnd()}…` : t;
}

/** The newest notice for the tray menu: a newer one replaces it, opening the window or waiting out the time clears it. */
export function createTrayNotices(now: () => number = Date.now) {
  let current: { text: string; atMs: number } | null = null;
  return {
    add(text: string) {
      current = { text, atMs: now() };
    },
    clear() {
      current = null;
    },
    /** The text to show, or undefined when there is none or it has expired. */
    current(): string | undefined {
      if (current && now() - current.atMs >= NOTICE_TTL_MS) current = null;
      return current?.text;
    },
  };
}
