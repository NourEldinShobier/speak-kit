/** Opaque copy of everything that was on the clipboard. */
export type ClipboardSnapshot = unknown;

export interface ClipboardPort {
  /** Everything on the clipboard now (an empty clipboard is a snapshot too). Null when it could not be read: nothing is restored then. */
  snapshot(): Promise<ClipboardSnapshot | null>;
  writeText(text: string): Promise<void>;
  restore(snapshot: ClipboardSnapshot): Promise<void>;
  /** False when a snapshot would lose what is on the clipboard now (a copied file list): the text must then not go through the clipboard at all. */
  restorable?(): Promise<boolean>;
  /** Changes whenever any program writes the clipboard. */
  sequence(): number;
}

interface Pending {
  snapshot: ClipboardSnapshot | null;
  seq: number;
  timer: NodeJS.Timeout | undefined;
  done(): void;
  idle: Promise<void>;
}

/**
 * Puts dictated text on the clipboard and later puts the user's clipboard back, but only while the clipboard still holds our text: the
 * sequence number moves when anything else writes it, so a copy the user makes in between is never overwritten. A second paste while a restore is
 * pending keeps the original snapshot (the clipboard then holds our previous text, not the user's).
 */
export function createRestoreGuard(clip: ClipboardPort) {
  let pending: Pending | null = null;

  const open = (): Pending => {
    let done!: () => void;
    const idle = new Promise<void>((resolve) => (done = resolve));
    return { snapshot: null, seq: 0, timer: undefined, done, idle };
  };

  const close = (p: Pending) => {
    clearTimeout(p.timer);
    if (pending === p) pending = null;
    p.done();
  };

  const run = async (p: Pending) => {
    if (pending !== p) return;
    try {
      if (p.snapshot !== null && clip.sequence() === p.seq) await clip.restore(p.snapshot);
    } catch {
      // Another program holds the clipboard open: our text stays on it, which the user can still paste.
    }
    close(p);
  };

  return {
    /** Copies the text to the clipboard, remembering what was there. Rejects when the clipboard cannot be written. */
    async stage(text: string): Promise<void> {
      const prev = pending;
      clearTimeout(prev?.timer);
      const ours = prev !== null && clip.sequence() === prev.seq;
      const snapshot = ours ? prev.snapshot : await clip.snapshot();
      if (prev && !ours) close(prev);
      await clip.writeText(text);
      const next = ours ? prev : open();
      next.snapshot = snapshot;
      next.seq = clip.sequence();
      pending = next;
    },
    /** Brings the old clipboard back after the delay. */
    restoreAfter(delayMs: number): void {
      const p = pending;
      if (p) p.timer = setTimeout(() => void run(p), delayMs);
    },
    /** The text stays on the clipboard for good. */
    keep(): void {
      if (pending) close(pending);
    },
    /** Resolves once no restore is waiting. */
    settled: (): Promise<void> => pending?.idle ?? Promise.resolve(),
    /** Restores now, for app quit. */
    async flush(): Promise<void> {
      if (!pending) return;
      clearTimeout(pending.timer);
      await run(pending);
    },
  };
}

export type RestoreGuard = ReturnType<typeof createRestoreGuard>;
