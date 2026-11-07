import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { initEpubFile } from "@lingo-reader/epub-parser";
import type { Block } from "../../../shared/library/contract";
import { htmlToParsed } from "./html";
import type { Parsed } from "../../../shared/library/text";

/** EPUB: the chapters in spine order, each through the HTML reader. The parser extracts images to a scratch folder, removed afterwards. */
export async function epubToParsed(bytes: Uint8Array): Promise<Parsed> {
  const scratch = await mkdtemp(path.join(tmpdir(), "speakkit-epub-"));
  try {
    const epub = await initEpubFile(bytes, scratch);
    const blocks: Block[] = [];
    for (const item of epub.getSpine()) blocks.push(...htmlToParsed((await epub.loadChapter(item.id)).html, { readable: false }).blocks);
    const title = epub.getMetadata().title;
    await epub.destroy();
    return { title: typeof title === "string" ? title : "", blocks };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
