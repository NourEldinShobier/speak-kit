import { beforeEach, describe, expect, test } from "vite-plus/test";
import type { Shell } from "../../shared/ui-types";
import { installDom } from "../../testing/dom";
import { askConsent } from "./consent";

let root: HTMLElement;
let shell: Shell;
beforeEach(() => {
  installDom();
  root = document.createElement("div");
  document.body.append(root);
  shell = { host: root, root, width: 1280, height: 720, popover: null, togglePopover: () => {}, closePopover: () => {}, placeHostAfter: () => {} };
});

const escape = () => document.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" })); // linkedom's KeyboardEvent ignores `key`
const card = () => root.querySelector("[data-sk=voice-consent]");

describe("askConsent", () => {
  test("says what is sent: the voice, the page text and address, billing to the user's account", async () => {
    const ask = askConsent(shell, new AbortController().signal);
    const text = card()?.textContent ?? "";
    expect(text).toContain("Your voice and the page text go to your provider, OpenAI");
    expect(text).toContain("page address");
    expect(text).toContain("sent again if the connection is restored");
    expect(text).toContain("bills conversations to your account");
    (root.querySelector("[data-sk=voice-consent-start]") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(await ask).toBe(true);
    expect(card()).toBeNull();
  });

  test("an abort (the conversation was toggled or ended while the card is open) settles it as declined and removes the card", async () => {
    const abort = new AbortController();
    const ask = askConsent(shell, abort.signal);
    expect(card()).not.toBeNull();
    abort.abort();
    expect(await ask).toBe(false);
    expect(card()).toBeNull();
    abort.abort(); // a second abort does nothing
  });

  test("Escape declines and stops listening: a later Escape is not swallowed", async () => {
    const ask = askConsent(shell, new AbortController().signal);
    escape();
    expect(await ask).toBe(false);
    let seen = false;
    document.addEventListener("keydown", () => (seen = true), true);
    escape();
    expect(seen).toBe(true);
  });

  test("a signal that is already aborted never shows the card", async () => {
    const abort = new AbortController();
    abort.abort();
    expect(await askConsent(shell, abort.signal)).toBe(false);
    expect(card()).toBeNull();
  });
});
