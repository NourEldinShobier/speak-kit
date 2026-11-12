import { afterEach, describe, expect, it } from "vite-plus/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { launch, removeDir, type Launched } from "./harness";

const running: Launched[] = [];
const dirs: string[] = [];
const start = async (o: Parameters<typeof launch>[0] = {}) => {
  const l = await launch({ ...o, env: { SPEAKKIT_TEST: "1", ...o.env } });
  running.push(l);
  return l;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
  await Promise.all(dirs.splice(0).map(removeDir));
});

const ON = { setupDone: true, setupSkipped: false, preferredPort: 0, capture: { enabled: true, consented: true, target: "screen" } };
type Hook = { [k: string]: (...a: unknown[]) => Promise<unknown> };
const hook = <T>(l: Launched, fn: string, ...args: unknown[]) =>
  l.app.evaluate((_, [f, a]) => ((globalThis as unknown as { __speakkit: { capture: Hook } }).__speakkit.capture[f as string] as (...x: unknown[]) => unknown)(...(a as unknown[])) as T, [fn, args] as const);
const until = async (f: () => Promise<boolean>, ms = 15_000) => {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(await f()).toBe(true);
};
const open = async (l: Launched) => {
  await l.page.getByRole("link", { name: "Capture" }).click();
  await l.page.getByRole("heading", { name: "Capture", level: 1 }).waitFor();
};
const phase = async (l: Launched) => (await hook<{ session: { phase: string } }>(l, "state")).session.phase;

/** One whole capture with the scripted recorder: start, stop, wait until it is saved. */
async function record(l: Launched) {
  await hook(l, "start");
  await until(async () => (await phase(l)) === "recording");
  await hook(l, "stop");
  await until(async () => (await phase(l)) === "idle" && (await hook<{ items: unknown[] }>(l, "state")).items.length > 0);
}

