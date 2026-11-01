import type { Block } from "./contract";

export interface Parsed {
  title: string;
  blocks: Block[];
  pages?: number;
  needsOcr?: boolean;
}

export const squash = (s: string) => s.replace(/[ \t\r\n ]+/g, " ").trim();
export const wordCount = (blocks: Block[]) => blocks.reduce((n, b) => n + (b.text.match(/\S+/g)?.length ?? 0), 0);

/** Fallback title: the first block of text, trimmed to a headline length. */
export function titleFromBlocks(blocks: Block[], fallback = "Untitled reading"): string {
  const t = blocks[0]?.text ?? "";
  if (!t) return fallback;
  return t.length > 80 ? `${t.slice(0, 77).trimEnd()}...` : t;
}

/**
 * Plain text to paragraphs. Blank lines separate paragraphs and single line breaks inside one are soft wraps;
 * text without any blank line is treated as one paragraph per line (notes, lists).
 */
export function textToBlocks(text: string): Block[] {
  const norm = text.replace(/\r\n?/g, "\n").replace(/ /g, " ").trim();
  if (!norm) return [];
  const hasBlank = /\n[ \t]*\n/.test(norm);
  const chunks = hasBlank ? norm.split(/\n[ \t]*\n+/) : norm.split("\n");
  return chunks.map(squash).filter(Boolean).map((t) => ({ kind: "paragraph" as const, text: t }));
}
