import type { SiteRule } from "@speakkit/protocol";
import * as v from "valibot";
import { defaultSettings, type ReaderSettings, type Settings } from "./types";

/**
 * Valibot schema for everything read from chrome.storage.sync. Every field falls back to its default when it is missing or
 * has the wrong type; numbers are clamped; unknown keys are dropped. It never throws.
 */
const d = defaultSettings();

const clamped = ([min, max]: readonly [number, number], fallback: number, round = false) =>
  v.fallback(
    v.pipe(
      v.number(),
      v.finite(),
      v.transform((n) => Math.min(max, Math.max(min, round ? Math.round(n) : n))),
    ),
    fallback,
  );
const flag = (fallback: boolean) => v.fallback(v.boolean(), fallback);
const pick = <const T extends readonly [string, ...string[]]>(all: T, fallback: T[number]) => v.fallback(v.picklist(all), fallback);
const text = (fallback: string) => v.fallback(v.pipe(v.string(), v.minLength(1)), fallback);
/** A voice id; the ids of the cloned voices of earlier versions (`cb_` and 8 hex digits) no longer exist and become the default. */
const voiceId = (fallback: string) => v.fallback(v.pipe(v.string(), v.minLength(1), v.regex(/^(?!cb_[0-9a-f]{8}$)/)), fallback);
const group = <E extends v.ObjectEntries>(entries: E, fallback: v.InferOutput<v.ObjectSchema<E, undefined>>) => v.fallback(v.object(entries), fallback);

const SITE_RULES = ["always-dock", "hide-controls", "never-read"] as const;
const sites = v.fallback(
  v.pipe(
    v.record(v.string(), v.unknown()),
    v.transform((r) => {
      const out: Record<string, SiteRule> = {};
      for (const [host, rule] of Object.entries(r)) if (SITE_RULES.includes(rule as SiteRule)) out[host] = rule as SiteRule;
      return out;
    }),
  ),
  {},
);

const READER_FONTS = ["sans", "serif", "dyslexic"] as const;
const READER_THEMES = ["paper", "light"] as const;
const READER_LIMITS = { size: [14, 28], width: [480, 960] } as const;

const readerSchema = group(
  {
    font: pick(READER_FONTS, d.reader.font),
    size: clamped(READER_LIMITS.size, d.reader.size, true),
    width: clamped(READER_LIMITS.width, d.reader.width, true),
    theme: pick(READER_THEMES, d.reader.theme),
    highlight: flag(d.reader.highlight),
  },
  d.reader satisfies ReaderSettings,
);

const settingsSchema = v.fallback(
  v.object({
    port: clamped([1, 65535], d.port, true),
    launcher: group(
      {
        enabled: flag(d.launcher.enabled),
        side: pick(["left", "right"], d.launcher.side),
        idle: pick(["peek", "hidden", "open"], d.launcher.idle),
        openOn: pick(["hover", "click"], d.launcher.openOn),
        closeDelayMs: clamped([0, 10000], d.launcher.closeDelayMs),
        widerWhileReading: flag(d.launcher.widerWhileReading),
        y: clamped([0, 1], d.launcher.y),
      },
      d.launcher,
    ),
    show: group(
      {
        bubble: flag(d.show.bubble),
        dock: flag(d.show.dock),
        gutter: flag(d.show.gutter),
        contextMenu: flag(d.show.contextMenu),
        autoScroll: flag(d.show.autoScroll),
      },
      d.show,
    ),
    voice: voiceId(d.voice),
    speed: clamped([0.5, 3], d.speed),
    pauseBetweenParagraphs: pick(["none", "short", "long"], d.pauseBetweenParagraphs),
    highlight: group(
      {
        mode: pick(["sentence+word", "sentence", "word", "off"], d.highlight.mode),
        sentenceColor: text(d.highlight.sentenceColor),
        wordColor: text(d.highlight.wordColor),
        matchTheme: flag(d.highlight.matchTheme),
      },
      d.highlight,
    ),
    skip: group(
      {
        navigation: flag(d.skip.navigation),
        citations: flag(d.skip.citations),
        code: flag(d.skip.code),
        urls: flag(d.skip.urls),
        captions: flag(d.skip.captions),
      },
      d.skip,
    ),
    reader: readerSchema,
    sites,
    siteDefault: pick(["ask", "never-read"], d.siteDefault),
  }),
  d,
);

/** Anything found in storage (or sent by a page) becomes a valid Settings. */
export const parseSettings = (raw: unknown): Settings => v.parse(settingsSchema, raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {});
