/** Copies shorter than this are not worth a prompt. */
export const MIN_PROMPT_CHARS = 100;

/** True for text worth offering to read: long enough, prose rather than a secret or a one-word token. */
export function worthPrompting(text: string): boolean {
  const t = text.trim();
  if (t.length < MIN_PROMPT_CHARS) return false;
  return /\s/.test(t) && (t.match(/\p{L}{2,}/gu)?.length ?? 0) >= 12;
}

export interface WatchDeps {
  text(): string;
  /** The copy came from a password manager. */
  isPrivate(): boolean;
  onCopy(text: string): void;
  intervalMs?: number;
}

/**
 * Polls the clipboard while enabled and calls onCopy for new long text. Windows has no cheap change event in Electron; one
 * string read per second costs nothing measurable, and the timer exists only while the setting is on.
 */
export class ClipboardWatcher {
  #d: WatchDeps;
  #timer: NodeJS.Timeout | undefined;
  #last = "";
  constructor(deps: WatchDeps) {
    this.#d = deps;
  }
  get running() {
    return !!this.#timer;
  }
  start() {
    if (this.#timer) return;
    this.#last = this.#d.text(); // what is already there was not copied just now
    this.#timer = setInterval(() => this.tick(), this.#d.intervalMs ?? 1000);
    this.#timer.unref();
  }
  stop() {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }
  tick() {
    const text = this.#d.text();
    if (text === this.#last) return;
    this.#last = text;
    if (worthPrompting(text) && !this.#d.isPrivate()) this.#d.onCopy(text);
  }
}
