import { describe, expect, it } from "vite-plus/test";
import { engineOf, modelOf } from "./engine";

const config = (narrationEngine: "dictation" | "live" | "windows" | "command", speechEngines: boolean) => ({ narrationEngine, experiments: { speechEngines } }) as Parameters<typeof engineOf>[0];

describe("narration engine", () => {
  it("honours the choice only while the speech engines experiment is on", () => {
    expect(engineOf(config("command", false))).toBe("dictation");
    expect(engineOf(config("live", false))).toBe("dictation");
    expect(engineOf(config("windows", true))).toBe("windows");
    expect(engineOf(config("live", true))).toBe("live");
    expect(engineOf(config("dictation", true))).toBe("dictation");
  });

  it("makes live use the dictation model", () => {
    expect([modelOf("live"), modelOf("dictation"), modelOf("windows"), modelOf("command")]).toEqual(["dictation", "dictation", "windows", "command"]);
  });
});
