import { describe, expect, it } from "vite-plus/test";
import { AutoSwitch, ModelSwitcher, RULE_WAIT_MS, matchRule, newerModelHint, type SttModelId, type SwitchRule } from "../src";

const W: SttModelId = "large-v3-turbo-q5_0";
const P: SttModelId = "parakeet-tdt-0.6b-v3-q4_0";

function switcher(over: Partial<{ recording: boolean; downloaded: boolean; load: (id: SttModelId) => Promise<void> }> = {}) {
  const calls: string[] = [];
  let current: SttModelId = W;
  const s = new ModelSwitcher({
    current: () => current,
    downloaded: async () => over.downloaded ?? true,
    load: async (id) => {
      calls.push(`load ${id}`);
      await over.load?.(id);
    },
    abort: async () => void calls.push("abort"),
    save: (id) => {
      calls.push(`save ${id}`);
      current = id;
    },
    recording: () => over.recording ?? false,
  });
  return { s, calls };
}

describe("ModelSwitcher", () => {
  it("saves the choice only after the new model has loaded", async () => {
    const { s, calls } = switcher();
    expect(await s.switchTo(P)).toEqual({ ok: true });
    expect(calls).toEqual([`load ${P}`, `save ${P}`]);
  });

  it("is blocked during a recording and loads nothing", async () => {
    const { s, calls } = switcher({ recording: true });
    expect(await s.switchTo(P)).toEqual({ ok: false, reason: "recording", message: "Finish the recording first, then switch." });
    expect(calls).toEqual([]);
  });

  it("refuses a model that is not downloaded", async () => {
    const { s, calls } = switcher({ downloaded: false });
    expect(await s.switchTo(P)).toMatchObject({ ok: false, reason: "not-downloaded" });
    expect(calls).toEqual([]);
  });

  it("switching to the model in use does nothing", async () => {
    const { s, calls } = switcher();
    expect(await s.switchTo(W)).toEqual({ ok: true });
    expect(calls).toEqual([]);
  });

  it("a failed load keeps the old model: it is loaded again and the choice is not saved", async () => {
    const { s, calls } = switcher({
      load: async (id) => {
        if (id === P) throw new Error("bad file");
      },
    });
    const r = await s.switchTo(P);
    expect(r).toEqual({ ok: false, reason: "failed", message: `${P} could not be loaded: bad file. The previous model is still in use.` });
    expect(calls).toEqual([`load ${P}`, `load ${W}`]);
  });

  it("a second switch while one runs is refused", async () => {
    let release!: () => void;
    const { s } = switcher({ load: () => new Promise<void>((r) => (release = r)) });
    const first = s.switchTo(P);
    await Promise.resolve();
    await Promise.resolve();
    expect(s.switching).toBe(P);
    expect(await s.switchTo(P)).toMatchObject({ ok: false, reason: "busy" });
    release();
    expect(await first).toEqual({ ok: true });
    expect(s.switching).toBeUndefined();
  });

  it("cancel aborts the load, brings the old model back and saves nothing", async () => {
    let release!: () => void;
    const { s, calls } = switcher({ load: (id) => (id === P ? new Promise<void>((r) => (release = r)) : Promise.resolve()) });
    const run = s.switchTo(P);
    await Promise.resolve();
    await Promise.resolve();
    await s.cancel();
    release();
    expect(await run).toEqual({ ok: false, reason: "cancelled", message: "The switch was cancelled. The previous model is back in use." });
    expect(calls).toEqual([`load ${P}`, "abort", `load ${W}`]);
  });

  it("cancel with nothing running does nothing", async () => {
    const { s, calls } = switcher();
    await s.cancel();
    expect(calls).toEqual([]);
  });

  it("an old model that cannot be reloaded does not hide the failure", async () => {
    const { s } = switcher({
      load: async () => {
        throw new Error("gone");
      },
    });
    expect(await s.switchTo(P)).toMatchObject({ ok: false, reason: "failed" });
  });
});

const rules: SwitchRule[] = [
  { id: "1", layout: "de", model: W, language: "de" },
  { id: "2", app: "Code.exe", model: P },
  { id: "3", layout: "en-US", app: "slack", model: P, language: "en" },
];
const all = new Set<string>([W, P]);

