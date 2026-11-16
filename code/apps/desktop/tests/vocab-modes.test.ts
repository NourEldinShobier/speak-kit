import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { launch, removeDir, type Launched } from "./harness";

const running: Launched[] = [];
const dirs: string[] = [];
const DONE = { setupDone: true, setupSkipped: false, preferredPort: 0 };
const start = async (o: Parameters<typeof launch>[0] = {}) => {
  const l = await launch({ config: DONE, ...o, env: { SPEAKKIT_TEST: "1", ...o.env } });
  running.push(l);
  return l;
};
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "speakkit-vm-"));
  dirs.push(d);
  return d;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
  await Promise.all(dirs.splice(0).map(removeDir));
});

type Hook = Record<string, (...a: unknown[]) => unknown>;
const hook = (l: Launched, name: string, ...args: unknown[]) =>
  l.app.evaluate((_e, [n, a]) => (globalThis as unknown as { __speakkit: { dictation: Hook } }).__speakkit.dictation[n as string]!(...(a as unknown[])), [name, args] as const);
const until = async (f: () => Promise<boolean>) => {
  for (const end = Date.now() + 8000; Date.now() < end;) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(await f()).toBe(true);
};
const settings = (l: Launched) => l.page.evaluate(async () => (await window.speakkitDictation.status()).settings);
const open = async (l: Launched, name: string, heading = name) => {
  await l.page.getByRole("link", { name }).click();
  await l.page.getByRole("heading", { name: heading, exact: true, level: 1 }).waitFor();
};

