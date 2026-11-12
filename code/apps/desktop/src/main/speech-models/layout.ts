/** Primary language ids of Windows keyboard layouts (the low ten bits of the layout handle) and the language code each one means. */
const PRIMARY: Readonly<Record<number, string>> = {
  0x01: "ar",
  0x04: "zh",
  0x07: "de",
  0x09: "en",
  0x0a: "es",
  0x0c: "fr",
  0x10: "it",
  0x11: "ja",
  0x12: "ko",
  0x13: "nl",
  0x15: "pl",
  0x16: "pt",
  0x19: "ru",
  0x1d: "sv",
  0x1f: "tr",
  0x22: "uk",
  0x27: "lt",
  0x39: "hi",
};

/** The language code of a keyboard layout handle given as a decimal string, or undefined for a layout we have no code for. */
export function layoutCode(handle: string): string | undefined {
  try {
    return PRIMARY[Number(BigInt(handle) & 0x3ffn)];
  } catch {
    return undefined;
  }
}

/** Names macOS gives keyboard layouts (the last part of "com.apple.keylayout.German"), by the start of the name, and the language each one means. */
const MAC_LAYOUTS: ReadonlyArray<readonly [string, string]> = [
  ["abc", "en"],
  ["us", "en"],
  ["british", "en"],
  ["australian", "en"],
  ["canadianfrench", "fr"],
  ["canadian", "en"],
  ["irish", "en"],
  ["dvorak", "en"],
  ["colemak", "en"],
  ["german", "de"],
  ["austrian", "de"],
  ["swissgerman", "de"],
  ["swissfrench", "fr"],
  ["arabic", "ar"],
  ["french", "fr"],
  ["spanish", "es"],
  ["italian", "it"],
  ["dutch", "nl"],
  ["polish", "pl"],
  ["portuguese", "pt"],
  ["brazilian", "pt"],
  ["russian", "ru"],
  ["swedish", "sv"],
  ["turkish", "tr"],
  ["ukrainian", "uk"],
  ["lithuanian", "lt"],
  ["hindi", "hi"],
  ["kotoeri", "ja"],
  ["japanese", "ja"],
  ["korean", "ko"],
  ["scim", "zh"],
  ["tcim", "zh"],
  ["pinyin", "zh"],
];

/** The language code of a macOS input source id such as "com.apple.keylayout.German", or undefined for one we have no code for. */
export function macLayoutCode(sourceId: string): string | undefined {
  const parts = sourceId.toLowerCase().split(".");
  const at = parts.findIndex((p) => p === "keylayout" || p === "inputmethod");
  const name = parts
    .slice(at >= 0 ? at + 1 : 2)
    .join(".")
    .replaceAll(/[^a-z]/g, "");
  return MAC_LAYOUTS.find(([prefix]) => name.startsWith(prefix))?.[1];
}
