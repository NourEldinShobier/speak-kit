import { CLONE_MAX_MS, CLONE_MIN_MS, type ClonedVoice, type CloneCheck, type Health } from "@speakkit/protocol";
import type { Take } from "./audio";

export type Source = "upload" | "record";
/** Why the microphone cannot be used: the OS or the person said no, or no microphone was found. */
export type MicProblem = "denied" | "missing";

/** The screens of the flow (G3 to G7, G15, G6). The microphone problem (K6) is a dialog over the first screen. */
export type CloneState =
  | { step: "choose"; consent: boolean; source: Source | null; busy: boolean; error: string | null; mic: MicProblem | null }
  | { step: "recording"; elapsedMs: number; level: number }
  | { step: "review"; take: Take }
  /** `voice` is set once the server accepted the clip; the screen then waits for Chatterbox to load so "Play test" starts at once. */
  | { step: "analyzing"; take: Take; phase: "checking" | "loading"; voice: ClonedVoice | null }
  | { step: "rejected"; message: string; checks: CloneCheck[] }
  | { step: "naming"; voice: ClonedVoice; name: string; exaggeration: number; saving: boolean; error: string | null }
  | { step: "done"; name: string };

export type CloneAction =
  | { type: "consent"; on: boolean }
  | { type: "source"; source: Source }
  | { type: "pick-start" }
  | { type: "pick-failed"; message: string }
  | { type: "picked"; take: Take }
  | { type: "record-start" }
  | { type: "record-tick"; elapsedMs: number; level: number }
  | { type: "record-done"; take: Take }
  | { type: "record-failed"; problem: MicProblem | null; message: string }
  | { type: "use-take" }
  | { type: "clone-rejected"; message: string; checks: CloneCheck[] }
  | { type: "clone-failed"; message: string }
  | { type: "cloned"; voice: ClonedVoice }
  | { type: "engine-ready" }
  | { type: "rename"; name: string }
  | { type: "style"; exaggeration: number }
  | { type: "save-start" }
  | { type: "save-failed"; message: string }
  | { type: "saved" }
  | { type: "back" }
  | { type: "dismiss-mic" };

export const NEUTRAL = 0.5;

type Step<S extends CloneState["step"]> = Extract<CloneState, { step: S }>;

export const initClone = (): CloneState => ({ step: "choose", consent: false, source: null, busy: false, error: null, mic: null });
/** The screen after a failure or a step back: the consent given on the first screen still stands. */
const choose = (over: Partial<Omit<Step<"choose">, "step">> = {}): CloneState => ({ ...(initClone() as Step<"choose">), consent: true, ...over });

/** Length of a take against the limits the server enforces, for the review screen (the server's own checks run after "Use this take"). */
export function lengthCheck(durationMs: number): CloneCheck {
  const sec = (ms: number) => `${Math.round(ms / 1000)} s`;
  const ok = durationMs >= CLONE_MIN_MS && durationMs <= CLONE_MAX_MS;
  return { id: "length", ok, message: ok ? `${sec(durationMs)}, between ${sec(CLONE_MIN_MS)} and ${sec(CLONE_MAX_MS)}.` : `${sec(durationMs)}. Use a clip of ${sec(CLONE_MIN_MS)} to ${sec(CLONE_MAX_MS)}.` };
}

/** The text sentence spoken by "Play test". */
export const testSentence = (name: string): string => `Hello, I am ${name.trim() || "your new voice"}. This is how I sound when reading to you.`;

function onChoose(s: Step<"choose">, a: CloneAction): CloneState {
  switch (a.type) {
    case "consent":
      return { ...s, consent: a.on };
    case "source":
      return { ...s, source: a.source };
    case "pick-start":
      return { ...s, busy: true, error: null };
    case "pick-failed":
      return { ...s, busy: false, error: a.message };
    case "record-start":
      return { step: "recording", elapsedMs: 0, level: 0 };
    case "dismiss-mic":
      return { ...s, mic: null };
    case "picked":
      return { step: "analyzing", take: a.take, phase: "checking", voice: null };
    case "record-failed":
      return { ...s, busy: false, error: a.problem ? null : a.message, mic: a.problem };
    default:
      return s;
  }
}

function onRecording(s: Step<"recording">, a: CloneAction): CloneState {
  switch (a.type) {
    case "record-tick":
      return { ...s, elapsedMs: a.elapsedMs, level: a.level };
    case "record-done":
      return { step: "review", take: a.take };
    case "record-failed":
      return choose({ source: "record", error: a.problem ? null : a.message, mic: a.problem });
    case "back":
      return choose({ source: "record" });
    default:
      return s;
  }
}

function onTake(s: Step<"review"> | Step<"rejected">, a: CloneAction): CloneState {
  switch (a.type) {
    case "use-take":
      return s.step === "review" ? { step: "analyzing", take: s.take, phase: "checking", voice: null } : s;
    case "record-start":
      return { step: "recording", elapsedMs: 0, level: 0 };
    case "pick-start":
      return s.step === "rejected" ? choose({ source: "upload", busy: true }) : s;
    case "picked":
      return { step: "analyzing", take: a.take, phase: "checking", voice: null };
    case "back":
      return choose({ source: s.step === "review" ? "record" : null });
    default:
      return s;
  }
}

function onAnalyzing(s: Step<"analyzing">, a: CloneAction): CloneState {
  switch (a.type) {
    case "cloned":
      return { ...s, phase: "loading", voice: a.voice };
    case "engine-ready":
      return s.voice ? { step: "naming", voice: s.voice, name: "", exaggeration: s.voice.exaggeration ?? NEUTRAL, saving: false, error: null } : s;
    case "clone-rejected":
      return { step: "rejected", message: a.message, checks: a.checks };
    case "clone-failed":
      return choose({ error: a.message });
    case "back":
      return choose();
    default:
      return s;
  }
}

function onNaming(s: Step<"naming">, a: CloneAction): CloneState {
  switch (a.type) {
    case "rename":
      return { ...s, name: a.name };
    case "style":
      return { ...s, exaggeration: a.exaggeration };
    case "save-start":
      return { ...s, saving: true, error: null };
    case "save-failed":
      return { ...s, saving: false, error: a.message };
    case "saved":
      return { step: "done", name: s.name.trim() };
    case "back":
      return choose();
    default:
      return s;
  }
}

/** The whole flow as one pure function. An action that does not fit the current screen is ignored. */
export function cloneReducer(s: CloneState, a: CloneAction): CloneState {
  switch (s.step) {
    case "choose":
      return onChoose(s, a);
    case "recording":
      return onRecording(s, a);
    case "review":
    case "rejected":
      return onTake(s, a);
    case "analyzing":
      return onAnalyzing(s, a);
    case "naming":
      return onNaming(s, a);
    case "done":
      return s;
    default: {
      const unreachable: never = s;
      return unreachable;
    }
  }
}

/** What the health answer says about Chatterbox while the flow waits for it to load. */
export type EngineWait = { kind: "waiting"; progress: number | null } | { kind: "ready" } | { kind: "failed"; message: string };

export function engineWait(h: Health | null): EngineWait {
  const e = h?.engine;
  if (!e || e.id !== "chatterbox") return { kind: "waiting", progress: null };
  if (e.state === "ready") return { kind: "ready" };
  if (e.state === "error" || e.state === "unavailable" || e.state === "missing") return { kind: "failed", message: e.detail ?? "Chatterbox could not start." };
  return { kind: "waiting", progress: e.progress ?? null };
}