describe("Vocabulary page", () => {
  it("adds a word with how it sounds, refuses a duplicate and a too-long word with the reason, and deletes by row", async () => {
    const l = await start();
    await open(l, "Vocabulary");
    await l.page.getByText("No words yet").waitFor();

    await l.page.getByRole("button", { name: "Add word" }).click();
    const dialog = l.page.getByRole("dialog", { name: "Add a word" });
    expect(await dialog.getByRole("button", { name: "Add word" }).isDisabled()).toBe(true);
    await dialog.getByLabel("Word or name").fill("Kubernetes");
    await dialog.getByLabel("Sounds like").fill("cooper netties, kuber nettys");
    await dialog.getByRole("button", { name: "Add word" }).click();
    const row = l.page.locator("[data-term]").filter({ hasText: "Kubernetes" });
    await row.waitFor();
    expect(await row.locator(".lm-chip").allTextContents()).toEqual(["cooper netties", "kuber nettys"]);
    expect(await l.page.getByTestId("word-count").textContent()).toBe("1 of 500 words");
    expect((await settings(l)).terms.map((t) => t.word)).toEqual(["Kubernetes"]);

    await l.page.getByRole("button", { name: "Add word" }).click();
    await dialog.getByLabel("Word or name").fill("kubernetes");
    await dialog.getByText('"Kubernetes" is already in the list.').waitFor();
    expect(await dialog.getByRole("button", { name: "Add word" }).isDisabled()).toBe(true);
    await dialog.getByLabel("Word or name").fill("x".repeat(74));
    await dialog.getByText("74 of 60").waitFor();
    await dialog.getByText("Words and names can be up to 60 characters. This one is 74.").waitFor();
    expect(await dialog.getByRole("button", { name: "Add word" }).isDisabled()).toBe(true);
    await dialog.getByLabel("Word or name").fill("kubernetes");
    await dialog.getByRole("button", { name: "Show entry" }).click();
    await dialog.waitFor({ state: "hidden" });
    expect(await l.page.getByLabel("Search your words").inputValue()).toBe("Kubernetes");

    await row.getByRole("button", { name: "Delete Kubernetes" }).click();
    await l.page.getByText("No words yet").waitFor();
    expect((await settings(l)).terms).toEqual([]);
  });

  it("deleting several rows quickly removes exactly those rows", async () => {
    const l = await start();
    const terms = ["Alpha", "Beta", "Gamma", "Delta"].map((word, i) => ({ id: `t${i}`, word, soundsLike: [] as string[] }));
    await l.page.evaluate((t) => window.speakkitDictation.patchSettings({ terms: t }), terms);
    await open(l, "Vocabulary");
    await l.page.locator("[data-term]").first().waitFor();
    for (const name of ["Alpha", "Gamma", "Delta"]) await l.page.getByRole("button", { name: `Delete ${name}` }).click({ noWaitAfter: true });
    await l.page.getByText("Showing 1 of 1 words.").waitFor();
    expect((await settings(l)).terms.map((t) => t.word)).toEqual(["Beta"]);
  });

  it("shows how many words the speech model reads, and tries the rules step by step with the vocabulary applied", async () => {
    const l = await start();
    await l.page.evaluate(() =>
      window.speakkitDictation.patchSettings({ terms: [{ id: "k", word: "Kubernetes", soundsLike: ["cooper netties"] }], replacements: [{ from: "my email", to: "sam@example.com" }] }),
    );
    await open(l, "Vocabulary");
    await l.page.getByText("1 of 1 word read by the model, 10 of 500 characters.").waitFor();
    await l.page.getByLabel("Sentence to test").fill("tell the team the cooper netties update is live and send it to my email");
    const steps = l.page.locator(".vocab-step__text");
    expect(await steps.allTextContents()).toEqual([
      "tell the team the cooper netties update is live and send it to my email",
      "tell the team the Kubernetes update is live and send it to my email",
      "tell the team the Kubernetes update is live and send it to sam@example.com",
      "Tell the team the Kubernetes update is live and send it to sam@example.com",
    ]);
    expect(await l.page.getByTestId("tester-final").textContent()).toBe("Tell the team the Kubernetes update is live and send it to sam@example.com");
    // Fix this adds the right spelling with what was heard, only when asked.
    await l.page.getByLabel("Sentence to test").fill("deploy grafana now");
    await l.page.getByRole("button", { name: "Fix this" }).click();
    const form = l.page.getByRole("form", { name: "Fix this" });
    await form.getByLabel("Right spelling").fill("Grafana");
    await form.getByLabel("Heard as").fill("graph fan ah");
    await form.getByRole("button", { name: "Add to Vocabulary" }).click();
    await l.page.locator("[data-term]").filter({ hasText: "Grafana" }).waitFor();
    expect((await settings(l)).terms.map((t) => [t.word, t.soundsLike])).toEqual([
      ["Kubernetes", ["cooper netties"]],
      ["Grafana", ["graph fan ah"]],
    ]);
  });

  it("imports a word list with a result dialog that lists what was skipped, and exports words as text", async () => {
    const l = await start();
    const dir = tmp();
    const file = path.join(dir, "words.txt");
    writeFileSync(file, `Grafana | gruh fan ah\nKubernetes | cooper netties\n${"y".repeat(61)}\nGrafana\n`);
    await open(l, "Vocabulary");
    await hook(l, "files", { open: file });
    await l.page.getByRole("button", { name: "Import", exact: true }).click();
    const result = l.page.getByRole("dialog", { name: "Import finished" });
    await result.getByText("2 words and 0 replacements were added.").waitFor();
    await result.getByText("1 duplicate and 1 entry that is too long were skipped.").waitFor();
    expect(await result.getByRole("list", { name: "Skipped entries" }).locator("li").allTextContents()).toEqual([`${"y".repeat(59)}…too long`, "Grafanaalready in the list"]);
    await result.getByRole("button", { name: "Done" }).click();
    expect((await settings(l)).terms.map((t) => t.word)).toEqual(["Grafana", "Kubernetes"]);

    const out = path.join(dir, "out.txt");
    await hook(l, "files", { save: out });
    await l.page.getByRole("button", { name: "Export" }).click();
    await l.page.getByRole("menuitem", { name: "Words only (.txt)" }).click();
    await expectFile(out, "Grafana | gruh fan ah\nKubernetes | cooper netties");

    await hook(l, "files", { open: path.join(dir, "bad.json") });
    writeFileSync(path.join(dir, "bad.json"), "{not json");
    await l.page.getByRole("button", { name: "Import", exact: true }).click();
    await l.page.getByRole("dialog", { name: "Could not import" }).getByText("bad.json is not a file Speak Kit can read. Nothing was added.").waitFor();
  });

  it("keeps pronunciations for the reader, shows the spoken wording and refuses a repeat", async () => {
    const l = await start();
    await open(l, "Vocabulary");
    await l.page.getByRole("radio", { name: "Read as" }).click();
    await l.page.getByRole("button", { name: "Add pronunciation" }).first().click();
    const dialog = l.page.getByRole("dialog", { name: "Add a pronunciation" });
    await dialog.getByLabel("Written as").fill("kubectl");
    await dialog.getByLabel("Read as").fill("cube control");
    await dialog.getByRole("button", { name: "Add pronunciation" }).click();
    await l.page.locator("[data-pron]").filter({ hasText: "cube control" }).waitFor();
    await l.page.getByLabel("Sentence to read").fill("Run kubectl apply.");
    expect(await l.page.getByTestId("spoken-wording").textContent()).toBe("Run cube control apply.");
    expect((await settings(l)).readAs.map((p) => [p.written, p.spoken])).toEqual([["kubectl", "cube control"]]);
    await l.page.getByRole("button", { name: "Add pronunciation" }).first().click();
    await dialog.getByLabel("Written as").fill("KUBECTL");
    await dialog.getByLabel("Read as").fill("kube cuttle");
    await dialog.getByRole("button", { name: "Add pronunciation" }).click();
    await dialog.getByText("That written form is already in the list.").waitFor();
  });

  it("the Voices page points to Fix a pronunciation, which opens the Read as tab", async () => {
    const l = await start();
    await open(l, "Voices");
    await l.page.getByRole("button", { name: "Fix a pronunciation" }).click();
    await l.page.getByRole("heading", { name: "Vocabulary", exact: true, level: 1 }).waitFor();
    expect(await l.page.getByRole("radio", { name: "Read as" }).getAttribute("aria-checked")).toBe("true");
  });
});

