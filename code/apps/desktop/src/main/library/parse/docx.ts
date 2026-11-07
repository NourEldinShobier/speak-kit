import mammoth from "mammoth";
import { htmlToParsed } from "./html";
import type { Parsed } from "../../../shared/library/text";

export async function docxToParsed(bytes: Uint8Array): Promise<Parsed> {
  const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
  return htmlToParsed(value, { readable: false });
}
