import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { validateChange } from "./control/settings-registry";
import { parseConfig } from "./schemas";
import { EnginesPatchSchema } from "./speech-models/config";

describe("settings removed with the reading, audio output, speech model and palette decisions", () => {
  it("a saved config that still has the removed keys loads, and the keys have no effect", () => {
    const c = parseConfig({
      exportPrefs: { format: "wav", mp3Kbps: 128, folder: "D:/out", captions: "srt", chapters: true },
      engines: { idleMinutes: 30, releaseOnClose: true },
    });
    expect(c.exportPrefs).toEqual({ format: "wav", mp3Kbps: 128, folder: "D:/out" });
    expect(c.engines.idleMinutes).toBe(30);
    expect("releaseOnClose" in c.engines).toBe(false);
  });

  it("a settings change or an engines patch with a removed key is refused", () => {
    expect(v.safeParse(EnginesPatchSchema, { releaseOnClose: true }).success).toBe(false);
    expect(validateChange({ "engines.releaseOnClose": true }).ok).toBe(false);
  });
});