async function expectFile(file: string, content: string) {
  for (let i = 0; i < 100; i++) {
    try {
      if (readFileSync(file, "utf8") === content) return;
    } catch {
      // not written yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(readFileSync(file, "utf8")).toBe(content);
}

describe("Dictation clean-up", () => {
  it("scopes the language rules, turns one off and tries a sentence", async () => {
    const l = await start();
    await open(l, "Dictation");
    await l.page.getByRole("heading", { name: "Clean-up" }).waitFor();
    expect(await l.page.getByText("English only").count()).toBe(1);
    await l.page.getByRole("combobox", { name: "Rules for" }).click();
    await l.page.getByRole("option", { name: "German" }).click();
    await l.page.getByText("Not available for German yet.").waitFor();
    expect(await l.page.getByRole("switch", { name: "Remove filler words" }).isDisabled()).toBe(true);
    await l.page.getByRole("combobox", { name: "Rules for" }).click();
    await l.page.getByRole("option", { name: "English" }).click();
    await l.page.getByLabel("Sentence to test").fill("um new line the price is twenty five dollars");
    expect((await l.page.getByTestId("tester-final").textContent())?.trim()).toBe("The price is twenty five dollars");
  });

  it("turning lowercase on lowercases the tried sentence and the setting is saved", async () => {
    const l = await start();
    await open(l, "Dictation");
    await l.page.getByRole("switch", { name: "Lowercase everything" }).click();
    await l.page.getByLabel("Sentence to test").fill("Hello There");
    await l.page.waitForFunction(() => document.querySelector('[data-testid="tester-final"]')?.textContent === "hello there");
    expect((await settings(l)).cleanup.lowercase).toBe(true);
  });
});

describe("Modes page", () => {
  it("adds a mode with an app and its own word, marks the word that replaces a shared one, sets up the rewrite pass and deletes the mode", async () => {
    const l = await start();
    await l.page.evaluate(() => window.speakkitDictation.patchSettings({ terms: [{ id: "s1", word: "Kubectl", soundsLike: [] }] }));
    await open(l, "Modes");
    expect(await l.page.getByRole("list", { name: "Modes" }).locator("li").count()).toBe(1);
    await l.page.getByRole("button", { name: "Add mode" }).click();
    const add = l.page.getByRole("dialog", { name: "Add a mode" });
    await add.getByLabel("Name").fill("Code editor");
    await add.getByRole("button", { name: "Add mode" }).click();
    await l.page.getByRole("heading", { name: "Code editor", exact: true, level: 1 }).waitFor();

    await l.page.getByRole("button", { name: "Add app" }).first().click();
    const app = l.page.getByRole("dialog", { name: "Add an app to Code editor" });
    await app.getByRole("button", { name: "Visual Studio Code" }).click();
    await app.getByRole("button", { name: "Add app" }).click();
    await l.page.getByRole("button", { name: "Remove Visual Studio Code" }).waitFor();
    expect((await settings(l)).modes[0]).toMatchObject({ name: "Code editor", apps: ["code"], capitals: "keep" });

    await l.page.getByRole("combobox", { name: "End of dictation" }).click();
    await l.page.getByRole("option", { name: "No full stop" }).click();
    await l.page.getByRole("button", { name: "Add word" }).click();
    const word = l.page.getByRole("dialog", { name: "Add a word to Code editor" });
    await word.getByLabel("Word or name").fill("kubectl");
    await word.getByText("The shared list has the same word. This mode's spelling is used here.").waitFor();
    await word.getByRole("button", { name: "Add word" }).click();
    await l.page.getByText("Replaces the shared spelling").waitFor();
    expect(await l.page.getByRole("combobox", { name: "Rewrite pass" }).isDisabled()).toBe(true);
    expect((await settings(l)).modes[0]).toMatchObject({ end: "no-full-stop", terms: [{ word: "kubectl" }] });

    await l.page.getByRole("button", { name: "Modes", exact: true }).click();
    const row = l.page.locator("[data-mode]").filter({ hasText: "Code editor" });
    expect(await row.locator(".lm-chip").allTextContents()).toEqual(["1 app", "1 word", "Rewrite off"]);
    await l.page.getByRole("button", { name: "Set up" }).click();
    const rewrite = l.page.getByRole("dialog", { name: "Turn on the rewrite pass?" });
    await rewrite.getByText("Your text leaves this computer.").waitFor();
    await rewrite.getByRole("button", { name: "Turn on rewrite pass" }).click();
    await l.page.getByRole("button", { name: "Change" }).waitFor();
    expect((await settings(l)).rewrite).toEqual({ enabled: true, deadlineMs: 4000 });

    await row.click();
    await l.page.getByRole("combobox", { name: "Rewrite pass" }).click();
    await l.page.getByRole("option", { name: "On" }).click();
    await l.page.getByRole("button", { name: "Delete mode" }).click();
    await l.page.getByRole("dialog", { name: "Delete Code editor?" }).getByRole("button", { name: "Delete mode" }).click();
    await l.page.getByRole("heading", { name: "Modes", exact: true, level: 1 }).waitFor();
    expect((await settings(l)).modes).toEqual([]);
  });

  it("adds a replacement that applies only in the mode, and removes it again", async () => {
    const l = await start();
    await open(l, "Modes");
    await l.page.getByRole("button", { name: "Add mode" }).click();
    const add = l.page.getByRole("dialog", { name: "Add a mode" });
    await add.getByLabel("Name").fill("Chat");
    await add.getByRole("button", { name: "Add mode" }).click();
    await l.page.getByRole("heading", { name: "Chat", exact: true, level: 1 }).waitFor();
    await l.page.getByLabel("When I say").fill("ship it");
    await l.page.getByLabel("Replace with").fill("deploy");
    await l.page.getByRole("button", { name: "Add", exact: true }).click();
    await l.page.getByRole("list", { name: "Replacements for Chat" }).getByText("deploy").waitFor();
    await until(async () => JSON.stringify((await settings(l)).modes[0]!.replacements) === JSON.stringify([{ from: "ship it", to: "deploy" }]));
    expect((await settings(l)).replacements).toEqual([]);
    await l.page.getByRole("button", { name: "Delete replacement ship it" }).click();
    await until(async () => (await settings(l)).modes[0]!.replacements.length === 0);
  });

  it("refuses a repeated or empty mode name and moves an app from one mode to another", async () => {
    const l = await start();
    await open(l, "Modes");
    await l.page.getByRole("button", { name: "Add mode" }).click();
    const add = l.page.getByRole("dialog", { name: "Add a mode" });
    expect(await add.getByRole("button", { name: "Add mode" }).isDisabled()).toBe(true);
    await add.getByLabel("Name").fill("default");
    await add.getByText("A mode with this name already exists.").waitFor();
    expect(await add.getByRole("button", { name: "Add mode" }).isDisabled()).toBe(true);
  });
});

describe("Default mode", () => {
  it("opens a detail page where the rewrite pass can be turned on for apps outside every mode, and saves it once", async () => {
    const l = await start();
    await l.page.evaluate(() => window.speakkitDictation.patchSettings({ rewrite: { enabled: true, deadlineMs: 4000 } }));
    await open(l, "Modes");
    await l.page.locator("[data-mode=default]").click();
    await l.page.getByRole("heading", { name: "Default", exact: true, level: 1 }).waitFor();
    expect(await l.page.getByRole("button", { name: "Delete mode" }).count()).toBe(0);
    await l.page.getByRole("combobox", { name: "Rewrite pass" }).click();
    await l.page.getByRole("option", { name: "On" }).click();
    await expect.poll(async () => (await settings(l)).modes.filter((m) => m.id === "default").map((m) => m.rewrite)).toEqual([true]);
    await l.page.getByRole("button", { name: "Modes", exact: true }).click();
    expect(await l.page.getByRole("list", { name: "Modes" }).locator("li").count()).toBe(1);
    expect(await l.page.locator("[data-mode=default] .lm-chip").allTextContents()).toEqual(["Shared words only", "Rewrite on"]);
  });
});

describe("History page", () => {
  const seed = (dir: string, entries: object[], wav = false) => {
    writeFileSync(path.join(dir, "dictation-history.json"), JSON.stringify({ version: 1, entries }));
    if (wav) {
      mkdirSync(path.join(dir, "dictation-audio"), { recursive: true });
      const n = 16_000;
      const buf = Buffer.alloc(44 + n * 2);
      buf.write("RIFF", 0);
      buf.writeUInt32LE(36 + n * 2, 4);
      buf.write("WAVEfmt ", 8);
      buf.writeUInt32LE(16, 16);
      buf.writeUInt16LE(1, 20);
      buf.writeUInt16LE(1, 22);
      buf.writeUInt32LE(16_000, 24);
      buf.writeUInt32LE(32_000, 28);
      buf.writeUInt16LE(2, 32);
      buf.writeUInt16LE(16, 34);
      buf.write("data", 36);
      buf.writeUInt32LE(n * 2, 40);
      for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 16_000) * 9000), 44 + i * 2);
      writeFileSync(path.join(dir, "dictation-audio", "e1.wav"), buf);
    }
  };
  const now = Date.now();
  const entries = [
    {
      id: "e1",
      at: now - 60_000,
      text: "Remind the team that the release is Thursday.",
      raw: "remind the team that the release is thursday",
      durationMs: 1000,
      app: "notepad.exe",
      model: "large-v3-turbo-q5_0",
      audio: "e1.wav",
    },
    { id: "e2", at: now - 3_600_000, text: "Deploy Kubernetes today.", raw: "deploy cooper netties today", durationMs: 2000, app: "chrome.exe", rewrite: "deadline" },
  ];

  it("shows totals, the retention on each entry, the raw text beside the final one, and finds a word by its sounds-like spelling", async () => {
    const userData = tmp();
    seed(userData, entries);
    const l = await start({ userData });
    await l.page.evaluate(() => window.speakkitDictation.patchSettings({ terms: [{ id: "k", word: "Kubernetes", soundsLike: ["cooper netties"] }] }));
    await open(l, "History");
    await l.page.getByRole("button", { name: "Statistics" }).click();
    await l.page.getByText("Dictation statistics").waitFor();
    await l.page.locator(".dict-stats dd").first().waitFor();
    expect(await l.page.locator(".dict-stats dd").allTextContents()).toEqual(["2", "11", "3 s", "2", "0", "0"]);
    await l.page.getByRole("dialog").getByRole("button", { name: "Close" }).first().click();
    expect(await l.page.locator(".dict-hist__meta").first().textContent()).toContain("Removed in 7 days");
    expect(await l.page.getByText("Pasted as said after 4 seconds").count()).toBe(1);

    await l.page.getByRole("radio", { name: "Side by side" }).click();
    await l.page.getByText("What the model heard").waitFor();
    expect(await l.page.locator(".dict-hist__text--raw").first().textContent()).toContain("remind the team");
    await l.page.getByRole("radio", { name: "Final text" }).click();

    await l.page.getByLabel("Search what you dictated").fill("cooper netties");
    await l.page.getByText("Matched “cooper netties” from your Vocabulary entry Kubernetes").waitFor();
    expect(await l.page.locator("[data-row]").count()).toBe(1);
  });

  it("opens a kept recording, transcribes it again with another model and uses the new text; a missing model fails visibly", async () => {
    const userData = tmp();
    seed(userData, entries, true);
    const l = await start({ userData });
    await open(l, "History");
    await l.page
      .getByRole("button", { name: /^Recording of:/ })
      .first()
      .click();
    const panel = l.page.getByTestId("recording-panel");
    await panel.getByText("1 of 1").waitFor();
    await hook(l, "say", "Remind the team that the release is on Thursday.");
    await panel.getByRole("combobox", { name: "Model for transcribing again" }).click();
    await l.page.getByRole("option", { name: "Parakeet v3", exact: true }).click();
    const again = panel.getByRole("combobox", { name: "Language for transcribing again" });
    expect(Math.round((await again.boundingBox())!.height)).toBe(36);
    await again.click();
    await l.page.getByRole("option", { name: "German" }).click();
    await panel.getByRole("button", { name: "Transcribe again" }).click();
    await panel.getByText("1 of 2").waitFor();
    await panel.getByRole("button", { name: "Use this text" }).click();
    await panel.getByText("2 of 2").waitFor();
    await l.page.locator("[data-row=e1] .dict-hist__text").filter({ hasText: "Remind the team that the release is on Thursday." }).waitFor();

    await hook(l, "setInstalled", "parakeet-tdt-0.6b-v3-q4_0", false);
    await panel.getByRole("button", { name: "Transcribe again" }).click();
    await panel.getByText("Parakeet v3 is not installed.").waitFor();
    await panel.getByText("The first version is kept.").waitFor();
    await panel.getByRole("button", { name: "Open Dictation" }).click();
    await l.page.getByRole("heading", { name: "Dictation", exact: true, level: 1 }).waitFor();
  });

  it("reports a history file from a newer version, keeps it and offers an update check", async () => {
    const userData = tmp();
    writeFileSync(path.join(userData, "dictation-history.json"), JSON.stringify({ version: 99, entries: [] }));
    const l = await start({ userData });
    await open(l, "History");
    await l.page.getByText("This history was saved by a newer Speak Kit").waitFor();
    await l.page.getByRole("button", { name: "Check for updates" }).waitFor();
    expect(JSON.parse(readFileSync(path.join(userData, "dictation-history.json"), "utf8")).version).toBe(99);
  });

  it("says so when the history file cannot be read, and keeps a copy of it", async () => {
    const userData = tmp();
    writeFileSync(path.join(userData, "dictation-history.json"), "{ half a file");
    const l = await start({ userData });
    await open(l, "History");
    await l.page.getByText("The history file could not be read").waitFor();
    await l.page.getByText(/A copy was kept as dictation-history\.unreadable-\d+\.json/).waitFor();
  });

  it("keeps the file and says so when the Recycle Bin refuses a recording", async () => {
    const userData = tmp();
    seed(userData, entries, true);
    const l = await start({ userData });
    await open(l, "History");
    await l.page.getByRole("button", { name: /^Delete: Remind/ }).click();
    // The test run has no Recycle Bin for the temporary folder on every system; the notice appears when the move fails, and the file is never lost either way.
    await l.page.locator("[data-row=e1]").waitFor({ state: "detached" });
    expect(readFileSync(path.join(userData, "dictation-history.json"), "utf8")).toContain("e2");
  });

  it("opens Keep recordings with its limits and saves the choice", async () => {
    const userData = tmp();
    seed(userData, entries);
    const l = await start({ userData });
    await open(l, "History");
    await l.page.getByRole("button", { name: "More history actions" }).click();
    await l.page.getByRole("menuitem", { name: "Keep recordings (off)" }).click();
    const dialog = l.page.getByRole("dialog", { name: "Keep recordings" });
    await dialog.getByText("The oldest recordings are removed first when they pass the size below", { exact: false }).waitFor();
    expect(await dialog.getByRole("combobox", { name: "Most space recordings may use" }).textContent()).toContain("512 MB");
    await dialog.getByRole("switch", { name: "Keep the audio of each dictation" }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await l.page.waitForFunction(async () => (await window.speakkitDictation.status()).settings.keepRecordings === true);
  });

  it("copies one of the last five dictations from Copy recent", async () => {
    const userData = tmp();
    seed(userData, entries);
    const l = await start({ userData });
    await open(l, "History");
    await l.page.getByRole("button", { name: "Copy recent" }).click();
    await l.page.getByRole("list", { name: "Recent dictations" }).waitFor();
    expect(await l.page.getByRole("list", { name: "Recent dictations" }).locator("li").count()).toBe(2);
  });
});

