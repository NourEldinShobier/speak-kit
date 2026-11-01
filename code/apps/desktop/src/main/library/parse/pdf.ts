import type { Block } from "../../../shared/library/contract";
import { bodyHeight, pageBlocks, stripRunning, type PdfItem } from "./pdf-layout";
import type { Parsed } from "../../../shared/library/text";

/** Fewer characters per page than this on average: the PDF is scans without a text layer. */
const MIN_CHARS_PER_PAGE = 25;

/** PDF text with pdf.js (legacy build, plain Node, no canvas needed for text). */
export async function pdfToParsed(bytes: Uint8Array): Promise<Parsed> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: PdfItem[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(
        content.items.flatMap((it) =>
          "str" in it ? [{ str: it.str, x: it.transform[4] ?? 0, y: it.transform[5] ?? 0, w: it.width, h: it.height || Math.hypot(it.transform[0] ?? 0, it.transform[1] ?? 0) }] : [],
        ),
      );
      page.cleanup();
    }
    const body = bodyHeight(pages);
    const blocks: Block[] = stripRunning(pages.map((p, i) => pageBlocks(p, body, i + 1))).flat();
    const chars = blocks.reduce((n, b) => n + b.text.length, 0);
    const info = (await doc.getMetadata().catch(() => null))?.info as { Title?: unknown } | undefined;
    const title = typeof info?.Title === "string" ? info.Title.trim() : "";
    return { title, blocks, pages: doc.numPages, needsOcr: chars < MIN_CHARS_PER_PAGE * doc.numPages };
  } finally {
    await task.destroy();
  }
}
