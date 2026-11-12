import { describe, expect, it } from "vite-plus/test";
import { WINDOWS_AUDIO_LOOP, windowsAudio } from "./windows-audio";

/** A helper that answers from a table; every command it was sent is logged. */
function helper(answers: Record<string, string | string[]>) {
  const sent: string[] = [];
  const slept: number[] = [];
  const queues = new Map(Object.entries(answers).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  const ask = async (command: string) => {
    sent.push(command);
    const q = queues.get(command.split(" ")[0]!);
    return (q && q.length > 1 ? q.shift() : q?.[0]) ?? "error";
  };
  return { sent, slept, audio: windowsAudio(ask, async (ms) => void slept.push(ms)) };
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

describe("windows audio timing", () => {
  it("waits between the steps of a ramp but not after the last one", async () => {
    const h = helper({ volume: "0.8", setvolume: "ok" });
    await h.audio.volume.ramp(0.2, 120);
    expect(h.slept).toEqual([40, 40]);
    const one = helper({ volume: "0.8", setvolume: "ok" });
    await one.audio.volume.ramp(0.2, 40);
    expect(one.slept).toEqual([]);
  });

  it("reads the peak four times 60 ms apart, stops at the first sound, and a peak exactly at the limit is silence", async () => {
    const quiet = helper({ peak: "0.002" });
    expect(await quiet.audio.media.playing()).toBe(false);
    expect(quiet.slept).toEqual([60, 60, 60]);
    const loud = helper({ peak: ["0", "0.0021"] });
    expect(await loud.audio.media.playing()).toBe(true);
    expect(loud.slept).toEqual([60]);
  });

  it("rejects a peak that is not a number", async () => {
    await expect(helper({ peak: "error" }).audio.media.playing()).rejects.toThrow("peak failed");
  });

  it("carries the Core Audio script", () => {
    for (const part of [
      "IAudioEndpointVolume",
      "IAudioMeterInformation",
      "GetMasterVolumeLevelScalar",
      "SetMute",
      "keybd_event(0xB3",
      "'playpause'",
      "'setvolume'",
      "'peak'",
      "'name'",
      "'muted'",
      "'setmuted'",
      "'volume'",
    ])
      expect(WINDOWS_AUDIO_LOOP).toContain(part);
  });
});