describe("Websites in a mode", () => {
  const addMode = async (l: Launched, name: string) => {
    await l.page.getByRole("button", { name: "Add mode" }).click();
    const d = l.page.getByRole("dialog", { name: "Add a mode" });
    await d.getByLabel("Name").fill(name);
    await d.getByRole("button", { name: "Add mode" }).click();
    await l.page.getByRole("heading", { name, exact: true, level: 1 }).waitFor();
  };

  it("adds a website as a host name, refuses text that is not one, moves it from another mode and removes it", async () => {
    const l = await start();
    await open(l, "Modes");
    await addMode(l, "Mail");
    await l.page.getByRole("button", { name: "Add website" }).click();
    const dialog = l.page.getByRole("dialog", { name: "Add a website to Mail" });
    await dialog.getByLabel("Website").fill("two words");
    await dialog.getByText("That is not a website address.").waitFor();
    expect(await dialog.getByRole("button", { name: "Add website" }).isDisabled()).toBe(true);
    await dialog.getByLabel("Website").fill("https://www.Mail.Google.com/inbox");
    await dialog.getByRole("button", { name: "Add website" }).click();
    await expect.poll(async () => (await settings(l)).modes[0]?.sites).toEqual(["mail.google.com"]);
    await l.page.getByRole("button", { name: "Remove mail.google.com" }).waitFor();

    await l.page.getByRole("button", { name: "Add website" }).click();
    await l.page.getByRole("dialog", { name: "Add a website to Mail" }).getByLabel("Website").fill("mail.google.com");
    await l.page.getByText("mail.google.com is already in this mode.").waitFor();
    await l.page.getByRole("dialog", { name: "Add a website to Mail" }).getByRole("button", { name: "Cancel" }).click();

    await l.page.getByRole("button", { name: "Modes", exact: true }).click();
    await addMode(l, "Work");
    await l.page.getByRole("button", { name: "Add website" }).click();
    const second = l.page.getByRole("dialog", { name: "Add a website to Work" });
    await second.getByLabel("Website").fill("mail.google.com");
    await second.getByText("mail.google.com is in Mail now. It moves to this mode.").waitFor();
    await second.getByRole("button", { name: "Add website" }).click();
    await expect
      .poll(async () => (await settings(l)).modes.map((m: { name: string; sites: string[] }) => [m.name, m.sites]))
      .toEqual([
        ["Mail", []],
        ["Work", ["mail.google.com"]],
      ]);
    await l.page.getByRole("button", { name: "Remove mail.google.com" }).click();
    await expect.poll(async () => (await settings(l)).modes[1]?.sites).toEqual([]);
  });
});

