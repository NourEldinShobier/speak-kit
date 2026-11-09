import { describe, expect, it } from "vite-plus/test";
import { MAX_PAGE_CHARS, buildInstructions } from "./page";

const page = { url: "https://example.com/a", title: "The Long Harbor", text: "The harbor wakes before the first ferry." };

describe("buildInstructions", () => {
  it("puts the system prompt, the title, the address and the text in the instructions", () => {
    const r = buildInstructions(page);
    expect(r.ok).toBe(true);
    const text = r.ok ? r.instructions : "";
    expect(text).toContain("Answer in one to three short spoken sentences");
    expect(text).toContain("Page title: The Long Harbor");
    expect(text).toContain("Page address: https://example.com/a");
    expect(text).toContain('Page text:\n"""\nThe harbor wakes before the first ferry.\n"""');
    expect(text).not.toContain("selected this text");
  });

  it("adds the selection as the focus", () => {
    const r = buildInstructions({ ...page, selection: "  the first ferry " });
    expect(r.ok && r.instructions).toContain('Treat it as the focus of the conversation:\n"""\nthe first ferry\n"""');
  });

  it("refuses a page over the cap, but a selection takes its place", () => {
    const big = { ...page, text: "x".repeat(MAX_PAGE_CHARS + 1) };
    expect(buildInstructions(big)).toEqual({ ok: false, problem: "too-long" });
    const r = buildInstructions({ ...big, selection: "just this" });
    expect(r.ok && r.instructions).toContain("only the selected text above is available");
    expect(r.ok && r.instructions).not.toContain("xxxxxxxx");
  });

  it("accepts a page exactly at the cap", () => {
    expect(buildInstructions({ ...page, text: "x".repeat(MAX_PAGE_CHARS) }).ok).toBe(true);
  });

  it("reports a page with no text as unreadable", () => {
    expect(buildInstructions({ ...page, text: "   " })).toEqual({ ok: false, problem: "unreadable" });
  });
});
