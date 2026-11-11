import * as v from "valibot";

/** One line of recognized text with its box in the picture. */
export interface OcrLine {
  t: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const lineSchema = v.object({ t: v.string(), x: v.number(), y: v.number(), w: v.number(), h: v.number() });
const replySchema = v.union([
  v.object({ id: v.number(), lang: v.nullable(v.string()), lines: v.array(lineSchema) }),
  v.object({ id: v.number(), error: v.string() }),
  v.object({ ready: v.literal(true), lang: v.nullable(v.string()) }),
]);
export type OcrReply = v.InferOutput<typeof replySchema>;

/** One line the helper wrote, or undefined when it is not one of its replies. */
export function parseOcrReply(line: string): OcrReply | undefined {
  try {
    const r = v.safeParse(replySchema, JSON.parse(line));
    return r.success ? r.output : undefined;
  } catch {
    return undefined;
  }
}

/** A space between neighbours, two for a column step, a bar when far apart. */
function separator(gap: number, unit: number): string {
  if (gap < unit * 1.5) return " ";
  return gap < unit * 4 ? "  " : " | ";
}

/** About 2k tokens: more text than this is a page of prose the picture shows anyway. */
export const MAX_TEXT_CHARS = 8000;

/**
 * The lines as text in reading order: top to bottom, and left to right inside a row. The recognizer returns a label and its value as separate
 * lines, sometimes far apart in its own order; putting lines that share a row together restores "Name  Value". A wide gap becomes " | ".
 */
export function readingOrder(lines: readonly OcrLine[], max = MAX_TEXT_CHARS): string {
  const items = lines.filter((l) => l.t.trim()).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows: OcrLine[][] = [];
  for (const l of items) {
    const row = rows.at(-1);
    const first = row?.[0];
    if (row && first && Math.abs(l.y + l.h / 2 - (first.y + first.h / 2)) <= Math.max(l.h, first.h) / 2) row.push(l);
    else rows.push([l]);
  }
  const text = rows
    .map((row) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((l, i) => {
          const prev = row[i - 1];
          if (!prev) return l.t.trim();
          const gap = l.x - (prev.x + prev.w);
          const unit = Math.max(l.h, prev.h, 1);
          return `${separator(gap, unit)}${l.t.trim()}`;
        })
        .join(""),
    )
    .join("\n");
  return text.length > max ? `${text.slice(0, max)}\n[text cut]` : text;
}
