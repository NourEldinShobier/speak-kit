import { afterEach, describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { launch, type Launched } from "./harness";

const running: Launched[] = [];
const start = async (o: Parameters<typeof launch>[0] = {}) => {
  const l = await launch({ ...o, env: { SPEAKKIT_TEST: "1", ...o.env } });
  running.push(l);
  return l;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
});

const DONE = { setupDone: true, setupSkipped: false, preferredPort: 0 };
const configOf = (l: Launched) => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8"));
const open = async (l: Launched) => {
  await l.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Engines" }).click();
  await l.page.getByRole("heading", { name: "Speech models" }).waitFor();
};
const shot = (l: Launched, name: string) => (process.env.SPEAKKIT_SHOTS ? l.page.screenshot({ path: path.join(process.env.SPEAKKIT_SHOTS, `${name}.png`) }) : Promise.resolve(undefined));

describe("Engines page", () => {
  it("lists both models with the one in use first, the language table, performance and disk space", async () => {
    const l = await start({ config: DONE });
    await open(l);
    const cards = l.page.locator("[data-testid^=model-card-]");
    expect(await cards.count()).toBe(2);
    expect(await cards.first().getAttribute("data-model")).toBe("large-v3-turbo-q5_0");
    const first = cards.first();
    expect(await first.getByText("In use").count()).toBe(1);
    expect(await first.getByText("File size", { exact: true }).count()).toBe(1);
    expect(await first.getByText("About 1 wrong word in 25 (English test)").count()).toBe(1);
    expect(await l.page.getByRole("heading", { name: "Best model for each language" }).count()).toBe(1);
    expect(await l.page.getByRole("table").getByRole("row").count()).toBeGreaterThan(5);
    expect(await l.page.getByRole("heading", { name: "Performance" }).count()).toBe(1);
    expect(await l.page.getByRole("heading", { name: "Disk space" }).count()).toBe(1);
    await shot(l, "engines-default");
  });

  it("controls are 36 px high, the cards show accuracy and speed bars and the Kokoro row says Ready", async () => {
    const l = await start({ config: DONE });
    await open(l);
    const height = async (loc: ReturnType<typeof l.page.locator>) => Math.round((await loc.boundingBox())!.height);
    expect(await height(l.page.getByRole("radiogroup", { name: "Show models" }))).toBe(36);
    expect(await height(l.page.getByRole("combobox", { name: "Language" }))).toBe(36);
    expect(await height(l.page.getByRole("combobox", { name: "Sort" }))).toBe(36);
    const first = l.page.locator("[data-testid^=model-card-]").first();
    expect(await first.getByRole("progressbar", { name: /^Accuracy of / }).getAttribute("aria-valuenow")).toBe("96");
    expect(await first.getByRole("progressbar", { name: /^Speed of / }).count()).toBe(1);
    expect(await l.page.locator("[data-engine=kokoro]").getByText("Ready").count()).toBe(1);
  });

  it("Compare models opens a table with one column per model, the test language in each accuracy cell, and closes with Escape", async () => {
    const l = await start({ config: DONE });
    await open(l);
    await l.page.getByRole("button", { name: "Compare models" }).click();
    const table = l.page.getByRole("region", { name: "Model comparison" });
    await table.waitFor();
    expect(await table.getByRole("columnheader").allTextContents()).toEqual(["", "Whisper Large v3 Turbo", "Parakeet v3"]);
    const accuracy = table.getByRole("row", { name: /^Accuracy/ });
    expect(await accuracy.getByRole("cell").allTextContents()).toEqual(["About 1 wrong word in 25 (English test)", "About 1 wrong word in 18 (English test)"]);
    await l.page.waitForTimeout(400); // the dialog fades in
    await shot(l, "engines-compare");
    await l.page.keyboard.press("Escape");
    await table.waitFor({ state: "detached" });
  });

  it("the Downloaded filter keeps the installed models and says how many are hidden", async () => {
    const l = await start({ config: DONE });
    await open(l);
    await l.page.getByRole("radio", { name: "Downloaded" }).click();
    expect(await l.page.locator("[data-testid^=model-card-]").count()).toBe(2); // both are on disk in the scripted engine
  });

  it("unload when idle is saved in the config and survives a restart of the page", async () => {
    const l = await start({ config: DONE });
    await open(l);
    await l.page.getByRole("combobox", { name: "Unload speech model when idle" }).click();
    await l.page.getByRole("option", { name: "After 30 minutes" }).click();
    await l.page.waitForFunction(() => true);
    await expect.poll(() => configOf(l).engines?.idleMinutes).toBe(30);
  });

  it("deleting a model asks first, says how much it frees, and removes it", async () => {
    const l = await start({ config: DONE });
    await open(l);
    await l.page.getByRole("button", { name: "Delete Parakeet v3" }).first().click();
    const dialog = l.page.getByRole("dialog");
    expect(await dialog.getByText("Delete Parakeet v3?").count()).toBe(1);
    expect(await dialog.getByText(/This frees 356 MB of disk space/).count()).toBe(1);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect(await l.page.getByRole("dialog").count()).toBe(0);
  });

  it("Advanced shows the detected hardware and the device choice", async () => {
    const l = await start({ config: DONE });
    await open(l);
    await l.page.getByRole("button", { name: /Advanced/ }).click();
    expect(await l.page.getByRole("combobox", { name: "Run speech on" }).count()).toBe(1);
    await shot(l, "engines-advanced");
  });

  it("holds at the 960 px narrow window: the cards stack and nothing scrolls sideways", async () => {
    const l = await start({ config: DONE });
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 800));
    await open(l);
    const overflow = await l.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(l, "engines-960");
  });
});

