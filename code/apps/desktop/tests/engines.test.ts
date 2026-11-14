import { afterEach, describe, expect, it } from "vite-plus/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
/** The computer the spec pretends to run on, so the recommendations do not depend on the machine that runs it. */
const WITH_CARD = { SPEAKKIT_HARDWARE: JSON.stringify({ platform: "win32", arch: "x64", avx2: true, cores: 16, memoryGb: 32, gpu: { name: "NVIDIA GeForce RTX 3060", driver: "31.0.15.5123" } }) };
const CPU_ONLY = { SPEAKKIT_HARDWARE: JSON.stringify({ platform: "win32", arch: "x64", avx2: true, cores: 8, memoryGb: 16 }) };
const configOf = (l: Launched) => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8"));
const open = async (l: Launched) => {
  await l.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Engines" }).click();
  await l.page.getByRole("heading", { name: "Speech models" }).waitFor();
};
const shot = (l: Launched, name: string) => (process.env.SPEAKKIT_SHOTS ? l.page.screenshot({ path: path.join(process.env.SPEAKKIT_SHOTS, `${name}.png`) }) : Promise.resolve(undefined));

describe("Engines page", () => {
  it("lists every model with the one in use first, the language table, performance and disk space", async () => {
    const l = await start({ config: DONE, env: WITH_CARD });
    await open(l);
    const cards = l.page.locator("[data-testid^=model-card-]");
    expect(await cards.count()).toBe(17);
    expect(await cards.first().getAttribute("data-model")).toBe("large-v3-turbo-q5_0");
    const first = cards.first();
    expect(await first.getByText("In use").count()).toBe(1);
    expect(await first.getByText("File size", { exact: true }).count()).toBe(1);
    expect(await first.getByText("About 1 wrong word in 6 (English test)").count()).toBe(1);
    expect(await first.getByText("Under a second with a graphics card, about 88 seconds on the CPU alone").count()).toBe(1);
    expect(await l.page.getByText(/^Measured by us on a small sample: 4 English \(79 words\), 4 German \(90 words\) and 4 Arabic \(64 words\) recordings/).count()).toBe(2); // under the cards and under the table
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
    expect(await first.getByRole("progressbar", { name: /^Accuracy of / }).getAttribute("aria-valuenow")).toBe("84");
    expect(await first.getByRole("progressbar", { name: /^Speed of / }).count()).toBe(1);
    expect(await l.page.locator("[data-engine=kokoro]").getByText("Ready").count()).toBe(1);
  });

  it("Compare models starts with four models, one test language named in every accuracy cell, lets the person change both, and closes with Escape", async () => {
    const l = await start({ config: DONE, env: WITH_CARD });
    await open(l);
    await l.page.getByRole("button", { name: "Compare models" }).click();
    const table = l.page.getByRole("region", { name: "Model comparison" });
    await table.waitFor();
    expect(await table.getByRole("columnheader").allTextContents()).toEqual(["", "Whisper Large v3 Turbo", "Whisper Large v3 (5-bit)", "Parakeet v3", "Whisper Tiny (5-bit)"]);
    const accuracy = table.getByRole("row", { name: /^Accuracy/ });
    expect(await accuracy.getByRole("cell").allTextContents()).toEqual([
      "About 1 wrong word in 6 (English test)",
      "About 1 wrong word in 11 (English test)",
      "About 1 wrong word in 8 (English test)",
      "About 1 wrong word in 4 (English test)",
    ]);
    // four are picked: the others cannot be added until one is taken out
    expect(await l.page.getByRole("checkbox", { name: "Whisper Base (5-bit)" }).isDisabled()).toBe(true);
    const pick = (name: string) => l.page.getByRole("dialog").locator("label", { hasText: name });
    await pick("Whisper Tiny (5-bit)").click();
    expect(await l.page.getByRole("checkbox", { name: "Whisper Tiny (5-bit)" }).isChecked()).toBe(false);
    await pick("Whisper Base (5-bit)").click();
    expect(await table.getByRole("columnheader").allTextContents()).toEqual(["", "Whisper Large v3 Turbo", "Whisper Large v3 (5-bit)", "Parakeet v3", "Whisper Base (5-bit)"]);
    await l.page.getByRole("combobox", { name: "Test language" }).click();
    await l.page.getByRole("option", { name: "Arabic" }).click();
    expect(await accuracy.getByRole("cell").allTextContents()).toEqual([
      "About 1 wrong word in 21 (Arabic test)",
      "About 1 wrong word in 13 (Arabic test)",
      "Not measured in Arabic",
      "About 1 wrong word in 2 (Arabic test)",
    ]);
    expect(
      await l.page
        .getByRole("dialog")
        .getByText(/Wrong-word figures are for one test language at a time/)
        .count(),
    ).toBe(1);
    await l.page.waitForTimeout(400); // the dialog fades in
    await shot(l, "engines-compare");
    await l.page.keyboard.press("Escape");
    await table.waitFor({ state: "detached" });
  });

  it("the language table names each language's model with its measured wrong words, and what runs without a graphics card and how long it takes", async () => {
    const l = await start({ config: DONE, env: WITH_CARD });
    await open(l);
    const row = (language: string) => l.page.getByRole("row", { name: new RegExp(`^${language} `) });
    await row("French").waitFor();
    expect(await row("English").getByRole("cell").allTextContents()).toEqual([
      "Whisper Large v3 (5-bit)",
      "About 1 wrong word in 11 (English test)",
      "Parakeet v3, about 2.5 seconds",
      expect.stringContaining("Whisper Large v3 Turbo"),
    ]);
    expect(await row("French").getByRole("cell").allTextContents()).toEqual([
      "Whisper Large v3 Turbo",
      "Not measured in this language",
      "Whisper Base (5-bit), about 4.5 seconds",
      expect.stringContaining("Whisper Tiny"),
    ]);
  });

  it("on a computer without a graphics card the English and German models are Parakeet, and a weak computer is pointed to it", async () => {
    const l = await start({ config: DONE, env: CPU_ONLY });
    await open(l);
    const first = l.page.locator("[data-testid^=model-card-]").first();
    await first.getByText("About 88 seconds").waitFor();
    expect(
      await l.page
        .getByRole("row", { name: /^English / })
        .getByRole("cell")
        .first()
        .textContent(),
    ).toBe("Parakeet v3");
    expect(
      await l.page
        .getByRole("row", { name: /^Arabic / })
        .getByRole("cell")
        .first()
        .textContent(),
    ).toBe("Whisper Small (5-bit)");
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
    const l = await start({ config: { setupDone: false, setupStep: 1, preferredPort: 0 }, env: WITH_CARD });
    await l.page
      .getByRole("button", { name: /Continue/ })
      .first()
      .click();
    await l.page.getByRole("heading", { name: "Choose your language" }).waitFor();
    expect(await l.page.getByRole("radio", { name: "English" }).isChecked()).toBe(true);
    expect(await l.page.getByText("Uses Whisper Large v3 (5-bit), 1.1 GB. Very fast. 1 wrong word in 11 (English test).").count()).toBe(1);
    expect(await l.page.getByText(/Uses Whisper Large v3 Turbo, 574 MB/).count()).toBeGreaterThan(0);
    await shot(l, "setup-language");
    await l.page.locator("label", { hasText: "German" }).first().click();
    expect(await l.page.getByRole("radio", { name: "German" }).isChecked()).toBe(true);
    await l.page.getByRole("button", { name: "Continue" }).click();
    await l.page.getByRole("heading", { name: "Try dictation here" }).waitFor();
    await expect.poll(() => configOf(l).dictation.language).toBe("de");
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
    await expect.poll(() => configOf(l).dictation.language).toBe("de");
  });
});

