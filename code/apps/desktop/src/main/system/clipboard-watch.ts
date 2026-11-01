/** Copies shorter than this are not worth a prompt. */
const MIN_PROMPT_CHARS = 100;

/** True for text worth offering to read: long enough, prose rather than a secret or a one-word token. */
export function worthPrompting(text: string): boolean {
  const t = text.trim();
  if (t.length < MIN_PROMPT_CHARS) return false;
  return /\s/.test(t) && (t.match(/\p{L}{2,}/gu)?.length ?? 0) >= 12;
}

interface WatchDeps {
  text(): Promise<string>;
  /** The copy came from a password manager. */
  isPrivate(): Promise<boolean>;
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
    void this.#d.text().then((t) => (this.#last ||= t)); // what is already there was not copied just now
    this.#timer = setInterval(() => void this.tick(), this.#d.intervalMs ?? 1000);
    this.#timer.unref();
  }
  stop() {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }
  async tick() {
    const text = await this.#d.text();
    if (text === this.#last) return;
    this.#last = text;
    if (worthPrompting(text) && !(await this.#d.isPrivate())) this.#d.onCopy(text);
  }
}
