import type { IpcMain, IpcMainEvent, WebContents } from "electron";
import * as v from "valibot";
import { REC_COMMAND, REC_DATA, REC_READY, REC_REPLY } from "../../shared/capture/channels";
import { RecorderDataSchema, RecorderReplySchema, type RecorderCommand, type RecorderData, type RecorderResult } from "../../shared/capture/contract";

/** What the host needs of its window: a page it can send commands to. */
export interface RecorderPage {
  readonly contents: WebContents;
  destroy(): void;
  readonly destroyed: boolean;
}

export interface RecorderHost {
  /** Creates the window and waits for its page. Safe to call again. */
  prepare(): Promise<boolean>;
  call(cmd: DistributiveOmit<RecorderCommand, "id">, timeoutMs?: number): Promise<RecorderResult>;
  onData(cb: (d: RecorderData) => void): void;
  close(): void;
  owns(contents: WebContents): boolean;
  dispose(): void;
}

type DistributiveOmit<T, K extends string> = T extends unknown ? Omit<T, K> : never;
const FAILED: RecorderResult = { ok: false, code: "source" };

interface Deps {
  ipcMain: IpcMain;
  open(): RecorderPage;
  /** Time to wait for the page to load and for an answer; the stop and sheet commands get more. */
  timeoutMs?: number;
}

/**
 * The screen recorder lives in a hidden renderer (getUserMedia, a canvas and a MediaRecorder); main talks to it with numbered commands. Every command
 * has a deadline, so a stuck page becomes a plain failure instead of a capture that never ends. What the page records streams back as it happens.
 */
class Host implements RecorderHost {
  readonly #d: Deps;
  readonly #waiting = new Map<number, (r: RecorderResult) => void>();
  readonly #listeners: [string, (e: IpcMainEvent, ...a: unknown[]) => void][];
  #data: ((d: RecorderData) => void) | undefined;
  #page: RecorderPage | undefined;
  #ready: Promise<boolean> | undefined;
  #markReady: (() => void) | undefined;
  #next = 1;

  constructor(deps: Deps) {
    this.#d = deps;
    this.#listeners = [
      [REC_READY, (e) => this.owns(e.sender) && this.#markReady?.()],
      [REC_REPLY, (e, ...args) => this.#onReply(e, args)],
      [REC_DATA, (e, data) => this.#onData(e, data)],
    ];
    for (const [channel, fn] of this.#listeners) deps.ipcMain.on(channel, fn);
  }

  onData(cb: (d: RecorderData) => void) {
    this.#data = cb;
  }

  #onData(e: IpcMainEvent, data: unknown) {
    const parsed = v.safeParse(RecorderDataSchema, data);
    if (this.owns(e.sender) && parsed.success) this.#data?.(parsed.output);
  }

  #onReply(e: IpcMainEvent, args: unknown[]) {
    const parsed = v.safeParse(RecorderReplySchema, args);
    if (!this.owns(e.sender) || !parsed.success) return;
    const [id, result] = parsed.output;
    this.#waiting.get(id)?.(result);
  }

  prepare(): Promise<boolean> {
    if (this.#ready && this.#page && !this.#page.destroyed) return this.#ready;
    const page = (this.#page = this.#d.open());
    const ready = (this.#ready = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), this.#d.timeoutMs ?? 10_000);
      this.#markReady = () => {
        clearTimeout(timer);
        resolve(true);
      };
    }));
    void ready.then((ok) => !ok && this.#page === page && this.close());
    page.contents.once("destroyed", () => this.#gone(page));
    return ready;
  }

  #gone(page: RecorderPage) {
    if (this.#page === page) this.#page = undefined;
    for (const settle of this.#waiting.values()) settle(FAILED);
  }

  async call(cmd: DistributiveOmit<RecorderCommand, "id">, timeoutMs = this.#d.timeoutMs ?? 10_000): Promise<RecorderResult> {
    if (!(await this.prepare()) || !this.#page || this.#page.destroyed) return FAILED;
    const page = this.#page;
    const id = this.#next++;
    return new Promise<RecorderResult>((resolve) => {
      const done = (r: RecorderResult) => {
        clearTimeout(timer);
        this.#waiting.delete(id);
        resolve(r);
      };
      const timer = setTimeout(() => done(FAILED), timeoutMs);
      this.#waiting.set(id, done);
      page.contents.send(REC_COMMAND, { ...cmd, id });
    });
  }

  close() {
    this.#page?.destroy();
    this.#page = undefined;
    this.#ready = undefined;
  }

  owns(contents: WebContents): boolean {
    return !!this.#page && !this.#page.destroyed && this.#page.contents === contents;
  }

  dispose() {
    for (const [channel, fn] of this.#listeners) this.#d.ipcMain.off(channel, fn);
    this.close();
  }
}

export const createRecorderHost = (deps: Deps): RecorderHost => new Host(deps);
