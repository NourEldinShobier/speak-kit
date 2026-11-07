import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { ClonedVoiceStore, FakeEngine, encodeWav } from "@speakkit/engine";
import { start, type Ctx } from "./harness";

let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.server.close();
  ctx = undefined;
});

/** Speech-like clip: 200 Hz bursts with quiet gaps, passes every clip check. */
function clip(seconds: number): Buffer {
  const rate = 24000;
  const pcm = new Int16Array(seconds * rate);
  for (let i = 0; i < pcm.length; i++) {
    const t = i / rate;
    pcm[i] = Math.round(((t % 1 < 0.7 ? 0.25 * Math.sin(2 * Math.PI * 200 * t) : 0) + 0.002 * ((Math.sin(i * 12.9898) * 43758.5453) % 1)) * 32767);
  }
  return encodeWav(pcm, rate);
}

const voicesDir = mkdtempSync(join(tmpdir(), "speakkit-voices-"));
class Cloner extends FakeEngine {
  readonly clones = new ClonedVoiceStore(voicesDir);
}

const call = (c: Ctx, method: string, path: string, body?: unknown) =>
  fetch(`${c.base}${path}`, { method, headers: { ...c.auth, "Content-Type": "application/json" }, body: body === undefined ? null : JSON.stringify(body) });

it("clones a voice, lists it, deletes it and then answers 404", async () => {
  ctx = await start({}, undefined, { chatterbox: new Cloner() });
  const made = await call(ctx, "POST", "/v1/voices/clone", { name: "Maya", consent: true, audio: clip(6).toString("base64") });
  expect(made.status).toBe(201);
  const { id } = (await made.json()) as { id: string };
  expect(id).toMatch(/^cb_[0-9a-f]{8}$/);
  expect(readdirSync(voicesDir)).toContain(`${id}.wav`);

  const listed = (await (await call(ctx, "GET", "/v1/voices/cloned")).json()) as { voices: { id: string; name: string }[] };
  expect(listed.voices.map((v) => [v.id, v.name])).toEqual([[id, "Maya"]]);

  expect((await call(ctx, "DELETE", `/v1/voices/${id}`)).status).toBe(204);
  expect(readdirSync(voicesDir)).not.toContain(`${id}.wav`);
  const again = await call(ctx, "DELETE", `/v1/voices/${id}`);
  expect(again.status).toBe(404);
  expect(((await again.json()) as { error: { code: string } }).error.code).toBe("not-found");
});
