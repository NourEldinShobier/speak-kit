import { describe, expect, it } from "vite-plus/test";
import { hostPort } from "../src/host-port";
import { processChannel, setProcessSpawner, type Channel } from "../src/channel";

describe("hostPort", () => {
  it("talks over the parent port inside an Electron utility process and unwraps the message data", () => {
    const sent: unknown[] = [];
    let listener: ((e: { data: unknown }) => void) | undefined;
    let event = "";
    const port = hostPort({ parentPort: { postMessage: (m) => void sent.push(m), on: (ev, cb) => ((event = ev), void (listener = cb)) }, on: () => 0 });
    const got: unknown[] = [];
    port.onMessage((m) => void got.push(m));
    port.send({ type: "ready" });
    listener!({ data: { type: "synth", id: 1 } });
    expect(sent).toEqual([{ type: "ready" }]);
    expect(got).toEqual([{ type: "synth", id: 1 }]);
    expect(event).toBe("message");
  });

  it("talks over IPC inside a forked node process", () => {
    const sent: unknown[] = [];
    let listener: ((m: unknown) => void) | undefined;
    let event = "";
    const port = hostPort({ send: (m) => (sent.push(m), true), on: (ev, cb) => ((event = ev), void (listener = cb)) });
    const got: unknown[] = [];
    port.onMessage((m) => void got.push(m));
    port.send({ type: "ready" });
    listener!({ type: "cancel", id: 2 });
    expect(sent).toEqual([{ type: "ready" }]);
    expect(got).toEqual([{ type: "cancel", id: 2 }]);
    expect(event).toBe("message");
  });
});

describe("processChannel spawner", () => {
  it("starts the host through the installed spawner with the init in the allowlisted environment", () => {
    const calls: Array<{ file: string; env: Record<string, string> }> = [];
    const fake = { post() {}, on() {}, terminate: async () => {} } satisfies Channel<unknown, unknown>;
    setProcessSpawner((file, env) => (calls.push({ file, env }), fake));
    try {
      expect(processChannel("/app/stt-worker.js", { gpu: true }, { EXTRA: "1" })).toBe(fake);
    } finally {
      setProcessSpawner();
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]!.file).toBe("/app/stt-worker.js");
    expect(calls[0]!.env).toMatchObject({ EXTRA: "1", SPEAKKIT_WORKER_INIT: '{"gpu":true}' });
    expect(calls[0]!.env.SOME_SECRET_TOKEN).toBeUndefined();
  });
});