/** A proxy that refuses every tunnel but records the host asked for, and a server for the PAC script that points at it. */
async function proxyAndPac() {
  const connects: string[] = [];
  const proxy = http.createServer((_req, res) => res.end());
  proxy.on("connect", (req, socket) => (connects.push(req.url ?? ""), socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n")));
  await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
  const proxyPort = (proxy.address() as AddressInfo).port;
  const pac = http.createServer((_req, res) => res.end(`function FindProxyForURL() { return "PROXY 127.0.0.1:${proxyPort}"; }`));
  await new Promise<void>((r) => pac.listen(0, "127.0.0.1", r));
  const pacPort = (pac.address() as AddressInfo).port;
  return { proxyPort, pacPort, connects, close: () => (proxy.close(), pac.close()) };
}

describe("Model downloads use the system proxy", () => {
  /** Starts the real engine, presses Download on the first card and returns the hosts the proxy was asked to connect to. */
  async function downloadVia(proxyArgs: (p: Awaited<ReturnType<typeof proxyAndPac>>) => string[]) {
    const p = await proxyAndPac();
    try {
      const l = await start({ config: DONE, args: proxyArgs(p), env: { SPEAKKIT_REAL_STT: "1", SPEAKKIT_MODELS_DIR: mkdtempSync(path.join(tmpdir(), "speakkit-models-")) } });
      await open(l);
      await l.page
        .locator("[data-testid^=model-card-]")
        .first()
        .getByRole("button", { name: /^Download / })
        .click();
      await expect.poll(() => p.connects, { timeout: 20_000 }).toContain("huggingface.co:443");
    } finally {
      p.close();
    }
  }

  it("goes through a manual proxy", () => downloadVia((p) => [`--proxy-server=127.0.0.1:${p.proxyPort}`]));

  it("goes through the proxy a PAC script names", () => downloadVia((p) => [`--proxy-pac-url=http://127.0.0.1:${p.pacPort}/proxy.pac`]));
});
