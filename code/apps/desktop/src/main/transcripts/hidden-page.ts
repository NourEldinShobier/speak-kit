import type { IpcMain, IpcMainEvent, WebContents } from "electron";
import * as v from "valibot";

/** A page nobody sees, as the host needs it. */
export interface PageHandle {
  readonly contents: WebContents;
  destroy(): void;
  readonly destroyed: boolean;
}

export interface RpcChannels {
  command: string;
  reply: string;
  ready: string;
}

interface Deps<R> {
  ipcMain: IpcMain;
  channels: RpcChannels;
  open(): PageHandle;
  /** Checks one reply's `[id, result]` arguments. */
  reply: v.GenericSchema<[number, R]>;
  /** What a call is answered with when the page is gone or does not answer in time. */
  lost: R;
  /** How long to wait for the page to load. */
  loadMs?: number;
}

/**
 * Numbered commands to a hidden renderer page and its answers. A page that never loads, dies, or does not answer within the call's time gives `lost`
 * instead of a call that never ends. Events other than replies (`on`) are accepted only from this page.
 */
export class HiddenPage<C extends { id: number }, R> {
  readonly #d: Deps<R>;
  readonly #waiting = new Map<number, (r: R) => void>();
  readonly #listeners: [string, (e: IpcMainEvent, ...a: unknown[]) => void][] = [];
  #page: PageHandle | undefined;
  #ready: Promise<boolean> | undefined;
  #markReady: (() => void) | undefined;
  #next = 1;

  constructor(deps: Deps<R>) {
    this.#d = deps;
    this.#listen(deps.channels.ready, () => this.#markReady?.());
    this.#listen(deps.channels.reply, (_e, ...args) => {
      const parsed = v.safeParse(deps.reply, args);
      if (parsed.success) this.#waiting.get(parsed.output[0])?.(parsed.output[1]);
    });
  }

  #listen(channel: string, fn: (e: IpcMainEvent, ...a: unknown[]) => void): void {
    const guarded = (e: IpcMainEvent, ...a: unknown[]) => this.owns(e.sender) && fn(e, ...a);
    this.#listeners.push([channel, guarded]);
    this.#d.ipcMain.on(channel, guarded);
  }

  /** Another message from the page (levels, audio) that only this page may send. */
  on(channel: string, fn: (...a: unknown[]) => void): void {
    this.#listen(channel, (_e, ...a) => fn(...a));
  }

  owns(contents: WebContents): boolean {
    return !!this.#page && !this.#page.destroyed && this.#page.contents === contents;
  }

  /** Opens the page and waits for it to say it is ready. */
  open(): Promise<boolean> {
    if (this.#ready && this.#page && !this.#page.destroyed) return this.#ready;
    const page = (this.#page = this.#d.open());
    const ready = (this.#ready = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), this.#d.loadMs ?? 10_000);
      this.#markReady = () => {
        clearTimeout(timer);
        resolve(true);
      };
    }));
    void ready.then((ok) => !ok && this.#page === page && this.close());
    page.contents.once("destroyed", () => {
      if (this.#page === page) this.#page = undefined;
      for (const settle of this.#waiting.values()) settle(this.#d.lost);
    });
    return ready;
  }

  async call(cmd: Omit<C, "id">, timeoutMs: number): Promise<R> {
    if (!(await this.open()) || !this.#page || this.#page.destroyed) return this.#d.lost;
    const page = this.#page;
    const id = this.#next++;
    return new Promise<R>((resolve) => {
      const done = (r: R) => {
        clearTimeout(timer);
        this.#waiting.delete(id);
        resolve(r);
      };
      const timer = setTimeout(() => done(this.#d.lost), timeoutMs);
      this.#waiting.set(id, done);
      page.contents.send(this.#d.channels.command, { ...cmd, id });
    });
  }

  close(): void {
    this.#page?.destroy();
    this.#page = undefined;
    this.#ready = undefined;
  }

  dispose(): void {
    for (const [channel, fn] of this.#listeners) this.#d.ipcMain.off(channel, fn);
    this.close();
  }
}
