import { describe, expect, it } from "vite-plus/test";
import { micLine, OUTPUT_HELP, OUTPUT_OPTIONS } from "./mic-model";

describe("micLine", () => {
  it("names the microphone in use and is not a problem", () => {
    expect(micLine({ kind: "ready", label: "Blue Yeti" }, true)).toEqual({ text: "Using Blue Yeti", problem: false, link: false });
    expect(micLine({ kind: "back", label: "Blue Yeti" }, true)).toEqual({ text: "Blue Yeti is back", problem: false, link: false });
  });

  it("explains the headset tradeoff without calling it a problem", () => {
    const line = micLine({ kind: "bluetooth", label: "WH-1000XM4" }, true);
    expect(line.problem).toBe(false);
    expect(line.text).toContain("lowers the sound quality of calls");
  });

  it("links to the privacy page only when the microphone is blocked and the system has one", () => {
    expect(micLine({ kind: "blocked", privacyLink: true }, true)).toMatchObject({ problem: true, link: true });
    expect(micLine({ kind: "blocked", privacyLink: true }, false).link).toBe(false);
    expect(micLine({ kind: "blocked", privacyLink: false }, true).link).toBe(false);
    expect(micLine({ kind: "busy" }, true).link).toBe(false);
  });

  it("has plain wording for every other state", () => {
    expect(micLine({ kind: "none" }, true).text).toBe("No microphone found");
    expect(micLine({ kind: "built-in-off" }, true).text).toContain("lid closed");
    expect(micLine({ kind: "busy" }, true).text).toBe("Another app is using the microphone");
    expect(micLine({ kind: "reconnecting", attempt: 2 }, true).text).toBe("Reconnecting the microphone");
    expect(micLine({ kind: "lost" }, true).text).toContain("could not be reopened");
  });
});

describe("output options", () => {
  it("are paste and restore, paste and keep, copy only, each with a line", () => {
    expect(OUTPUT_OPTIONS.map((o) => o.id)).toEqual(["restore", "keep", "copy"]);
    for (const o of OUTPUT_OPTIONS) expect(OUTPUT_HELP[o.id].length).toBeGreaterThan(10);
  });
});
