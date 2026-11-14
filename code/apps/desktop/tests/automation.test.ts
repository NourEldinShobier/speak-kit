import { afterEach, describe, expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { appDir, launch, type Launched } from "./harness";

const running: Launched[] = [];
const dirs: string[] = [];
const start = async (o: Parameters<typeof launch>[0] = {}) => {
  const l = await launch({ ...o, env: { SPEAKKIT_TEST: "1", ...o.env } });
  running.push(l);
  return l;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const DONE = { setupDone: true, setupSkipped: false, preferredPort: 0 };
const configOf = (l: Launched) => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8"));
const discovery = (dir: string) => JSON.parse(readFileSync(path.join(dir, "control.json"), "utf8")) as { port: number; token: string };
const until = async (f: () => boolean, ms = 10_000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (f()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(f()).toBe(true);
};
const cli = (dir: string, args: string[], input?: string) => {
  const r = spawnSync(process.execPath, [path.join(appDir, "dist/cli/speakkit.js"), ...args], {
    env: { ...process.env, SPEAKKIT_USER_DATA: dir },
    encoding: "utf8",
    ...(input !== undefined && { input }),
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const openAutomation = async (l: Launched) => {
  await l.page.getByRole("heading", { name: "Home" }).waitFor();
  await l.page.getByRole("link", { name: "Settings" }).click();
  await l.page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Automation", exact: true }).click();
  await l.page.getByRole("heading", { name: "Automation", exact: true, level: 1 }).waitFor();
};
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "speakkit-auto-"));
  dirs.push(d);
  return d;
};

describe("Automation page", () => {
  it("lists the tools with a switch each, saves a choice, and pauses the switches with the server", async () => {
    const l = await start({ config: DONE });
    await openAutomation(l);
    await l.page.getByText("speakkit status --json").waitFor();
    await l.page.getByRole("button", { name: "Copy speakkit://lab/caption-export" }).waitFor();
    const history = l.page.getByRole("switch", { name: "Search dictation history" });
    expect(await history.getAttribute("aria-checked")).toBe("false");
    expect(await l.page.getByRole("switch", { name: "Read aloud" }).getAttribute("aria-checked")).toBe("true");
    await history.click();
    await l.page.waitForFunction(() => document.querySelector('[aria-label="Search dictation history"]')?.getAttribute("aria-checked") === "true");
    expect(configOf(l).mcpTools).toEqual({ history_search: true });
    await l.page.getByRole("switch", { name: "Let AI apps use Speak Kit" }).click();
    await l.page.getByText("The local server is off").waitFor();
    expect(configOf(l).controlServer).toBe(false);
    expect(await history.isDisabled()).toBe(true);
    await l.page.getByRole("button", { name: "Start server" }).click();
    await l.page.getByText("The local server is off").waitFor({ state: "detached" });
    expect(configOf(l).controlServer).toBe(true);
  });

  it("says the command-line tool is part of the installed app when run from source", async () => {
    const l = await start({ config: DONE });
    await openAutomation(l);
    await l.page.getByText("Not available").waitFor();
    expect(await l.page.getByText("Puts a speakkit command on your PATH").count()).toBe(0);
  });

  it("Reset token gives the discovery file a new token and the old one is refused", async () => {
    const l = await start({ config: DONE });
    await until(() => existsSync(path.join(l.userData, "control.json")));
    const before = discovery(l.userData);
    await openAutomation(l);
    await l.page.getByRole("button", { name: "Reset token" }).click();
    await until(() => discovery(l.userData).token !== before.token);
    const post = (token: string) => fetch(`http://127.0.0.1:${before.port}/control`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ command: "status" }) });
    expect((await post(before.token)).status).toBe(404);
    expect((await post(discovery(l.userData).token)).status).toBe(200);
    expect(cli(l.userData, ["--json", "status"]).code).toBe(0);
  });

  it("names every control and holds at the 960 px window without sideways scroll", async () => {
    const l = await start({ config: DONE });
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 800));
    await openAutomation(l);
    const unnamed = await l.page.evaluate(() =>
      [...document.querySelectorAll("button, [role=switch], a[href]")].filter((e) => !(e.getAttribute("aria-label") || e.textContent?.trim())).map((e) => e.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
    expect(await l.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

describe("the command line against the real app", () => {
  it("speak --print shows the sentences, queue and voices answer, and stop works", async () => {
    const l = await start({ config: DONE });
    await until(() => existsSync(path.join(l.userData, "control.json")));
    const printed = cli(l.userData, ["speak", "One sentence. Another sentence.", "--print"]);
    expect([printed.code, printed.out]).toEqual([0, "One sentence.\nAnother sentence.\n"]);
    expect(JSON.parse(cli(l.userData, ["--json", "queue"]).out)).toMatchObject({ ok: true, data: { items: [] } });
    expect(JSON.parse(cli(l.userData, ["--json", "voices"]).out).data.voices.length).toBeGreaterThan(0);
    expect(cli(l.userData, ["stop", "--keep-queue"]).code).toBe(0);
    expect(cli(l.userData, ["speak", "x", "--out", "relative.txt"]).code).toBe(2);
  });

  it("speak a file with --out saves the audio and refuses a file over the limit", async () => {
    const l = await start({ config: DONE });
    await until(() => existsSync(path.join(l.userData, "control.json")));
    const dir = tmp();
    const text = path.join(dir, "notes.txt");
    writeFileSync(text, "A short note for the export.");
    const out = path.join(dir, "note.wav");
    const done = cli(l.userData, ["speak", text, "--out", out]);
    expect(done.code).toBe(0);
    expect(done.out.trim()).toBe(out);
    expect(existsSync(out)).toBe(true);
    const big = path.join(dir, "big.txt");
    writeFileSync(big, "");
    spawnSync(process.execPath, ["-e", `require("fs").truncateSync(${JSON.stringify(big)}, 64*1024*1024+1)`]);
    const refused = cli(l.userData, ["--json", "speak", big]);
    expect([refused.code, JSON.parse(refused.out).error.code]).toEqual([1, "too-large"]);
  });

  it("turns an experiment on and off and lists it", async () => {
    const l = await start({ config: DONE });
    await until(() => existsSync(path.join(l.userData, "control.json")));
    expect(cli(l.userData, ["labs", "on", "caption-export"]).code).toBe(0);
    await until(() => configOf(l).experiments?.["caption-export"] === true);
    expect(cli(l.userData, ["labs", "off", "caption-export"]).code).toBe(0);
    await until(() => configOf(l).experiments?.["caption-export"] !== true);
    const unknown = cli(l.userData, ["--json", "labs", "on", "no-such-lab"]);
    expect([unknown.code, JSON.parse(unknown.out).error.code]).toEqual([2, "usage"]);
  });
});

describe("reads and the MCP bridge with the app closed", () => {
  const folder = () => {
    const dir = tmp();
    mkdirSync(path.join(dir, "meetings", "aaaaaa1"), { recursive: true });
    const entry = {
      id: "aaaaaa1",
      title: "Budget review",
      titleTemporary: false,
      providerId: "zoom",
      providerName: "Zoom",
      startedAt: Date.UTC(2026, 10, 12, 10),
      durationSec: 90,
      status: "done",
      audio: { you: 0, them: 0 },
      notes: { state: "off", chapters: 0 },
      exports: [],
    };
    writeFileSync(path.join(dir, "meetings", "manifest.json"), JSON.stringify({ v: 1, entries: [entry] }));
    writeFileSync(
      path.join(dir, "meetings", "aaaaaa1", "transcript.json"),
      JSON.stringify({
        v: 1,
        lines: [
          { start: 5, end: 9, text: "the budget is over plan", who: "You" },
          { start: 70, end: 80, text: "move the launch", who: "Them" },
        ],
      }),
    );
    return dir;
  };

  it("meetings list, show with a range, and search never start the app and change no file", async () => {
    const dir = folder();
    const before = readFileSync(path.join(dir, "meetings", "manifest.json"), "utf8");
    expect(cli(dir, ["meetings", "list"]).out).toContain("Budget review");
    const shown = cli(dir, ["meetings", "show", "latest", "--from", "1:00"]);
    expect(shown.code).toBe(0);
    expect(shown.out).toContain("[01:10] Them: move the launch");
    expect(shown.out).not.toContain("over plan");
    expect(JSON.parse(cli(dir, ["--json", "meetings", "search", "budget"]).out).data.hits[0].id).toBe("aaaaaa1");
    expect(cli(dir, ["capture", "list"]).out).toBe("No captures yet.\n");
    expect(existsSync(path.join(dir, "control.json"))).toBe(false);
    expect(readFileSync(path.join(dir, "meetings", "manifest.json"), "utf8")).toBe(before);
  });

  it("the MCP bridge lists the tools that are on and answers a meeting read once its switch is on", async () => {
    const dir = folder();
    const ask = (flags: object, method: string, params: object = {}) => {
      writeFileSync(path.join(dir, "config.json"), JSON.stringify({ mcpTools: flags }));
      const r = cli(dir, ["mcp"], `${JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })}\n`);
      return JSON.parse(r.out.trim().split("\n")[0]!).result;
    };
    expect(ask({}, "tools/list").tools.map((t: { name: string }) => t.name)).toEqual(["read_aloud", "stop_reading", "reading_queue"]);
    const off = ask({}, "tools/call", { name: "meetings_list", arguments: {} });
    expect(off.isError).toBe(true);
    const on = ask({ meetings_list: true }, "tools/call", { name: "meetings_list", arguments: {} });
    expect(on.isError).toBe(false);
    expect(JSON.parse(on.content[0].text).meetings[0].title).toBe("Budget review");
  });
});

describe("live transcription over the local API", () => {
  it("a stream of audio ends with the engine's text, the processed text and the times", async () => {
    const l = await start({ config: DONE });
    const token = readFileSync(path.join(l.userData, "token"), "utf8").trim();
    const base = `http://127.0.0.1:${l.port}`;
    const api = (p: string, init: RequestInit & { owner?: string } = {}) =>
      fetch(`${base}${p}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.owner && { "X-Stream-Owner": init.owner }), ...(typeof init.body === "string" && { "Content-Type": "application/json" }) },
      });
    await until(() => existsSync(path.join(l.userData, "token")));
    const made = (await (await api("/v1/streams", { method: "POST", body: JSON.stringify({ process: true, timestamps: true }) })).json()) as { id: string; owner: string };
    const pcm = (ms: number, amp: number) => Buffer.from(new Int16Array((16_000 * ms) / 1000).fill(amp).buffer);
    const sent = await api(`/v1/streams/${made.id}/audio`, { method: "POST", owner: made.owner, body: Buffer.concat([pcm(1500, 9000), pcm(720, 0)]) as unknown as BodyInit });
    expect(sent.status).toBe(202);
    const done = (await (await api(`/v1/streams/${made.id}/finish`, { method: "POST", owner: made.owner })).json()) as {
      text: string;
      processed: string;
      segments: { startMs: number; endMs: number }[];
    };
    expect(done.text).toBe("hello from the fake speech engine");
    expect(typeof done.processed).toBe("string");
    expect(done.segments[0]).toMatchObject({ startMs: 0, endMs: 2220 });
    const caps = (await (await api("/v1/capabilities")).json()) as { commands: Record<string, string> };
    expect(caps.commands["live-stream"]).toBe("available");
  });
});

describe("every control in the main menu pages has a name", () => {
  it("visits each page and finds no button, switch, link or field without an accessible name", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    const pages = ["Home", "Library", "Voices", "Voice chat", "Engines", "Dictation", "Modes", "Vocabulary", "History", "Capture"];
    const problems: string[] = [];
    for (const name of pages) {
      await l.page.getByRole("link", { name, exact: true }).first().click();
      await l.page.getByRole("heading", { level: 1 }).first().waitFor();
      await l.page.waitForTimeout(300);
      const unnamed = await l.page.evaluate(() =>
        [...document.querySelectorAll("button, [role=switch], [role=checkbox], a[href], input, select, textarea")]
          .filter(
            (e) =>
              !(
                e.getAttribute("aria-label") ||
                e.getAttribute("aria-labelledby") ||
                e.textContent?.trim() ||
                (e as HTMLInputElement).labels?.length ||
                e.getAttribute("title") ||
                e.getAttribute("placeholder")
              ),
          )
          .map((e) => e.outerHTML.slice(0, 90)),
      );
      problems.push(...unnamed.map((u) => `${name}: ${u}`));
    }
    expect(problems).toEqual([]);
  });
});

const axeSource = readFileSync(createRequire(createRequire(import.meta.url).resolve("@axe-core/playwright")).resolve("axe-core/axe.min.js"), "utf8");
/** The accessibility rules of WCAG A and AA, run by the axe engine inside the page; what it finds, serious and critical first. */
const axeViolations = async (l: Launched) => {
  await l.page.evaluate(axeSource);
  return l.page.evaluate(async () => {
    const run = (window as unknown as { axe: { run(c: Document, o: object): Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await run.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
    return r.violations.map(
      (v) =>
        `${v.impact} ${v.id} ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
    );
  });
};

describe("the agent skill row and the try-it terminal", () => {
  it("installs the skill into the test folder, shows it as installed, and keeps Test in terminal off while the tool is not installed", async () => {
    const l = await start({ config: DONE });
    await openAutomation(l);
    await l.page.getByText("Agent skill").waitFor();
    await l.page.getByText("Not installed").first().waitFor();
    await l.page.getByRole("button", { name: "Install", exact: true }).click();
    await l.page.getByText("Up to date.").waitFor();
    expect(readFileSync(path.join(l.userData, "agent-skill", "SKILL.md"), "utf8")).toContain("name: speakkit");
    expect(await l.page.getByRole("button", { name: "Install", exact: true }).count()).toBe(0);
    expect(await l.page.getByRole("button", { name: "Copy the skill install command" }).isVisible()).toBe(true);
    expect(await l.page.getByRole("button", { name: "Test in terminal" }).isDisabled()).toBe(true);
  });

  it("shows an Update when the file was written by another version", async () => {
    const l = await start({ config: DONE });
    const file = path.join(l.userData, "agent-skill", "SKILL.md");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "an older skill");
    await openAutomation(l);
    await l.page.getByText("Update available").waitFor();
    await l.page.getByRole("button", { name: "Update", exact: true }).click();
    await l.page.getByText("Up to date.").waitFor();
    expect(readFileSync(file, "utf8")).toContain("name: speakkit");
  });

  it("shows the real discovery file path, not a made-up one", async () => {
    const l = await start({ config: DONE });
    await openAutomation(l);
    await l.page.getByText(path.join(l.userData, "control.json"), { exact: true }).waitFor();
  });
});

describe("accessibility scan with axe", () => {
  it("finds no serious or critical violation on the Automation page at 960 px", async () => {
    const l = await start({ config: DONE });
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 800));
    await openAutomation(l);
    await l.page.getByText("Agent skill").waitFor();
    expect((await axeViolations(l)).filter((v) => /^(serious|critical)/.test(v))).toEqual([]);
  });

  it("finds no serious or critical violation on the main pages", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    const found: string[] = [];
    for (const name of ["Home", "Library", "Voices", "Voice chat", "Engines", "Dictation", "Modes", "Vocabulary", "History", "Capture"]) {
      await l.page.getByRole("link", { name, exact: true }).first().click();
      await l.page.getByRole("heading", { level: 1 }).first().waitFor();
      await l.page.waitForTimeout(300);
      found.push(...(await axeViolations(l)).filter((v) => /^(serious|critical)/.test(v)).map((v) => `${name}: ${v}`));
    }
    expect(found).toEqual([]);
  });
});
