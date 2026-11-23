import { describe, expect, it } from "vite-plus/test";
import type { VoiceView } from "@speakkit/protocol";
import { initialView, reduceVoice, type VoiceEvent } from "./machine";

const run = (events: VoiceEvent[], from: VoiceView = initialView()) => events.reduce(reduceVoice, from);

describe("reduceVoice", () => {
  it("walks a turn: connect, listen, think, speak, back to idle", () => {
    expect(run([{ t: "connected" }])).toEqual({ phase: "idle", muted: false });
    expect(run([{ t: "connected" }, { t: "speech-start" }]).phase).toBe("listening");
    expect(run([{ t: "connected" }, { t: "speech-start" }, { t: "speech-stop" }]).phase).toBe("thinking");
    expect(run([{ t: "connected" }, { t: "speech-start" }, { t: "speech-stop" }, { t: "audio-start" }]).phase).toBe("speaking");
    expect(run([{ t: "connected" }, { t: "speech-start" }, { t: "speech-stop" }, { t: "audio-start" }, { t: "audio-stop" }]).phase).toBe("idle");
  });

  it("speech while the model speaks flips straight to listening", () => {
    expect(run([{ t: "connected" }, { t: "audio-start" }, { t: "speech-start" }]).phase).toBe("listening");
  });

  it("a response without audio returns from thinking to idle", () => {
    expect(run([{ t: "connected" }, { t: "speech-start" }, { t: "speech-stop" }, { t: "response-done" }]).phase).toBe("idle");
  });

  it("mute stays muted across turns, and muting while listening drops to idle", () => {
    const v = run([{ t: "connected" }, { t: "speech-start" }, { t: "mute", on: true }]);
    expect(v).toEqual({ phase: "idle", muted: true });
    expect(run([{ t: "mute", on: true }, { t: "connected" }, { t: "audio-start" }])).toEqual({ phase: "speaking", muted: true });
  });

  it("counts reconnects and gives up after five with the offline problem", () => {
    const lost = Array.from({ length: 5 }, () => ({ t: "lost" }) as const);
    expect(run([{ t: "connected" }, ...lost])).toEqual({ phase: "reconnecting", muted: false, attempt: 5 });
    expect(run([{ t: "connected" }, ...lost, { t: "lost" }])).toEqual({ phase: "ended", muted: false, problem: "offline" });
    expect(run([{ t: "connected" }, { t: "lost" }, { t: "lost" }, { t: "connected" }])).toEqual({ phase: "idle", muted: false });
  });

  it("idle warning is left by keep going, and carries the seconds left", () => {
    const w = run([{ t: "connected" }, { t: "idle-warning", secondsLeft: 30 }]);
    expect(w).toEqual({ phase: "idle-warning", muted: false, secondsLeft: 30 });
    expect(reduceVoice(w, { t: "idle-warning", secondsLeft: 29 }).secondsLeft).toBe(29);
    expect(reduceVoice(w, { t: "keep-going" })).toEqual({ phase: "idle", muted: false });
  });

  it("the cost limit warns while the conversation is live, and a lost connection then ends it instead of reconnecting", () => {
    const w = run([{ t: "connected" }, { t: "speech-start" }, { t: "speech-stop" }, { t: "audio-start" }, { t: "cost-limit" }]);
    expect(w).toEqual({ phase: "cost-warning", muted: false });
    expect(reduceVoice(w, { t: "speech-start" })).toBe(w);
    expect(reduceVoice(w, { t: "audio-stop" })).toBe(w);
    expect(reduceVoice(w, { t: "lost" })).toEqual({ phase: "ended", muted: false });
    expect(reduceVoice(w, { t: "end" }).phase).toBe("ended");
    expect(run([{ t: "cost-limit" }]).phase).toBe("connecting");
  });

  it("a problem ends the conversation and nothing revives it", () => {
    const dead = run([{ t: "connected" }, { t: "problem", problem: "no-credit" }]);
    expect(dead).toEqual({ phase: "ended", muted: false, problem: "no-credit" });
    expect(reduceVoice(dead, { t: "connected" })).toBe(dead);
  });

  it("ignores events that do not apply (speech before the connection exists)", () => {
    expect(run([{ t: "speech-start" }, { t: "audio-start" }])).toEqual(initialView());
  });
});
