import type { Capitals, EndOfDictation, InsertMode, Mode, Term } from "@speakkit/dictation";

const KNOWN: Record<string, string> = {
  code: "Visual Studio Code",
  cursor: "Cursor",
  windowsterminal: "Windows Terminal",
  powershell: "PowerShell",
  pwsh: "PowerShell",
  cmd: "Command Prompt",
  slack: "Slack",
  teams: "Teams",
  discord: "Discord",
  outlook: "Outlook",
  chrome: "Chrome",
  msedge: "Edge",
  firefox: "Firefox",
  notepad: "Notepad",
  winword: "Word",
  terminal: "Terminal",
  iterm2: "iTerm",
  mail: "Mail",
  messages: "Messages",
  safari: "Safari",
};

/** A program name as the person knows it: "windowsterminal" is Windows Terminal. */
export const appLabel = (key: string): string => KNOWN[key] ?? (key ? key[0]!.toUpperCase() + key.slice(1) : key);

/** Programs offered when adding an app, so the person need not know file names. */
export const SUGGESTED_APPS = ["code", "cursor", "windowsterminal", "powershell", "slack", "teams", "discord", "outlook", "chrome", "notepad", "terminal", "mail"] as const;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export interface ModeRow {
  id: string;
  letter: string;
  name: string;
  detail: string;
  chips: string[];
}

export const letterOf = (name: string): string => {
  const first = [...name.trim()][0] ?? "?";
  return /\p{L}/u.test(first) ? first.toUpperCase() : "{ }";
};

/** One row of the mode list. The default mode takes every app no other mode lists. */
export function modeRow(m: Mode, rewriteOn: boolean): ModeRow {
  const rewrite = m.rewrite && rewriteOn ? "Rewrite on" : "Rewrite off";
  if (m.id === "default") return { id: m.id, letter: "D", name: m.name, detail: "Every app that is not in another mode", chips: ["Shared words only", rewrite] };
  return { id: m.id, letter: letterOf(m.name), name: m.name, detail: m.apps.map(appLabel).join(", ") || "No apps yet", chips: [plural(m.apps.length, "app"), plural(m.terms.length, "word"), rewrite] };
}

export const WRITER = "OpenAI gpt-4o-mini";
export const DEADLINES = [2000, 4000, 6000, 10_000] as const;
export const deadlineLabel = (ms: number): string => `${ms / 1000} seconds`;

/** "Heard as: cooper netties, kuber nettys", or nothing for a word with no sounds-like. */
export const heardAs = (t: Term): string => (t.soundsLike.length ? `Heard as: ${t.soundsLike.join(", ")}` : "");

export const CAPITALS: { value: Capitals; label: string }[] = [
  { value: "keep", label: "Keep as spoken" },
  { value: "sentence", label: "Capitalise sentences" },
  { value: "lower", label: "Lowercase everything" },
];
export const ENDS: { value: EndOfDictation; label: string }[] = [
  { value: "keep", label: "Keep as spoken" },
  { value: "no-full-stop", label: "No full stop" },
];
export const INSERTS: { value: InsertMode; label: string }[] = [
  { value: "paste", label: "Paste" },
  { value: "type", label: "Type" },
  { value: "copy", label: "Copy to clipboard" },
];
