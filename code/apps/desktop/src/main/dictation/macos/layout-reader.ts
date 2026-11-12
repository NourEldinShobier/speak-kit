import { macLayoutCode } from "../../speech-models/layout";

export type RunText = (file: string, args: readonly string[]) => Promise<string>;

const TTL_MS = 1000;

const field = (text: string, key: string) => new RegExp(String.raw`"?${key}"?\s*=\s*"?([^";\n]+)`).exec(text)?.[1]?.trim();

/** The selected input source in the form macOS id strings use: an input method (Japanese, Chinese, Korean) by its mode, a plain layout by its name. */
export function selectedSourceId(out: string): string {
  const mode = field(out, "Input Mode");
  if (mode) return mode;
  const name = field(out, "KeyboardLayout Name");
  return name ? `com.apple.keylayout.${name}` : "";
}

/**
 * The keyboard layout of the person typing, as a language code. `foreground()` must answer at once, so this answers with the last reading and
 * starts a new one when that is older than a second; the first answer is empty. A layout with no language code clears the answer; a failed reading keeps the last one.
 */
export function createMacLayoutReader(run: RunText, now: () => number): { current(): string | undefined } {
  let code: string | undefined;
  let readAt = -Infinity;
  let reading = false;
  const refresh = () => {
    reading = true;
    readAt = now();
    run("defaults", ["read", "com.apple.HIToolbox", "AppleSelectedInputSources"]).then(
      (out) => {
        code = macLayoutCode(selectedSourceId(out));
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
