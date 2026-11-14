import { afterEach, describe, expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { appDir, launch, type Launched } from "./harness";

const running: Launched[] = [];
const start = async (config: object = {}) => {
  const l = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0, ...config }, env: { SPEAKKIT_TEST: "1" } });
  running.push(l);
  return l;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
});

const file = (l: Launched) => path.join(l.userData, "control.json");
const until = async (f: () => boolean, ms = 10_000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (f()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(f()).toBe(true);
};
const cli = (l: Launched, ...args: string[]) => {
  const r = spawnSync(process.execPath, [path.join(appDir, "dist/cli/speakkit.js"), ...args], { env: { ...process.env, SPEAKKIT_USER_DATA: l.userData }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

/** Two seconds of a 16 kHz mono tone, as a WAVE file in a temporary folder. */
function tone(dir: string): string {
  const n = 32_000;
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
  const file = path.join(dir, "talk.wav");
  writeFileSync(file, buf);
  return file;
}

describe("control server in the real app", () => {
  it("writes the discovery file, answers with the token, and hides from a wrong token", async () => {
    const l = await start();
    await until(() => existsSync(file(l)));
    const d = JSON.parse(readFileSync(file(l), "utf8"));
    expect(d).toMatchObject({ pid: expect.any(Number), version: expect.any(String) });
    const post = (token: string, command: string) => fetch(`http://127.0.0.1:${d.port}/control`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ command }) });
    expect(await (await post(d.token, "capabilities")).json()).toMatchObject({ ok: true, version: 1, data: { features: { print: true } } });
    expect((await post("nope".repeat(16), "capabilities")).status).toBe(404);
    expect(await (await post(d.token, "status")).json()).toMatchObject({ ok: true, data: { dictation: { phase: "idle" } } });
    await l.app.close();
  });

  it("is not started when the setting is off", async () => {
    const l = await start({ controlServer: false });
    await l.page.waitForTimeout(1500);
    expect(existsSync(file(l))).toBe(false);
  });

  it("the command line talks to it: status, voice, settings, history, and exit codes for usage and for an app that is not running", async () => {
    const l = await start();
    await until(() => existsSync(file(l)));
    const status = cli(l, "--json", "status");
    expect(status.code).toBe(0);
    expect(JSON.parse(status.out)).toMatchObject({ ok: true, version: 1, data: { reader: { status: "idle" } } });
    expect(JSON.parse(cli(l, "--json", "voice", "bf_emma").out)).toMatchObject({ ok: true, data: { voice: "bf_emma" } });
    expect(JSON.parse(cli(l, "--json", "voice").out).data.voice).toBe("bf_emma");
    expect(cli(l, "--json", "settings", "set", "speed=2").code).toBe(0);
    expect(JSON.parse(cli(l, "--json", "settings", "get", "speed").out).data.value).toBe(2);
    const refused = cli(l, "--json", "settings", "set", "speed=99");
    expect(refused.code).toBe(1);
    expect(JSON.parse(refused.out)).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(cli(l, "--json", "history").code).toBe(0);
    expect(cli(l, "read").code).toBe(2);
    expect(cli(l, "--json", "meetings", "list").code).toBe(0);
    const dictate = cli(l, "--json", "dictate", "--print");
    expect(dictate.code).toBe(1);
    expect(JSON.parse(dictate.out)).toMatchObject({ error: { code: "unsupported" } });
    await l.app.close();
    // The file may outlive the process; it names a process that is gone, so it is ignored.
    const gone = cli(l, "status");
    expect(gone.code).toBe(3);
    expect(gone.err).toContain("Speak Kit is not running");
  });

  it("transcribes a file from the command line: prints the words, and refuses a missing file, an unsupported one and no file", async () => {
    const l = await start();
    await until(() => existsSync(file(l)));
    const dir = mkdtempSync(path.join(tmpdir(), "speakkit-transcribe-"));
    const done = cli(l, "transcribe", tone(dir));
    expect(done.code).toBe(0);
    expect(done.out).toContain("hello from the fake speech engine");
    const missing = JSON.parse(cli(l, "--json", "transcribe", path.join(dir, "missing.wav")).out);
    expect(missing).toMatchObject({ ok: false });
    writeFileSync(path.join(dir, "notes.xyz"), "this is just text");
    const bad = cli(l, "--json", "transcribe", path.join(dir, "notes.xyz"));
    expect(bad.code).toBe(1);
    expect(JSON.parse(bad.out)).toMatchObject({ ok: false, error: { code: "unsupported" } });
    expect(cli(l, "transcribe").code).toBe(2);
    await l.app.close();
  });
});
