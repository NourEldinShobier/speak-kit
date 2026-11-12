import type { Notice } from "../../shared/capture/notices";

const NOTICE_MS = 8000;

export interface NoticeBoardDeps {
  /** Shows a failure or a warning in the capsule; undefined clears it. */
  showInCapsule(n: Notice | undefined): void;
  publish(): void;
}

/** The notice of the Capture page: it stays until dismissed or replaced, and a plain note goes away by itself. */
export class NoticeBoard {
  readonly #d: NoticeBoardDeps;
  #current: Notice | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(deps: NoticeBoardDeps) {
    this.#d = deps;
  }

  get current(): Notice | undefined {
    return this.#current;
  }

  /** A failure or a note: errors and warnings go to the capsule too. */
  notify(n: Notice) {
    clearTimeout(this.#timer);
    this.#current = n;
    if (n.tone !== "info") this.#d.showInCapsule(n);
    else this.#timer = setTimeout(() => this.dismiss(), NOTICE_MS);
    this.#d.publish();
  }

  /** The notice is cleared without telling the capsule (a new capture begins). */
  clear() {
    this.#current = undefined;
  }

  dismiss() {
    this.#current = undefined;
    this.#d.showInCapsule(undefined);
    this.#d.publish();
  }

  dispose() {
    clearTimeout(this.#timer);
  }
}
