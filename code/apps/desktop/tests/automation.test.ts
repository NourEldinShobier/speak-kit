import { afterEach, describe, expect, it } from "vite-plus/test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
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

const DONE = { setupDone: true, setupSkipped: false };
const until = async (f: () => boolean, ms = 10_000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (f()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(f()).toBe(true);
};

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
    await l.page.getByRole("heading", { name: "Dictation", exact: true }).waitFor();
    const pages = ["Library", "Voices", "Voice chat", "Dictation", "Modes", "Vocabulary", "History"];
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
    await l.page.getByRole("heading", { name: "Dictation", exact: true }).waitFor();
    const found: string[] = [];
    for (const name of ["Library", "Voices", "Voice chat", "Dictation", "Modes", "Vocabulary", "History"]) {
      await l.page.getByRole("link", { name, exact: true }).first().click();
      await l.page.getByRole("heading", { level: 1 }).first().waitFor();
      await l.page.waitForTimeout(300);
      found.push(...(await axeViolations(l)).filter((v) => /^(serious|critical)/.test(v)).map((v) => `${name}: ${v}`));
    }
    expect(found).toEqual([]);
  });
});