describe("matchRule", () => {
  it("matches a short layout code against every region, case-insensitively", () => {
    expect(matchRule(rules, { layout: "de-DE" }, all).rule?.id).toBe("1");
    expect(matchRule(rules, { layout: "DE-ch" }, all).rule?.id).toBe("1");
    expect(matchRule(rules, { layout: "dex" }, all).rule).toBeUndefined();
  });
  it("matches an app name with or without .exe", () => {
    expect(matchRule(rules, { app: "code" }, all).rule?.id).toBe("2");
    expect(matchRule(rules, { app: "CODE.EXE" }, all).rule?.id).toBe("2");
  });
  it("a rule with both parts needs both", () => {
    expect(matchRule(rules, { layout: "en-US" }, all).rule).toBeUndefined();
    expect(matchRule(rules, { layout: "en-US", app: "slack.exe" }, all).rule?.id).toBe("3");
  });
  it("the first matching rule wins", () => {
    expect(matchRule(rules, { layout: "de-DE", app: "code" }, all).rule?.id).toBe("1");
  });
  it("skips a rule whose model is not downloaded, says so, and uses the next one", () => {
    const m = matchRule(rules, { layout: "de-DE", app: "code" }, new Set([P]));
    expect(m.skipped.map((r) => r.id)).toEqual(["1"]);
    expect(m.rule?.id).toBe("2");
    expect(matchRule(rules, { layout: "de-DE" }, new Set()).rule).toBeUndefined();
  });
  it("ignores a rule that names neither layout nor app", () => {
    expect(matchRule([{ id: "x", model: P }], { layout: "de", app: "a" }, all).rule).toBeUndefined();
  });
});

function auto(over: { enabled?: boolean; recording?: boolean; current?: { model: SttModelId; language: "en" | "de" } } = {}) {
  const applied: [SttModelId, string | undefined][] = [];
  let timer: (() => void) | undefined;
  let state = { recording: over.recording ?? false };
  const a = new AutoSwitch({
    enabled: () => over.enabled ?? true,
    rules: () => rules,
    downloaded: () => all,
    current: () => over.current ?? { model: P, language: "en" },
    recording: () => state.recording,
    apply: async (m, l) => void applied.push([m, l]),
    timers: { setTimeout: (f) => ((timer = f), 1), clearTimeout: () => (timer = undefined) },
  });
  return { a, applied, fire: () => timer?.(), state };
}

describe("AutoSwitch", () => {
  it("waits for the context to settle (the wait is 300 ms) and applies the matching rule", async () => {
    expect(RULE_WAIT_MS).toBe(300);
    const { a, applied, fire } = auto();
    a.update({ layout: "de-DE" });
    expect(applied).toEqual([]);
    fire();
    await Promise.resolve();
    await Promise.resolve();
    expect(applied).toEqual([[W, "de"]]);
  });

  it("only the last context counts when it changes within the wait", async () => {
    const { a, applied, fire } = auto({ current: { model: W, language: "en" } });
    a.update({ layout: "de-DE" });
    a.update({ app: "code" });
    fire();
    await Promise.resolve();
    await Promise.resolve();
    expect(applied).toEqual([[P, undefined]]);
  });

  it("does nothing when it is off, when nothing matches, or when the model and language already fit", async () => {
    const off = auto({ enabled: false });
    off.a.update({ layout: "de-DE" });
    await off.a.evaluate();
    expect(off.applied).toEqual([]);
    const none = auto();
    none.a.update({ layout: "fr-FR" });
    await none.a.evaluate();
    expect(none.applied).toEqual([]);
    const same = auto({ current: { model: W, language: "de" } });
    same.a.update({ layout: "de-DE" });
    await same.a.evaluate();
    expect(same.applied).toEqual([]);
  });

  it("holds the switch during a recording and applies it when the recording ends", async () => {
    const { a, applied, state } = auto({ recording: true });
    a.update({ layout: "de-DE" });
    await a.evaluate();
    expect(applied).toEqual([]);
    state.recording = false;
    a.recordingEnded();
    await Promise.resolve();
    await Promise.resolve();
    expect(applied).toEqual([[W, "de"]]);
    a.recordingEnded(); // nothing held now
    await Promise.resolve();
    expect(applied).toHaveLength(1);
  });

  it("remembers which rules were skipped", async () => {
    const { a } = auto();
    a.update({ layout: "xx" });
    await a.evaluate();
    expect(a.skipped).toEqual([]);
  });
});

describe("newerModelHint", () => {
  const catalog = [
    { id: P, name: "Parakeet v3" },
    { id: "custom-aaaaaaaaaaaa" as SttModelId, name: "Parakeet v3.1", replaces: P },
  ];
  it("hints at a newer model for an installed one", () => {
    expect(newerModelHint(catalog, new Set([P]), [])).toEqual({ id: "custom-aaaaaaaaaaaa", name: "Parakeet v3.1", replaces: P });
  });
  it("stays quiet when dismissed, when the old model is not installed, or when the new one already is", () => {
    expect(newerModelHint(catalog, new Set([P]), ["custom-aaaaaaaaaaaa"])).toBeUndefined();
    expect(newerModelHint(catalog, new Set([W]), [])).toBeUndefined();
    expect(newerModelHint(catalog, new Set([P, "custom-aaaaaaaaaaaa"]), [])).toBeUndefined();
    expect(newerModelHint([{ id: P, name: "x" }], new Set([P]), [])).toBeUndefined();
  });
});
