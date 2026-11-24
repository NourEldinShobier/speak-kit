import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { SelectProps } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";

// Radix needs a browser's layout, which static markup lacks: this stands in for the Select with the same props.
vi.mock("@speakkit/ui", async (original) => ({
  ...(await original<typeof import("@speakkit/ui")>()),
  Select: ({ label, value, options, renderValue }: SelectProps) => (
    <div>
      <button aria-label={label}>{renderValue ? renderValue(options.find((o) => o.value === value)) : value}</button>
      <ul aria-label={`${label} options`}>
        {options.map((o) => (
          <li key={o.value}>{o.label}</li>
        ))}
      </ul>
    </div>
  ),
}));
vi.mock("../dictation-bridge", () => ({ patchDictation: () => Promise.resolve() }));
vi.mock("../engines", () => ({ useSpeechModels: () => ({ view: null }), models: {} }));
const { RewriteCard } = await import("./RewriteCard");

const status = (settings: { enabled: boolean; rewriteDefault?: string }) =>
  ({ rewriteKey: true, settings: { rewrite: { enabled: settings.enabled }, rewriteWriter: "openai", rewriteDefault: settings.rewriteDefault ?? "off" } }) as unknown as DictationStatus;
const html = (s: DictationStatus) => renderToStaticMarkup(<RewriteCard s={s} />);
const text = (s: DictationStatus) =>
  html(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("the rewrite card", () => {
  it("has no time limit, and says the person can skip the wait", () => {
    const t = text(status({ enabled: true }));
    expect(t).not.toContain("Give up after");
    expect(t).not.toContain("Gives up after");
    expect(t).toContain("While it works you can skip it and the text is pasted as you said it.");
  });

  it("lists the eight writing styles and lets the style for apps in no mode be chosen", () => {
    const h = html(status({ enabled: true, rewriteDefault: "email" }));
    expect(h).toContain("Writing styles: Tidy (default), Exact, Message, Email, Formal, Notes, Concise, Technical.");
    expect(h).toContain('<button aria-label="Style for apps in no mode">Email</button>');
    expect(h).toContain("<li>Off: the text is pasted as you said it</li>");
    expect(h).toContain("<li>Notes: Brief lines and lists. For Notion, Obsidian and meeting jottings.</li>");
  });

  it("shows no styles until the pass is on", () => {
    const t = text(status({ enabled: false }));
    expect(t).not.toContain("Writing styles");
    expect(t).toContain("Set up");
  });
});
