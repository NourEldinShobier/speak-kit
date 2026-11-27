import type { ButtonLearn } from "../../../shared/dictation/contract";
import { logiHotkey, logiLabel } from "../../../shared/dictation/keys";
import { connectDevice, type ReprogDevice, type Transport } from "./device";
import { learnable, learnDiverts, planDiverts } from "./divert";
import { openTransports } from "./node-hid";

/** Mouse buttons as extra shortcut keys: the caller names the buttons it wants and hears their presses and releases. */
export interface ButtonSource {
  /** Divert exactly these buttons (control ids) to this program and release every other one this program diverted. Takes effect on a later turn. */
  assign(cids: readonly number[]): void;
  onButton(cb: (cid: number, down: boolean) => void): void;
  /** Waits for the next press on any button and returns it; ends with `unavailable` when no mouse answers. */
  learn(): Promise<ButtonLearn>;
  cancelLearn(): void;
  /** Releases everything this program diverted. Does not wait for the answers, so it is safe while the app quits. */
  dispose(): void;
}

interface Deps {
  /** Finds and opens the devices. */
  open(): Promise<Transport[]>;
  /** How often the diverts are checked: a mouse that reset or reconnected loses them. */
  checkMs: number;
  learnMs: number;
}

interface Held {
  dev: ReprogDevice;
  /** Buttons diverted for a shortcut. */
  owned: Set<number>;
  /** Buttons diverted for the length of a learn. */
  temp: Set<number>;
}

const noop = (): void => undefined;
/** A divert the mouse refused stays until its next reset; nothing else depends on it. */
async function tolerate(job: () => Promise<unknown>): Promise<void> {
  try {
    await job();
  } catch {
    // not fatal
  }
}

const UNAVAILABLE: ButtonLearn = { ok: false, reason: "unavailable" };

class Buttons implements ButtonSource {
  readonly #d: Deps;
  #held: Held[] = [];
  #wanted: ReadonlySet<number> = new Set();
  #press: (cid: number, down: boolean) => void = () => undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #queue: Promise<unknown> = Promise.resolve();
  #learning: ((r: ButtonLearn) => void) | undefined;
  #disposed = false;

  constructor(d: Deps) {
    this.#d = d;
  }

  onButton(cb: (cid: number, down: boolean) => void): void {
    this.#press = cb;
  }

  assign(cids: readonly number[]): void {
    this.#wanted = new Set(cids);
    if (cids.length > 0 && !this.#timer && !this.#disposed) {
      this.#timer = setInterval(() => void this.#enqueue(() => this.#sync()), this.#d.checkMs);
      this.#timer.unref?.();
    }
    void this.#enqueue(() => this.#sync());
  }

  learn(): Promise<ButtonLearn> {
    this.cancelLearn();
    return this.#enqueue(() => this.#learn());
  }

  cancelLearn(): void {
    this.#learning?.({ ok: false, reason: "cancelled" });
  }

  dispose(): void {
    this.#disposed = true;
    this.cancelLearn();
    clearInterval(this.#timer);
    this.#timer = undefined;
    for (const h of this.#held.splice(0)) {
      h.dev.releaseNow([...h.owned, ...h.temp]);
      h.dev.close();
    }
  }

  #enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(job, job);
    this.#queue = next.then(noop, noop);
    return next;
  }

  async #connect(): Promise<void> {
    for (const t of await this.#d.open()) {
      const dev = await connectDevice(t);
      if (!dev) continue;
      if (this.#disposed) {
        dev.close();
        continue;
      }
      const held: Held = { dev, owned: new Set(), temp: new Set() };
      dev.onPress((cid, down) => this.#onPress(cid, down));
      dev.onLost(() => this.#drop(held));
      this.#held.push(held);
    }
  }

  #drop(h: Held): void {
    this.#held = this.#held.filter((x) => x !== h);
    h.dev.close();
  }

  #onPress(cid: number, down: boolean): void {
    if (this.#learning) {
      if (down && this.#held.some((h) => learnable(h.dev.controls).has(cid))) this.#learning({ ok: true, id: logiHotkey(cid), label: logiLabel(cid) });
    } else if (this.#wanted.has(cid)) this.#press(cid, down);
  }

  /** Connects when something is wanted and nothing is connected, then brings each device in line with the wanted buttons. */
  async #sync(): Promise<void> {
    if (this.#disposed) return;
    if (this.#wanted.size > 0 && this.#held.length === 0) await this.#connect();
    for (const h of this.#held) await this.#reconcile(h).catch(() => this.#drop(h));
    if (this.#wanted.size === 0) {
      clearInterval(this.#timer);
      this.#timer = undefined;
      for (const h of this.#held) this.#drop(h);
    }
  }

  async #flags(h: Held, cids: Iterable<number>): Promise<Map<number, number>> {
    const known = new Set(h.dev.controls.map((c) => c.cid));
    const flags = new Map<number, number>();
    for (const cid of cids) if (known.has(cid)) flags.set(cid, await h.dev.flagsOf(cid));
    return flags;
  }

  async #reconcile(h: Held): Promise<void> {
    const flags = await this.#flags(h, new Set([...this.#wanted, ...h.owned]));
    const plan = planDiverts({ controls: h.dev.controls, wanted: this.#wanted, owned: h.owned, flags });
    for (const cid of plan.divert) {
      await h.dev.setDivert(cid, true);
      h.owned.add(cid);
    }
    for (const cid of plan.undivert) {
      await h.dev.setDivert(cid, false);
      h.owned.delete(cid);
    }
  }

  async #learn(): Promise<ButtonLearn> {
    if (this.#disposed) return UNAVAILABLE;
    if (this.#held.length === 0) await this.#connect();
    if (this.#held.length === 0) return UNAVAILABLE;
    try {
      for (const h of this.#held) await this.#divertAll(h);
      return await this.#firstPress();
    } catch {
      return UNAVAILABLE;
    } finally {
      await this.#restore();
    }
  }

  async #divertAll(h: Held): Promise<void> {
    const flags = await this.#flags(
      h,
      h.dev.controls.map((c) => c.cid),
    );
    for (const cid of learnDiverts(h.dev.controls, flags)) {
      h.temp.add(cid);
      await h.dev.setDivert(cid, true);
    }
  }

  #firstPress(): Promise<ButtonLearn> {
    return new Promise((resolve) => {
      const finish = (r: ButtonLearn) => (clearTimeout(timer), (this.#learning = undefined), resolve(r));
      const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), this.#d.learnMs);
      this.#learning = finish;
    });
  }

  /** Ends the learn's diverts, then puts the devices back in line with the wanted buttons. */
  async #restore(): Promise<void> {
    for (const h of this.#held) {
      for (const cid of h.temp) await tolerate(() => h.dev.setDivert(cid, false));
      h.temp.clear();
    }
    await tolerate(() => this.#sync());
  }
}

export interface ButtonOptions {
  open?: () => Promise<Transport[]>;
  checkMs?: number;
  learnMs?: number;
  platform?: string;
}

const NONE: ButtonSource = { assign: () => undefined, onButton: () => undefined, learn: async () => UNAVAILABLE, cancelLearn: () => undefined, dispose: () => undefined };

/** Windows only: the HID++ code is verified there. Elsewhere there are no mouse buttons to offer, and nothing is loaded. */
export function createButtons({ open = openTransports, checkMs = 10_000, learnMs = 15_000, platform = process.platform }: ButtonOptions = {}): ButtonSource {
  return platform === "win32" ? new Buttons({ open, checkMs, learnMs }) : NONE;
}
