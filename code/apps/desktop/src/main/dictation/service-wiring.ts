import path from "node:path";
import { shell } from "electron";
import type { Rewriter } from "@speakkit/dictation";
import { createAudioStore } from "./audio-store";
import { createHistoryStorage } from "./history-storage";
import { openRecorderWindow } from "./recorder-window";

export const trashViaShell = (file: string): Promise<boolean> =>
  shell.trashItem(file).then(
    () => true,
    () => false,
  );

/** The history file and the folder of kept recordings under the data directory. */
export function historyFiles(dataDir: string, trash: (file: string) => Promise<boolean>, onEvicted: (files: string[]) => void) {
  return { storage: createHistoryStorage(path.join(dataDir, "dictation-history.json")), audio: createAudioStore({ dir: path.join(dataDir, "dictation-audio"), trash, onEvicted }) };
}

/** The microphone window as the recorder host sees it. */
export function recorderWindow(page: string, micAllowed: () => boolean) {
  const w = openRecorderWindow({ page, micAllowed });
  return {
    contents: w.webContents,
    destroy: () => !w.isDestroyed() && w.destroy(),
    get destroyed() {
      return w.isDestroyed();
    },
  };
}

/** Tests only: a writer that succeeds, fails or never answers (until its deadline aborts it). */
export function scriptedRewriter(mode: () => "ok" | "hang" | "fail"): Rewriter {
  return {
    rewrite: ({ text, signal }) => {
      if (mode() === "fail") return Promise.reject(new Error("scripted"));
      if (mode() === "hang") return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      return Promise.resolve(`${text} [rewritten]`);
    },
  };
}

/** Status updates to the window: download progress arrives many times a second, the window gets a few a second. */
export class Pusher {
  #last = 0;
  #timer: NodeJS.Timeout | undefined;
  readonly #everyMs: number;
  readonly #send: () => void;
  constructor(everyMs: number, send: () => void) {
    this.#everyMs = everyMs;
    this.#send = send;
  }
  now(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#last = Date.now();
    this.#send();
  }
  push(soon = false): void {
    if (soon || Date.now() - this.#last >= this.#everyMs) this.now();
    else this.#timer ??= setTimeout(() => this.now(), this.#everyMs);
  }
  stop(): void {
    clearTimeout(this.#timer);
  }
}
