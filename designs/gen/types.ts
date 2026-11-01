import { B, Ref } from "./lib";
import { T } from "./kit";

export type S = {
  id: string; group: string; title: string; note: string; w: number; h: number; dark?: boolean;
  build: (b: B, t: T, root: Ref) => void;
};
export const GROUPS: Record<string, { name: string; blurb: string }> = {
  A: { name: "Chrome extension: toolbar popup", blurb: "The popup opened from the toolbar icon. Controls the current page and shows the link to the desktop app." },
  B: { name: "Chrome extension: on-page reading", blurb: "Selection bubble, paragraph play gutter, floating dock, read-along highlight, context menu and errors, drawn on a real article page." },
  C: { name: "Chrome extension: options and side panel", blurb: "Extension settings page (connection, voice, highlight look, shortcuts, site rules) and the queue side panel." },
  D: { name: "Desktop app: first-run setup", blurb: "Welcome, engine choice with hardware check, model download, extension pairing, test voice." },
  E: { name: "Desktop app: library", blurb: "Home with saved readings, adding content (paste, URL, file, drag and drop), search." },
  F: { name: "Desktop app: reader", blurb: "Text and PDF reading with read-along highlight, player bar, outline, display settings, sleep timer and finish states." },
  G: { name: "Voices and engines", blurb: "Kokoro voice library, Chatterbox voice cloning, engine manager, hardware warnings." },
  H: { name: "Desktop app: settings", blurb: "General, playback, pronunciation, browser integration, shortcuts, storage, appearance, about and updates." },
  I: { name: "Tray, mini player and global shortcuts", blurb: "Always-available surfaces outside the main window." },
  J: { name: "Export audio", blurb: "Save a reading as MP3 or WAV." },
  K: { name: "System states and errors", blurb: "Crashes, resource problems, permission and update dialogs." },
};
