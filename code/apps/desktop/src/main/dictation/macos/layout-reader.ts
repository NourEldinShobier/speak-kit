import { macLayoutCode } from "../../speech-models/layout";

export type RunText = (file: string, args: readonly string[]) => Promise<string>;

const TTL_MS = 1000;

/**
 * The keyboard layout of the person typing, as a language code. `foreground()` must answer at once, so this answers with the last reading and
 * starts a new one when that is older than a second; the first answer is empty. A failed reading keeps the last good one.
 */
export function createMacLayoutReader(run: RunText, now: () => number): { current(): string | undefined } {
  let code: string | undefined;
  let readAt = -Infinity;
  let reading = false;
  const refresh = () => {
    reading = true;
    readAt = now();
    run("defaults", ["read", "com.apple.HIToolbox", "AppleCurrentKeyboardLayoutInputSourceID"]).then(
      (out) => {
        code = macLayoutCode(out.trim()) ?? code;
        reading = false;
      },
      () => {
        reading = false;
      },
    );
  };
  return {
    current() {
      if (!reading && now() - readAt >= TTL_MS) refresh();
      return code;
    },
  };
}
