import type { AppOverride, ForegroundInfo, PasteProfile } from "./types";

export const BASE_PROFILE: PasteProfile = { shortcut: "ctrl-v", preDelayMs: 0, restoreDelayMs: 500 };

const terminal: AppOverride["profile"] = { shortcut: "ctrl-shift-v" };
// Remote desktop clients sync the clipboard to the other machine after the fact: give them time before the keys and before the old clipboard returns.
const remote: AppOverride["profile"] = { preDelayMs: 400, restoreDelayMs: 3000 };

/** Programs that need something other than Ctrl+V right away. Java programs (games) only understand plain Ctrl+V, even inside a terminal-like window. */
export const DEFAULT_OVERRIDES: readonly AppOverride[] = [
  ...["windowsterminal", "wt", "conhost", "mintty", "alacritty", "wezterm-gui", "kitty", "tabby", "putty", "conemu64", "conemu"].map((exe) => ({ exe, profile: terminal })),
  ...["mstsc", "msrdc", "msrdcw"].map((exe) => ({ exe, profile: remote })),
  ...["java", "javaw"].map((exe) => ({ exe, profile: { shortcut: "ctrl-v" } satisfies AppOverride["profile"] })),
];

const stem = (name: string) => name.toLowerCase().replace(/\.exe$/, "");

/** How to paste into this window: the built-in rules, then the user's rules for the same program on top. No foreground window gets the base profile. */
export function profileFor(info: ForegroundInfo | null, userOverrides: readonly AppOverride[] = []): PasteProfile {
  const exe = info?.exe ? stem(info.exe) : null;
  if (!exe) return BASE_PROFILE;
  const find = (list: readonly AppOverride[]) => list.find((o) => stem(o.exe) === exe)?.profile;
  return { ...BASE_PROFILE, ...find(DEFAULT_OVERRIDES), ...find(userOverrides) };
}
