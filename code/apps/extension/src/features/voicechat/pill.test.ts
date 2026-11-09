import type { VoiceView } from "@speakkit/protocol";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { Shell } from "../../shared/ui-types";
import { installDom } from "../../testing/dom";
import { VoicePill } from "./pill";

let root: HTMLElement;
let pill: VoicePill;
beforeEach(() => {
  installDom();
  Object.assign(globalThis, { matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) }); // reduced motion: no timers
  root = document.createElement("div");
  document.body.append(root);
  const shell: Shell = { host: root, root, width: 1280, height: 720, popover: null, togglePopover: () => {}, closePopover: () => {}, placeHostAfter: () => {} };
  pill = new VoicePill(shell, { mute() {}, end() {}, act() {} });
});
afterEach(() => vi.useRealTimers());

const view = (phase: VoiceView["phase"], more: Partial<VoiceView> = {}): VoiceView => ({ phase, muted: false, ...more });
const shown = () => root.querySelector("[data-sk=voice-pill]")?.getAttribute("data-phase");
const live = () => root.querySelector("[data-sk=voice-live]");

describe("the page-changed notice", () => {
  test("replaces the grid in every phase where the user is talking", () => {
    for (const phase of ["listening", "idle", "thinking", "speaking"] as const) {
      pill.render(view(phase), "page-changed");
      expect(shown()).toBe("problem");
      expect(root.querySelector("[data-sk=voice-text]")?.textContent).toBe("Page changed");
    }
  });

  test("never covers a warning, a reconnect, a connect or an error", () => {
    pill.render(view("idle-warning", { secondsLeft: 20 }), "page-changed");
    expect(shown()).toBe("idle-warning");
    pill.render(view("reconnecting", { attempt: 2 }), "page-changed");
    expect(shown()).toBe("reconnecting");
    pill.render(view("connecting"), "page-changed");
    expect(shown()).toBe("connecting");
    pill.render(view("ended", { problem: "offline" }), "page-changed");
    expect(root.querySelector("[data-sk=voice-text]")?.textContent).toBe("You are offline");
    pill.render(view("idle"), "page-changed"); // back to talking: the notice comes back
    expect(root.querySelector("[data-sk=voice-text]")?.textContent).toBe("Page changed");
  });
});

describe("the live region", () => {
  test("is one element outside the pill that survives every rebuild and says each change", () => {
    pill.render(view("idle"));
    const region = live();
    expect(region?.getAttribute("role")).toBe("status");
    expect(root.querySelector("[data-sk=voice-pill]")?.contains(region)).toBe(false);
    expect(region?.textContent).toBe("Ready. Say something.");
    const said: string[] = [];
    for (const [v, n] of [
      [view("idle-warning", { secondsLeft: 30 }), undefined],
      [view("reconnecting", { attempt: 1 }), undefined],
      [view("ended", { problem: "no-credit" }), undefined],
      [view("ended"), undefined],
      [view("idle"), "page-changed" as const],
    ] as const) {
      pill.render(v, n);
      expect(live()).toBe(region);
      said.push(region?.textContent ?? "");
    }
    expect(said).toEqual(["Still there?", "Reconnecting, 1 of 5", "No credit left", "Conversation ended", "Page changed"]);
  });

  test("goes away with the pill", () => {
    pill.render(view("idle"));
    pill.destroy();
    expect(live()).toBeNull();
  });
});
