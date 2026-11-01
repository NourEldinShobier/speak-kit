import { useEffect, useState } from "react";
import * as v from "valibot";

export const DisplaySchema = v.object({
  theme: v.fallback(v.picklist(["app", "light", "dark"]), "app"),
  font: v.fallback(v.picklist(["sans", "serif"]), "sans"),
  size: v.fallback(v.pipe(v.number(), v.minValue(14), v.maxValue(30)), 19),
  line: v.fallback(v.pipe(v.number(), v.minValue(1.3), v.maxValue(2.2)), 1.7),
  width: v.fallback(v.pipe(v.number(), v.minValue(480), v.maxValue(960)), 680),
  follow: v.fallback(v.boolean(), true),
});
export type Display = v.InferOutput<typeof DisplaySchema>;

const KEY = "speakkit.reader.display";
export const DEFAULT_DISPLAY: Display = v.parse(DisplaySchema, {});

/** Whatever is stored, as valid settings (bad fields take their defaults). */
export const parseDisplay = (raw: unknown): Display => v.parse(DisplaySchema, raw && typeof raw === "object" ? raw : {});

function load(): Display {
  try {
    return parseDisplay(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return DEFAULT_DISPLAY;
  }
}

/** Reader display settings, remembered in this browser profile. */
export function useDisplay(): [Display, (patch: Partial<Display>) => void] {
  const [d, setD] = useState(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch {
      /* storage unavailable: the settings last for this session */
    }
  }, [d]);
  return [d, (patch) => setD((cur) => parseDisplay({ ...cur, ...patch }))];
}

export const FONT_STACK: Record<Display["font"], string> = {
  sans: 'Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
  serif: 'Charter, "Iowan Old Style", Georgia, "Times New Roman", serif',
};
