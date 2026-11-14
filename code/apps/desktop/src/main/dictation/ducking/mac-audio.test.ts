import { describe, expect, it } from "vite-plus/test";
import { macAudio, parseMacOutput } from "./mac-audio";

function osa(answer: (script: string) => string) {
  const ran: string[] = [];
  const slept: number[] = [];
  return {
    ran,
    slept,
    audio: macAudio(
      async (s) => (ran.push(s), answer(s)),
      async (ms) => void slept.push(ms),
    ),
  };
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
    expect(
      parseMacOutput(
        report([
          { _name: "Studio Display", coreaudio_default_audio_output_device: "spaudio_no" },
          { _name: "MacBook Pro Speakers", coreaudio_device_transport: "coreaudio_device_type_builtin", coreaudio_default_audio_output_device: "spaudio_yes" },
        ]),
      ),
    ).toBe("MacBook Pro Speakers builtin");
    expect(parseMacOutput(report([{ _name: "AirPods Pro", coreaudio_device_transport: "coreaudio_device_type_bluetooth", coreaudio_default_audio_output_device: "spaudio_yes" }]))).toBe(
      "AirPods Pro bluetooth",
    );
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

describe("mac audio scripts and timing", () => {
  it("asks for the mute state and the playing app with the right scripts", async () => {
    const m = osa((s) => (s.includes("player state") ? "Music\n" : "false"));
    expect(await m.audio.volume.muted()).toBe(false);
    expect(await m.audio.media.playing()).toBe(true);
    expect(m.ran[0]).toBe("output muted of (get volume settings)");
    for (const part of ['application "Spotify" is running', 'application "Music" is running', 'tell application "Spotify" to if player state is playing then set r to "Spotify"', "return r"])
      expect(m.ran[1]).toContain(part);
  });

  it("reads the default output with system_profiler", async () => {
    const m = osa(() => "{}");
    await m.audio.output();
    expect(m.ran).toEqual(['do shell script "system_profiler SPAudioDataType -json"']);
  });

  it("waits between ramp steps but not after the last, and one step for a short ramp", async () => {
    const m = osa(() => "80");
    await m.audio.volume.ramp(0.2, 120);
    expect(m.slept).toEqual([40, 40]);
    const one = osa(() => "80");
    await one.audio.volume.ramp(0.2, 40);
    expect(one.slept).toEqual([]);
  });

  it("keeps the transport out of the label when the report names none, and strips the prefix only at the start", () => {
    expect(parseMacOutput(report([{ _name: "Speakers", coreaudio_default_audio_output_device: "spaudio_yes" }]))).toBe("Speakers");
    expect(parseMacOutput(report([{ _name: "X", coreaudio_device_transport: "xcoreaudio_device_type_usb", coreaudio_default_audio_output_device: "spaudio_yes" }]))).toBe(
      "X xcoreaudio_device_type_usb",
    );
    expect(parseMacOutput(report([{ coreaudio_device_transport: "coreaudio_device_type_usb", coreaudio_default_audio_output_device: "spaudio_yes" }]))).toBe("usb");
    expect(parseMacOutput(JSON.stringify({ SPAudioDataType: [{}, { _items: [{ _name: "A", coreaudio_default_audio_output_device: "spaudio_yes" }] }] }))).toBe("A");
    expect(parseMacOutput(JSON.stringify({}))).toBeUndefined();
  });
});
