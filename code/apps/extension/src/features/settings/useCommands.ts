import { useEffect, useState } from "react";

export const CMD_LABEL: Record<string, string> = {
  "read-selection": "Read selection",
  "play-pause": "Play / pause",
  stop: "Stop and close dock",
  "read-page": "Read page from the top",
};
export const CMD_ORDER = ["read-selection", "play-pause", "read-page", "stop"];
export const splitShortcut = (sc?: string) => (sc ? sc.split(/\s*\+\s*/).filter(Boolean) : []);

/**
 * Chrome leaves a command unassigned when its suggested key is already taken (another extension, Chrome itself) and keeps it
 * unassigned when the user removes it. The API does not say which, so this reports every unassigned command that has a suggested key.
 * Page-level conflicts (a web app that handles the key itself) are invisible to extensions.
 */
export function unassignedSuggestions(
  commands: readonly Pick<chrome.commands.Command, "name" | "shortcut">[],
  manifest: Record<string, { suggested_key?: { default?: string } }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of commands) {
    const key = c.name ? manifest?.[c.name]?.suggested_key?.default : undefined;
    if (c.name && key && !c.shortcut) out[c.name] = key;
  }
  return out;
}

/** The extension's keyboard commands as Chrome has them assigned right now (null until read). Re-read when the tab becomes visible again. */
export function useCommands(): chrome.commands.Command[] | null {
  const [cmds, setCmds] = useState<chrome.commands.Command[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => {
      try {
        chrome.commands?.getAll().then(
          (c) => live && setCmds(c),
          () => live && setCmds([]),
        );
      } catch {
        if (live) setCmds([]);
      }
    };
    load();
    const onVis = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return cmds;
}
