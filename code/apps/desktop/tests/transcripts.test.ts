import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { encodeMp3 } from "../src/main/export/mp3";
import { launch, removeDir, type Launched } from "./harness";

const running: Launched[] = [];
const tmpDirs: string[] = [];
const start = async (o: Parameters<typeof launch>[0] = {}) => {
  const l = await launch({ ...o, env: { SPEAKKIT_TEST: "1", ...o.env } });
  running.push(l);
  return l;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
  await Promise.all(tmpDirs.splice(0).map(removeDir));
});
const tmp = (what: string) => {
  const d = mkdtempSync(path.join(tmpdir(), `speakkit-${what}-`));
  tmpDirs.push(d);
  return d;
};

/** 16 kHz mono 16-bit tone, as a WAVE file. */
function wav(file: string, seconds: number, rate = 16_000): string {
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 9000), 44 + i * 2);
  writeFileSync(file, buf);
  return file;
}

const DONE = { setupDone: true, setupSkipped: false };
type Hook = { pick(f: string | null): void; clipboard(): string };
/** Calls a function of the main process's test hook, by dotted path (for example "dictation.say"). */
const hook = <T>(l: Launched, fn: string, ...a: unknown[]) =>
  l.app.evaluate(
    (_, [name, args]) => {
      type Fn = (...x: unknown[]) => unknown;
      let o = (globalThis as unknown as { __speakkit: Record<string, unknown> }).__speakkit;
      const parts = (name as string).split(".");
      for (const k of parts.slice(0, -1)) o = o[k] as Record<string, unknown>;
      return (o[parts.at(-1)!] as Fn)(...(args as unknown[])) as T;
    },
    [fn, a] as const,
  );
const transcriptsHook = <K extends keyof Hook>(l: Launched, k: K, ...a: Parameters<Hook[K]>) => hook<ReturnType<Hook[K]>>(l, `transcripts.${k}`, ...a);

/** Saves a screenshot of the window for a design check when SHOTS names a folder. */
const shot = async (l: Launched, name: string) => {
  if (process.env.SHOTS) await l.page.screenshot({ path: path.join(process.env.SHOTS, `${name}.png`) });
};

const openHistory = async (l: Launched) => {
  await l.page.getByRole("link", { name: "History" }).click();
  await l.page.getByRole("heading", { name: "History", level: 1 }).waitFor();
};
const openTranscripts = async (l: Launched) => {
  await openHistory(l);
  await l.page.getByRole("radio", { name: "Transcripts" }).click();
  await l.page.getByRole("button", { name: "Import audio file" }).first().waitFor();
};

/** An app with the scripted speech engine. */
async function app(over: { config?: { transcripts?: object } & Record<string, unknown>; env?: Record<string, string>; userData?: string } = {}) {
  const l = await start({
    config: { ...DONE, ...over.config },
    ...(over.userData && { userData: over.userData }),
    ...(over.env && { env: over.env }),
  });
  await l.page.getByRole("heading", { name: "Dictation", exact: true }).waitFor();
  return { l };
}

const importFile = async (l: Launched, file: string, expectDone = true) => {
  await transcriptsHook(l, "pick", file);
  await l.page.getByRole("button", { name: "Import audio file" }).first().click();
  const dialog = l.page.getByRole("dialog", { name: "Import an audio file" });
  await dialog.getByRole("button", { name: "Choose file" }).click();
  await dialog.getByText(path.basename(file)).waitFor();
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  if (expectDone) await l.page.locator('[data-testid="transcript-row"][data-status="done"]').first().waitFor();
};

describe("History tabs", () => {
  it("has the Dictations and Transcripts tabs; transcripts start empty with a way to import", async () => {
    const { l } = await app();
    await openHistory(l);
    await l.page.getByRole("radio", { name: "Dictations" }).waitFor();
    expect(await l.page.getByRole("radio", { name: "Dictations" }).getAttribute("aria-checked")).toBe("true");
    await l.page.getByRole("radio", { name: "Transcripts" }).click();
    await l.page.getByText("No transcripts yet").waitFor();
    await l.page.getByRole("button", { name: "Import audio file" }).first().waitFor();
    await shot(l, "empty");
  });
});