describe("Setup: dictation step", () => {
  it("opens again on the dictation step with a live checklist, then asks for a language and picks the model that fits", async () => {
    const l = await start({ config: { setupDone: false, setupStep: 2, preferredPort: 0 } });
    await l.page.getByRole("heading", { name: "Welcome back" }).waitFor();
    const list = l.page.getByRole("region", { name: "Setup checklist" });
    expect(await list.getByText("Microphone", { exact: true }).count()).toBe(1);
    expect(await list.getByText("Hotkey", { exact: true }).count()).toBe(1);
    expect(await list.getByText("Speech model", { exact: true }).count()).toBe(1);
    await shot(l, "setup-welcome-back");
    await l.page.getByRole("button", { name: "Continue" }).click();
    await l.page.getByRole("heading", { name: "Try dictation here" }).waitFor(); // the model is installed: on to the practice
    await shot(l, "setup-practice");
    expect(await l.page.getByRole("textbox", { name: "Practice field" }).count()).toBe(1);
    expect(await l.page.getByRole("button", { name: "Continue" }).isDisabled()).toBe(true); // until something was dictated
    await l.page.getByRole("heading", { name: "Try dictation here" }).waitFor();
    // Practice does not say it is the person's turn before the hotkey listener is live: either the wait line shows or the pill hint does, never both.
    const waiting = await l.page.getByText("Getting the hotkey ready").count();
    const hint = await l.page.getByText("This pill appears near the bottom of your screen").count();
    expect(waiting + hint).toBe(1);
    await expect.poll(() => configOf(l).setupStep).toBe(2);
  });

  it("asks for a language first, pre-selects the system language and downloads nothing when it is chosen", async () => {
    const l = await start({ config: { setupDone: false, setupStep: 1, preferredPort: 0 } });
    await l.page
      .getByRole("button", { name: /Continue/ })
      .first()
      .click();
    await l.page.getByRole("heading", { name: "Choose your language" }).waitFor();
    expect(await l.page.getByRole("radio", { name: "English" }).isChecked()).toBe(true);
    expect(await l.page.getByText(/Uses Parakeet v3, 356 MB/).count()).toBe(1);
    expect(await l.page.getByText(/Uses Whisper Large v3 Turbo, 574 MB/).count()).toBeGreaterThan(0);
    await shot(l, "setup-language");
    await l.page.locator("label", { hasText: "German" }).first().click();
    expect(await l.page.getByRole("radio", { name: "German" }).isChecked()).toBe(true);
    await l.page.getByRole("button", { name: "Continue" }).click();
    await l.page.getByRole("heading", { name: "Try dictation here" }).waitFor();
    expect(configOf(l).dictation.language).toBe("de");
  });

  it("Skip dictation goes on to the browser step and remembers that no model was chosen", async () => {
    const l = await start({ config: { setupDone: false, setupStep: 0, preferredPort: 0 } });
    await l.page
      .getByRole("button", { name: /Get started|Continue/ })
      .first()
      .click();
    await l.page
      .getByRole("button", { name: /Continue/ })
      .first()
      .click();
    await l.page.getByRole("heading", { name: "Choose your language" }).waitFor();
    await l.page.getByRole("button", { name: "Skip dictation" }).click();
    await l.page.getByRole("heading", { name: /Connect/ }).waitFor();
    expect(configOf(l).engines.skippedModel).toBe(true);
  });
});

describe("About: Run setup again", () => {
  it("shows the setup window again from the model step and keeps downloaded models and settings", async () => {
    const l = await start({ config: { ...DONE, dictation: { language: "de" } } });
    await l.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
    await l.page.getByRole("link", { name: "About" }).click();
    await l.page.getByRole("button", { name: "Run setup again" }).click();
    await l.page
      .getByRole("heading", { name: /Download|Kokoro/ })
      .first()
      .waitFor();
    await expect.poll(() => configOf(l).setupDone).toBe(false);
    expect(configOf(l).dictation.language).toBe("de");
  });
});

/** A proxy that answers every plain request with the host it was asked for, and a server for the PAC script that points at it. */
async function proxyAndPac() {
  const proxy = http.createServer((req, res) => res.end(`via proxy: ${req.url}`));
  await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
  const proxyPort = (proxy.address() as AddressInfo).port;
  const pac = http.createServer((_req, res) => res.end(`function FindProxyForURL() { return "PROXY 127.0.0.1:${proxyPort}"; }`));
  await new Promise<void>((r) => pac.listen(0, "127.0.0.1", r));
  const pacPort = (pac.address() as AddressInfo).port;
  return { proxyPort, pacPort, close: () => (proxy.close(), pac.close()) };
}

describe("Model downloads use the system proxy", () => {
  const through = (l: Launched) => l.app.evaluate(({ net }) => net.fetch("http://models.proxy-test.invalid/ggml.bin").then((r) => r.text()));

  it("goes through a manual proxy", async () => {
    const p = await proxyAndPac();
    try {
      const l = await start({ config: DONE, args: [`--proxy-server=127.0.0.1:${p.proxyPort}`] });
      expect(await through(l)).toBe("via proxy: http://models.proxy-test.invalid/ggml.bin");
    } finally {
      p.close();
    }
  });

  it("goes through the proxy a PAC script names", async () => {
    const p = await proxyAndPac();
    try {
      const l = await start({ config: DONE, args: [`--proxy-pac-url=http://127.0.0.1:${p.pacPort}/proxy.pac`] });
      expect(await through(l)).toBe("via proxy: http://models.proxy-test.invalid/ggml.bin");
    } finally {
      p.close();
    }
  });
});
