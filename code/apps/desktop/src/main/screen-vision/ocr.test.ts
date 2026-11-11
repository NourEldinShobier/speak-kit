import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createOcr, noOcr, type HostProcess } from "./ocr";

/** A helper whose replies the test writes. */
function fakeHost() {
  const written: { id: number; png: string }[] = [];
  let line: ((l: string) => void) | undefined;
  const early: string[] = [];
  let exit: () => void = () => {};
  const h = {
    killed: 0,
    written,
    /** What the helper writes; kept until the manager has started it and listens. */
    say: (o: object) => (line ? line(JSON.stringify(o)) : early.push(JSON.stringify(o))),
    die: () => exit(),
    proc: {
      write: (l: string) => void written.push(JSON.parse(l)),
      onLine: (cb) => ((line = cb), early.splice(0).forEach(cb)),
      onExit: (cb) => void (exit = cb),
      kill: () => void h.killed++,
    } satisfies HostProcess,
  };
  return h;
}

const PNG = new Uint8Array([137, 80, 78, 71]);
const B64 = "iVBORw==";
const ok = { id: 1, lang: "en-US", lines: [{ t: "Hello", x: 1, y: 2, w: 3, h: 4 }] };

afterEach(() => vi.useRealTimers());

describe("createOcr", () => {
  it("starts the helper on the first call, sends the picture as base64 and returns its lines", async () => {
    const hosts = [fakeHost()];
    const starts: number[] = [];
    const ocr = createOcr({ start: () => (starts.push(1), hosts[0]!.proc) });
    expect(starts).toHaveLength(0);
    const p = ocr.recognize(PNG);
    hosts[0]!.say({ ready: true, lang: "en-US" });
    await vi.waitFor(() => expect(hosts[0]!.written).toHaveLength(1));
    expect(hosts[0]!.written[0]).toEqual({ id: 1, png: B64 });
    hosts[0]!.say(ok);
    expect(await p).toEqual({ ok: true, lang: "en-US", lines: ok.lines });
    expect(starts).toHaveLength(1);
  });

  it("keeps one helper for later calls and matches each answer to its request", async () => {
    const h = fakeHost();
    const ocr = createOcr({ start: () => h.proc });
    h.say({ ready: true, lang: "en-US" });
    const a = ocr.recognize(PNG);
    const b = ocr.recognize(PNG);
    await vi.waitFor(() => expect(h.written.map((w) => w.id)).toEqual([1, 2]));
    h.say({ id: 2, lang: "en-US", lines: [] });
    h.say({ id: 1, lang: "en-US", lines: [{ t: "one", x: 0, y: 0, w: 1, h: 1 }] });
    expect(await a).toMatchObject({ ok: true, lines: [{ t: "one" }] });
    expect(await b).toMatchObject({ ok: true, lines: [] });
  });

  it("says no-language when no recognizer language is installed, without sending anything", async () => {
    const h = fakeHost();
    const ocr = createOcr({ start: () => h.proc });
    h.say({ ready: true, lang: null });
    expect(await ocr.recognize(PNG)).toEqual({ ok: false, reason: "no-language" });
    expect(h.written).toHaveLength(0);
  });

  it("reports an error line of the helper as failed and goes on", async () => {
    const h = fakeHost();
    const ocr = createOcr({ start: () => h.proc });
    h.say({ ready: true, lang: "en-US" });
    const p = ocr.recognize(PNG);
    await vi.waitFor(() => expect(h.written).toHaveLength(1));
    h.say({ id: 1, error: "bad image" });
    expect(await p).toEqual({ ok: false, reason: "failed" });
    const q = ocr.recognize(PNG);
    await vi.waitFor(() => expect(h.written).toHaveLength(2));
    h.say({ ...ok, id: 2 });
    expect(await q).toMatchObject({ ok: true });
    expect(h.killed).toBe(0);
  });

  it("ignores lines that are not replies and answers for ids it does not know", async () => {
    const h = fakeHost();
    const ocr = createOcr({ start: () => h.proc });
    h.say({ ready: true, lang: "en-US" });
    const p = ocr.recognize(PNG);
    await vi.waitFor(() => expect(h.written).toHaveLength(1));
    h.say({ id: 99, error: "stray" });
    h.say({ hello: "world" });
    h.say({ ...ok, id: 1 });
    expect(await p).toMatchObject({ ok: true });
  });

  it("fails a request that gets no answer in time, kills the helper and starts a new one next time", async () => {
    vi.useFakeTimers();
    const hosts = [fakeHost(), fakeHost()];
    let n = 0;
    const ocr = createOcr({ start: () => hosts[n++]!.proc, timeoutMs: 1000 });
    hosts[0]!.say({ ready: true, lang: "en-US" });
    const p = ocr.recognize(PNG);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toEqual({ ok: false, reason: "failed" });
    expect(hosts[0]!.killed).toBe(1);
    hosts[1]!.say({ ready: true, lang: "en-US" });
    const q = ocr.recognize(PNG);
    await vi.advanceTimersByTimeAsync(0);
    hosts[1]!.say({ ...ok, id: 2 });
    expect(await q).toMatchObject({ ok: true });
    expect(n).toBe(2);
  });

  it("fails when the helper never says it is ready", async () => {
    vi.useFakeTimers();
    const h = fakeHost();
    const ocr = createOcr({ start: () => h.proc, timeoutMs: 1000 });
    const p = ocr.recognize(PNG);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toEqual({ ok: false, reason: "failed" });
    expect(h.killed).toBe(1);
  });

  it("fails the requests in flight when the helper exits, and starts a new helper next time", async () => {
    const hosts = [fakeHost(), fakeHost()];
    let n = 0;
    const ocr = createOcr({ start: () => hosts[n++]!.proc });
    hosts[0]!.say({ ready: true, lang: "en-US" });
    const p = ocr.recognize(PNG);
    await vi.waitFor(() => expect(hosts[0]!.written).toHaveLength(1));
    hosts[0]!.die();
    expect(await p).toEqual({ ok: false, reason: "failed" });
    hosts[1]!.say({ ready: true, lang: "en-US" });
    const q = ocr.recognize(PNG);
    await vi.waitFor(() => expect(hosts[1]!.written).toHaveLength(1));
    hosts[1]!.say({ ...ok, id: 2 });
    expect(await q).toMatchObject({ ok: true });
  });

  it("stops the helper after the idle time and not before", async () => {
    vi.useFakeTimers();
    const h = fakeHost();
    const ocr = createOcr({ start: () => h.proc, idleMs: 60_000 });
    h.say({ ready: true, lang: "en-US" });
    const p = ocr.recognize(PNG);
    await vi.advanceTimersByTimeAsync(0);
    h.say({ ...ok, id: 1 });
    await p;
    await vi.advanceTimersByTimeAsync(59_000);
    expect(h.killed).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.killed).toBe(1);
  });

  it("dispose kills the helper and fails what is waiting", async () => {
    const h = fakeHost();
    const ocr = createOcr({ start: () => h.proc });
    h.say({ ready: true, lang: "en-US" });
    const p = ocr.recognize(PNG);
    await vi.waitFor(() => expect(h.written).toHaveLength(1));
    ocr.dispose();
    expect(await p).toEqual({ ok: false, reason: "failed" });
    expect(h.killed).toBe(1);
  });
});

describe("noOcr", () => {
  it("is unsupported", async () => {
    expect(await noOcr.recognize(PNG)).toEqual({ ok: false, reason: "unsupported" });
  });
});
