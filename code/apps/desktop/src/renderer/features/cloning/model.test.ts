import { describe, expect, it } from "vite-plus/test";
import type { ClonedVoice, Health } from "@speakkit/protocol";
import type { Take } from "./audio";
import { cloneReducer, engineWait, initClone, lengthCheck, testSentence, type CloneAction, type CloneState } from "./model";

const take: Take = { wav: new Uint8Array(44), durationMs: 14000, label: "maya.mp3" };
const voice: ClonedVoice = { id: "cb_0a1b2c3d", name: "maya.mp3", durationMs: 14000, createdAt: 1, checks: [] };
const run = (s: CloneState, ...actions: CloneAction[]) => actions.reduce(cloneReducer, s);
const ready = (): CloneState => run(initClone(), { type: "consent", on: true }, { type: "source", source: "upload" });

describe("choose a reference", () => {
  it("starts without consent, source or error", () => {
    expect(initClone()).toEqual({ step: "choose", consent: false, source: null, busy: false, error: null, mic: null });
  });

  it("keeps the consent and the source while a file is read, and shows a failure to read it", () => {
    const s = run(ready(), { type: "pick-start" }, { type: "pick-failed", message: "x.mp3 could not be read: bad data" });
    expect(s).toEqual({ step: "choose", consent: true, source: "upload", busy: false, error: "x.mp3 could not be read: bad data", mic: null });
  });

  it("goes to analyzing when a picked file is decoded", () => {
    expect(run(ready(), { type: "pick-start" }, { type: "picked", take })).toEqual({ step: "analyzing", take, phase: "checking", voice: null });
  });
});

describe("recording", () => {
  const recording = run(ready(), { type: "source", source: "record" }, { type: "record-start" });

  it("follows the timer and the level, then shows the take for review", () => {
    expect(recording).toEqual({ step: "recording", elapsedMs: 0, level: 0 });
    const s = run(recording, { type: "record-tick", elapsedMs: 8000, level: 0.4 });
    expect(s).toEqual({ step: "recording", elapsedMs: 8000, level: 0.4 });
    expect(run(s, { type: "record-done", take })).toEqual({ step: "review", take });
  });

  it("records again from the review screen and goes on with the take", () => {
    const review = run(recording, { type: "record-done", take });
    expect(run(review, { type: "record-start" })).toEqual({ step: "recording", elapsedMs: 0, level: 0 });
    expect(run(review, { type: "use-take" })).toEqual({ step: "analyzing", take, phase: "checking", voice: null });
  });

  it("returns to the first screen with the microphone problem when recording cannot start", () => {
    expect(run(recording, { type: "record-failed", problem: "denied", message: "" })).toEqual({ step: "choose", consent: true, source: "record", busy: false, error: null, mic: "denied" });
    expect(run(recording, { type: "record-failed", problem: null, message: "The recording is empty." })).toMatchObject({ error: "The recording is empty.", mic: null });
  });

  it("closes the microphone dialog without leaving the first screen", () => {
    const blocked = run(recording, { type: "record-failed", problem: "missing", message: "" });
    expect(run(blocked, { type: "dismiss-mic" })).toMatchObject({ step: "choose", mic: null, consent: true });
  });
});

describe("analyzing, a bad reference and naming", () => {
  const analyzing = run(ready(), { type: "picked", take });

  it("waits for the engine after the clip passes, then asks for a name with the voice's own style", () => {
    const loading = run(analyzing, { type: "cloned", voice });
    expect(loading).toEqual({ step: "analyzing", take, phase: "loading", voice });
    expect(run(loading, { type: "engine-ready" })).toEqual({ step: "naming", voice, name: "", exaggeration: 0.5, saving: false, error: null });
    expect(run(analyzing, { type: "engine-ready" })).toBe(analyzing);
  });

  it("shows one row per check when the server rejects the clip", () => {
    const checks = [
      { id: "length" as const, ok: false, message: "Clip is 3.0 s; at least 5.0 s is needed." },
      { id: "noise" as const, ok: true, message: "Clip is clean." },
    ];
    const s = run(analyzing, { type: "clone-rejected", message: checks[0]!.message, checks });
    expect(s).toEqual({ step: "rejected", message: "Clip is 3.0 s; at least 5.0 s is needed.", checks });
    expect(run(s, { type: "record-start" })).toEqual({ step: "recording", elapsedMs: 0, level: 0 });
    expect(run(s, { type: "pick-start" })).toMatchObject({ step: "choose", busy: true, source: "upload", consent: true });
  });

  it("goes back to the first screen with the error when the server fails for another reason", () => {
    expect(run(analyzing, { type: "clone-failed", message: "Install Chatterbox to clone voices" })).toMatchObject({ step: "choose", error: "Install Chatterbox to clone voices", consent: true });
  });

  it("edits the name and the style, saves, and ends on done with the trimmed name", () => {
    const naming = run(analyzing, { type: "cloned", voice }, { type: "engine-ready" }, { type: "rename", name: " Maya " }, { type: "style", exaggeration: 0.7 });
    expect(naming).toMatchObject({ name: " Maya ", exaggeration: 0.7 });
    expect(run(naming, { type: "save-start" })).toMatchObject({ saving: true });
    expect(run(naming, { type: "save-start" }, { type: "save-failed", message: "The server did not answer." })).toMatchObject({ saving: false, error: "The server did not answer." });
    expect(run(naming, { type: "save-start" }, { type: "saved" })).toEqual({ step: "done", name: "Maya" });
  });

  it("ignores an action that does not belong to the screen", () => {
    const done = run(analyzing, { type: "cloned", voice }, { type: "engine-ready" }, { type: "rename", name: "Maya" }, { type: "saved" });
    expect(run(done, { type: "rename", name: "Other" })).toBe(done);
    expect(run(initClone(), { type: "saved" })).toEqual(initClone());
  });
});

describe("helpers", () => {
  it("checks a take's length against 5 to 30 seconds", () => {
    expect(lengthCheck(14000)).toEqual({ id: "length", ok: true, message: "14 s, between 5 s and 30 s." });
    expect(lengthCheck(3000)).toEqual({ id: "length", ok: false, message: "3 s. Use a clip of 5 s to 30 s." });
    expect(lengthCheck(31000).ok).toBe(false);
  });

  it("words the test sentence with the name, or without one", () => {
    expect(testSentence(" Maya ")).toBe("Hello, I am Maya. This is how I sound when reading to you.");
    expect(testSentence("")).toBe("Hello, I am your new voice. This is how I sound when reading to you.");
  });

  const health = (engine: Health["engine"]): Health => ({ app: "speakkit", version: "1", apiVersion: 1, engine });
  it("reads the engine's load from health", () => {
    expect(engineWait(null)).toEqual({ kind: "waiting", progress: null });
    expect(engineWait(health({ id: "kokoro", state: "ready" }))).toEqual({ kind: "waiting", progress: null });
    expect(engineWait(health({ id: "chatterbox", state: "loading", progress: 0.64 }))).toEqual({ kind: "waiting", progress: 0.64 });
    expect(engineWait(health({ id: "chatterbox", state: "ready" }))).toEqual({ kind: "ready" });
    expect(engineWait(health({ id: "chatterbox", state: "error", detail: "CUDA out of memory" }))).toEqual({ kind: "failed", message: "CUDA out of memory" });
  });
});
