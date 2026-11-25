import { describe, expect, it } from "vite-plus/test";
import { copyOf, defaultMode, keepsFacts, removeStyle, resolveStyle, saveStyle, styleDraftError, styleUsers, TEMPLATES, type CustomStyle, type StyleDraft } from "../src";

const draft: StyleDraft = { name: " Support ", line: "", prompt: " Write like a friendly support agent. ", keepsLists: false };
const mine: CustomStyle = { id: "u-abc123", name: "Support", line: "", prompt: "Write like a friendly support agent.", keepsLists: false };

describe("resolving a style id", () => {
  it("gives a built-in template as it is, and a style of the person's with its own prompt", () => {
    expect(resolveStyle("notes").prompt).toBe(TEMPLATES.notes.prompt);
    expect(resolveStyle("u-abc123", [mine])).toEqual({ id: "u-abc123", name: "Support", line: "", prompt: mine.prompt, keepsLists: false, keepsWords: false });
  });

  it("gives Tidy for a style that was deleted or never existed", () => {
    expect(resolveStyle("u-abc123", []).id).toBe("tidy");
    expect(resolveStyle("u-abc123", []).prompt).toBe(TEMPLATES.tidy.prompt);
    expect(resolveStyle("constructor").id).toBe("tidy");
  });

  it("lets a style of the person's skip the list-line check only when it does not keep lists, and always checks figures", () => {
    const keeps = { ...mine, keepsLists: true };
    expect(keepsFacts("- a\n- b", "a and b", "u-abc123", [mine])).toBe(true);
    expect(keepsFacts("- a\n- b", "a and b", "u-abc123", [keeps])).toBe(false);
    expect(keepsFacts("- a\n- b", "a and b", "u-abc123", [])).toBe(false);
    expect(keepsFacts("pay 5 now", "Pay 6 now", "u-abc123", [mine])).toBe(false);
  });
});

describe("the style form", () => {
  it("needs a name and an instruction, and refuses text over the limits", () => {
    expect(styleDraftError({ ...draft, name: "  " })).toBe("no-name");
    expect(styleDraftError({ ...draft, prompt: "" })).toBe("no-prompt");
    expect(styleDraftError({ ...draft, name: "n".repeat(41) })).toBe("name-too-long");
    expect(styleDraftError({ ...draft, line: "l".repeat(121) })).toBe("line-too-long");
    expect(styleDraftError({ ...draft, prompt: "p".repeat(601) })).toBe("prompt-too-long");
    expect(styleDraftError({ ...draft, name: "n".repeat(40), line: "l".repeat(120), prompt: "p".repeat(600) })).toBeUndefined();
  });

  it("saves a new style with trimmed text and a u- id, and replaces an existing one in place", () => {
    const [added] = saveStyle([], draft) ?? [];
    expect(added).toMatchObject({ name: "Support", line: "", prompt: "Write like a friendly support agent.", keepsLists: false });
    expect(added?.id).toMatch(/^u-[a-z0-9]{6,8}$/);
    const other = { ...mine, id: "u-other1", name: "Other" };
    expect(saveStyle([mine, other], { ...draft, name: "Support 2", keepsLists: true }, "u-abc123")).toEqual([{ ...mine, name: "Support 2", keepsLists: true }, other]);
  });

  it("refuses an invalid draft and a twenty-first style", () => {
    expect(saveStyle([], { ...draft, name: "" })).toBeUndefined();
    const full = Array.from({ length: 20 }, (_, i) => ({ ...mine, id: `u-s${i}` }));
    expect(saveStyle(full, draft)).toBeUndefined();
    expect(saveStyle(full, draft, "u-s3")).toHaveLength(20);
  });

  it("copies a built-in style into a form with a new name", () => {
    expect(copyOf(TEMPLATES.firm)).toEqual({ name: "Firm but polite copy", line: TEMPLATES.firm.line, prompt: TEMPLATES.firm.prompt, keepsLists: false });
    expect(copyOf({ ...TEMPLATES.firm, name: "n".repeat(40) }).name).toHaveLength(40);
  });
});

describe("deleting a style", () => {
  it("removes it, and a mode or the default that named it then gets Tidy", () => {
    const modes = [
      { ...defaultMode(), id: "m1", name: "Chat", template: "u-abc123" },
      { ...defaultMode(), id: "m2", name: "Mail", template: "email" },
    ];
    expect(styleUsers("u-abc123", modes, "u-abc123")).toEqual(["Apps in no mode", "Chat"]);
    expect(styleUsers("u-abc123", modes, "off")).toEqual(["Chat"]);
    expect(styleUsers("u-zzz", modes, "off")).toEqual([]);
    const left = removeStyle([mine], "u-abc123");
    expect(left).toEqual([]);
    expect(resolveStyle(modes[0]!.template, left).id).toBe("tidy");
  });
});
