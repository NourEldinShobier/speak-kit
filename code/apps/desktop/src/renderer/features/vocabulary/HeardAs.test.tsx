import { parseHTML } from "linkedom";
import { act } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Term } from "@speakkit/dictation";
import type { DictationStatus } from "../../../shared/dictation/contract";

const patched = vi.hoisted(() => [] as { terms?: Term[] }[]);
vi.mock("../dictation-bridge", () => ({ patchDictation: async (p: { terms?: Term[] }) => void patched.push(p) }));
// The switch needs a browser's form elements, which the fake DOM lacks: this stands in for it.
vi.mock("@speakkit/ui", async (original) => ({
  ...(await original<typeof import("@speakkit/ui")>()),
  Toggle: (p: { "aria-label"?: string }) => <button aria-label={p["aria-label"]} />,
}));
const { HeardAs } = await import("./HeardAs");
const { createRoot } = await import("react-dom/client");

const saved: Term = { id: "w", word: "Kubernetes", soundsLike: ["cooper netties"], app: "code", matchCase: true };
const suggestion: Term = { id: "s", word: "Claude Code", soundsLike: ["cloud code"], suggested: true, learned: { heard: "cloud code", count: 1, createdAt: 1 } };

async function mount(terms: Term[]) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true });
  for (const k of Object.getOwnPropertyNames(window)) if (/^[A-Z]/.test(k) && !(k in globalThis)) (globalThis as Record<string, unknown>)[k] = (window as unknown as Record<string, unknown>)[k];
  const s = { settings: { terms, prompt: true, model: "large-v3-turbo-q5_0" }, models: [] } as unknown as DictationStatus;
  patched.length = 0;
  await act(async () => createRoot(document.getElementById("root")!).render(<HeardAs s={s} onImport={() => undefined} />));
  return document;
}

const headings = (d: Document) => [...d.querySelectorAll("h3")].map((h) => h.textContent);

describe("the Vocabulary page body", () => {
  it("has one list of words and the prompt card, and no Replacements or Corrections section", async () => {
    const d = await mount([saved]);
    expect(headings(d)).toEqual(["Words and names", "Speech model prompt"]);
    expect(d.body.textContent).not.toContain("Replacements");
    expect(d.body.textContent).not.toContain("Corrections");
    expect(d.querySelector('[aria-label="Replacement rules"]')).toBeNull();
  });

  it("shows where a word applies and its options beside the word", async () => {
    const d = await mount([saved]);
    const row = d.querySelector("[data-term=w]");
    expect(row?.textContent).toContain("Kubernetes");
    expect(row?.textContent).toContain("Only in code.exe. Matches capitals");
    expect(row?.textContent).toContain("cooper netties");
  });

  it("marks a word that was learned from a fix, and no other", async () => {
    const learned: Term = { id: "l", word: "Claude Code", soundsLike: ["cloud code"], learned: { heard: "cloud code", count: 1, createdAt: 1 } };
    const d = await mount([saved, learned]);
    expect(d.querySelector("[data-term=l] .lm-badge")?.textContent).toBe("Learned");
    expect(d.querySelector("[data-term=w] .lm-badge")).toBeNull();
    expect(d.querySelector("[data-term=l]")?.textContent).not.toContain("Seen");
  });

  it("puts the suggested fixes at the top, with how often each was seen", async () => {
    const d = await mount([saved, suggestion]);
    expect(headings(d)).toEqual(["Suggested", "Words and names", "Speech model prompt"]);
    expect(d.querySelector("[data-term=s]")?.textContent).toContain("cloud codeClaude Codeseen once");
    expect(d.querySelector('[aria-label="Your words"] [data-term=s]')).toBeNull();
  });

  it("uses a suggestion: it becomes a saved word and the rest of the list stays", async () => {
    const d = await mount([saved, suggestion]);
    await act(async () => (d.querySelector('[aria-label="Use the suggestion cloud code"]') as HTMLElement).click());
    expect(patched).toHaveLength(1);
    expect(patched[0]?.terms?.map((t) => [t.id, t.word, !!t.suggested])).toEqual([
      ["w", "Kubernetes", false],
      ["s", "Claude Code", false],
    ]);
  });

  it("dismisses a suggestion without touching the saved words", async () => {
    const d = await mount([saved, suggestion]);
    await act(async () => (d.querySelector('[aria-label="Dismiss the suggestion cloud code"]') as HTMLElement).click());
    expect(patched[0]?.terms).toEqual([saved]);
  });

  it("shows no Suggested group when there is nothing to suggest, and says so for a fix that already applies", async () => {
    expect(headings(await mount([saved]))).not.toContain("Suggested");
    const twice = { ...suggestion, learned: { heard: "cloud code", count: 2, createdAt: 1 } };
    expect((await mount([twice])).querySelector("[data-term=s]")?.textContent).toContain("seen 2 times, already applied");
  });
});
