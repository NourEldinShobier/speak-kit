import { describe, expect, it } from "vite-plus/test";
import { encodeWav, meterLevel, mixToMono, rms, wavSampleRate } from "./audio";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

describe("encodeWav", () => {
  it("writes the 44-byte header and little-endian 16-bit samples of a mono file", () => {
    const wav = encodeWav(Float32Array.of(0, 0.5, -0.5, 1), 24000);
    expect(hex(wav)).toBe(
      "52494646" + // RIFF
        "2c000000" + // 36 + 8 data bytes
        "57415645" + // WAVE
        "666d7420" + // "fmt "
        "10000000" + // fmt chunk is 16 bytes
        "0100" + // PCM
        "0100" + // 1 channel
        "c05d0000" + // 24000 Hz
        "80bb0000" + // 48000 bytes per second
        "0200" + // 2 bytes per frame
        "1000" + // 16 bits
        "64617461" + // data
        "08000000" + // 8 bytes
        "0000" +
        "ff3f" +
        "00c0" +
        "ff7f", // 0, 0.5 (16383), -0.5 (-16384), 1 (32767)
    );
  });

  it("clamps samples outside -1 to 1", () => {
    expect(hex(encodeWav(Float32Array.of(2, -2), 16000).subarray(44))).toBe("ff7f0080");
  });

  it("reads back its own sample rate", () => {
    expect(wavSampleRate(encodeWav(new Float32Array(3), 8000))).toBe(8000);
  });
});

describe("wavSampleRate", () => {
  it("is null for bytes that are not a WAV file", () => {
    expect(wavSampleRate(new TextEncoder().encode("ID3 an mp3 tag, long enough to pass the length check"))).toBeNull();
  });

  it("finds the fmt chunk after another chunk", () => {
    const wav = encodeWav(new Float32Array(2), 44100);
    const list = new TextEncoder().encode("LIST\u0004\u0000\u0000\u0000abcd");
    const withList = new Uint8Array([...wav.subarray(0, 12), ...list, ...wav.subarray(12)]);
    expect(wavSampleRate(withList)).toBe(44100);
  });
});

describe("mixToMono", () => {
  it("averages the channels", () => {
    expect(Array.from(mixToMono([Float32Array.of(1, 0.5), Float32Array.of(0, -0.5)]))).toEqual([0.5, 0]);
  });

  it("returns a mono input as it is and nothing for no channels", () => {
    const one = Float32Array.of(0.25);
    expect(mixToMono([one])).toBe(one);
    expect(mixToMono([]).length).toBe(0);
  });
});

describe("meter", () => {
  it("rms of a constant block is its magnitude", () => {
    expect(rms(Float32Array.of(0.5, -0.5, 0.5, -0.5))).toBe(0.5);
    expect(rms(new Float32Array(0))).toBe(0);
  });

  it("stretches quiet levels and caps at 1", () => {
    expect([meterLevel(0.1), meterLevel(0.5)]).toEqual([0.4, 1]);
  });
});
