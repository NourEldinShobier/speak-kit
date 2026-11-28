import { diffPressed } from "./divert";
import {
  DEVICE_INDEXES,
  decodeFrame,
  divertParams,
  encodeRequest,
  FEATURE_ROOT,
  isButtonEvent,
  isErrorFor,
  isReplyTo,
  parseControl,
  parseReporting,
  pressedCids,
  REPROG_CONTROLS_V4,
  type Control,
} from "./hidpp";

/** One HID collection that speaks HID++: what node-hid gives, reduced to what the protocol needs. */
export interface Transport {
  /** Sends one frame; throws when the device is gone. */
  write(bytes: number[]): void;
  onData(cb: (bytes: ArrayLike<number>) => void): void;
  onError(cb: (e: Error) => void): void;
  close(): void;
}

/** A device whose buttons can be diverted to this program. */
export interface ReprogDevice {
  readonly controls: readonly Control[];
  /** Reporting flags of one button; rejects when the device does not answer. */
  flagsOf(cid: number): Promise<number>;
  setDivert(cid: number, on: boolean): Promise<void>;
  /** Asks for the divert to end without waiting for the answer, for the moment the app quits. */
  releaseNow(cids: readonly number[]): void;
  onPress(cb: (cid: number, down: boolean) => void): void;
  onLost(cb: () => void): void;
  close(): void;
}

const noop = (): void => undefined;

type Pending = { feature: number; fn: number; resolve(params: number[]): void; reject(e: Error): void };

class Session implements ReprogDevice {
  controls: Control[] = [];
  readonly #t: Transport;
  readonly #timeoutMs: number;
  #index: number = DEVICE_INDEXES[0];
  #feature = FEATURE_ROOT;
  #pending: Pending | undefined;
  #chain: Promise<unknown> = Promise.resolve();
  #held: ReadonlySet<number> = new Set();
  #press: (cid: number, down: boolean) => void = () => undefined;
  #lost: () => void = () => undefined;

  constructor(t: Transport, timeoutMs: number) {
    this.#t = t;
    this.#timeoutMs = timeoutMs;
    t.onData((bytes) => this.#frame(bytes));
    t.onError(() => this.#lost());
  }

  onPress(cb: (cid: number, down: boolean) => void): void {
    this.#press = cb;
  }
  onLost(cb: () => void): void {
    this.#lost = cb;
  }
  close(): void {
    this.#t.close();
  }

  flagsOf(cid: number): Promise<number> {
    return this.#request(this.#feature, 2, [cid >> 8, cid & 0xff]).then(parseReporting);
  }
  async setDivert(cid: number, on: boolean): Promise<void> {
    await this.#request(this.#feature, 3, divertParams(cid, on));
    // A diverted button starts from up: a release lost before a reset must not hide the next press.
    this.#held = new Set([...this.#held].filter((c) => c !== cid));
  }
  releaseNow(cids: readonly number[]): void {
    for (const cid of cids) this.#send(this.#feature, 3, divertParams(cid, false));
  }

  /** Finds the device index, the feature and the buttons; false when this collection is not a device with divertable buttons. */
  async handshake(): Promise<boolean> {
    if (!(await this.#findIndex())) return false;
    this.#feature = (await this.#request(FEATURE_ROOT, 0, [REPROG_CONTROLS_V4 >> 8, REPROG_CONTROLS_V4 & 0xff]))[0]!;
    if (this.#feature === 0) return false;
    const count = (await this.#request(this.#feature, 0))[0]!;
    for (let i = 0; i < count; i++) this.controls.push(parseControl(await this.#request(this.#feature, 1, [i])));
    return true;
  }

  async #findIndex(): Promise<boolean> {
    for (const index of DEVICE_INDEXES) {
      this.#index = index;
      try {
        await this.#request(FEATURE_ROOT, 1, [0, 0, 0xaa]);
        return true;
      } catch {
        // no device at this index
      }
    }
    return false;
  }

  #send(feature: number, fn: number, params: number[]): void {
    try {
      this.#t.write(encodeRequest({ index: this.#index, feature, fn, params }));
    } catch (e) {
      this.#lost();
      throw e;
    }
  }

  /** One request at a time, so an answer always belongs to the request that is waiting. */
  #request(feature: number, fn: number, params: number[] = []): Promise<number[]> {
    const run = () =>
      new Promise<number[]>((resolve, reject) => {
        const timer = setTimeout(() => ((this.#pending = undefined), reject(new Error("no answer"))), this.#timeoutMs);
        const done =
          <T>(f: (x: T) => void) =>
          (x: T) => (clearTimeout(timer), (this.#pending = undefined), f(x));
        this.#pending = { feature, fn, resolve: done(resolve), reject: done(reject) };
        try {
          this.#send(feature, fn, params);
        } catch (e) {
          this.#pending.reject(e as Error);
        }
      });
    const next = this.#chain.then(run, run);
    this.#chain = next.then(noop, noop);
    return next;
  }

  #frame(bytes: ArrayLike<number>): void {
    const f = decodeFrame(bytes);
    if (!f) return;
    const p = this.#pending;
    if (p && isReplyTo(f, p.feature, p.fn)) return p.resolve(f.params);
    if (p && isErrorFor(f, p.feature)) return p.reject(new Error(`HID++ error ${f.code}`));
    if (!isButtonEvent(f, this.#feature)) return;
    const now = pressedCids(f.params);
    const { down, up } = diffPressed(this.#held, now);
    this.#held = now;
    for (const cid of up) this.#press(cid, false);
    for (const cid of down) this.#press(cid, true);
  }
}

/** Talks to a transport until it is known whether it is a device with divertable buttons; closes it when it is not. */
export async function connectDevice(t: Transport, timeoutMs = 1500): Promise<ReprogDevice | null> {
  const s = new Session(t, timeoutMs);
  const ok = await s.handshake().catch(() => false);
  if (!ok) t.close();
  return ok ? s : null;
}
