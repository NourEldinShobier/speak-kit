import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { installSkill, skillState, skillText, type SkillFs } from "./skill";

const key = (f: string) => f.replace(/\\/g, "/");
const memory = (files: Record<string, string> = {}): SkillFs => ({
  read: async (f) => files[key(f)] ?? null,
  write: async (f, t) => void (files[key(f)] = t),
});

describe("skillText", () => {
  it("has the frontmatter an agent needs to find it, and the version mark", () => {
    const t = skillText("0.5.3");
    expect(t.startsWith("---\nname: speakkit\ndescription: ")).toBe(true);
    expect(t).toContain("<!-- speakkit-version: 0.5.3 -->");
  });
  it("names the real limits, exit codes and every error code", () => {
    const t = skillText("1.0.0");
    expect(t).toContain("100,000 characters");
    expect(t).toContain("64 MiB");
    expect(t).toContain("3 Speak Kit is not running");
    for (const code of ["model_missing", "busy", "permission_denied", "too_large", "unsupported", "queue_full", "invalid_input", "not_running", "token_rejected", "timeout", "failed"])
      expect(t).toContain(`- ${code}: `);
    expect(t).toContain("At most 20 readings can wait");
  });
  it("differs by version only in the mark", () => {
    expect(skillText("1.0.0").replace("1.0.0", "X")).toBe(skillText("2.0.0").replace("2.0.0", "X"));
  });
});

describe("install and state", () => {
  it("is none before install, current after, outdated when the app moved on", async () => {
    const fs = memory();
    expect(await skillState(fs, "/h/skills", "1.0.0")).toEqual({ state: "none" });
    expect(await installSkill(fs, "/h/skills", "1.0.0")).toBe(path.join("/h/skills", "speakkit", "SKILL.md"));
    expect(await skillState(fs, "/h/skills", "1.0.0")).toEqual({ state: "current" });
    expect(await skillState(fs, "/h/skills", "1.1.0")).toEqual({ state: "outdated", installedFor: "1.0.0" });
  });
  it("installing again replaces an old skill", async () => {
    const fs = memory();
    await installSkill(fs, "/s", "1.0.0");
    await installSkill(fs, "/s", "2.0.0");
    expect(await skillState(fs, "/s", "2.0.0")).toEqual({ state: "current" });
  });
  it("a skill file without the mark counts as outdated, not current", async () => {
    const fs = memory({ [key(path.join("/s", "speakkit", "SKILL.md"))]: "---\nname: speakkit\n---\nold" });
    expect(await skillState(fs, "/s", "1.0.0")).toEqual({ state: "outdated", installedFor: "an unknown version" });
  });
});