describe("Installed-app picker", () => {
  const APPS = JSON.stringify([
    { key: "slack", name: "Slack" },
    { key: "putty", name: "PuTTY" },
    { key: "code", name: "Visual Studio Code" },
  ]);

  it("offers installed programs in the mode's Add app dialog, narrows them as you type and skips the ones already added", async () => {
    const l = await start({ env: { SPEAKKIT_INSTALLED_APPS: APPS } });
    await open(l, "Modes");
    await l.page.getByRole("button", { name: "Add mode" }).click();
    await l.page.getByRole("dialog", { name: "Add a mode" }).getByLabel("Name").fill("Chat");
    await l.page.getByRole("dialog", { name: "Add a mode" }).getByRole("button", { name: "Add mode" }).click();
    await l.page.getByRole("heading", { name: "Chat", exact: true, level: 1 }).waitFor();
    await l.page.getByRole("button", { name: "Add app" }).first().click();
    const dialog = l.page.getByRole("dialog", { name: "Add an app to Chat" });
    const list = dialog.getByRole("group", { name: "Installed apps" });
    await list.getByRole("button", { name: "Use PuTTY" }).waitFor();
    expect(await list.getByRole("button").count()).toBe(3);
    await dialog.getByLabel("Program name").fill("sla");
    await list.getByRole("button", { name: "Use Slack" }).waitFor();
    expect(await list.getByRole("button").count()).toBe(1);
    await dialog.getByLabel("Program name").fill("zzz");
    await dialog.getByText(/No installed app matches .zzz.\. You can still add the name you typed\./).waitFor();
    await dialog.getByLabel("Program name").fill("sla");
    await list.getByRole("button", { name: "Use Slack" }).click();
    expect(await dialog.getByLabel("Program name").inputValue()).toBe("slack");
    await dialog.getByRole("button", { name: "Add app" }).click();
    await expect.poll(async () => (await settings(l)).modes[0]?.apps).toEqual(["slack"]);

    await l.page.getByRole("button", { name: "Add app" }).first().click();
    await l.page.getByRole("dialog", { name: "Add an app to Chat" }).getByRole("group", { name: "Installed apps" }).getByRole("button", { name: "Use Slack" }).waitFor({ state: "detached" });
  });

  it("adds a program to the insert-method table with one click on an installed app", async () => {
    const l = await start({ env: { SPEAKKIT_INSTALLED_APPS: APPS } });
    await open(l, "Dictation");
    await l.page.getByRole("textbox", { name: "Program name" }).focus();
    await l.page.getByRole("group", { name: "Installed apps" }).getByRole("button", { name: "Use PuTTY" }).click();
    await expect.poll(async () => Object.keys((await settings(l)).appRules)).toContain("putty");
  });

  it("says so and still lets the name be typed when no list can be made", async () => {
    const l = await start({ env: { SPEAKKIT_INSTALLED_APPS: "not json" } });
    await open(l, "Dictation");
    await l.page.getByRole("textbox", { name: "Program name" }).focus();
    await l.page.getByText("No installed apps found.").waitFor();
    await l.page.getByRole("textbox", { name: "Program name" }).fill("wezterm");
    await l.page.getByRole("textbox", { name: "Program name" }).press("Enter");
    await expect.poll(async () => Object.keys((await settings(l)).appRules)).toContain("wezterm");
  });
});
