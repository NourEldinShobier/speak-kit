import { describe, expect, it } from "vite-plus/test";
import { agentSkill, type SkillFs } from "./index";

function rig(initial: string | undefined, over: Partial<SkillFs> = {}) {
  const s = { text: initial, writes: [] as string[] };
  const fs: SkillFs = {
    read: async () => s.text,
    write: async (_file, text) => void (s.writes.push(text), (s.text = text)),
    ...over,
  };
  return { s, skill: agentSkill({ file: "C:/h/.claude/skills/speakkit/SKILL.md", text: () => "skill v2", fs }) };
}
const WHERE = "C:/h/.claude/skills/speakkit/SKILL.md";

describe("agent skill", () => {
  it("is not installed, then installed and up to date once written", async () => {
    const r = rig(undefined);
    expect(await r.skill.status()).toEqual({ state: "not-installed", where: WHERE });
    expect(await r.skill.install()).toEqual({ state: "up-to-date", where: WHERE });
    expect(r.s.writes).toEqual(["skill v2"]);
  });

  it("is out of date when the file is for another version, and install replaces it", async () => {
    const r = rig("skill v1");
    expect(await r.skill.status()).toEqual({ state: "out-of-date", where: WHERE });
    expect(await r.skill.install()).toEqual({ state: "up-to-date", where: WHERE });
  });

  it("says unreadable when the file cannot be read, and lets a failed write reach the caller", async () => {
    const r = rig("x", { read: async () => Promise.reject(new Error("EACCES")), write: async () => Promise.reject(new Error("EROFS")) });
    expect(await r.skill.status()).toEqual({ state: "unreadable", where: WHERE });
    await expect(r.skill.install()).rejects.toThrow("EROFS");
  });
});
