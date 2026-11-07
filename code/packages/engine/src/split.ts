/** Split text longer than `max` chars at the latest sentence, clause or word boundary inside the window. */
export function splitLong(text: string, max = 300): string[] {
  const out: string[] = [];
  let rest = text.trim();
  const min = Math.floor(max * 0.35); // avoid tiny leading pieces
  while (rest.length > max) {
    const win = rest.slice(0, max + 1);
    let cut = -1;
    for (const re of [/[.!?…]["')\]]*\s/g, /[;:—–]\s|\s[—–]\s/g, /,\s/g, /\s/g]) {
      let m: RegExpExecArray | null;
      let last = -1;
      while ((m = re.exec(win))) if (m.index + 1 >= min) last = m.index + m[0].length;
      if (last > 0) {
        cut = last;
        break;
      }
    }
    if (cut <= 0) cut = max; // no boundary at all (e.g. one huge token)
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}
