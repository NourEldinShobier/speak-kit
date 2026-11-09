import { button, h, icon } from "@speakkit/ui/vanilla";
import type { Shell } from "../../shared/ui-types";

const POINTS: [icon: "user" | "shield-check" | "circle-check", text: string][] = [
  ["user", "Your voice and the page text go to your provider, OpenAI. They need an API key, which you add in the Speak Kit app."],
  ["shield-check", "Speak Kit has no server and stores nothing."],
  ["circle-check", "You can end the conversation any time."],
];

/** The first-use card: what leaves the computer and where it goes. Resolves true on "Start talking", false on "Not now", Escape or the close button. */
export function askConsent(shell: Shell): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      card.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(ok);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      done(false);
    };
    const close = h("button", { type: "button", class: "lm-btn lm-btn--icon lm-btn--ghost lm-btn--sm sk-vc-x", "aria-label": "Close" }, icon("x", 14));
    close.addEventListener("click", () => done(false));
    const start = button({ variant: "primary", label: "Start talking", onClick: () => done(true) });
    start.dataset.sk = "voice-consent-start";
    const later = button({ variant: "secondary", label: "Not now", onClick: () => done(false) });
    later.dataset.sk = "voice-consent-later";
    const card = h(
      "div",
      { class: "lm-popover sk-vc-card", role: "dialog", "aria-labelledby": "sk-vc-title", "data-sk": "voice-consent" },
      h(
        "div",
        { class: "sk-vc-head" },
        h("div", {}, h("div", { class: "sk-vc-title", id: "sk-vc-title" }, "Talk about this page"), h("div", { class: "sk-vc-sub" }, "Ask out loud, hear the answer.")),
        close,
      ),
      ...POINTS.map(([i, t]) => h("div", { class: "sk-vc-row" }, icon(i, 16), h("span", {}, t))),
      h("div", { class: "sk-vc-foot" }, later, start),
    );
    document.addEventListener("keydown", onKey, true);
    shell.root.append(card);
    start.focus({ preventScroll: true });
  });
}
