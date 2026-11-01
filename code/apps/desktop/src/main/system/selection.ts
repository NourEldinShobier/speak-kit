/** The clipboard operations selection capture needs, so the sequence can be tested without a real clipboard. */
export interface ClipboardIO {
  text(): Promise<string>;
  /** Everything on the clipboard right now, to put back afterwards. */
  snapshot(): Promise<unknown>;
  restore(snapshot: unknown): Promise<void>;
  clear(): void | Promise<void>;
}

interface CaptureDeps {
  clip: ClipboardIO;
  /** Presses Ctrl+C in the focused app. */
  copy(): Promise<void>;
  sleep(ms: number): Promise<void>;
  /** How long to wait for the app to answer Ctrl+C. */
  timeoutMs?: number;
}

/**
 * Reads the text selected in the focused app: clear the clipboard, press Ctrl+C, wait for text, put the old clipboard back.
 * Returns "" when nothing was selected or the app did not answer in time.
 */
export async function captureSelection({ clip, copy, sleep, timeoutMs = 600 }: CaptureDeps): Promise<string> {
  const before = await clip.snapshot();
  await clip.clear();
  try {
    await copy();
    for (let waited = 0; waited < timeoutMs; waited += 25) {
      const t = await clip.text();
      if (t) return t;
      await sleep(25);
    }
    return "";
  } finally {
    await clip.restore(before);
  }
}
