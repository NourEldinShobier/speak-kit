import { readFileSync, mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { GROUPS, S, type Scenario } from "./scenarios";
import { DONE, desktopShot, home, press, settings, type Opts } from "./desktop";
import { READ, hook, libraryWith, slow, windowShot } from "./desktop-app";
import { clickTrayQuit, sleep } from "./support";

// Desktop states that came after the first harness pass: library add / drag / menu / toasts, reader sub-states, PDF reader, shortcut recording,
// update available, quit variants, bell with entries. Design ids follow the design set.

const LIB = GROUPS.library;
const RD = GROUPS.readerApp;
const SY = GROUPS.system;
const ST = GROUPS.settings;
const here = dirname(fileURLToPath(import.meta.url));
const fixture = (n: string) => [...readFileSync(resolve(here, "../../apps/desktop/src/main/library/fixtures", n))];

const toLibrary = async (p: Page) => {
  await p.getByRole("link", { name: "Library" }).click();
  await p.getByRole("heading", { name: "Library" }).waitFor();
};
const importText = (p: Page, text: string, title?: string) => p.evaluate(([t, ti]) => window.speakkitLibrary.importText(t as string, (ti as string | undefined) ?? undefined), [text, title] as const);
const importBytes = (p: Page, name: string, bytes: number[]) => p.evaluate(([n, b]) => window.speakkitLibrary.importBytes(n as string, new Uint8Array(b as number[])), [name, bytes] as const);
/** Leave and come back: the list reads once when the page opens. */
const reopenLibrary = async (p: Page) => {
  await p.getByRole("link", { name: "Home" }).click();
  await toLibrary(p);
};
const openDoc = async (p: Page, title: string | RegExp) => {
  await reopenLibrary(p);
  await p
    .getByRole("button", { name: typeof title === "string" ? `Open ${title}` : title })
    .first()
    .click();
  await p.getByTestId("reader").waitFor();
};
const status = (p: Page, s: string) => p.waitForFunction((v) => document.querySelector("[data-testid=reader]")?.getAttribute("data-status") === v, s);
const play = async (p: Page) => {
  await p.getByRole("button", { name: "Play", exact: true }).click();
  await status(p, "playing");
};
const SHORT = "One short sentence here. A second sentence follows it. And a third to finish the paragraph.";
const LONG = Array.from(
  { length: 14 },
  (_, i) => `Paragraph ${i + 1} of the essay. It has a few sentences so the page needs scrolling. The voice reads one paragraph after another until the end.`,
).join("\n\n");
const withText = (title: string, text: string) => async (p: Page) => {
  await importText(p, text, title);
  await openDoc(p, title);
};

type Dropped = { name: string; type?: string };
const dragFiles = (p: Page, files: Dropped[], type: "dragenter" | "drop") =>
  p.evaluate(
    ([list, t]) => {
      const dt = new DataTransfer();
      for (const f of list as Dropped[]) dt.items.add(new File(["x"], f.name, f.type ? { type: f.type } : {}));
      document.querySelector("[data-testid=library]")!.dispatchEvent(new DragEvent(t as string, { dataTransfer: dt, bubbles: true, cancelable: true }));
    },
    [files, type] as const,
  );

const lib = (id: string, state: string, title: string, o: Opts) => home(id, state, LIB, title, o);
const rd = (id: string, state: string, title: string, drive: NonNullable<Opts["drive"]>, env: Record<string, string> = slow) => home(id, state, RD, title, { env, drive });
const addMenu = async (p: Page, item: string) => {
  await p.getByRole("button", { name: "Add", exact: true }).click();
  await p.getByRole("menuitem", { name: item }).click();
};

/** A web server for the Add-from-address dialog: `hang` never answers, so the dialog stays in "Fetching". */
async function withServer<T>(hang: boolean, run: (url: string) => Promise<T>): Promise<T> {
  const open: Socket[] = [];
  const srv: Server = createServer((req, res) => {
    open.push(req.socket);
    if (!hang) {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  try {
    return await run(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/article`);
  } finally {
    open.forEach((s) => s.destroy());
    srv.close();
  }
}

const url = (id: string, state: string, title: string, hang: boolean, after: (p: Page) => Promise<void>) =>
  S(id, state, LIB, title, (c) =>
    withServer(hang, (u) =>
      desktopShot(c, {
        config: DONE,
        drive: async (p) => {
          await libraryWith(p);
          await addMenu(p, "From a web address");
          await p.getByRole("textbox", { name: "Web address" }).fill(u);
          await p.getByRole("button", { name: "Add", exact: true }).click();
          await after(p);
        },
      }),
    ),
  );

const mini = (id: string, state: string, title: string, after: (w: Page) => Promise<void>, env: Record<string, string> = {}) =>
  windowShot(id, state, title, "mini.html", "mini", async (app) => void (await hook(app, "readText", READ)), { env, after });

const exportOpts = (latency: string): Opts => ({
  env: { SPEAKKIT_FAKE_LATENCY_MS: latency },
  config: { ...DONE, exportPrefs: { format: "wav", mp3Kbps: 192, folder: mkdtempSync(join(tmpdir(), "sk-visual-export-")) } },
});
const NOTE = "Exporting is simple. Each sentence is rendered once. Then the file is saved.";
const runExport = async (p: Page, name: string) => {
  await p.getByRole("button", { name: "New reading" }).click();
  await p.getByRole("textbox", { name: "Text to read" }).fill(NOTE);
  await p.getByRole("button", { name: "Export audio" }).click();
  await p.getByRole("dialog", { name: "Export audio" }).waitFor();
  await p.getByRole("textbox", { name: "File name" }).fill(name);
  await p.getByRole("button", { name: "Export", exact: true }).click();
};

export const stateScenarios: Scenario[] = [
  // library: add, drag, row menu, delete, toasts
  lib("E3", "paste-text", "Add · paste text", {
    drive: async (p) => {
      await libraryWith(p);
      await addMenu(p, "Paste text");
      await p.getByRole("textbox", { name: "Title (optional)" }).fill("Notes from the call");
      await p.getByRole("textbox", { name: "Text" }).fill("We talked about the reader first.\n\nThe export dialog follows after the release.");
      await sleep(300);
    },
  }),
  url("E4", "url-fetching", "Add · web address, fetching", true, async (p) => {
    await p.getByRole("button", { name: "Fetching" }).waitFor();
  }),
  url("E5", "url-failed", "Add · web address failed", false, async (p) => {
    await p.getByText("That page could not be added").waitFor({ timeout: 15_000 });
  }),
  lib("E6", "drag-file", "Library · dragging a file", {
    drive: async (p) => {
      await libraryWith(p);
      await dragFiles(p, [{ name: "Report.pdf", type: "application/pdf" }], "dragenter");
      await p.getByTestId("drop-overlay").waitFor();
    },
  }),
  lib("E14", "drag-files", "Library · dragging several files (the product shows the same overlay for one or many)", {
    drive: async (p) => {
      await libraryWith(p);
      await dragFiles(p, [{ name: "Report.pdf", type: "application/pdf" }, { name: "Chapter 1.docx" }, { name: "Notes.md" }], "dragenter");
      await p.getByTestId("drop-overlay").waitFor();
    },
  }),
  lib("E15", "unsupported-file", "Library · unsupported file", {
    drive: async (p) => {
      await libraryWith(p);
      await dragFiles(p, [{ name: "movie.mp4", type: "video/mp4" }], "drop");
      await p.getByText("Some files could not be added").waitFor();
    },
  }),
  lib("E9", "row-menu", "Library · row menu", {
    drive: async (p) => {
      await libraryWith(p);
      await p.getByRole("button", { name: "More for Meeting notes" }).click();
      await p.getByRole("menuitem", { name: "Delete" }).waitFor();
    },
  }),
  lib("E16", "delete-pasted", "Library · delete pasted text", {
    drive: async (p) => {
      await libraryWith(p);
      await importText(p, "A pasted note that exists only here.\n\nIt has no original file.", "Pasted note");
      await reopenLibrary(p);
      await p.getByRole("button", { name: "More for Pasted note" }).click();
      await p.getByRole("menuitem", { name: "Delete" }).click();
      await p.getByRole("dialog").waitFor();
    },
  }),
  lib("E13", "added-toast", "Library · added toast", {
    drive: async (p) => {
      await libraryWith(p);
      await addMenu(p, "Paste text");
      await p.getByRole("textbox", { name: "Text" }).fill("We talked about the reader first.\n\nThe export dialog follows after the release.");
      await p.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
      await p.getByRole("status").filter({ hasText: "Added" }).waitFor();
    },
  }),

  // reader sub-states
  rd(
    "F3",
    "preparing-next",
    "Reader · preparing next paragraph",
    async (p) => {
      await withText("Slow reading", LONG)(p);
      await play(p);
      await p.getByRole("button", { name: "Next paragraph" }).click();
      await p.locator(".rd-prepare").waitFor({ timeout: 20_000 });
    },
    { SPEAKKIT_FAKE_LATENCY_MS: "3500" },
  ),
  rd("F4", "finished", "Reader · finished", async (p) => {
    await withText("Short", SHORT)(p);
    await p.getByRole("button", { name: "1x" }).click();
    await p.getByRole("button", { name: "3x", exact: true }).click();
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "Play", exact: true }).click();
    await p.getByRole("dialog", { name: "Finished" }).waitFor({ timeout: 30_000 });
  }),
  rd("F5", "read-from-here", "Reader · read from here", async (p) => {
    await withText("Short", SHORT)(p);
    await p.locator("[data-block='0']").click({ position: { x: 120, y: 8 } });
    await p.getByRole("button", { name: "Read from here" }).waitFor();
  }),
  rd("F7", "display-settings", "Reader · display settings", async (p) => {
    await withText("Short", SHORT)(p);
    await p.getByRole("button", { name: "Display settings" }).click();
    await p.getByRole("radio", { name: "Serif" }).click();
    await sleep(300);
  }),
  rd("F8", "sleep-timer", "Reader · sleep timer", async (p) => {
    await withText("Short", SHORT)(p);
    await p.getByRole("button", { name: "Sleep timer" }).click();
    await p.getByRole("button", { name: "15 minutes" }).click();
    await p.getByRole("button", { name: "Sleep timer" }).click();
    await sleep(300);
  }),
  rd("F15", "back-to-current", "Reader · back to current", async (p) => {
    await withText("Long essay", LONG)(p);
    await play(p);
    await p.getByTestId("reader-scroll").hover();
    await p.mouse.wheel(0, 600);
    await p.getByRole("button", { name: "Back to current" }).waitFor();
  }),
  rd("F16", "find-in-text", "Reader · search in text", async (p) => {
    await withText("Long essay", LONG)(p);
    await p.keyboard.press("Control+F");
    await p.getByRole("textbox", { name: "Find in text" }).fill("paragraph");
    await sleep(500);
  }),

  // PDF reader
  rd("F10", "pdf-playing", "PDF reader · playing", async (p) => {
    await importBytes(p, "Report.pdf", fixture("sample.pdf"));
    await openDoc(p, /^Open /);
    await play(p);
  }),
  rd("F11", "pdf-scanned", "PDF reader · scanned page", async (p) => {
    await importBytes(p, "Scan.pdf", fixture("scanned.pdf"));
    await openDoc(p, /^Open /);
    await p.getByText("This PDF has no text layer").waitFor();
  }),
  rd("F12", "pdf-scanned-consent", "PDF reader · scanned page, consent to recognize", async (p) => {
    await importBytes(p, "Scan.pdf", fixture("scanned.pdf"));
    await openDoc(p, /^Open /);
    await p.getByRole("button", { name: "Recognize text" }).click();
    await p.getByRole("dialog", { name: "Recognize text on this computer?" }).waitFor();
  }),
  rd("F13", "pdf-recognizing", "PDF reader · recognizing text (language data still loading)", async (p) => {
    // the language data comes from a CDN: never answer, so the panel stays in its first phase
    await p.context().route(/cdn\.jsdelivr\.net/, () => {});
    await importBytes(p, "Scan.pdf", fixture("scanned.pdf"));
    await openDoc(p, /^Open /);
    await p.getByRole("button", { name: "Recognize text" }).click();
    await p.getByRole("dialog", { name: "Recognize text on this computer?" }).getByRole("button", { name: "Recognize text" }).click();
    await p.getByRole("region", { name: "Recognizing text" }).waitFor();
    await sleep(1500);
  }),
  rd("F17", "pdf-recognition-failed", "PDF reader · recognition stopped, nothing recognized", async (p) => {
    await importBytes(p, "Scan.pdf", fixture("scanned.pdf"));
    await openDoc(p, /^Open /);
    await p.getByRole("button", { name: "Recognize text" }).click();
    await p.getByRole("dialog", { name: "Recognize text on this computer?" }).getByRole("button", { name: "Recognize text" }).click();
    await p.getByText("Text recognition stopped").waitFor({ timeout: 60_000 });
  }),

  // settings
  home("H11", "shortcut-recording", ST, "Settings · Shortcuts, recording a key", {
    drive: async (p) => {
      await settings("Shortcuts")(p);
      await p
        .getByRole("button", { name: /^Change .* shortcut$/ })
        .first()
        .click();
      await p.getByTestId("recording").waitFor();
    },
  }),
  home("H16", "shortcut-conflict", ST, "Settings · Shortcuts, conflict", {
    drive: async (p, { app }) => {
      await hook(app, "foreignShortcuts", ["Ctrl+Alt+S"]);
      await settings("Shortcuts")(p);
      await p.getByTestId("shortcut-problem").first().waitFor();
    },
  }),
  home("H9", "update-available", ST, "Settings · Update available (release page, the copy cannot replace itself)", {
    env: { SPEAKKIT_UPDATE_MANUAL: "0.9.0" },
    drive: async (p) => {
      await settings("About")(p);
      await p.getByRole("button", { name: "Check for updates" }).click();
      await p.getByTestId("update-manual").waitFor();
    },
  }),

  // export
  home("J5", "export-file-exists", RD, "Export · file exists", {
    ...exportOpts("100"),
    drive: async (p) => {
      await runExport(p, "My note");
      await p.getByTestId("export-done").waitFor();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: /Close|Done/ })
        .first()
        .click();
      await runExport(p, "My note");
      await p.getByTestId("export-exists").waitFor();
    },
  }),
  home("J7", "bell-with-entries", SY, "Notifications bell · after an export", {
    ...exportOpts("100"),
    drive: async (p) => {
      await runExport(p, "My note");
      await p.getByTestId("export-done").waitFor();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: /Close|Done/ })
        .first()
        .click();
      await p.getByRole("button", { name: "Notifications" }).first().click();
      await sleep(400);
    },
  }),

  // system: quit variant, update variant, mini states
  home("K13", "quit-reading-export", SY, "Quit confirmation · a reading and an export running", {
    ...exportOpts("4000"),
    drive: async (p, { app }) => {
      await runExport(p, "My note");
      await p.getByTestId("export-progress").waitFor();
      await p.getByRole("button", { name: "Run in background" }).click();
      await hook(app, "readText", READ);
      await sleep(500);
      await clickTrayQuit(app);
      await p.getByRole("dialog").waitFor({ timeout: 5000 });
    },
  }),
  home("H22", "update-restart-confirm", SY, "Update ready · restart while a reading is playing", {
    env: { SPEAKKIT_FAKE_UPDATE: "0.2.0", ...slow },
    drive: async (p, { app }) => {
      await settings("About")(p);
      await p.getByRole("button", { name: "Check for updates" }).click();
      await p.getByTestId("update-ready").waitFor();
      await hook(app, "readText", READ);
      await sleep(600);
      await p.getByTestId("update-pill").click();
      await press(p, /Restart now/);
      await p.getByTestId("update-confirm").first().waitFor();
    },
  }),
  mini(
    "I21",
    "mini-error",
    "Mini player · error",
    async (w) => {
      await w.waitForFunction(() => document.querySelector("[data-testid=mini]")?.getAttribute("data-status") === "error", null, { timeout: 15_000 });
    },
    { SPEAKKIT_FAKE_STATE: "error" },
  ),
];
