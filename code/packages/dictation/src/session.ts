import { MAX_TAKE_MS, prerollMs } from "./capture/policy";
import type { Settings } from "./settings";

/** Release before this is a short tap: nothing is kept. */
export const HOLD_MS = 300;
/** A second tap this soon after a short tap locks the recording. */
export const DOUBLE_TAP_MS = 300;
/** A recording ends by itself at this length: a lost key release or a forgotten toggle must not buffer audio and hold the microphone for hours. */
export const MAX_RECORDING_MS = MAX_TAKE_MS;

type Config = Pick<Settings, "hotkey" | "cancelKey" | "mode" | "duck"> & Partial<Pick<Settings, "holdMs" | "secondKey" | "mouseKey" | "rawKey" | "keepReady">>;
/** A press of one of the shortcuts: which, and when. */
type Press = { key: string; raw: boolean; at: number };

export type Capture =
  | { kind: "idle" }
  /** A short tap was discarded; a press of the same shortcut before `until` locks. */
  | { kind: "armed"; until: number; key: string }
  /** The key is down. A release before `lockUntil` locks; it is -Infinity unless this press follows a short tap. `raw` is the shortcut that skips processing; `mode` is the one in force when it began. */
  | { kind: "hold"; id: number; key: string; raw?: boolean; pressedAt: number; lockUntil: number; mode: Settings["mode"] }
  /** A chord discarded the recording; `key` is still down and its release means nothing. */
  | { kind: "ignoring"; key: string }
  | { kind: "toggle"; id: number; down: boolean; key: string; raw?: boolean }
  | { kind: "locked"; id: number; key: string; raw?: boolean };

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

export type Effect = { type: "start-recording"; id: number; prerollMs: number } | { type: "finish-recording"; id: number; raw?: true } | { type: "discard-recording"; id: number; cancelled: boolean };

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

const holdMs = (cfg: Config) => cfg.holdMs ?? HOLD_MS;
const finish = (c: { id: number; raw?: boolean }): Effect => ({ type: "finish-recording", id: c.id, ...(c.raw && { raw: true as const }) });

function begin(session: Session, cfg: Config, press: Press): Out {
  const id = session.seq + 1;
  const armed = session.capture.kind === "armed" && session.capture.key === press.key ? session.capture.until : -Infinity;
  const raw = press.raw ? { raw: true } : {};
  const capture: Capture =
    cfg.mode === "toggle" ? { kind: "toggle", id, down: true, key: press.key, ...raw } : { kind: "hold", id, key: press.key, pressedAt: press.at, lockUntil: armed, mode: cfg.mode, ...raw };
  return { session: { capture, seq: id }, effects: [{ type: "start-recording", id, prerollMs: prerollMs({ keepReady: cfg.keepReady === true, ducking: cfg.duck }) }] };
}

/** A recording started by a command, not by a key: no key is down, so the next press of the shortcut ends it. */
function started(session: Session, cfg: Config, at: number): Out {
  const out = begin(session, { ...cfg, mode: "toggle" }, { key: cfg.hotkey, raw: false, at });
  const c = out.session.capture;
  return c.kind === "toggle" ? { ...out, session: { ...out.session, capture: { ...c, down: false } } } : out;
}

function release(session: Session, cfg: Config, at: number): Out {
  const c = session.capture;
  if (c.kind !== "hold") return same(session);
  // The mode in force when the press began decides, so a setting changed mid-hold cannot strand the recording.
  const long = at - c.pressedAt >= holdMs(cfg);
  if (long && c.mode !== "double-tap") return to(session, idle, finish(c));
  if (c.mode === "tap-or-hold") return to(session, { kind: "toggle", id: c.id, down: false, key: c.key, ...(c.raw && { raw: true }) });
  if (c.mode !== "hold" && c.mode !== "double-tap") return to(session, idle, { type: "discard-recording", id: c.id, cancelled: false });
  if (!long && at <= c.lockUntil) return to(session, { kind: "locked", id: c.id, key: c.key, ...(c.raw && { raw: true }) });
  return to(session, { kind: "armed", until: at + DOUBLE_TAP_MS, key: c.key }, { type: "discard-recording", id: c.id, cancelled: false });
}

