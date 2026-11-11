import type { LookRequest, ScreenLook } from "@speakkit/protocol";
import type { LookResult } from "@speakkit/server";
import { Consent } from "./consent";
import type { Ocr, OcrResult } from "./ocr";
import { readingOrder } from "./ocr-text";
import { blackness, fitJpeg, planCapture, sendSize, type Bitmap, type DisplayInfo, type Point, type Rect, type WindowInfo } from "./plan";

/** A picture the service can cut, read and shrink. The Electron one wraps a NativeImage. */
export interface Shot {
  readonly width: number;
  readonly height: number;
  crop(r: Rect): Shot;
  png(): Uint8Array;
  jpeg(width: number, height: number, quality: number): Uint8Array;
  /** The whole picture shrunk to this many pixels, as BGRA. */
  small(width: number, height: number): Bitmap;
}

/** Everything the service needs from the operating system. Where capture is not built yet, `supported` is false and nothing else is called. */
export interface ScreenPlatform {
  readonly supported: boolean;
  displays(): DisplayInfo[];
  cursor(): Point;
  /** Top-level windows, topmost first, without Speak Kit's own. */
  windows(): Promise<WindowInfo[]>;
  /** Id prefix ("window:<handle>") of the window the user is typing into. */
  foreground(): string | undefined;
  /** The display at its native resolution. */
  grab(display: DisplayInfo): Promise<Shot>;
  /** Runs `run` while Speak Kit's own windows are excluded from capture. */
  hideOwnWindows<T>(run: () => Promise<T>): Promise<T>;
}

/** The question of the first look of a conversation. Resolves false on "Not now", on closing the card, on its own timeout and when `signal` aborts. */
export interface ConsentCard {
  ask(signal: AbortSignal): Promise<boolean>;
}

/** The visible sign that Speak Kit is looking: shown for the whole look, hidden a moment after. */
export interface Indicator {
  show(): void;
  hide(): void;
}

export interface LookDeps {
  platform: ScreenPlatform;
  ocr: Ocr;
  card: ConsentCard;
  indicator: Indicator;
  consent?: Consent;
  /** The time the foreground needs to come back to the program the user was in after the card closed. */
  settleMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Code = Extract<LookResult, { ok: false }>["code"];
const fail = (code: Code): LookResult => ({ ok: false, code });

const ocrStatus = (read: OcrResult, text: string): ScreenLook["ocr"] => {
  if (!read.ok) return "unavailable";
  return text ? "ok" : "empty";
};

/** The picture and its text, or the code of why there is none. */
async function capture({ platform, ocr }: LookDeps, scope: LookRequest["scope"]): Promise<ScreenLook | Code> {
  const windows = scope === "window" ? await platform.windows() : [];
  const plan = planCapture({ scope, displays: platform.displays(), cursor: platform.cursor(), windows, foreground: platform.foreground() });
  if (!plan.ok) return plan.code;
  const full = await platform.hideOwnWindows(() => platform.grab(plan.display));
  const shot = plan.crop ? full.crop(plan.crop) : full;
  const black = blackness(shot.small(64, 36));
  const base = { scope, target: plan.target };
  if (black === "black") return { ...base, image: "", width: 0, height: 0, text: "", ocr: "empty", black };
  const reading = ocr.recognize(shot.png());
  const fitted = fitJpeg(sendSize(shot.width, shot.height), (w, h, q) => shot.jpeg(w, h, q));
  const read = await reading;
  if (!fitted) return "capture-failed";
  const text = read.ok ? readingOrder(read.lines) : "";
  return { ...base, image: Buffer.from(fitted.jpeg).toString("base64"), width: fitted.width, height: fitted.height, text, ocr: ocrStatus(read, text), ...(black ? { black } : {}) };
}

/**
 * One look at the screen for the voice chat: consent once per conversation, a capture of the window or screen at its native resolution,
 * the text read from that full-size picture, and a JPEG small enough for the model's data channel. Nothing is written to disk.
 */
export function createLook(deps: LookDeps) {
  const { platform, card, indicator, consent = new Consent(), settleMs = 300 } = deps;
  let busy = false;

  return {
    async look({ session, scope }: LookRequest, signal: AbortSignal): Promise<LookResult> {
      if (!platform.supported) return fail("unsupported");
      if (busy) return fail("busy");
      busy = true;
      try {
        if (!consent.has(session)) {
          if (!(await card.ask(signal))) return fail(signal.aborted ? "capture-failed" : "declined");
          consent.grant(session);
          await sleep(settleMs);
        }
        if (signal.aborted) return fail("capture-failed");
        indicator.show();
        try {
          const r = await capture(deps, scope);
          return typeof r === "string" ? fail(r) : { ok: true, look: r };
        } finally {
          indicator.hide();
        }
      } catch {
        return fail("capture-failed");
      } finally {
        busy = false;
      }
    },
  };
}
