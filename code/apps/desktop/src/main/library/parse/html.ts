import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { Block } from "../contract";
import { squash, type Parsed } from "./text";

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "PRE", "CODE", "SVG", "FIGURE", "NAV", "ASIDE", "FOOTER", "FORM", "BUTTON", "TEMPLATE"]);
const HEADING = /^H([1-6])$/;
const BLOCKS = new Set(["P", "DIV", "SECTION", "ARTICLE", "MAIN", "LI", "UL", "OL", "BLOCKQUOTE", "TABLE", "TBODY", "THEAD", "TR", "H1", "H2", "H3", "H4", "H5", "H6", "BODY", "HTML", "BR", "HR", "DL", "DT", "DD"]);
const LISTS = new Set(["UL", "OL"]);

interface DomNode {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<DomNode>;
}

/** Walk an HTML tree into blocks. Inline runs between block elements become paragraphs. */
export function domToBlocks(root: DomNode): Block[] {
  const out: Block[] = [];
  const add = (kind: Block["kind"], text: string, level?: number) => {
    const t = squash(text);
    if (t) out.push(level ? { kind, text: t, level } : { kind, text: t });
  };
  const walk = (node: DomNode) => {
    let run = "";
    const flush = () => {
      add("paragraph", run);
      run = "";
    };
    for (const c of Array.from(node.childNodes)) {
      if (c.nodeType === 3) run += c.textContent ?? "";
      else if (c.nodeType !== 1 || SKIP.has(c.nodeName)) continue;
      else if (!BLOCKS.has(c.nodeName)) run += c.textContent ?? ""; // inline: a, span, em, b
      else {
        flush();
        const h = HEADING.exec(c.nodeName);
        if (h) add("heading", c.textContent ?? "", Number(h[1]));
        else if (c.nodeName === "LI") item(c);
        else if (c.nodeName === "BLOCKQUOTE") add("quote", c.textContent ?? "");
        else if (c.nodeName === "TR") add("paragraph", Array.from(c.childNodes).map((x) => squash(x.textContent ?? "")).filter(Boolean).join(", "));
        else if (c.nodeName === "P") add("paragraph", c.textContent ?? "");
        else walk(c);
      }
    }
    flush();
  };
  // An item with a nested list: its own text first, then the nested items.
  const item = (li: DomNode) => {
    const kids = Array.from(li.childNodes);
    add("list-item", kids.filter((x) => !LISTS.has(x.nodeName)).map((x) => x.textContent ?? "").join(""));
    for (const x of kids) if (LISTS.has(x.nodeName)) walk(x);
  };
  walk(root);
  return out;
}

export interface HtmlOptions {
  /** Run Readability first (web pages and saved pages). Off for DOCX and EPUB, which are already clean. */
  readable: boolean;
  url?: string;
}

const MIN_ARTICLE_CHARS = 200;
const page = (fragment: string) => `<!doctype html><html><head></head><body>${fragment}</body></html>`;

export function htmlToParsed(html: string, { readable, url }: HtmlOptions): Parsed {
  const { document } = parseHTML(/<html[\s>]/i.test(html) ? html : page(html));
  const docTitle = squash(document.title ?? "");
  if (readable) {
    if (url) {
      const base = document.createElement("base");
      base.setAttribute("href", url);
      document.head?.appendChild(base);
    }
    const article = new Readability(document as unknown as Document, { charThreshold: MIN_ARTICLE_CHARS }).parse();
    if (article?.content && (article.textContent?.length ?? 0) >= MIN_ARTICLE_CHARS) {
      const inner = parseHTML(page(article.content)).document;
      return { title: squash(article.title || docTitle), blocks: domToBlocks(inner.body as unknown as DomNode) };
    }
  }
  return { title: docTitle, blocks: domToBlocks((document.body ?? document.documentElement) as unknown as DomNode) };
}
