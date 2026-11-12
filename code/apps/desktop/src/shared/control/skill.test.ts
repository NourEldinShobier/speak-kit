import { describe, expect, it } from "vite-plus/test";
import { skillMark, skillState, skillText } from "./skill";

describe("agent skill", () => {
  it("names the app and control version it was written for and every command, and reads them back", () => {
    const text = skillText(1, "0.5.3");
    expect(skillMark(text)).toEqual({ app: "0.5.3", control: 1 });
    for (const c of ["speakkit speak", "--wait", "speakkit queue", "speakkit voices", "speakkit meetings", "speakkit capture", "speakkit labs", "speakkit history", "speakkit dictate --print"])
      expect(text).toContain(c);
    expect(skillMark("not a skill")).toBeUndefined();
  });
  it("compares an installed file with the one this version writes", () => {
    expect(skillState(undefined, "a")).toBe("not-installed");
    expect(skillState("a", "a")).toBe("up-to-date");
    expect(skillState("b", "a")).toBe("out-of-date");
  });
});
