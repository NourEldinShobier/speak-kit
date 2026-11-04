import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { GROUPS, type Scenario } from "./scenarios";
import { DONE, home, settings, press, type Opts } from "./desktop";
import { READ, hook, libraryWith, windowShot } from "./desktop-app";
import { sleep } from "./support";

// Screens of the Lockix pass that need their own states: update pill and card, mini player and tray panel states, collapsed sidebar, in-app toast.
// Native OS toasts (I4, I12, J7) are drawn by the system and cannot be captured here.

const SY = GROUPS.system;
const UPD = { SPEAKKIT_FAKE_UPDATE: "0.2.0" };
const toReady = async (p: Page) => {
  await settings("About")(p);
  await p.getByRole("button", { name: "Check for updates" }).click();
  await p.getByTestId("update-ready").waitFor();
};
const openPill = async (p: Page) => {
  await toReady(p);
  await p.getByTestId("update-pill").click();
  await p.getByRole("dialog").waitFor();
};
const status = (w: Page, s: string) => w.waitForFunction((v) => document.querySelector("[data-testid=mini]")?.getAttribute("data-status") === v, s);
const miniAfter = (s: string, then?: (w: Page) => Promise<void>) => async (w: Page) => {
  await status(w, s);
  await then?.(w);
};
const read = (app: Parameters<Parameters<typeof windowShot>[5]>[0]) => hook(app, "readText", READ).then(() => undefined);
const note = "Exporting is simple. Each sentence is rendered once. Then the file is saved.";
const startExport = async (p: Page) => {
  await p.getByRole("button", { name: "New reading" }).click();
  await p.getByRole("textbox", { name: "Text to read" }).fill(note);
  await p.getByRole("button", { name: "Export audio" }).click();
  await p.getByRole("dialog", { name: "Export audio" }).waitFor();
  await p.getByRole("textbox", { name: "File name" }).fill("My note");
  await p.getByRole("button", { name: "Export", exact: true }).click();
};
const exportTo = (latency: string): Opts => ({
  env: { SPEAKKIT_FAKE_LATENCY_MS: latency },
  config: { ...DONE, exportPrefs: { format: "wav", mp3Kbps: 192, folder: mkdtempSync(join(tmpdir(), "sk-visual-export-")) } },
});
const sys = (id: string, state: string, title: string, o: Opts, extra: { design?: boolean } = {}) => home(id, state, SY, title, o, extra);

export const systemScenarios: Scenario[] = [
  sys("H18", "update-pill", "Update ready · pill", { env: UPD, drive: toReady }),
  sys("H18", "update-popover", "Update ready · popover", { env: UPD, drive: openPill }),
  sys("H19", "updating", "Updating", {
    env: UPD,
    drive: async (p) => {
      await openPill(p);
      await press(p, /Restart now/);
      await p.getByTestId("updating-card").waitFor();
    },
  }),
  sys(
    "L5",
    "sidebar-collapsed",
    "Collapsed sidebar",
    {
      drive: async (p) => {
        await p.getByRole("button", { name: "Toggle sidebar" }).click();
        await sleep(400);
      },
    },
    { design: false },
  ),
  windowShot("I9", "mini-preparing", "Mini player · preparing", "mini.html", "mini", read, { env: { SPEAKKIT_FAKE_LATENCY_MS: "6000" }, after: miniAfter("preparing") }),
  windowShot("I9", "mini-playing", "Mini player · playing", "mini.html", "mini", read, { after: miniAfter("playing") }),
  windowShot("I9", "mini-paused", "Mini player · paused", "mini.html", "mini", read, {
    after: miniAfter("playing", async (w) => {
      await w.getByRole("button", { name: "Pause" }).click();
      await status(w, "paused");
    }),
  }),
  windowShot("I13", "mini-finished", "Mini player · finished", "mini.html", "mini", read, { after: miniAfter("finished") }),
  windowShot("I10", "tray-panel-idle", "Tray panel · idle", "panel.html", "tray-panel", async (app) => void (await hook(app, "togglePanel"))),
  windowShot(
    "I10",
    "tray-panel-paused",
    "Tray panel · paused",
    "panel.html",
    "tray-panel",
    async (app) => {
      await read(app);
      await hook(app, "togglePanel");
    },
    {
      after: async (w) => {
        await w.getByRole("button", { name: "Pause" }).click();
        await sleep(400);
      },
    },
  ),
  sys("J2", "export-rendering", "Export · rendering", { ...exportTo("4000"), drive: async (p) => (await startExport(p), await p.getByTestId("export-progress").waitFor()) }),
  sys("J3", "export-done", "Export · done", { ...exportTo("100"), drive: async (p) => (await startExport(p), await p.getByTestId("export-done").waitFor()) }),
  sys("J6", "export-background", "Export · in background", {
    ...exportTo("4000"),
    drive: async (p) => {
      await startExport(p);
      await p.getByRole("button", { name: "Run in background" }).click();
      await p.getByTestId("export-pill").waitFor();
    },
  }),
  home(
    "E12",
    "deleted-toast",
    GROUPS.library,
    "Library · deleted, undo toast",
    {
      drive: async (p) => {
        await libraryWith(p);
        await p.getByRole("button", { name: "More for Meeting notes" }).click();
        await p.getByRole("menuitem", { name: "Delete" }).click();
        await p.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
        await p.getByRole("button", { name: "Undo" }).waitFor();
      },
    },
    { design: false },
  ),
];
