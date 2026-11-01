import path from "node:path";
import { EXTENSIONS, type Format } from "../../../shared/library/contract";
import { docxToParsed } from "./docx";
import { epubToParsed } from "./epub";
import { htmlToParsed } from "./html";
import { ImportError } from "./import-error";
import { markdownToBlocks } from "./markdown";
import { pdfToParsed } from "./pdf";
import { checkZip } from "./zip-guard";
import { textToBlocks, type Parsed } from "../../../shared/library/text";

const FORMAT_OF: Record<(typeof EXTENSIONS)[number], Format> = {
  txt: "text",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  pdf: "pdf",
  docx: "docx",
  epub: "epub",
};

const SUPPORTED = "TXT, MD, HTML, PDF, DOCX, EPUB";

function formatOf(name: string): Format | undefined {
  const ext = path.extname(name).slice(1).toLowerCase();
  return FORMAT_OF[ext as keyof typeof FORMAT_OF];
}

export { ImportError };

const decode = (b: Uint8Array) => new TextDecoder("utf-8").decode(b).replace(/^﻿/, "");

/** Parse a file's bytes by its extension. An empty result is an error unless a PDF may be scanned (OCR can fill it). */
export async function parseFile(name: string, bytes: Uint8Array): Promise<{ format: Format; parsed: Parsed }> {
  const format = formatOf(name);
  if (!format) throw new ImportError("unsupported", `${path.extname(name) || "This file"} is not a supported type. Supported: ${SUPPORTED}.`);
  if (format === "docx" || format === "epub") checkZip(name, bytes);
  let parsed: Parsed;
  try {
    if (format === "text") parsed = { title: "", blocks: textToBlocks(decode(bytes)) };
    else if (format === "markdown") {
      const blocks = markdownToBlocks(decode(bytes));
      parsed = { title: blocks.find((b) => b.kind === "heading")?.text ?? "", blocks };
    } else if (format === "html") parsed = htmlToParsed(decode(bytes), { readable: true });
    else if (format === "pdf") parsed = await pdfToParsed(bytes);
    else if (format === "docx") parsed = await docxToParsed(bytes);
    else parsed = await epubToParsed(bytes);
  } catch (e) {
    throw new ImportError("unreadable", `${name} could not be read: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!parsed.blocks.length && !parsed.needsOcr) throw new ImportError("empty", `${name} has no text to read.`);
  return { format, parsed };
}
