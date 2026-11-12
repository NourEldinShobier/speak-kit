import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { parseConfig } from "../../shared/schemas";
import { KeyStore, type SafeStorageLike } from "./key-store";
import { createVoiceChat } from "./service";

const KEY = "sk-proj-Service_Key-0123456789abcdef";
const safe: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(`ENC1:${Buffer.from(s).reverse().toString("base64")}`),
  decryptString: (b) => Buffer.from(b.toString().slice(5), "base64").reverse().toString(),
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "speakkit-vc-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function setup(fetchFn?: typeof fetch, canEncrypt = true) {
  const config = parseConfig({});
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const saveConfig = vi.fn();
  const store = new KeyStore(path.join(dir, "key.bin"), { ...safe, isEncryptionAvailable: () => canEncrypt });
  const vc = createVoiceChat({ store, config, saveConfig, log, baseUrl: "http://openai.test", ...(fetchFn ? { fetch: fetchFn } : {}) });
  return { vc, config, log, saveConfig };
}
const secretReply = () => new Response(JSON.stringify({ value: "ek_abc", expires_at: 1_900_000_000 }), { status: 200 });
const abort = () => new AbortController().signal;

describe("voice chat service", () => {
  it("reports only whether a key is saved, never the key", async () => {
    const { vc } = setup();
    expect(await vc.status()).toEqual({ hasKey: false, canEncrypt: true });
    expect(await vc.setKey(KEY)).toEqual({ ok: true });
    const status = await vc.status();
    expect(status).toEqual({ hasKey: true, canEncrypt: true });
    expect(JSON.stringify(status)).not.toContain("sk-");
    expect(await vc.removeKey()).toEqual({ hasKey: false, canEncrypt: true });
  });

  it("refuses to save when this computer cannot encrypt, and writes nothing", async () => {
    const { vc } = setup(undefined, false);
    expect(await vc.setKey(KEY)).toEqual({ ok: false, code: "encryption-unavailable" });
    expect(await readdir(dir)).toEqual([]);
    expect(await vc.status()).toEqual({ hasKey: false, canEncrypt: false });
  });

  it("refuses a value that is not the shape of a key", async () => {
    const { vc } = setup();
    expect(await vc.setKey("hello world")).toEqual({ ok: false, code: "save-failed" });
    expect(await readdir(dir)).toEqual([]);
  });

  it("stores the trimmed key encrypted, and neither the config nor the log holds it", async () => {
    const calls: string[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      calls.push((init.headers as Record<string, string>).Authorization!);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const { vc, config, log } = setup(fetchFn);
    await vc.setKey(`  ${KEY}\n`);
    expect(JSON.stringify(config)).not.toContain(KEY);
    expect((await readFile(path.join(dir, "key.bin"))).includes(Buffer.from(KEY))).toBe(false);
    expect(JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])).not.toContain(KEY);
    expect(await vc.testKey()).toEqual({ ok: true });
    expect(calls).toEqual([`Bearer ${KEY}`]);
  });

  it("mints with the saved key and the configured voice", async () => {
    const calls: { url: string; auth: string; body: { session: { model: string; audio: { output: { voice: string } } } } }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: (init.headers as Record<string, string>).Authorization!, body: JSON.parse(init.body as string) });
      return secretReply();
    }) as unknown as typeof fetch;
    const { vc, config, saveConfig } = setup(fetchFn);
    await vc.setKey(KEY);
    vc.setVoice("cedar");
    expect(config.voiceChatVoice).toBe("cedar");
    expect(saveConfig).toHaveBeenCalledOnce();
    const r = await vc.server.mint(abort());
    expect(r).toEqual({ ok: true, session: { clientSecret: "ek_abc", expiresAt: 1_900_000_000, model: "gpt-realtime-2.1", voice: "cedar" } });
    expect(JSON.stringify(r)).not.toContain(KEY);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "http://openai.test/v1/realtime/client_secrets", auth: `Bearer ${KEY}` });
    expect(calls[0]!.body.session).toMatchObject({ model: "gpt-realtime-2.1", audio: { output: { voice: "cedar" } } });
  });

  it("answers no-key without calling OpenAI when nothing is saved", async () => {
    const fetchFn = vi.fn(async () => secretReply());
    const { vc } = setup(fetchFn as unknown as typeof fetch);
    expect(await vc.server.hasKey()).toBe(false);
    expect(await vc.server.mint(abort())).toEqual({ ok: false, code: "no-key" });
    expect(await vc.testKey()).toEqual({ ok: false, code: "no-key" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("passes a refusal from OpenAI on as a code and logs the code only", async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ error: { code: "insufficient_quota", message: `quota for ${KEY}` } }), { status: 429 })) as unknown as typeof fetch;
    const { vc, log } = setup(fetchFn);
    await vc.setKey(KEY);
    expect(await vc.server.mint(abort())).toEqual({ ok: false, code: "no-credit" });
    expect(log.warn.mock.calls).toEqual([["voice chat: client secret refused", "no-credit"]]);
  });

  it("tests the key against OpenAI", async () => {
    const { vc } = setup((async () => new Response("{}", { status: 401 })) as unknown as typeof fetch);
    await vc.setKey(KEY);
    expect(await vc.testKey()).toEqual({ ok: false, code: "key-rejected" });
  });
});

describe("capture waiting for the voice chat", () => {
  it("is read through the look call of the server, once", async () => {
    const vc = createVoiceChat({
      store: { has: async () => true, read: async () => "k", canEncrypt: () => true } as never,
      config: {} as never,
      saveConfig: () => {},
      log: { info() {}, warn() {}, error() {} } as never,
    });
    vc.captureInbox.offer("c1", { image: "QUJD", width: 1, height: 1, text: "hi", ocr: "ok", target: "Screen", scope: "capture" });
    const first = await vc.server.look?.({ session: "s", scope: "capture" }, new AbortController().signal);
    expect(first).toMatchObject({ ok: true, look: { target: "Screen" } });
    expect(await vc.server.look?.({ session: "s", scope: "capture" }, new AbortController().signal)).toEqual({ ok: false, code: "no-capture" });
  });

  it("answers a screen look as unavailable when the app cannot look", async () => {
    const vc = createVoiceChat({ store: { has: async () => true } as never, config: {} as never, saveConfig: () => {}, log: { info() {}, warn() {}, error() {} } as never });
    expect(await vc.server.look?.({ session: "s", scope: "screen" }, new AbortController().signal)).toEqual({ ok: false, code: "unavailable" });
  });
});
