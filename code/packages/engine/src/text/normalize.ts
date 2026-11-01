// CommonJS package: Node ESM (Playwright, the packed server) only supports its default export.
import numberToWords from "number-to-words";

const { toWordsOrdinal, toWords: rawWords } = numberToWords;

const toWords = (n: number) => rawWords(n).replace(/,/g, "");

export interface NormalizeOptions {
  /**
   * Spell out digits (ordinals, years, times, decimals, percent). Kokoro's phonemizer already reads those,
   * so this is only for engines that do not (Chatterbox).
   */
  numbers?: boolean;
}

const UNITS: Record<string, [one: string, many: string]> = {
  km: ["kilometer", "kilometers"],
  kg: ["kilogram", "kilograms"],
  cm: ["centimeter", "centimeters"],
  mm: ["millimeter", "millimeters"],
  ml: ["milliliter", "milliliters"],
  mg: ["milligram", "milligrams"],
  L: ["liter", "liters"],
  lb: ["pound", "pounds"],
  lbs: ["pound", "pounds"],
  oz: ["ounce", "ounces"],
  mph: ["mile per hour", "miles per hour"],
  "km/h": ["kilometer per hour", "kilometers per hour"],
  KB: ["kilobyte", "kilobytes"],
  MB: ["megabyte", "megabytes"],
  GB: ["gigabyte", "gigabytes"],
  TB: ["terabyte", "terabytes"],
  Hz: ["hertz", "hertz"],
  kHz: ["kilohertz", "kilohertz"],
  MHz: ["megahertz", "megahertz"],
  GHz: ["gigahertz", "gigahertz"],
};
const CURRENCY: Record<string, [string, string, string?, string?]> = {
  $: ["dollar", "dollars", "cent", "cents"],
  "£": ["pound", "pounds", "penny", "pence"],
  "€": ["euro", "euros", "cent", "cents"],
  "¥": ["yen", "yen"],
};
const SCALE: Record<string, string> = {
  k: "thousand",
  thousand: "thousand",
  m: "million",
  mm: "million",
  million: "million",
  b: "billion",
  bn: "billion",
  billion: "billion",
  t: "trillion",
  trillion: "trillion",
};

const num = (s: string) => s.replace(/,/g, "");
const digits = (s: string, spell: boolean) => (spell ? toWords(Number(num(s))) : num(s));

function currency(sym: string, amount: string, scale: string | undefined, spell: boolean): string {
  const [one, many, cent, cents] = CURRENCY[sym]!;
  const [whole = "0", frac = ""] = num(amount).split(".");
  const unit = scale ? many : Number(whole) === 1 && !frac ? one : many;
  const head = `${scale ? `${digits(amount, spell)} ${SCALE[scale.toLowerCase()]}` : digits(whole, spell)} ${unit}`;
  const c = Number(frac.padEnd(2, "0").slice(0, 2));
  if (scale || !cent || !frac || c === 0) return scale && frac ? head : head;
  return `${head} and ${digits(String(c), spell)} ${c === 1 ? cent : cents}`;
}

const plural = (w: string, yes: boolean) => (!yes ? w : w.endsWith("y") ? `${w.slice(0, -1)}ies` : `${w}s`);

/** 1999 -> "nineteen ninety nine", 2005 -> "two thousand five", 1850 -> "eighteen fifty". */
function year(y: number): string {
  if (y % 1000 < 10 || (y >= 2000 && y < 2010)) return toWords(y);
  const [hi, lo] = [Math.floor(y / 100), y % 100];
  return `${toWords(hi)} ${lo === 0 ? "hundred" : lo < 10 ? `oh ${toWords(lo)}` : toWords(lo)}`;
}

function spellNumbers(t: string): string {
  return t
    .replace(/\b(\d{1,2}):([0-5]\d)\s?([ap])\.?m\b\.?/gi, (_, h, m, ap) =>
      `${toWords(Number(h))} ${m === "00" ? "" : Number(m) < 10 ? `oh ${toWords(Number(m))}` : toWords(Number(m))} ${ap.toLowerCase()} m`.replace(/\s+/g, " "),
    )
    .replace(/\b(\d{1,2}):([0-5]\d)\b/g, (_, h, m) => (m === "00" ? `${toWords(Number(h))} o'clock` : `${toWords(Number(h))} ${Number(m) < 10 ? "oh " : ""}${toWords(Number(m))}`))
    .replace(/\b(\d[\d,]*)(st|nd|rd|th)\b/gi, (_, n) => toWordsOrdinal(Number(num(n))).replace(/,/g, ""))
    .replace(/(\d[\d,]*)(?:\.(\d+))?\s?%/g, (_, i, f) => `${f ? `${toWords(Number(num(i)))} point ${[...f].map(Number).map(toWords).join(" ")}` : toWords(Number(num(i)))} percent`)
    .replace(/\b(1[1-9]\d\d|20\d\d)s?\b(?![.,]\d)/g, (m, y) => plural(year(Number(y)), m.endsWith("s")))
    .replace(/(?<![\w.])-(?=\d)/g, "minus ")
    .replace(/\b(\d[\d,]*)\.(\d+)\b/g, (_, i, f) => `${toWords(Number(num(i)))} point ${[...f].map(Number).map(toWords).join(" ")}`)
    .replace(/\b\d[\d,]*\b/g, (m) => toWords(Number(num(m))));
}

/**
 * Rewrites written forms the engines read badly (measured against kokoro-js, see docs/perf.md "Text normalization"):
 * URLs, e-mail addresses, emoji, Latin abbreviations, scaled currency ("$5M"), prefix currency (euro), units.
 */
export function normalizeText(text: string, { numbers = false }: NormalizeOptions = {}): string {
  let t = text
    .replace(/\bhttps?:\/\/([^\s/?#]+)\S*/gi, (_, host: string) => host.replace(/^www\./, "").replace(/\./g, " dot "))
    .replace(/\bwww\.([^\s/?#]+)\S*/gi, (_, host: string) => host.replace(/\./g, " dot "))
    .replace(/\b([\w.+-]+)@([\w-]+(?:\.[\w-]+)+)\b/g, (_, user: string, host: string) => `${user.replace(/\./g, " dot ")} at ${host.replace(/\./g, " dot ")}`)
    .replace(/(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️)+/gu, "")
    .replace(/\be\.g\.,?/gi, "for example,")
    .replace(/\bi\.e\.,?/gi, "that is,")
    .replace(/\bvs\.?(?=\s)/gi, "versus")
    .replace(/\bapprox\./gi, "approximately")
    .replace(/([$£€¥])\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(thousand|million|billion|trillion|bn|mm|[kmbt])\b(?![\w/]))?/gi, (_, sym: string, amount: string, scale?: string) =>
      currency(sym, amount, scale, numbers),
    )
    .replace(/(\d)\s?(km\/h|[kKmMgG]?[Hh]z|[KMGT]B|km|kg|cm|mm|ml|mg|lbs?|oz|mph|L)\b(?![\w/])/g, (_, n: string, u: string) => {
      const unit = UNITS[u] ?? UNITS[u.replace(/hz$/i, "Hz").replace(/^K/, "k")];
      return unit ? `${n} ${Number(num(n)) === 1 ? unit[0] : unit[1]}` : `${n}${u}`;
    });
  if (numbers) t = spellNumbers(t);
  return t.replace(/[^\S\n]{2,}/g, " ").trim();
}
