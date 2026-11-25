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

const mine = { id: "u-abc123", name: "Support", line: "For customers", prompt: "Be kind.", keepsLists: false };
const status = (settings: { enabled: boolean; rewriteDefault?: string; styles?: unknown[] }) =>
  ({
    rewriteKey: true,
    settings: { rewrite: { enabled: settings.enabled }, rewriteWriter: "openai", rewriteDefault: settings.rewriteDefault ?? "off", styles: settings.styles ?? [], modes: [] },
  }) as unknown as DictationStatus;
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

  it("lets the style for apps in no mode be chosen from the built-in styles", () => {
    const h = html(status({ enabled: true, rewriteDefault: "email" }));
    expect(h).toContain('<button aria-label="Style for apps in no mode">Email</button>');
    expect(h).toContain("<li>Off: the text is pasted as you said it</li>");
    expect(h).toContain("<li>Notes: Brief lines and lists. For Notion, Obsidian and meeting jottings.</li>");
  });

  it("lists the built-in styles to copy and the person's own to edit or delete", () => {
    const h = html(status({ enabled: true, styles: [mine] }));
    expect(h.match(/>Duplicate</g)).toHaveLength(11);
    expect(h).toContain("Professional reply");
    expect(h).toContain("<li>Support: For customers (your style)</li>");
    expect(h.match(/>Edit</g)).toHaveLength(1);
    expect(h.match(/>Delete</g)).toHaveLength(1);
    expect(h).toContain("Add style");
  });

  it("shows the default style as Tidy when the style it names was deleted", () => {
    expect(html(status({ enabled: true, rewriteDefault: "u-abc123" }))).toContain('<button aria-label="Style for apps in no mode">Tidy</button>');
    expect(html(status({ enabled: true, rewriteDefault: "u-abc123", styles: [mine] }))).toContain('<button aria-label="Style for apps in no mode">Support</button>');
  });

  it("shows no styles until the pass is on", () => {
    const t = text(status({ enabled: false }));
    expect(t).not.toContain("Writing styles");
    expect(t).toContain("Set up");
  });
});
