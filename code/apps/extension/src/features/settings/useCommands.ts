import { useEffect, useState } from "react";

export const CMD_LABEL: Record<string, string> = {
  "read-selection": "Read selection",
  "play-pause": "Play / pause",
  stop: "Stop and close dock",
  "read-page": "Read page from the top",
};
export const CMD_ORDER = ["read-selection", "play-pause", "read-page", "stop"];
export const splitShortcut = (sc?: string) => (sc ? sc.split(/\s*\+\s*/).filter(Boolean) : []);

/** The extension's keyboard commands as Chrome has them assigned right now (null until read). Re-read when the tab becomes visible again. */
export function useCommands(): chrome.commands.Command[] | null {
  const [cmds, setCmds] = useState<chrome.commands.Command[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => {
      try {
        chrome.commands?.getAll().then((c) => live && setCmds(c), () => live && setCmds([]));
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
