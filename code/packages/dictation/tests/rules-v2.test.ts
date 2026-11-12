import { describe, expect, it } from "vite-plus/test";
import { applyRules, soundsLikeRules, traceRules, type RulesOptions } from "../src";

const off: RulesOptions = { fillers: false, spokenSymbols: false, spokenFormatting: false, autoCapitalize: false, trailingSpace: false, replacements: [], language: "en" };
const run = (text: string, opts: Partial<RulesOptions> = {}): string => applyRules(text, { ...off, ...opts });
const rule = (from: string, to: string) => ({ from, to });

describe("replacement edge rules", () => {
  it("keeps scanning after an in-word match is rejected", () => {
    expect(run("xcat cat", { replacements: [rule("cat", "dog")] })).toBe("xcat dog");
    expect(run("catcat cat", { replacements: [rule("cat", "dog")] })).toBe("catcat dog");
  });

  it("takes the longest span when two phrases overlap", () => {
    expect(run("new york city", { replacements: [rule("new york", "NY"), rule("york city", "YC"), rule("new york city", "NYC")] })).toBe("NYC");
    expect(run("new york city", { replacements: [rule("new york", "NY"), rule("york city", "YC")] })).toBe("new YC");
  });

  it("never replaces a replacement again", () => {
    expect(run("a b", { replacements: [rule("a", "b"), rule("b", "c")] })).toBe("b c");
  });

  it("matches next to scripts that have no spaces between words", () => {
    expect(run("今日はkubeです", { replacements: [rule("kube", "Kubernetes")] })).toBe("今日はKubernetesです");
    expect(run("東京タワー", { replacements: [rule("タワー", "Tower")] })).toBe("東京Tower");
    expect(run("ไทยkubeไทย", { replacements: [rule("kube", "K")] })).toBe("ไทยKไทย");
  });

  it("still refuses a match inside a word of a spaced script", () => {
    expect(run("kubernetes cube", { replacements: [rule("kube", "K")] })).toBe("kubernetes cube");
    expect(run("مكعبكيوب", { replacements: [rule("كيوب", "K")] })).toBe("مكعبكيوب");
  });

  it("deleting a phrase closes the gap", () => {
    expect(run("so um you know it works", { replacements: [rule("um", ""), rule("you know", "")] })).toBe("so it works");
    expect(run("hello, um, world", { replacements: [rule("um", "")] })).toBe("hello, world");
    expect(run("it works um.", { replacements: [rule("um", "")] })).toBe("it works.");
  });

  it("replaces a sounds-like spelling exactly, ignoring case (Wasu becomes Wazuh)", () => {
    const rules = soundsLikeRules([{ id: "1", word: "Wazuh", soundsLike: ["wasu", "wa zoo"] }]);
    expect(run("Install Wasu on the server", { replacements: rules })).toBe("Install Wazuh on the server");
    expect(run("install wa zoo", { replacements: rules })).toBe("install Wazuh");
    expect(run("wasun is not it", { replacements: rules })).toBe("wasun is not it");
  });
});

describe("clean-up switches", () => {
  it("lower-case keeps a vocabulary word's spelling", () => {
    expect(run("Hello World and Cooper Netties", { lowercase: true, replacements: [rule("cooper netties", "Kubernetes")], autoCapitalize: true })).toBe("hello world and Kubernetes");
  });

  it("drops one final full stop only", () => {
    const s = { stripFinalStop: true };
    expect(run("Done.", s)).toBe("Done");
    expect(run("Done. ", s)).toBe("Done");
    expect(run("Done. Really.", s)).toBe("Done. Really");
    expect(run("Wait...", s)).toBe("Wait...");
    expect(run("See e.g.", s)).toBe("See e.g.");
    expect(run("Done?", s)).toBe("Done?");
    expect(run("No stop", s)).toBe("No stop");
  });

  it("strips before the trailing space is added", () => {
    expect(run("Done.", { stripFinalStop: true, trailingSpace: true })).toBe("Done ");
  });

  it("leaves numbers-only text alone, adding only the trailing space", () => {
    for (const n of ["3.14", "1,234.50", "+49 30 1234567", "10 20 30", "(555) 123-4567"])
      expect(run(n, { fillers: true, spokenSymbols: true, spokenFormatting: true, autoCapitalize: true, stripFinalStop: true, trailingSpace: true })).toBe(`${n} `);
  });

  it("does not treat words with a digit as numbers-only", () => {
    expect(run("call 5 times um", { fillers: true })).toBe("call 5 times");
  });
});

