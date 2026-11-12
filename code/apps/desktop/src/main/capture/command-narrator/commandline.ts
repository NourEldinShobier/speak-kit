/**
 * A command line as a list of arguments, with no shell: words are split at spaces, and double or single quotes group words (the quotes are
 * dropped). Backslashes are plain characters, so Windows paths work. Undefined for an empty line or a quote that is never closed.
 */
export function splitCommand(line: string): string[] | undefined {
  const args: string[] = [];
  let cur = "";
  let started = false;
  let quote: string | undefined;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = undefined;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started || cur) args.push(cur);
      cur = "";
      started = false;
    } else cur += ch;
  }
  if (quote) return undefined;
  if (started || cur) args.push(cur);
  return args.length ? args : undefined;
}

/** The arguments of the command with the audio file where {audio} stands, or at the end when the command does not say. */
export function withAudio(args: readonly string[], file: string): string[] {
  return args.some((a) => a.includes("{audio}")) ? args.map((a) => a.replaceAll("{audio}", file)) : [...args, file];
}
