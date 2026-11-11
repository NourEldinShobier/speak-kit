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

  it("a look shows from the model's turn until the picture is on its way, then the model thinks again", () => {
    const thinking = run([{ t: "connected" }, { t: "speech-start" }, { t: "speech-stop" }]);
    const looking = reduceVoice(thinking, { t: "look-start" });
    expect(looking).toEqual({ phase: "looking", muted: false });
    expect(reduceVoice(looking, { t: "look-end" }).phase).toBe("thinking");
    expect(reduceVoice(reduceVoice(looking, { t: "look-end" }), { t: "response-done" }).phase).toBe("idle");
  });

  it("a look can start while the model is still speaking or the conversation is idle, not before it is connected or while the user talks", () => {
    expect(run([{ t: "connected" }, { t: "audio-start" }, { t: "look-start" }]).phase).toBe("looking");
    expect(run([{ t: "connected" }, { t: "look-start" }]).phase).toBe("looking");
    expect(run([{ t: "connected" }, { t: "speech-start" }, { t: "look-start" }]).phase).toBe("listening");
    expect(run([{ t: "look-start" }]).phase).toBe("connecting");
  });

  it("speaking during a look is listening; the end of the look then changes nothing", () => {
    const talking = run([{ t: "connected" }, { t: "look-start" }, { t: "speech-start" }]);
    expect(talking.phase).toBe("listening");
    expect(reduceVoice(talking, { t: "look-end" })).toBe(talking);
  });

  it("audio events leave a look alone, and the cost limit and a lost connection still apply to it", () => {
    const looking = run([{ t: "connected" }, { t: "look-start" }]);
    expect(reduceVoice(looking, { t: "audio-start" })).toBe(looking);
    expect(reduceVoice(looking, { t: "audio-stop" })).toBe(looking);
    expect(reduceVoice(looking, { t: "cost-limit" }).phase).toBe("cost-warning");
    expect(reduceVoice(looking, { t: "lost" }).phase).toBe("reconnecting");
    expect(reduceVoice(looking, { t: "mute", on: true })).toEqual({ phase: "looking", muted: true });
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
