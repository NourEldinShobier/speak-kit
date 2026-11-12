import { clipboard, ClipboardItem, type NativeImage } from "electron";

/** Puts a capture on the clipboard: the words as text and the picture as a PNG, in one item so a paste picks whichever the target takes. Only writes; nothing here reads. */
export async function writeCapture(text: string, image?: NativeImage): Promise<void> {
  const parts: ConstructorParameters<typeof ClipboardItem>[0] = {};
  if (text) parts["text/plain"] = new Blob([text], { type: "text/plain" });
  if (image && !image.isEmpty()) parts["image/png"] = new Blob([new Uint8Array(image.toPNG())], { type: "image/png" });
  if (Object.keys(parts).length) await clipboard.write([new ClipboardItem(parts)]);
}

export const writeText = (text: string): Promise<void> => clipboard.writeText(text);
