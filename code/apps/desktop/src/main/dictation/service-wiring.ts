import path from "node:path";
import { shell } from "electron";
import type { Rewriter } from "@speakkit/dictation";
import { createAudioStore } from "./audio-store";
import { createHistoryStorage } from "./history-storage";

export const trashViaShell = (file: string): Promise<boolean> =>
  shell.trashItem(file).then(
    () => true,
    () => false,
  );

/** The history file and the folder of kept recordings under the data directory. */
export function historyFiles(dataDir: string, trash: (file: string) => Promise<boolean>, audio: { onEvicted: (files: string[]) => void; limitBytes?: () => number }) {
  return {
    storage: createHistoryStorage(path.join(dataDir, "dictation-history.json")),
    audio: createAudioStore({ dir: path.join(dataDir, "dictation-audio"), trash, ...audio }),
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
