import * as v from "valibot";

/** How dictated text leaves the app for one program: the paste keys, typing, or only copying. */
export const PASTE_METHODS = ["ctrl-v", "ctrl-shift-v", "shift-insert", "type", "copy"] as const;
export type PasteMethod = (typeof PASTE_METHODS)[number];
export const MAX_APP_RULES = 50;

export const AppRule = v.object({ method: v.picklist(PASTE_METHODS), delayMs: v.fallback(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5000)), 0) });
export type AppRule = v.InferOutput<typeof AppRule>;
export const exeName = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.regex(/^[a-z0-9._ -]{1,60}$/));
// A bad rule is dropped, the rest of the table stays; the program name is kept without ".exe".
export const appRules = v.fallback(
  v.pipe(
    v.record(v.string(), v.unknown()),
    v.transform((all) => {
      const out: Record<string, AppRule> = {};
      for (const [name, rule] of Object.entries(all)) {
        const key = v.safeParse(exeName, name.replace(/\.exe$/i, ""));
        const parsed = v.safeParse(AppRule, rule);
        if (key.success && parsed.success && Object.keys(out).length < MAX_APP_RULES) out[key.output] = parsed.output;
      }
      return out;
    }),
  ),
  {},
);
