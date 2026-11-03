import { plural } from "@speakkit/protocol";
import type { engineView } from "../shared/engine-view";
import type { ReaderState } from "../shared/reader";

type EngineKey = ReturnType<typeof engineView>["key"];

/** Footer wording for each engine state (the title-bar pill says the same in one word). */
const ENGINE_TEXT: Record<EngineKey, string> = {
  starting: "Starting the voice engine",
  missing: "Voice engine not downloaded",
  downloading: "Downloading the voice engine",
  unloaded: "Voice engine asleep",
  loading: "Loading the voice engine",
  ready: "Kokoro ready",
  error: "Voice engine error",
};

export interface FooterInput {
  engine: EngineKey;
  /** Display name of the default voice; undefined until the voice list is known. */
  voice: string | undefined;
  /** Readings in the library; null until the first load. */
  docs: number | null;
  reader: ReaderState;
}

/** The status line parts, left to right: engine, voice, then the reading that plays or else the library count. */
export function footerItems(i: FooterInput): string[] {
  const items = [ENGINE_TEXT[i.engine]];
  if (i.voice) items.push(`Voice: ${i.voice}`);
  const { status, title } = i.reader;
  if (status === "playing" || status === "preparing") items.push(`Reading: ${title || "this text"}`);
  else if (status === "paused") items.push(`Paused: ${title || "this text"}`);
  else if (i.docs !== null) items.push(plural(i.docs, "reading", "readings"));
  return items;
}