describe("capture page", () => {
  it("shows the empty state, the three tabs and the capture key", async () => {
    const l = await start({ config: ON });
    await open(l);
    await l.page.getByText("No captures yet").waitFor();
    expect(await l.page.getByRole("tab").allTextContents()).toEqual(["Captures", "Settings", "Privacy"]);
    expect(await l.page.getByRole("button", { name: /Take a capture/ }).isEnabled()).toBe(true);
    await l.page.screenshot({ path: path.join(l.userData, "capture-empty.png") });
  });

  it("records, lists the capture, opens it, searches, and deletes it after a confirm", async () => {
    const l = await start({ config: ON });
    await open(l);
    await record(l);
    const row = l.page.getByTestId("capture-row");
    await row.first().waitFor();
    expect(await row.count()).toBe(1);
    expect(await l.page.getByText("Saved").first().isVisible() || (await l.page.getByText("Copied").first().isVisible())).toBe(true);
    // no microphone words in a scripted capture: the page says so
    await l.page.getByText("No words were saved").first().waitFor();
    await l.page.screenshot({ path: path.join(l.userData, "capture-list.png") });

    await l.page.getByRole("textbox", { name: "Search captures" }).fill("zzzz");
    await l.page.getByText("No captures match").waitFor();
    await l.page.getByRole("textbox", { name: "Search captures" }).fill("");

    await l.page.getByRole("button", { name: /^Open / }).click();
    await l.page.getByTestId("capture-detail").waitFor();
    await l.page.getByText("No narration was saved for this capture.").waitFor();
    await l.page.getByRole("button", { name: "Delete" }).click();
    await l.page.getByRole("dialog", { name: "Delete this capture?" }).waitFor();
    await l.page.getByRole("button", { name: /Move to/ }).click();
    await l.page.getByText("No captures yet").waitFor();
    expect((await hook<{ items: unknown[] }>(l, "state")).items).toEqual([]);
  });

  it("one capture at a time and a cancel returns to idle", async () => {
    const l = await start({ config: ON });
    await open(l);
    await hook(l, "start");
    await until(async () => (await phase(l)) === "recording");
    await hook(l, "start");
    expect(await phase(l)).toBe("recording");
    await hook(l, "discard");
    expect(await phase(l)).toBe("idle");
    expect((await hook<{ items: unknown[] }>(l, "state")).items).toEqual([]);
  });

  it("a recording with no frames says nothing was recorded and saves nothing", async () => {
    const l = await start({ config: ON });
    await open(l);
    await hook(l, "script", { frames: 0 });
    await hook(l, "start");
    await until(async () => (await phase(l)) === "recording");
    await hook(l, "stop");
    await l.page.getByText("Nothing was recorded").first().waitFor();
    expect((await hook<{ items: unknown[] }>(l, "state")).items).toEqual([]);
  });

  it("settings: turning capture off shows the banner, the keep time and the hotkey are saved", async () => {
    const l = await start({ config: ON });
    await open(l);
    await l.page.getByRole("tab", { name: "Settings" }).click();
    await l.page.getByTestId("capture-settings").waitFor();
    await l.page.getByRole("switch", { name: "Capture" }).click();
    await l.page.getByRole("tab", { name: "Captures" }).click();
    await l.page.getByText("Capture is off").waitFor();
    await l.page.getByRole("button", { name: "Turn on" }).click();
    await l.page.getByText("Capture is off").waitFor({ state: "detached" });
    await l.page.getByRole("tab", { name: "Settings" }).click();
    await l.page.getByRole("combobox", { name: "Keep captures" }).click();
    await l.page.getByRole("option", { name: "7 days" }).click();
    await until(async () => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8")).capture?.retentionDays === 7);
    await l.page.screenshot({ path: path.join(l.userData, "capture-settings.png") });
  });

  it("privacy tab says what is hidden and recorded", async () => {
    const l = await start({ config: ON });
    await open(l);
    await l.page.getByRole("tab", { name: "Privacy" }).click();
    await l.page.getByTestId("capture-privacy").waitFor();
    await l.page.getByText("The capsule, the picker and Speak Kit itself never appear in a capture.").waitFor();
    expect(await l.page.getByRole("checkbox", { name: "Hide Speak Kit windows from recordings" }).isChecked()).toBe(true);
  });

  it("first capture asks for consent", async () => {
    const l = await start({ config: { ...ON, capture: { ...ON.capture, consented: false } } });
    await open(l);
    await l.page.getByRole("dialog", { name: "Record your screen?" }).waitFor();
    await l.page.getByRole("button", { name: "Allow capture" }).click();
    await l.page.getByRole("dialog").waitFor({ state: "detached" });
    expect(JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8")).capture.consented).toBe(true);
  });
});

describe("recovery after a crash", () => {
  it("finishes an interrupted capture whose media was saved, removes one that had nothing, and says so", async () => {
    const userData = mkdtempSync(path.join(tmpdir(), "speakkit-capture-"));
    dirs.push(userData);
    const root = path.join(userData, "captures");
    for (const [id, stage, media] of [["cdone", "media-saved", "video.webm"], ["cempty", "recording", undefined]] as const) {
      mkdirSync(path.join(root, id, "frames"), { recursive: true });
      writeFileSync(path.join(root, id, "journal.json"), JSON.stringify({ id, stage, startedAt: Date.now() - 5000, ...(media && { media }) }));
      if (media) writeFileSync(path.join(root, id, media), "x");
    }
    const l = await start({ config: ON, userData });
    await open(l);
    await l.page.getByText("Captures recovered after Speak Kit closed unexpectedly").waitFor();
    await l.page.getByText("Recovered capture").waitFor();
    expect(existsSync(path.join(root, "cempty"))).toBe(false);
    expect(existsSync(path.join(root, "cdone", "video.webm"))).toBe(true);
  });
});

describe("experiments", () => {
  it("lists the Capture cards and turns the screenshot card on and off", async () => {
    const l = await start({ config: ON });
    await l.page.getByRole("link", { name: "Settings" }).click();
    await l.page.getByRole("link", { name: "Experiments" }).click();
    await l.page.getByRole("heading", { name: "Experiments" }).waitFor();
    const card = l.page.locator('[data-id="capture-screenshots"]');
    await card.getByText("Screenshots with a corner card").waitFor();
    await card.getByRole("button", { name: /Turn on/ }).click();
    await card.getByRole("button", { name: /Turn off/ }).waitFor();
    await until(async () => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8")).capture?.experiments?.screenshots === true);
    await card.getByRole("button", { name: /Turn off/ }).click();
    await card.getByRole("button", { name: /Turn on/ }).waitFor();
    await l.page.screenshot({ path: path.join(l.userData, "capture-experiments.png") });
  });
});
