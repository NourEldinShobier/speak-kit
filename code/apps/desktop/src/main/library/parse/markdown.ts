import { marked, type Token, type Tokens } from "marked";
import type { Block } from "../contract";
import { squash } from "./text";

const inline = (tokens: Token[] | undefined, fallback: string): string => {
  if (!tokens) return fallback;
  return tokens
    .map((t) => {
      if (t.type === "image" || t.type === "html") return "";
      if ("tokens" in t && t.tokens) return inline(t.tokens, t.raw);
      return "text" in t ? String(t.text) : "";
    })
    .join("");
};

/** Markdown to blocks: headings, paragraphs, list items and quotes; code, tables, rules and raw HTML are not read aloud. */
export function markdownToBlocks(md: string): Block[] {
  const out: Block[] = [];
  const add = (kind: Block["kind"], text: string, level?: number) => {
    const t = squash(text);
    if (t) out.push(level ? { kind, text: t, level } : { kind, text: t });
  };
  for (const t of marked.lexer(md)) {
    if (t.type === "heading") add("heading", inline(t.tokens, t.text), (t as Tokens.Heading).depth);
    else if (t.type === "paragraph") add("paragraph", inline(t.tokens, t.text));
    else if (t.type === "blockquote") add("quote", inline(t.tokens, t.text));
    else if (t.type === "list")
      for (const item of (t as Tokens.List).items)
        add("list-item", inline(item.tokens.flatMap((x) => (x.type === "text" && "tokens" in x && x.tokens ? x.tokens : [x])), item.text));
  }
  return out;
}
