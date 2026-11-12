import { describe, expect, it } from "vite-plus/test";
import { macAudio, parseMacOutput } from "./mac-audio";

function osa(answer: (script: string) => string) {
  const ran: string[] = [];
  return { ran, audio: macAudio(async (s) => (ran.push(s), answer(s)), async () => undefined) };
}

const report = (items: object[]) => JSON.stringify({ SPAudioDataType: [{ _items: items }] });

describe("mac audio", () => {
  it("reads the volume as 0 to 1 and the mute state", async () => {
    const m = osa((s) => (s.startsWith("output volume") ? "35\n" : "true\n"));
    expect(await m.audio.volume.get()).toBe(0.35);
    expect(await m.audio.volume.muted()).toBe(true);
  });

  it("rejects when the volume cannot be read", async () => {
    await expect(osa(() => "missing value").audio.volume.get()).rejects.toThrow("cannot be read");
  });

  it("ramps in whole percent steps that end on the target", async () => {
    const m = osa(() => "80");
    await m.audio.volume.ramp(0.2, 120);
    expect(m.ran.filter((s) => s.startsWith("set"))).toEqual(["set volume output volume 60", "set volume output volume 40", "set volume output volume 20"]);
  });

  it("mutes and unmutes", async () => {
    const m = osa(() => "");
    await m.audio.volume.setMuted(true);
    await m.audio.volume.setMuted(false);
    expect(m.ran).toEqual(["set volume output muted true", "set volume output muted false"]);
  });

  it("pauses the player that was playing and plays that same one again", async () => {
    const m = osa((s) => (s.includes("player state") ? "Spotify" : ""));
    expect(await m.audio.media.playing()).toBe(true);
    await m.audio.media.pause();
    await m.audio.media.play();
    expect(m.ran.slice(1)).toEqual(['tell application "Spotify" to pause', 'tell application "Spotify" to play']);
  });

  it("says nothing is playing, and presses nothing, when no known player plays", async () => {
    const m = osa(() => "none");
    expect(await m.audio.media.playing()).toBe(false);
    await m.audio.media.pause();
    await m.audio.media.play();
    expect(m.ran).toHaveLength(1);
  });

  it("reads the default output from the audio report", () => {
    expect(parseMacOutput(report([{ _name: "Studio Display", coreaudio_default_audio_output_device: "spaudio_no" }, { _name: "MacBook Pro Speakers", coreaudio_device_transport: "coreaudio_device_type_builtin", coreaudio_default_audio_output_device: "spaudio_yes" }]))).toBe(
      "MacBook Pro Speakers builtin",
    );
    expect(parseMacOutput(report([{ _name: "AirPods Pro", coreaudio_device_transport: "coreaudio_device_type_bluetooth", coreaudio_default_audio_output_device: "spaudio_yes" }]))).toBe("AirPods Pro bluetooth");
    expect(parseMacOutput(report([{ _name: "x" }]))).toBeUndefined();
    expect(parseMacOutput("not json")).toBeUndefined();
  });

  it("classifies the built-in speakers as speakers and AirPods as headphones", async () => {
    const speakers = osa(() => report([{ _name: "MacBook Pro Speakers", coreaudio_device_transport: "coreaudio_device_type_builtin", coreaudio_default_audio_output_device: "spaudio_yes" }]));
    expect(await speakers.audio.output()).toBe("speakers");
    const pods = osa(() => report([{ _name: "AirPods Pro", coreaudio_device_transport: "coreaudio_device_type_bluetooth", coreaudio_default_audio_output_device: "spaudio_yes" }]));
    expect(await pods.audio.output()).toBe("headphones");
    expect(await osa(() => "{}").audio.output()).toBe("unknown");
  });
});
