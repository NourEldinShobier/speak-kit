import { highlightRanges } from "@speakkit/meetings/pure";

/** Text with the words of a search wrapped in <mark>. */
export function Marked({ text, query }: { text: string; query: string }) {
  const parts: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const r of highlightRanges(text, query)) {
    if (r.from < at) continue;
    if (r.from > at) parts.push({ text: text.slice(at, r.from), hit: false });
    parts.push({ text: text.slice(r.from, r.to), hit: true });
    at = r.to;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="tr-mark">
            {p.text}
          </mark>
        ) : (
          p.text
        ),
      )}
    </>
  );
}
