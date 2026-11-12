import type { Dictation } from "@speakkit/dictation";
import type { HistoryItem } from "../../shared/dictation/contract";
import { friendlyAppName } from "./app-name";

const RECENT = 5;
const NO_STATS = { dictations: 0, words: 0, listeningMs: 0, wordsPerMinute: 0, topApps: [], outcomes: { pasted: 0, copied: 0, failed: 0 } };

interface Deps {
  core(): Dictation | undefined;
  /** Resolves once the core exists (or failed to). */
  ready(): Promise<unknown>;
  /** The count or the recent list changed. */
  changed(): void;
}

/** What the History page and the tray need of the dictation history, with the entry count and the last five texts kept up to date after every change. */
export class HistoryFacade {
  readonly #d: Deps;
  #count = 0;
  #recent: { id: string; text: string }[] = [];

  constructor(deps: Deps) {
    this.#d = deps;
  }

  get count(): number {
    return this.#count;
  }

  /** Texts of the last dictations, newest first. */
  recent(): string[] {
    return this.#recent.map((r) => r.text);
  }

  copyRecent(index: number): void {
    const id = this.#recent[index]?.id;
    if (id) void this.#d.core()?.history.copy(id);
  }

  async refresh(): Promise<void> {
    const all =
      (await this.#d
        .core()
        ?.history.list()
        .catch(() => [])) ?? [];
    this.#count = all.length;
    this.#recent = all.slice(0, RECENT).map((e) => ({ id: e.id, text: e.text }));
    this.#d.changed();
  }

  async list(search?: string, limit?: number): Promise<HistoryItem[]> {
    await this.#d.ready();
    const items = (await this.#d.core()?.history.list(search || limit ? { ...(search && { search }), ...(limit && { limit }) } : undefined)) ?? [];
    return items.map((e) => ({
      id: e.id,
      at: e.at,
      text: e.text,
      raw: e.raw,
      durationMs: e.durationMs,
      expiresInMs: null,
      ...(e.app && { app: e.app, appName: e.displayName ?? friendlyAppName(e.app) ?? e.app }),
      ...(e.kind && { kind: e.kind }),
      ...(e.outcome && { outcome: e.outcome }),
    }));
  }

  async copy(id: string): Promise<boolean> {
    await this.#d.ready();
    return (await this.#d.core()?.history.copy(id)) ?? false;
  }

  async remove(ids: string[]): Promise<void> {
    await this.#d.ready();
    await this.#d.core()?.history.removeMany(ids);
    await this.refresh();
  }

  async clear(): Promise<void> {
    await this.#d.ready();
    await this.#d.core()?.history.clear();
    await this.refresh();
  }

  async stats() {
    await this.#d.ready();
    return (await this.#d.core()?.history.stats()) ?? NO_STATS;
  }

  /** Inserts the newest dictation again, into the window in front now. */
  async pasteLast(): Promise<boolean> {
    const [last] = this.#recent;
    return last ? ((await this.#d.core()?.history.insert(last.id)) ?? false) : false;
  }

  /** Puts the newest dictation on the clipboard. */
  async copyLast(): Promise<void> {
    const [last] = this.#recent;
    if (last) await this.#d.core()?.history.copy(last.id);
  }
}
