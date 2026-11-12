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
