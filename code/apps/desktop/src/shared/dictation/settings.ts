import * as v from "valibot";
import { firstClash, type Shortcuts } from "./conflicts";
import { DEFAULT_HOTKEY, DEFAULT_PASTE_LAST, validCancelKey, validHotkey } from "./keys";

export const DICTATION_MODELS = ["large-v3-turbo-q5_0", "parakeet-tdt-0.6b-v3-q4_0"] as const;
export type DictationModelId = (typeof DICTATION_MODELS)[number];
export const DICTATION_LANGUAGES = ["auto", "en", "de", "ar"] as const;
export const RETENTIONS = ["off", "24h", "7d", "30d", "forever"] as const;
export const MAX_REPLACEMENTS = 100;

export type Replacement = { from: string; to: string };
const Replacement = v.object({ from: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)), to: v.pipe(v.string(), v.maxLength(200)) });
const hotkey = v.fallback(v.pipe(v.string(), v.check(validHotkey)), DEFAULT_HOTKEY);
/** "" is unset. */
const optionalHotkey = (fallback: string) => v.fallback(v.union([v.literal(""), v.pipe(v.string(), v.check(validHotkey))]), fallback);
export const MODES = ["hold", "hold-only", "toggle", "double-tap", "tap-or-hold"] as const;
export const HOLD_TIMES = [150, 200, 300, 400, 500, 750, 1000] as const;
export const PAUSE_MODES = ["off", "allow", "block"] as const;
/** Pausing by foreground program, and in full-screen programs. Experimental. */
const PauseRules = v.object({
  mode: v.fallback(v.picklist(PAUSE_MODES), "off"),
  apps: v.fallback(v.pipe(v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80))), v.maxLength(50)), []),
  fullscreen: v.fallback(v.boolean(), false),
});
export type PauseRules = v.InferOutput<typeof PauseRules>;
const MOUSE_PICK = ["", "Mouse2", "Mouse3", "Mouse4", "Mouse5"] as const;
// A bad entry is dropped, the rest of the list stays.
const replacements = v.fallback(
  v.pipe(
    v.array(v.unknown()),
    v.transform((items) =>
      items
        .flatMap((i) => {
          const r = v.safeParse(Replacement, i);
          return r.success ? [r.output] : [];
        })
        .slice(0, MAX_REPLACEMENTS),
    ),
  ),
  [],
);

/** Persisted under `dictation` in config.json. Off until the person turns it on; every key falls back to its default, which is also how files from before dictation existed load. */
const CORE_KEYS = {
  enabled: v.fallback(v.boolean(), false),
  hotkey,
  mode: v.fallback(v.picklist(MODES), "hold"),
  holdMs: v.fallback(v.picklist(HOLD_TIMES), 300),
  secondHotkey: optionalHotkey(""),
  mouseButton: v.fallback(v.picklist(MOUSE_PICK), ""),
  rawHotkey: optionalHotkey(""),
  pasteLastHotkey: optionalHotkey(DEFAULT_PASTE_LAST),
  cancelKey: v.fallback(v.pipe(v.string(), v.check(validCancelKey)), "Escape"),
  /** Hold mode only: the keys also reach the program that listens for them (push-to-talk in a chat app). */
  shareHotkey: v.fallback(v.boolean(), false),
  pauseRules: v.fallback(PauseRules, { mode: "off", apps: [], fullscreen: false }),
  /** Set when a saved shortcut was refused at load and replaced: the page says so once. */
  resetNotice: v.fallback(v.optional(v.picklist(["left-click", "clash"])), undefined),
  language: v.fallback(v.picklist(DICTATION_LANGUAGES), "auto"),
  model: v.fallback(v.picklist(DICTATION_MODELS), DICTATION_MODELS[0]),
  retention: v.fallback(v.picklist(RETENTIONS), "7d"),
  replacements,
};
const MouseOne = /(^|\+)Mouse1(\+|$)/;
const hotkeySlots = (c: { hotkey: string; secondHotkey: string; mouseButton: string; rawHotkey: string; pasteLastHotkey: string; cancelKey: string }): Shortcuts => ({
  dictation: c.hotkey,
  second: c.secondHotkey,
  mouse: c.mouseButton,
  raw: c.rawHotkey,
  pasteLast: c.pasteLastHotkey,
  cancel: c.cancelKey,
});
export const DictationConfigSchema = v.pipe(
  // A saved left button as the shortcut would swallow every click: it goes back to the default and the page says why.
  v.pipe(
    v.unknown(),
    v.transform((raw) => {
      const r = raw as Record<string, unknown> | null;
      if (r && typeof r === "object" && [r.hotkey, r.secondHotkey, r.rawHotkey, r.mouseButton].some((x) => typeof x === "string" && MouseOne.test(x))) {
        return { ...r, hotkey: typeof r.hotkey === "string" && MouseOne.test(r.hotkey) ? DEFAULT_HOTKEY : r.hotkey, secondHotkey: "", rawHotkey: "", mouseButton: "", resetNotice: "left-click" };
      }
      return raw;
    }),
  ),
  v.object(CORE_KEYS),
  // Two shortcuts that share a key cannot both work: the optional one that clashes is cleared.
  v.transform((c) => {
    let out = c;
    for (let i = 0; i < 6; i++) {
      const clash = firstClash(hotkeySlots(out));
      if (!clash) break;
      const drop = (["raw", "mouse", "second", "pasteLast", "cancel"] as const).find((slot) => clash.includes(slot));
      if (!drop) break;
      out = {
        ...out,
        resetNotice: "clash" as const,
        ...(drop === "raw" && { rawHotkey: "" }),
        ...(drop === "mouse" && { mouseButton: "" as const }),
        ...(drop === "second" && { secondHotkey: "" }),
        ...(drop === "pasteLast" && { pasteLastHotkey: DEFAULT_PASTE_LAST }),
        ...(drop === "cancel" && { cancelKey: "Escape" }),
      };
    }
    return out;
  }),
);
export type DictationConfig = v.InferOutput<typeof DictationConfigSchema>;
export { hotkeySlots };

/** What the renderer may change; `enabled` has its own call because turning dictation on starts the hook and the microphone window. */
export const DictationPatchSchema = v.partial(
  v.strictObject({
    hotkey: v.pipe(v.string(), v.check(validHotkey)),
    mode: v.picklist(MODES),
    holdMs: v.picklist(HOLD_TIMES),
    secondHotkey: v.union([v.literal(""), v.pipe(v.string(), v.check(validHotkey))]),
    mouseButton: v.picklist(MOUSE_PICK),
    rawHotkey: v.union([v.literal(""), v.pipe(v.string(), v.check(validHotkey))]),
    pasteLastHotkey: v.union([v.literal(""), v.pipe(v.string(), v.check(validHotkey))]),
    cancelKey: v.pipe(v.string(), v.check(validCancelKey)),
    shareHotkey: v.boolean(),
    pauseRules: PauseRules,
    language: v.picklist(DICTATION_LANGUAGES),
    model: v.picklist(DICTATION_MODELS),
    retention: v.picklist(RETENTIONS),
    replacements: v.pipe(v.array(Replacement), v.maxLength(MAX_REPLACEMENTS)),
  }),
);
export type DictationPatch = v.InferOutput<typeof DictationPatchSchema>;
