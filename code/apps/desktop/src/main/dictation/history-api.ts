import type { Dictation } from "@speakkit/dictation";
import type { HistoryItem } from "../../shared/dictation/contract";
import { historyItems } from "./service-support";

interface Deps {
  core(): Dictation | undefined;
  ready(): Promise<void>;
  /** Every speech model, to show the name of the one that heard an entry. */
  catalog(): readonly { id: string; name: string }[];
  /** The count changed. */
  changed(): void;
}

/** The dictation history as the pages use it: the entries with the model that heard each, copy, delete, and the count the status shows. */
export class HistoryApi {
  count = 0;
  readonly #d: Deps;

  constructor(deps: Deps) {
    this.#d = deps;
  }

  async refresh(): Promise<void> {
    this.count = (
      (await this.#d
        .core()
        ?.history.list()
        .catch(() => [])) ?? []
    ).length;
    this.#d.changed();
  }

  async list(search?: string): Promise<HistoryItem[]> {
    await this.#d.ready();
    return historyItems((await this.#d.core()?.history.list(search ? { search } : undefined)) ?? [], this.#d.catalog());
  }

  async copy(id: string): Promise<boolean> {
    await this.#d.ready();
    return (await this.#d.core()?.history.copy(id)) ?? false;
  }

  async remove(id: string): Promise<void> {
    await this.#d.ready();
    await this.#d.core()?.history.remove(id);
    await this.refresh();
  }

  async clear(): Promise<void> {
    await this.#d.ready();
    await this.#d.core()?.history.clear();
    await this.refresh();
  }
}
