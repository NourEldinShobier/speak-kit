import { marked } from "./model";

/** Text with the words of a search wrapped in <mark>. */
export function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {marked(text, query).map((p, i) =>
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