describe("import", () => {
  it("a WAVE file is transcribed, listed, opened and searched", async () => {
    const dir = tmp("in");
    const { l } = await app();
    await hook(l, "dictation.say", "We talk about the invoice today");
    await openTranscripts(l);
    await importFile(l, wav(path.join(dir, "weekly_planning.wav"), 70));
    const row = l.page.locator('[data-testid="transcript-row"]').first();
    await row.getByText("weekly planning").waitFor();
    await row.getByText("Imported").waitFor();
    // Search finds it by what was said.
    await l.page.getByRole("textbox", { name: "Search titles and transcripts" }).fill("invoice");
    await row.getByText("invoice", { exact: false }).first().waitFor();
    await l.page.getByRole("textbox", { name: "Search titles and transcripts" }).fill("zebra");
    await l.page.getByText("Nothing matches that search.").waitFor();
    await l.page.getByRole("textbox", { name: "Search titles and transcripts" }).fill("");
    // Open it.
    await row.getByRole("button", { name: "Open: weekly planning" }).click();
    await l.page.getByRole("heading", { name: "weekly planning" }).waitFor();
    await l.page.getByText("We talk about the invoice today").first().waitFor();
    await l.page.getByRole("textbox", { name: "Search in this transcript" }).fill("invoice");
    await l.page.getByText("1 of 3").waitFor();
    await l.page.getByRole("button", { name: "Next match" }).click();
    await l.page.getByText("2 of 3").waitFor();
    await shot(l, "view");
  });

  it("with notes on, a finished transcript gets a summary naming the writer, chapters with Copy section", async () => {
    const dir = tmp("in");
    const answer = JSON.stringify({
      title: "Invoice talk",
      summary: "They discuss the invoice. Nothing else comes up.",
      chapters: [
        { start: 0, title: "The invoice" },
        { start: 30, title: "Wrap up" },
      ],
    });
    const server: Server = createServer((req, res) => {
      req.resume();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(req.url === "/v1/chat/completions" ? JSON.stringify({ choices: [{ message: { content: answer } }] }) : JSON.stringify({ data: [] }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const { l } = await app({ config: { transcripts: { notes: true } }, env: { SPEAKKIT_OPENAI_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}` } });
      await l.page.getByRole("link", { name: "Voice chat" }).click();
      await l.page.getByLabel("OpenAI API key").fill("sk-proj-E2E_good_key-0123456789abcdef");
      await l.page.getByRole("button", { name: "Save", exact: true }).click();
      await l.page.getByTestId("voice-chat-notice").waitFor();
      await hook(l, "dictation.say", "We talk about the invoice today");
      await openTranscripts(l);
      await importFile(l, wav(path.join(dir, "weekly_planning.wav"), 70));
      const row = l.page.locator('[data-testid="transcript-row"]').first();
      await row.getByRole("button", { name: /^Open: / }).click();
      await l.page.getByText("They discuss the invoice. Nothing else comes up.").waitFor();
      await l.page.getByText(/Written by OpenAI/).waitFor();
      await l.page.getByText("2 chapters").waitFor();
      await l.page.getByRole("button", { name: "Copy section: The invoice" }).click();
      expect(await transcriptsHook(l, "clipboard")).toContain("We talk about the invoice today");
      await shot(l, "summary");
    } finally {
      server.close();
    }
  });

  it("an MP3 goes through the decoder page and is transcribed with its real length", async () => {
    const dir = tmp("in");
    const rate = 44_100;
    const samples = Float32Array.from({ length: rate * 3 }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / rate) * 0.3);
    const file = path.join(dir, "memo.mp3");
    writeFileSync(file, await encodeMp3({ sampleRate: rate, samples }, 128, () => {}));
    const { l } = await app();
    await hook(l, "dictation.say", "words from an mp3");
    await openTranscripts(l);
    await importFile(l, file);
    const row = l.page.locator('[data-testid="transcript-row"]').first();
    await row.getByText("memo.mp3").waitFor();
    await row.getByText("3 s").waitFor();
    const calls = await hook<{ samples: number }[]>(l, "dictation.calls");
    // 3 seconds at 16 kHz; an MP3 decoder adds or trims a few frames at the ends.
    expect(Math.abs(calls[0]!.samples - 48_000)).toBeLessThan(3_000);
  });

  it("a file that is not audio is named in red with the formats that work, and nothing is imported", async () => {
    const dir = tmp("in");
    const bad = path.join(dir, "notes.mp3");
    writeFileSync(bad, "this is just text");
    const { l } = await app();
    await openTranscripts(l);
    await transcriptsHook(l, "pick", bad);
    await l.page.getByRole("button", { name: "Import audio file" }).first().click();
    const dialog = l.page.getByRole("dialog", { name: "Import an audio file" });
    expect(await dialog.getByRole("button", { name: "Import", exact: true }).isDisabled()).toBe(true);
    await dialog.getByRole("button", { name: "Choose file" }).click();
    await dialog
      .getByRole("alert")
      .getByText(/notes\.mp3 is not an audio file Speak Kit can read/)
      .waitFor();
    await dialog
      .getByText(/WAV, MP3, M4A, FLAC and OGG/)
      .first()
      .waitFor();
    expect(await dialog.getByRole("button", { name: "Import", exact: true }).isDisabled()).toBe(true);
    await shot(l, "import-error");
  });

  it("an engine that fails stops the job with a message, and Try again finishes it", async () => {
    const dir = tmp("in");
    const { l } = await app();
    await hook(l, "dictation.failTranscription", true);
    await openTranscripts(l);
    await importFile(l, wav(path.join(dir, "a.wav"), 5), false);
    const row = l.page.locator('[data-testid="transcript-row"][data-status="failed"]');
    await row
      .getByRole("alert")
      .getByText(/speech engine failed/)
      .waitFor();
    await hook(l, "dictation.failTranscription", false);
    await row.getByRole("button", { name: /Try again/ }).click();
    await l.page.locator('[data-testid="transcript-row"][data-status="done"]').waitFor();
  });

  it("without a speech model the dialog says so and Import stays off", async () => {
    const dir = tmp("in");
    const { l } = await app();
    await hook(l, "dictation.setInstalled", "large-v3-turbo-q5_0", false);
    await openTranscripts(l);
    await transcriptsHook(l, "pick", wav(path.join(dir, "a.wav"), 5));
    await l.page.getByRole("button", { name: "Import audio file" }).first().click();
    const dialog = l.page.getByRole("dialog", { name: "Import an audio file" });
    await dialog.getByRole("button", { name: "Choose file" }).click();
    await dialog.getByText("a.wav").waitFor();
    await dialog.getByText(/No speech model is installed yet/).waitFor();
    expect(await dialog.getByRole("button", { name: "Import", exact: true }).isDisabled()).toBe(true);
  });
});

describe("resume after quit", () => {
  it("quitting in the middle of a job keeps it; the next start offers Resume and finishes it", async () => {
    const dir = tmp("in");
    const userData = tmp("data");
    const config = DONE;
    const first = await start({ config, userData });
    await first.page.getByRole("heading", { name: "Dictation", exact: true }).waitFor();
    await hook(first, "dictation.say", "first part");
    // The first chunk never answers (a hung engine): the app quits while the job waits for it.
    await hook(first, "dictation.hangNext");
    await openTranscripts(first);
    await importFile(first, wav(path.join(dir, "long.wav"), 70), false);
    await first.page.locator('[data-testid="transcript-row"][data-status="transcribing"]').waitFor();
    await until(async () => (await hook<unknown[]>(first, "dictation.calls")).length === 1);
    await first.app.close();
    running.splice(running.indexOf(first), 1);
    const second = await start({ config, userData });
    await second.page.getByRole("heading", { name: "Dictation", exact: true }).waitFor();
    await openTranscripts(second);
    const row = second.page.locator('[data-testid="transcript-row"][data-status="interrupted"]');
    await row.getByText("Interrupted before it finished.").waitFor();
    await hook(second, "dictation.say", "second start");
    await row.getByRole("button", { name: /Resume/ }).click();
    await second.page.locator('[data-testid="transcript-row"][data-status="done"]').waitFor();
    await second.page
      .locator('[data-testid="transcript-row"]')
      .first()
      .getByRole("button", { name: /Open: long/ })
      .click();
    await second.page.getByRole("heading", { name: "long" }).waitFor();
    await second.page.getByText("second start").first().waitFor();
  });
});

describe("delete", () => {
  it("delete asks first and removes the transcript for good", async () => {
    const dir = tmp("in");
    const { l } = await app();
    await openTranscripts(l);
    await importFile(l, wav(path.join(dir, "one.wav"), 5));
    await importFile(l, wav(path.join(dir, "two.wav"), 5));
    const rows = l.page.locator('[data-testid="transcript-row"]');
    await until(async () => (await rows.count()) === 2);
    // The row's actions take pointer events only while the row is hovered or has focus. Focus does not depend on where the pointer is
    // (a row that moved under a still pointer keeps no hover), so focus the row before the click's hit test.
    await rows.filter({ hasText: "one" }).getByRole("button", { name: "Open: one" }).focus();
    await l.page.getByRole("button", { name: "Delete: one" }).click();
    const confirm = l.page.getByRole("dialog", { name: "Delete this transcript?" });
    await confirm.getByRole("button", { name: "Cancel" }).click();
    expect(await rows.count()).toBe(2);
    await l.page.getByRole("button", { name: "Delete: one" }).click({ force: true });
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await until(async () => (await rows.count()) === 1);
    expect(await l.page.getByRole("button", { name: /^Trash/ }).count()).toBe(0);
  });
});

describe("settings and storage", () => {
  it("the Transcripts card in Storage has the notes switch and what is in use, and no retention or folder rows", async () => {
    const { l } = await app();
    await l.page.getByRole("link", { name: "Settings" }).click();
    await l.page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Storage" }).click();
    await l.page.getByRole("heading", { name: "Storage", level: 1 }).waitFor();
    await l.page.getByText("In use now").waitFor();
    for (const gone of ["Keep transcripts for", "Keep audio for", "Trash keeps deleted transcripts for", "Save transcripts in"]) expect(await l.page.getByText(gone, { exact: true }).count()).toBe(0);
    await l.page.getByRole("switch", { name: "Write notes with OpenAI" }).click();
    await until(() => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8")).transcripts?.notes === true);
    await shot(l, "settings");
  });
});

async function until(f: () => Promise<boolean> | boolean, ms = 20_000) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(await f()).toBe(true);
}
