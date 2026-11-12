import type { Dictation } from "@speakkit/dictation";
import type { HistoryItem } from "../../shared/dictation/contract";

interface Deps {
  ready(): Promise<unknown>;
  core(): Dictation | undefined;
  /** The entry count may have changed. */
  changed(): Promise<void>;
}

/** The history as the Settings pages use it: plain items, and the count refreshed after a delete. */
export class DictationHistory {
  readonly #d: Deps;

  constructor(d: Deps) {
    this.#d = d;
  }

  async list(search?: string): Promise<HistoryItem[]> {
    await this.#d.ready();
    const items = (await this.#d.core()?.history.list(search ? { search } : undefined)) ?? [];
    return items.map((e) => ({ id: e.id, at: e.at, text: e.text, ...(e.app && { app: e.app }), ...(e.kind && { kind: e.kind }) }));
  }

  async copy(id: string): Promise<boolean> {
    await this.#d.ready();
    return (await this.#d.core()?.history.copy(id)) ?? false;
  }

  async remove(id: string): Promise<void> {
    await this.#d.ready();
    await this.#d.core()?.history.remove(id);
    await this.#d.changed();
  }

  async clear(): Promise<void> {
    await this.#d.ready();
    await this.#d.core()?.history.clear();
    await this.#d.changed();
  }
}
