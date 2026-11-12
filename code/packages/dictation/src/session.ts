import { MAX_TAKE_MS, PREROLL_MS, prerollMs, TAIL_MIN_MS } from "./capture/policy";
import type { Settings } from "./settings";

/** Release before this is a short tap: nothing is kept. */
export const HOLD_MS = 300;
/** A second tap this soon after a short tap locks the recording. */
export const DOUBLE_TAP_MS = 300;
export { PREROLL_MS };
/** Recording continues at least this long after the key is released. */
export const TAIL_MS = TAIL_MIN_MS;
/** A recording ends by itself at this length: a lost key release or a forgotten toggle must not buffer audio and hold the microphone for hours. */
export const MAX_RECORDING_MS = MAX_TAKE_MS;

type Config = Pick<Settings, "hotkey" | "cancelKey" | "mode" | "duck" | "keepReady">;

export type Capture =
  | { kind: "idle" }
  /** A short tap was discarded; a press before `until` locks. */
  | { kind: "armed"; until: number }
  /** The key is down. A release before `lockUntil` locks; it is -Infinity unless this press follows a short tap. */
  | { kind: "hold"; id: number; key: string; pressedAt: number; lockUntil: number }
  /** A chord discarded the recording; `key` is still down and its release means nothing. */
  | { kind: "ignoring"; key: string }
  | { kind: "toggle"; id: number; down: boolean }
  | { kind: "locked"; id: number };

/** `seq` numbers the recordings, so a late recorder answer can tell whether it is still current. */
export interface Session {
  capture: Capture;
  seq: number;
}

export const initialSession: Session = { capture: { kind: "idle" }, seq: 0 };

export type SessionEvent =
  | { type: "key"; key: string; down: boolean; at: number }
  | { type: "start"; at: number }
  | { type: "stop" }
  | { type: "cancel" }
  /** The recorder could not start recording `id`. */
  | { type: "failed"; id: number }
  /** Recording `id` reached `MAX_RECORDING_MS`. */
  | { type: "limit"; id: number };

export type Effect = { type: "start-recording"; id: number; prerollMs: number } | { type: "finish-recording"; id: number } | { type: "discard-recording"; id: number; cancelled: boolean };

export interface Step {
  session: Session;
  effects: Effect[];
  /** The event was dictation's own (the hotkey or the cancel key), so the key should not reach the focused app. */
  consumed: boolean;
}

type KeyEvent = Extract<SessionEvent, { type: "key" }>;
type Out = Pick<Step, "session" | "effects">;
const same = (session: Session): Out => ({ session, effects: [] });
const to = (session: Session, capture: Capture, ...effects: Effect[]): Out => ({ session: { ...session, capture }, effects });
const idle: Capture = { kind: "idle" };

function begin(session: Session, cfg: Config, at: number): Out {
  const id = session.seq + 1;
  const lockUntil = session.capture.kind === "armed" ? session.capture.until : -Infinity;
  const capture: Capture = cfg.mode === "toggle" ? { kind: "toggle", id, down: true } : { kind: "hold", id, key: cfg.hotkey, pressedAt: at, lockUntil };
  return { session: { capture, seq: id }, effects: [{ type: "start-recording", id, prerollMs: prerollMs({ keepReady: cfg.keepReady, ducking: cfg.duck }) }] };
}

function release(session: Session, c: Extract<Capture, { kind: "hold" }>, at: number): Out {
  if (at - c.pressedAt >= HOLD_MS) return to(session, idle, { type: "finish-recording", id: c.id });
  if (at <= c.lockUntil) return to(session, { kind: "locked", id: c.id });
  return to(session, { kind: "armed", until: at + DOUBLE_TAP_MS }, { type: "discard-recording", id: c.id, cancelled: false });
}

function hotkey(session: Session, cfg: Config, event: KeyEvent): Out {
  const c = session.capture;
  if (event.down) {
    // The key is still down after this press; its repeats and its release must not start another recording.
    if (c.kind === "locked" || (c.kind === "toggle" && !c.down)) return to(session, { kind: "ignoring", key: cfg.hotkey }, { type: "finish-recording", id: c.id });
    return c.kind === "idle" || c.kind === "armed" ? begin(session, cfg, event.at) : same(session);
  }
  if (c.kind === "toggle") return to(session, { ...c, down: false });
  if (c.kind === "ignoring") return to(session, idle);
  return c.kind === "hold" ? release(session, c, event.at) : same(session);
}

// Another key: a chord during a short hold discards, a long hold ignores it, Escape cancels only a toggled recording.
function otherKey(session: Session, cfg: Config, event: KeyEvent): Step {
  const c = session.capture;
  if (c.kind === "toggle" && event.key === cfg.cancelKey) return { ...to(session, idle, { type: "discard-recording", id: c.id, cancelled: true }), consumed: true };
  if (c.kind === "armed") return { ...to(session, idle), consumed: false };
  if (c.kind === "hold" && event.at - c.pressedAt < HOLD_MS) return { ...to(session, { kind: "ignoring", key: c.key }, { type: "discard-recording", id: c.id, cancelled: false }), consumed: false };
  return { ...same(session), consumed: false };
}

function control(session: Session, cfg: Config, event: Extract<SessionEvent, { type: "start" | "stop" | "cancel" }>): Out {
  const c = session.capture;
  if (event.type === "start") return c.kind === "idle" || c.kind === "armed" ? begin(session, { ...cfg, mode: "toggle" }, event.at) : same(session);
  if (c.kind !== "hold" && c.kind !== "toggle" && c.kind !== "locked") return same(session);
  if (event.type === "stop") return to(session, idle, { type: "finish-recording", id: c.id });
  return event.type === "cancel" ? to(session, idle, { type: "discard-recording", id: c.id, cancelled: true }) : same(session);
}

function key(session: Session, cfg: Config, event: KeyEvent): Step {
  const c = session.capture;
  // A hold ends with the key that started it, even if the setting changed meanwhile.
  const owner = c.kind === "hold" || c.kind === "ignoring" ? c.key : cfg.hotkey;
  if (event.key === owner) return { ...hotkey(session, cfg, event), consumed: true };
  if (!event.down) return { ...same(session), consumed: false };
  return otherKey(session, cfg, event);
}

/** The capture state machine. Pure: time arrives with each event. */
export function reduce(session: Session, event: SessionEvent, cfg: Config): Step {
  if (event.type === "key") return key(session, cfg, event);
  if (event.type === "limit") {
    const c = session.capture;
    return { ...("id" in c && c.id === event.id ? to(session, idle, { type: "finish-recording", id: c.id }) : same(session)), consumed: false };
  }
  if (event.type === "failed") {
    const c = session.capture;
    return { ...("id" in c && c.id === event.id ? to(session, idle) : same(session)), consumed: false };
  }
  return { ...control(session, cfg, event), consumed: false };
}
