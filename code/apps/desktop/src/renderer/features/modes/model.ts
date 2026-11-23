import type { Term, WritingMode as Mode } from "@speakkit/dictation";

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

/** One row of the mode list. */
export function modeRow(m: Mode, rewriteOn: boolean): ModeRow {
  const rewrite = m.rewrite && rewriteOn ? "Rewrite on" : "Rewrite off";
  return {
    id: m.id,
    letter: letterOf(m.name),
    name: m.name,
    detail: [...m.apps.map(appLabel), ...m.sites].join(", ") || "No apps yet",
    chips: [plural(m.apps.length, "app"), ...(m.sites.length ? [plural(m.sites.length, "site")] : []), plural(m.terms.length, "word"), rewrite],
  };
}

export const WRITER = "OpenAI gpt-4o-mini";
export const LOCAL_WRITER = "Gemma 4 on this computer";
/** The writer a setting names, as the page calls it. */
export const writerName = (writer: "openai" | "local"): string => (writer === "local" ? LOCAL_WRITER : WRITER);
export const DEADLINES = [2000, 4000, 6000, 10_000] as const;
export const deadlineLabel = (ms: number): string => `${ms / 1000} seconds`;

/** "Heard as: cooper netties, kuber nettys", or nothing for a word with no sounds-like. */
export const heardAs = (t: Term): string => (t.soundsLike.length ? `Heard as: ${t.soundsLike.join(", ")}` : "");
