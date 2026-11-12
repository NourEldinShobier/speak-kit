import { describe, expect, it } from "vite-plus/test";
import { windowsAudio } from "./windows-audio";

/** A helper that answers from a table; every command it was sent is logged. */
function helper(answers: Record<string, string | string[]>) {
  const sent: string[] = [];
  const queues = new Map(Object.entries(answers).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  const ask = async (command: string) => {
    sent.push(command);
    const q = queues.get(command.split(" ")[0]!);
    return (q && q.length > 1 ? q.shift() : q?.[0]) ?? "error";
  };
  return { sent, audio: windowsAudio(ask, async () => undefined) };
}

describe("windows audio", () => {
  it("reads the volume and the mute state", async () => {
    const h = helper({ volume: "0.6", muted: "1" });
    expect(await h.audio.volume.get()).toBe(0.6);
    expect(await h.audio.volume.muted()).toBe(true);
  });

  it("ramps from the current volume to the target in steps that end exactly on it", async () => {
    const h = helper({ volume: "0.8", setvolume: "ok" });
    await h.audio.volume.ramp(0.2, 120);
    expect(h.sent).toEqual(["volume", "setvolume 0.6000", "setvolume 0.4000", "setvolume 0.2000"]);
  });

  it("makes one step for a ramp shorter than a step", async () => {
    const h = helper({ volume: "0.5", setvolume: "ok" });
    await h.audio.volume.ramp(0.1, 10);
    expect(h.sent).toEqual(["volume", "setvolume 0.1000"]);
  });

  it("rejects when the helper answers an error, so the ducker leaves the audio alone", async () => {
    const h = helper({ volume: "error", setmuted: "error" });
    await expect(h.audio.volume.get()).rejects.toThrow("volume failed");
    await expect(h.audio.volume.setMuted(true)).rejects.toThrow("setmuted 1 failed");
  });

  it("mutes and unmutes", async () => {
    const h = helper({ setmuted: "ok" });
    await h.audio.volume.setMuted(true);
    await h.audio.volume.setMuted(false);
    expect(h.sent).toEqual(["setmuted 1", "setmuted 0"]);
  });

  it("says something is playing when any of four peak readings is above silence, and nothing is playing when all are quiet", async () => {
    expect(await helper({ peak: ["0", "0", "0.4", "0"] }).audio.media.playing()).toBe(true);
    const quiet = helper({ peak: "0.001" });
    expect(await quiet.audio.media.playing()).toBe(false);
    expect(quiet.sent).toHaveLength(4);
  });

  it("pauses and resumes with the media key", async () => {
    const h = helper({ playpause: "ok" });
    await h.audio.media.pause();
    await h.audio.media.play();
    expect(h.sent).toEqual(["playpause", "playpause"]);
  });

  it("names the output as speakers or headphones from the device name", async () => {
    expect(await helper({ name: "Speakers (Realtek(R) Audio)" }).audio.output()).toBe("speakers");
    expect(await helper({ name: "Headphones (WH-1000XM4 Hands-Free)" }).audio.output()).toBe("headphones");
    expect(await helper({ name: "" }).audio.output()).toBe("unknown");
  });
});
