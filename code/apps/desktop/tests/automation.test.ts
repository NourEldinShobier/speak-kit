import { afterEach, describe, expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "speakkit-auto-"));
  dirs.push(d);
  return d;
};

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

describe("the MCP bridge with the app closed", () => {
  const ask = (dir: string, method: string, params: object = {}) => {
    const r = cli(dir, ["mcp"], `${JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })}\n`);
    return JSON.parse(r.out.trim().split("\n")[0]!).result;
  };

  it("lists the reading tools and nothing that reads the person's own words", async () => {
    expect(ask(tmp(), "tools/list").tools.map((t: { name: string }) => t.name)).toEqual(["read_aloud", "stop_reading", "reading_queue"]);
  });

  it("says Speak Kit is not running for a tool call, and does not start it", async () => {
    const dir = tmp();
    const on = ask(dir, "tools/call", { name: "reading_queue", arguments: {} });
    expect(on.isError).toBe(true);
    expect(on.content[0].text).toBe("Speak Kit is not running.");
    expect(existsSync(path.join(dir, "control.json"))).toBe(false);
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
    const pages = ["Home", "Library", "Voices", "Voice chat", "Engines", "Dictation", "Modes", "Vocabulary", "History"];
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

describe("accessibility scan with axe", () => {
  it("finds no serious or critical violation on the main pages", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    const found: string[] = [];
    for (const name of ["Home", "Library", "Voices", "Voice chat", "Engines", "Dictation", "Modes", "Vocabulary", "History"]) {
      await l.page.getByRole("link", { name, exact: true }).first().click();
      await l.page.getByRole("heading", { level: 1 }).first().waitFor();
      await l.page.waitForTimeout(300);
      found.push(...(await axeViolations(l)).filter((v) => /^(serious|critical)/.test(v)).map((v) => `${name}: ${v}`));
    }
    expect(found).toEqual([]);
  });
});
