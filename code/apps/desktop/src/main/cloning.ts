import { dialog, type BrowserWindow } from "electron";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Api } from "../shared/ipc";
import { DesktopFault } from "../shared/errors";
import type { Ctx } from "./context";
import { ServerError } from "./server-api";

type CloningHandlers = Pick<Api, "pickReference" | "cloneVoice" | "clonedVoices" | "updateClonedVoice" | "deleteClonedVoice">;

/** Audio files the reference picker offers; the renderer decodes them, so these are the formats Chromium decodes. */
export const REFERENCE_TYPES = ["wav", "mp3", "m4a", "flac"] as const;
/** A reference is at most 30 s; even 30 s of 24-bit stereo WAV at 96 kHz is 17 MB. Anything larger is not a clip. */
export const MAX_REFERENCE_BYTES = 60 * 1024 * 1024;

/** The server's answer to a rejected clip becomes an error the renderer words (clip-rejected carries the per-criterion rows). */
const rejected = async <T>(p: Promise<T>): Promise<T> =>
  p.catch((e) => {
    if (e instanceof ServerError && e.code === "clip-rejected") throw new DesktopFault({ code: "clip-rejected", args: { message: e.message, checks: e.checks ?? [] } });
    throw e;
  });

/**
 * Voice cloning (G3 to G15): the file picker for a reference clip and the cloned-voice routes of the local server. The renderer
 * decodes the audio and sends a WAV; nothing here keeps the clip: the server stores the voice file, and the picker only reads.
 */
export function cloningHandlers(ctx: Ctx, parent: () => BrowserWindow | null): CloningHandlers {
  const s = ctx.server;
  return {
    pickReference: async () => {
      const w = parent();
      const opts = { properties: ["openFile" as const], filters: [{ name: "Audio", extensions: [...REFERENCE_TYPES] }] };
      const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
      const file = r.canceled ? undefined : r.filePaths[0];
      if (!file) return null;
      const name = path.basename(file);
      const mb = MAX_REFERENCE_BYTES / 1024 / 1024;
      if ((await stat(file)).size > MAX_REFERENCE_BYTES) throw new DesktopFault({ code: "file-too-large", args: { name, mb } });
      return { name, bytes: new Uint8Array(await readFile(file)) };
    },
    cloneVoice: ({ name, consent, audio }) => rejected(s.cloneVoice({ name, consent, audio: Buffer.from(audio).toString("base64") })),
    clonedVoices: () => s.clonedVoices(),
    updateClonedVoice: (id, patch) => s.updateVoice(id, patch),
    deleteClonedVoice: (id) => s.deleteVoice(id),
  };
}
