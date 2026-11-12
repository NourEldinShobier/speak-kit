import type { AppOverride, ForegroundInfo, PasteProfile } from "./types";

export const BASE_PROFILE: PasteProfile = { shortcut: "ctrl-v", preDelayMs: 0, restoreDelayMs: 500 };

const terminal: AppOverride["profile"] = { shortcut: "ctrl-shift-v" };
// Remote desktop clients sync the clipboard to the other machine after the fact: give them time before the keys and before the old clipboard returns.
const remote: AppOverride["profile"] = { preDelayMs: 400, restoreDelayMs: 3000 };

// macOS programs are named by bundle identifier. Terminals there paste with plain Command+V, so only remote desktop clients need a rule.
const MAC_REMOTE = ["com.microsoft.rdc.macos", "com.apple.screensharing", "com.teamviewer.teamviewer", "com.parsecgaming.parsec"];

/** Programs that need something other than Ctrl+V right away. Java programs (games) only understand plain Ctrl+V, even inside a terminal-like window. */
export const DEFAULT_OVERRIDES: readonly AppOverride[] = [
  ...["windowsterminal", "wt", "conhost", "mintty", "alacritty", "wezterm-gui", "kitty", "tabby", "putty", "conemu64", "conemu"].map((exe) => ({ exe, profile: terminal })),
  ...["mstsc", "msrdc", "msrdcw"].map((exe) => ({ exe, profile: remote })),
  ...MAC_REMOTE.map((exe) => ({ exe, profile: remote })),
  ...["java", "javaw"].map((exe) => ({ exe, profile: { shortcut: "ctrl-v" } satisfies AppOverride["profile"] })),
];

// Chromium 155 and 156 ignore a paste that comes right after the clipboard was written; typing the text works. Later versions paste normally.
const BROKEN_PASTE_MAJORS = [155, 156];
const CHROMIUM_BROWSERS = new Set([
  ...["chrome", "msedge", "brave", "vivaldi", "opera", "chromium", "arc"],
  ...["com.google.chrome", "com.microsoft.edgemac", "com.brave.browser", "com.vivaldi.vivaldi", "com.operasoftware.opera", "company.thebrowser.browser", "org.chromium.chromium"],
]);

const stem = (name: string) => name.toLowerCase().replace(/\.exe$/, "");

/** True for a browser built on Chromium: the only programs whose version is looked up. */
export const isChromiumBrowser = (exe: string | null | undefined): boolean => !!exe && CHROMIUM_BROWSERS.has(stem(exe));

/** The first number of a version string, or undefined. */
export const majorOf = (version: string | undefined): number | undefined => {
  const m = /^\s*v?(\d{1,4})(?:\.|$)/.exec(version ?? "");
  return m ? Number(m[1]) : undefined;
};

/** How to paste into this window: the built-in rules, then the user's rules for the same program on top. No foreground window gets the base profile. */
export function profileFor(info: ForegroundInfo | null, userOverrides: readonly AppOverride[] = []): PasteProfile {
  const exe = info?.exe ? stem(info.exe) : null;
  if (!exe) return BASE_PROFILE;
  const find = (list: readonly AppOverride[]) => list.find((o) => stem(o.exe) === exe)?.profile;
  const broken = isChromiumBrowser(exe) && BROKEN_PASTE_MAJORS.includes(majorOf(info?.version) ?? 0) ? ({ shortcut: "type" } satisfies AppOverride["profile"]) : undefined;
  return { ...BASE_PROFILE, ...find(DEFAULT_OVERRIDES), ...broken, ...find(userOverrides) };
}
