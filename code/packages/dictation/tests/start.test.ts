import { describe, expect, it } from "vite-plus/test";
import type { Clip, DictationDeps, DictationErrorCode } from "../src";
import { NEEDS_AUDIO, reportSettled, tryStart } from "../src/start";

const clip: Clip = { pcm: new Float32Array(1), sampleRate: 16_000, peak: 0.5 };

describe("reportSettled", () => {
  it.each(["model-missing", "model-loading", "model-failed", "transcribe-failed", "failed"] as DictationErrorCode[])("keeps the audio after %s, because no text exists yet", (code) => {
    const seen: boolean[] = [];
    reportSettled({ settled: (_c, done) => seen.push(done) }, clip, code);
    expect(seen).toEqual([false]);
  });

  it.each(["mic-silent", "password-field", "insert-failed", "focus-failed", "mic-denied", "hotkey-failed"] as DictationErrorCode[])(
    "is done after %s, because the text is saved or must not be kept",
    (code) => {
      const seen: boolean[] = [];
      reportSettled({ settled: (_c, done) => seen.push(done) }, clip, code);
      expect(seen).toEqual([true]);
    },
  );

  it("is done when nothing went wrong", () => {
    const seen: [Clip, boolean][] = [];
    reportSettled({ settled: (c, done) => seen.push([c, done]) }, clip, undefined);
    expect(seen).toEqual([[clip, true]]);
  });

  it("lists exactly the failures that came before any text", () => {
    expect([...NEEDS_AUDIO].sort()).toEqual(["failed", "model-failed", "model-loading", "model-missing", "transcribe-failed"]);
  });

  it("does nothing when the app asked for no report, and survives a report that throws", () => {
    expect(() => reportSettled({}, clip, undefined)).not.toThrow();
    expect(() =>
      reportSettled(
        {
          settled: () => {
            throw new Error("disk");
          },
        },
        clip,
        undefined,
      ),
    ).not.toThrow();
  });
});

describe("tryStart", () => {
  const deps = (start: DictationDeps["recorder"]["start"]) => ({ recorder: { start } }) as unknown as DictationDeps;

  it("passes the pre-roll on and has no error when the microphone opens", async () => {
    const asked: number[] = [];
    expect(
      await tryStart(
        deps(async ({ prerollMs }) => (asked.push(prerollMs), { ok: true })),
        450,
      ),
    ).toBeUndefined();
    expect(asked).toEqual([450]);
  });

  it("returns the code the microphone gave", async () => {
    expect(
      await tryStart(
        deps(async () => ({ ok: false, code: "mic-busy" })),
        0,
      ),
    ).toBe("mic-busy");
  });

  it("treats a recorder that throws as a microphone that cannot be used", async () => {
    expect(
      await tryStart(
        deps(async () => {
          throw new Error("gone");
        }),
        0,
      ),
    ).toBe("mic-failed");
  });
});
