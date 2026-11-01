import type { ContentToBg, PlayerCommand, PlayerState, ReadDoc, SiteRule } from "@speakkit/protocol";
import type { Extraction, ReaderView } from "../../features/reader";
import type { Settings } from "../../features/settings";
import type { ExtraToBg, VoiceInfo } from "../../shared/internal";
import type { UiModel } from "../../shared/ui-types";
import type { Deferred } from "./lazy";
import type { Ui } from "./ui";

/** What the parts of the content controller share. Controller owns the fields and implements the methods; the parts read and write through it. */

/** An extracted document: the page text, the doc sent to the service worker, and the block numbers it spans. */
export interface Doc {
  ex: Extraction;
  doc: ReadDoc;
  blocks: number[];
}

/** The sentence that is highlighted now. */
export interface Current {
  docId: string;
  index: number;
  range: Range | null;
}

export type ReadMode = "page" | "selection" | "from-here";

export interface Ctx {
  settings: Settings;
  state: PlayerState | null;
  ui: Deferred<Ui> | null;
  docs: Map<string, Doc>;
  current: Current | null;
  lastDoc: ReadDoc | null;
  reader: ReaderView | null;
  readerDoc: string | null;
  voices: VoiceInfo[];
  readonly host: string;
  readonly reading: boolean;
  rule(): SiteRule | undefined;
  model(): UiModel;
  refresh(): void;
  ensureUi(): Deferred<Ui>;
  post(msg: ContentToBg | ExtraToBg, cb?: (r: unknown) => void): void;
  cmd(command: PlayerCommand): void;
  warm(reason: "hover" | "selection" | "dock"): void;
  setSpeed(speed: number): void;
  closeReader(): void;
  saveSettings(mut: (s: Settings) => void): Promise<void>;
}