function hotkey(session: Session, cfg: Config, press: Press & { down: boolean }): Out {
  const c = session.capture;
  if (press.down) {
    // The key is still down after this press; its repeats and its release must not start another recording.
    if (c.kind === "locked" || (c.kind === "toggle" && !c.down)) return to(session, { kind: "ignoring", key: c.key }, finish(c));
    return c.kind === "idle" || c.kind === "armed" ? begin(session, cfg, press) : same(session);
  }
  if (c.kind === "toggle") return to(session, { ...c, down: false });
  if (c.kind === "ignoring") return to(session, idle);
  return release(session, cfg, press.at);
}

// Another key: a chord during a short hold discards, a long hold ignores it, Escape cancels only a toggled recording.
function otherKey(session: Session, cfg: Config, event: KeyEvent): Step {
  const c = session.capture;
  // Escape cancels only a recording this app owns: a toggled one. Held or locked ones leave it to the app in front.
  if (c.kind === "toggle" && event.key === cfg.cancelKey) return { ...to(session, idle, { type: "discard-recording", id: c.id, cancelled: true }), consumed: true };
  if (c.kind === "armed") return { ...to(session, idle), consumed: false };
  if (c.kind === "hold" && event.at - c.pressedAt < holdMs(cfg))
    return { ...to(session, { kind: "ignoring", key: c.key }, { type: "discard-recording", id: c.id, cancelled: false }), consumed: false };
  return { ...same(session), consumed: false };
}

function control(session: Session, cfg: Config, event: Extract<SessionEvent, { type: "start" | "stop" | "cancel" }>): Out {
  const c = session.capture;
  if (event.type === "start") return c.kind === "idle" || c.kind === "armed" ? started(session, cfg, event.at) : same(session);
  if (c.kind !== "hold" && c.kind !== "toggle" && c.kind !== "locked") return same(session);
  if (event.type === "stop") return to(session, idle, finish(c));
  return event.type === "cancel" ? to(session, idle, { type: "discard-recording", id: c.id, cancelled: true }) : same(session);
}

/** Which shortcut an event is: a capture ends with the shortcut that started it (even if the settings changed meanwhile), else any configured one. */
function shortcutOf(c: Capture, cfg: Config, key: string): { key: string; raw: boolean } | undefined {
  if (c.kind !== "armed" && "key" in c) return key === c.key ? { key, raw: "raw" in c && c.raw === true } : undefined;
  return key && [cfg.hotkey, cfg.secondKey, cfg.mouseKey, cfg.rawKey].includes(key) ? { key, raw: key === cfg.rawKey } : undefined;
}

function key(session: Session, cfg: Config, event: KeyEvent): Step {
  const which = shortcutOf(session.capture, cfg, event.key);
  if (which) return { ...hotkey(session, cfg, { ...which, at: event.at, down: event.down }), consumed: true };
  if (!event.down) return { ...same(session), consumed: false };
  return otherKey(session, cfg, event);
}

/** The capture state machine. Pure: time arrives with each event. */
export function reduce(session: Session, event: SessionEvent, cfg: Config): Step {
  if (event.type === "key") return key(session, cfg, event);
  if (event.type === "limit") {
    const c = session.capture;
    return { ...("id" in c && c.id === event.id ? to(session, idle, finish(c as { id: number; raw?: boolean })) : same(session)), consumed: false };
  }
  if (event.type === "failed") {
    const c = session.capture;
    return { ...("id" in c && c.id === event.id ? to(session, idle) : same(session)), consumed: false };
  }
  return { ...control(session, cfg, event), consumed: false };
}
