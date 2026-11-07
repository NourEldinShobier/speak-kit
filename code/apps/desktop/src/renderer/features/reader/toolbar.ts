import { useEffect, useState } from "react";
import * as v from "valibot";

/** Reading icons in the header and the right-hand controls of the player, in the order they are drawn. */
export const HEADER_IDS = ["search", "display", "bookmark", "export", "outline"] as const;
export const FOOTER_IDS = ["speed", "voice", "sleep", "volume", "queue"] as const;
export type HeaderId = (typeof HEADER_IDS)[number];
export type FooterId = (typeof FOOTER_IDS)[number];

/** Names shown in the "Customise toolbar" list. */
export const TOOLBAR_LABEL: Record<HeaderId | FooterId, string> = {
  search: "Find in text",
  display: "Display settings",
  bookmark: "Bookmark",
  export: "Export audio",
  outline: "Outline",
  speed: "Speed",
  voice: "Voice",
  sleep: "Sleep timer",
  volume: "Volume",
  queue: "Queue",
};

/** The items a person turned off. Storing what is hidden keeps every item visible by default, also the ones added later. */
const hiddenIn = <T extends readonly [string, ...string[]]>(ids: T) => v.fallback(v.array(v.picklist(ids)), []);
export const ToolbarSchema = v.object({ header: hiddenIn(HEADER_IDS), footer: hiddenIn(FOOTER_IDS) });
export type ToolbarConfig = v.InferOutput<typeof ToolbarSchema>;

export type ToolbarAction = { bar: "header"; id: HeaderId; shown: boolean } | { bar: "footer"; id: FooterId; shown: boolean };

export const DEFAULT_TOOLBAR: ToolbarConfig = v.parse(ToolbarSchema, {});

/** Whatever is stored, as a valid config (bad fields show everything). */
export const parseToolbar = (raw: unknown): ToolbarConfig => v.parse(ToolbarSchema, raw && typeof raw === "object" ? raw : {});

const without = <T extends string>(list: readonly T[], id: T) => list.filter((x) => x !== id);

/** Shows or hides one item. The order is fixed, so only the hidden lists change. */
export function toolbarReducer(cfg: ToolbarConfig, a: ToolbarAction): ToolbarConfig {
  switch (a.bar) {
    case "header":
      return { ...cfg, header: a.shown ? without(cfg.header, a.id) : [...without(cfg.header, a.id), a.id] };
    case "footer":
      return { ...cfg, footer: a.shown ? without(cfg.footer, a.id) : [...without(cfg.footer, a.id), a.id] };
    default: {
      const never: never = a;
      return never;
    }
  }
}

const KEY = "speakkit.reader.toolbar";

function load(): ToolbarConfig {
  try {
    return parseToolbar(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return DEFAULT_TOOLBAR;
  }
}

/** Which toolbar items show, remembered in this browser profile like the display settings. */
export function useToolbar(): [ToolbarConfig, (a: ToolbarAction) => void] {
  const [cfg, setCfg] = useState(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cfg));
    } catch {
      /* storage unavailable: the choice lasts for this session */
    }
  }, [cfg]);
  return [cfg, (a) => setCfg((cur) => toolbarReducer(cur, a))];
}