describe("rules by language", () => {
  it("removes fillers in English only, so German words survive", () => {
    expect(run("er hat um zwei Uhr gesagt", { fillers: true, language: "de" })).toBe("er hat um zwei Uhr gesagt");
    expect(run("ele disse um dia", { fillers: true, language: "pt" })).toBe("ele disse um dia");
    expect(run("هذا um", { fillers: true, language: "ar" })).toBe("هذا um");
    expect(run("er um hello", { fillers: true, language: "en-GB" })).toBe("hello");
    expect(run("um hello", { fillers: true, language: "auto" })).toBe("hello");
  });

  it("has symbol and formatting tables for German, Spanish and Arabic", () => {
    expect(run("hallo komma welt neue zeile ende", { spokenSymbols: true, spokenFormatting: true, language: "de" })).toBe("hallo, welt\nende");
    expect(run("hola nueva línea mundo", { spokenFormatting: true, language: "es" })).toBe("hola\nmundo");
    expect(run("usuario arroba ejemplo", { spokenSymbols: true, language: "es" })).toBe("usuario@ejemplo");
    expect(run("مرحبا فاصلة عالم", { spokenSymbols: true, language: "ar" })).toBe("مرحبا، عالم");
    expect(run("one comma two", { spokenSymbols: true, language: "fr" })).toBe("one comma two");
  });

  it("keeps German umlauts and quote marks through every stage", () => {
    expect(run("anführungszeichen auf Größe anführungszeichen zu", { spokenFormatting: true, language: "de" })).toBe("„Größe“");
  });

  it("puts the spacing around a spoken symbol into the rule", () => {
    expect(run("mail me at john at sign example", { spokenSymbols: true })).toBe("mail me at john@example");
    expect(run("tag hashtag launch", { spokenSymbols: true })).toBe("tag #launch");
    expect(run("a semicolon b", { spokenSymbols: true })).toBe("a; b");
  });
});

describe("rules tester", () => {
  const opts: RulesOptions = { ...off, fillers: true, spokenSymbols: true, spokenFormatting: true, autoCapitalize: true, replacements: [rule("cooper netties", "Kubernetes")] };

  it("shows each stage, ending with the final text", () => {
    expect(traceRules("um deploy cooper netties comma new line done", opts)).toEqual({
      raw: "um deploy cooper netties comma new line done",
      replacements: "um deploy Kubernetes comma new line done",
      fillers: "deploy Kubernetes comma new line done",
      symbols: "deploy Kubernetes,\ndone",
      final: "Deploy Kubernetes,\nDone",
      notes: [],
    });
  });

  it("says which switches were skipped for the language", () => {
    expect(traceRules("hallo", { ...opts, language: "ar" }).notes).toEqual(["fillers-language", "formatting-language"]);
    expect(traceRules("hallo", { ...opts, language: "fr" }).notes).toEqual(["fillers-language", "formatting-language", "symbols-language"]);
  });

  it("marks noise tags and numbers-only text", () => {
    expect(traceRules("[BLANK_AUDIO]", opts)).toMatchObject({ final: "", notes: ["noise"] });
    expect(traceRules(" 12 34 ", opts)).toMatchObject({ final: "12 34", notes: ["numbers-only"] });
  });

  it("returns nothing when everything is removed", () => {
    expect(traceRules("um uh", opts).final).toBe("");
  });
});
