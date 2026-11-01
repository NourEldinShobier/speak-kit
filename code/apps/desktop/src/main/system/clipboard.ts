import { clipboard } from "electron";
import type { ClipboardIO } from "./selection";

interface Snap {
  text: string;
  html: string;
  rtf: string;
  image: Electron.NativeImage;
}

/** The real clipboard. Text, HTML, RTF and an image are restored; other formats are lost (rare for a selection copy). */
export const electronClipboard: ClipboardIO = {
  text: () => clipboard.readText(),
  snapshot: (): Snap => ({ text: clipboard.readText(), html: clipboard.readHTML(), rtf: clipboard.readRTF(), image: clipboard.readImage() }),
  restore: (s) => {
    const { text, html, rtf, image } = s as Snap;
    if (!image.isEmpty()) clipboard.write({ image, text, html, rtf });
    else if (text || html || rtf) clipboard.write({ text, html, rtf });
    else clipboard.clear();
  },
  clear: () => clipboard.clear(),
};

/** Password managers mark their copies with these formats so clipboard tools skip them. */
export const copyIsPrivate = (): boolean => {
  if (process.platform !== "win32") return false;
  if (clipboard.readBuffer("ExcludeClipboardContentFromMonitorProcessing").length > 0) return true;
  const hist = clipboard.readBuffer("CanIncludeInClipboardHistory");
  return hist.length >= 4 && hist.readUInt32LE(0) === 0;
};
