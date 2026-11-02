import type { Block } from "../../../shared/library/contract";
import { squash } from "../../../shared/library/text";

/** One text run from pdf.js: position in page units, origin bottom-left. */
export interface PdfItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Line {
  text: string;
  x: number;
  y: number;
  h: number;
  right: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/** Group runs into lines (same baseline, left to right), top of the page first. */
function toLines(items: PdfItem[]): Line[] {
  const runs = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; h: number; runs: PdfItem[] }[] = [];
  for (const r of runs) {
    const l = lines.find((c) => Math.abs(c.y - r.y) < Math.max(c.h, r.h) * 0.4);
    if (l) l.runs.push(r);
    else lines.push({ y: r.y, h: r.h, runs: [r] });
  }
  return lines.map((l) => {
    const rs = l.runs.sort((a, b) => a.x - b.x);
    let text = "";
    let prevEnd = rs[0]!.x;
    for (const r of rs) {
      if (text && r.x - prevEnd > l.h * 0.15 && !text.endsWith(" ") && !r.str.startsWith(" ")) text += " ";
      text += r.str;
      prevEnd = r.x + r.w;
    }
    return { text: squash(text), x: rs[0]!.x, y: l.y, h: l.h, right: prevEnd };
  });
}

const ENDS_SENTENCE = /[.!?:;"')\]]$/;

/** Join wrapped lines; a hyphen at a line end is dropped when the next line continues in lower case. */
const joinLines = (lines: string[]) => lines.reduce((acc, l) => (acc ? joinPair(acc, l) : l), "");
const joinPair = (acc: string, l: string) => (/[a-z]-$/.test(acc) && /^[a-z]/.test(l) ? acc.slice(0, -1) + l : `${acc} ${l}`);

/**
 * Layout-aware paragraphs for one page: larger type and short lines become headings; a paragraph ends at a vertical gap
 * clearly above the line spacing, or at an indented line after a sentence end. `body` is the document's median text height.
 */
export function pageBlocks(items: PdfItem[], body: number, page: number): Block[] {
  const lines = toLines(items);
  if (!lines.length) return [];
  // line spacing: the typical gap between wrapped lines; gaps between paragraphs and to a footer are excluded
  const gaps = lines
    .slice(1)
    .map((l, i) => lines[i]!.y - l.y)
    .filter((g) => g > 0 && g < body * 2);
  const spacing = median(gaps) || body * 1.2;
  const left = Math.min(...lines.map((l) => l.x));
  const width = Math.max(...lines.map((l) => l.right)) - left;
  const out: Block[] = [];
  let cur: Line[] = [];
  const startsParagraph = (l: Line, prev: Line) => {
    const endsSentence = ENDS_SENTENCE.test(prev.text);
    return prev.y - l.y > spacing * 1.45 || (endsSentence && (l.x - left > body * 1.2 || prev.right < left + width * 0.7));
  };
  const flush = () => {
    const text = joinLines(cur.map((l) => l.text));
    if (text) out.push({ kind: "paragraph", text, page });
    cur = [];
  };
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    const isHeading = l.h > body * 1.2 && l.text.length < 140;
    if (isHeading) {
      flush();
      const last = out.at(-1);
      // consecutive heading lines of one title
      if (last?.kind === "heading" && prev && prev.h > body * 1.2 && prev.y - l.y < spacing * 1.6) last.text = `${last.text} ${l.text}`;
      else out.push({ kind: "heading", text: l.text, level: l.h > body * 1.6 ? 1 : 2, page });
      return;
    }
    if (prev && cur.length && startsParagraph(l, prev)) flush();
    cur.push(l);
  });
  flush();
  return out;
}

const digitsOff = (s: string) => s.replace(/\d+/g, "#").toLowerCase();

/** Running headers, footers and bare page numbers: a first or last line that repeats on at least half the pages (and 3 or more). */
export function stripRunning(pages: Block[][]): Block[][] {
  const count = new Map<string, number>();
  const edges = (p: Block[]) => [p[0], p.at(-1)].filter((b): b is Block => !!b && b.kind === "paragraph");
  for (const p of pages) for (const k of new Set(edges(p).map((b) => digitsOff(b.text)))) count.set(k, (count.get(k) ?? 0) + 1);
  const limit = Math.max(3, pages.length / 2);
  const running = (b: Block) => (count.get(digitsOff(b.text)) ?? 0) >= limit || /^(page )?\d{1,4}( of \d+)?$/i.test(b.text);
  return pages.map((p) => {
    const e = edges(p);
    return p.filter((b) => !(e.includes(b) && running(b)));
  });
}

export const bodyHeight = (pages: PdfItem[][]) =>
  median(
    pages
      .flat()
      .filter((i) => i.str.trim())
      .map((i) => i.h),
  );
