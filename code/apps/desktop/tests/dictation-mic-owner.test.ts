import { afterEach, describe, expect, it } from "vite-plus/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { health, launch, type Launched } from "./harness";

const running: Launched[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
});

const until = async (f: () => boolean | Promise<boolean>, ms = 10_000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(await f()).toBe(true);
};
type Hook = Record<string, (...a: unknown[]) => unknown>;
const hook = (l: Launched, name: string) => l.app.evaluate((_e, n) => (globalThis as unknown as { __speakkit: { dictation: Hook } }).__speakkit.dictation[n]!(), name);

describe("dictation while a voice chat conversation holds the microphone", () => {
  it("is refused with the holder named, and works again once the conversation lets go", async () => {
    const l = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0, dictation: { enabled: true } }, env: { SPEAKKIT_TEST: "1" } });
    running.push(l);
    await until(() => existsSync(path.join(l.userData, "control.json")) && existsSync(path.join(l.userData, "token")));
    const control = JSON.parse(readFileSync(path.join(l.userData, "control.json"), "utf8"));
    const token = readFileSync(path.join(l.userData, "token"), "utf8").trim();
    const dictate = (action: string) =>
      fetch(`http://127.0.0.1:${control.port}/control`, { method: "POST", headers: { authorization: `Bearer ${control.token}` }, body: JSON.stringify({ command: "dictate", args: { action } }) });
    const held = (on: boolean) =>
      fetch(`http://127.0.0.1:${l.port}/v1/voice-chat/mic`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ held: on }) });

    await until(async () => (await health(l.port).catch(() => undefined))?.engine.state === "ready");
    expect((await held(true)).status).toBe(204);
    await dictate("start");
    await until(async () => JSON.stringify(await hook(l, "state")).includes("mic-in-use"));
    expect(await hook(l, "state")).toMatchObject({ status: "error", code: "mic-in-use", owner: "Voice chat" });

    expect((await held(false)).status).toBe(204);
    await until(async () => ((await hook(l, "state")) as { status: string }).status === "idle");
    await dictate("start");
    await until(async () => ((await hook(l, "state")) as { status: string }).status === "recording");
    await dictate("cancel");
  });
});
