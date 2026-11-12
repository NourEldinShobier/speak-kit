import { afterEach, describe, expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
    expect(cli(l, "--json", "meetings").code).toBe(1);
    const dictate = cli(l, "--json", "dictate", "--print");
    expect(dictate.code).toBe(1);
    expect(JSON.parse(dictate.out)).toMatchObject({ error: { code: "unsupported" } });
    await l.app.close();
    // The file may outlive the process; it names a process that is gone, so it is ignored.
    const gone = cli(l, "status");
    expect(gone.code).toBe(3);
    expect(gone.err).toContain("Speak Kit is not running");
  });
});
