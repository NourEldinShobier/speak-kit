import { ipcMain } from "electron";
import { createDataSink } from "./data-sink";
import type { Bundle } from "./bundle";
import type { FakeRecorderOptions } from "./fake";
import type { Fence } from "./fence";
import { createRecorderHost, type RecorderHost } from "./recorder-host";
import type { WriteGuard } from "./write-guard";
import { capturePage, openRecorderWindow } from "./windows";

export interface RecorderHolderDeps {
  /** Tests only: a recorder that makes pictures up. */
  recorder?: RecorderHost | undefined;
  distDir: string;
  narration(): boolean;
  fence: Fence;
  writes: WriteGuard;
  bundle(): Bundle;
  /** The capture that is on now. */
  id(): string | undefined;
  log(line: string): void;
}

/** The recorder window, opened the first time a capture needs it, with what it streams going to the files of the capture that is on. */
export class RecorderHolder {
  readonly #d: RecorderHolderDeps;
  #host: RecorderHost | undefined;

  constructor(deps: RecorderHolderDeps) {
    this.#d = deps;
  }

  get host(): RecorderHost {
    if (this.#host) return this.#host;
    const d = this.#d;
    const page = () => openRecorderWindow(capturePage(d.distDir, "capture-recorder"), d.narration);
    const host = d.recorder ?? createRecorderHost({ ipcMain, open: page, timeoutMs: 10_000 });
    host.onData(createDataSink({ fence: d.fence, writes: d.writes, bundle: d.bundle, id: d.id, log: d.log }));
    return (this.#host = host);
  }

  /** Tests only: tells the scripted recorder what to do. */
  script(o: FakeRecorderOptions) {
    const fake = this.#d.recorder as { options?: FakeRecorderOptions } | undefined;
    if (fake?.options) Object.assign(fake.options, o);
  }

  /** Tests only: whether narration was asked for in each recording the scripted recorder started. */
  starts(): boolean[] {
    return (this.#d.recorder as { starts?: boolean[] } | undefined)?.starts ?? [];
  }

  dispose() {
    this.#host?.dispose();
  }
}
