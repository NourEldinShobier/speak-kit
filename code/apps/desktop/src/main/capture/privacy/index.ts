/** An input event as the hooks see it. `key` is only ever read to decide that a key was pressed, never stored. */
export type InputEvent = { kind: "click"; x: number; y: number; atMs: number } | { kind: "key"; key: string; atMs: number } | { kind: "scroll"; atMs: number } | { kind: "ink"; atMs: number };

export type LoggedEvent = { kind: "click"; x: number; y: number; atMs: number } | { kind: "key"; atMs: number } | { kind: "scroll"; atMs: number } | { kind: "ink"; atMs: number };

/** What goes into the capture's input log. "events" keeps that something happened and when, never which key: typed text and passwords cannot be rebuilt from it. */
export function logInput(e: InputEvent, mode: "events" | "off"): LoggedEvent | undefined {
  if (mode === "off") return undefined;
  if (e.kind === "key") return { kind: "key", atMs: e.atMs };
  return e;
}

/** A UI element as reported by the platform accessibility API. */
export interface UiNode {
  role: string;
  name?: string;
  /** What the field holds. Never read. */
  value?: string;
  password?: boolean;
  /** Platform flag for secure text fields. */
  secure?: boolean;
  offscreen?: boolean;
}

export interface UiLabel {
  role: string;
  name: string;
}

export const MAX_LABELS = 40;
export const MAX_LABEL_LENGTH = 80;
const PASSWORD_NAME = /pass(word|code|phrase)|pin\b|secret|one-time|otp|cvv|card number/i;

/** Agent context text: the names of buttons and fields near a click, never their values, nothing from password or secure fields. */
export function labelsOnly(nodes: readonly UiNode[]): UiLabel[] {
  const out: UiLabel[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    if (out.length >= MAX_LABELS) break;
    if (n.password || n.secure || n.offscreen) continue;
    const name = (n.name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH);
    if (!name || PASSWORD_NAME.test(name) || /password/i.test(n.role)) continue;
    const key = `${n.role}\u0000${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ role: n.role, name });
  }
  return out;
}

export interface OwnWindow {
  id: string;
}

/** Sources that must not be offered to the picker or recorded: this app's own windows (the capsule, the indicator, the main window). */
export function withoutOwn<T extends { id: string }>(sources: readonly T[], own: readonly OwnWindow[]): T[] {
  const ids = new Set(own.map((w) => w.id));
  return sources.filter((s) => !ids.has(s.id));
}
