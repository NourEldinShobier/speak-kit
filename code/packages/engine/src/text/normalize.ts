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

interface Money {
  sym: string;
  amount: string;
  scale: string | undefined;
}

function currency({ sym, amount, scale }: Money): string {
  const [one, many, cent, cents] = CURRENCY[sym]!;
  const [whole = "0", frac = ""] = num(amount).split(".");
  const unit = !scale && Number(whole) === 1 && !frac ? one : many;
  const head = `${scale ? `${num(amount)} ${SCALE[scale.toLowerCase()]}` : num(whole)} ${unit}`;
  const c = Number(frac.padEnd(2, "0").slice(0, 2));
  if (scale || !cent || !frac || c === 0) return head;
  return `${head} and ${c} ${c === 1 ? cent : cents}`;
}

/**
 * Rewrites written forms the engines read badly (measured against kokoro-js):
 * URLs, e-mail addresses, emoji, Latin abbreviations, scaled currency ("$5M"), prefix currency (euro), units.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\bhttps?:\/\/([^\s/?#]+)\S*/gi, (_, host: string) => host.replace(/^www\./, "").replace(/\./g, " dot "))
    .replace(/\bwww\.([^\s/?#]+)\S*/gi, (_, host: string) => host.replace(/\./g, " dot "))
    .replace(/\b([\w.+-]+)@([\w-]+(?:\.[\w-]+)+)\b/g, (_, user: string, host: string) => `${user.replace(/\./g, " dot ")} at ${host.replace(/\./g, " dot ")}`)
    .replace(/(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️)+/gu, "")
    .replace(/\be\.g\.,?/gi, "for example,")
    .replace(/\bi\.e\.,?/gi, "that is,")
    .replace(/\bvs\.?(?=\s)/gi, "versus")
    .replace(/\bapprox\./gi, "approximately")
    .replace(/([$£€¥])\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(thousand|million|billion|trillion|bn|mm|[kmbt])\b(?![\w/]))?/gi, (...g: (string | undefined)[]) =>
      currency({ sym: g[1]!, amount: g[2]!, scale: g[3] }),
    )
    .replace(/(\d)\s?(km\/h|[kKmMgG]?[Hh]z|[KMGT]B|km|kg|cm|mm|ml|mg|lbs?|oz|mph|L)\b(?![\w/])/g, (_, n: string, u: string) => {
      const unit = UNITS[u] ?? UNITS[u.replace(/hz$/i, "Hz").replace(/^K/, "k")];
      return unit ? `${n} ${Number(num(n)) === 1 ? unit[0] : unit[1]}` : `${n}${u}`;
    })
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();
}
