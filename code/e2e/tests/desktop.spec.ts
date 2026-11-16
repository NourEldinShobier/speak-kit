import { test, expect, begin } from "../support/ext";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { launch } from "../../apps/desktop/tests/harness";

test.describe("desktop companion @slow", () => {
  test("pair the extension with the token shown in the app, then read a page end to end", async ({ ext }) => {
    // The desktop app runs its in-process server with the fake engine; setup is marked done so it opens on Home.
    const d = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0 } });
    try {
      await d.page.getByRole("heading", { name: "Home" }).waitFor();
      await d.page.getByRole("button", { name: "Reveal" }).click();
      const token = (await d.page.getByTestId("token").textContent())!;
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(await d.page.getByTestId("server-address").textContent()).toBe(`127.0.0.1:${d.port}`);

      const { page, popup } = await begin(ext, { port: d.port, token }, "/short");
      await ext.setSettings({ speed: 3 });
      await popup.getByRole("button", { name: "Listen to this page" }).click();
      await ext.waitState("playing");
      expect(await ext.peakRms(1000)).toBeGreaterThan(0.02);
      await ext.waitState("finished", 30_000);
      await expect(popup.locator(".pp")).toHaveAttribute("data-view", "finished");

      // Regenerating the token in the app locks the extension out until it is paired again.
      ext.allowed.push(/401|Unauthorized/i);
      await d.page.getByRole("button", { name: "Regenerate" }).click();
      await d.page.waitForFunction(() => document.querySelector("[data-testid=token]")?.getAttribute("data-revealed") === "false");
      await d.page.getByRole("button", { name: "Reveal" }).click();
      const fresh = (await d.page.getByTestId("token").textContent())!;
      expect(fresh).not.toBe(token);
      const popup2 = await ext.popup(page);
      await expect(popup2.locator(".pp")).toHaveAttribute("data-view", "token", { timeout: 15_000 });
      const opt = await ext.pair({ port: d.port, token: fresh });
      await opt.close();
      await expect(popup2.locator(".pp")).toHaveAttribute("data-view", /idle|finished/, { timeout: 15_000 });
    } finally {
      await d.cleanup();
    }
  });
});

const healthOf = (port: number) => fetch(`http://127.0.0.1:${port}/v1/health`).then((r) => r.json() as Promise<{ engine: { state: string; idleUnloadAtMs?: number | null } }>);

test.describe("desktop companion, setup and memory @slow", () => {
  test("setup wizard: the real extension pairs from the Connect step, Test connection turns Connected, and the page is read", async ({ ext }) => {
    const d = await launch({ env: { SPEAKKIT_TEST: "1" } });
    try {
      await d.page.getByRole("button", { name: /Get started/ }).click();
      await d.page.getByRole("button", { name: /^Continue/ }).click();
      await d.page.getByRole("button", { name: "Skip dictation" }).click();
      await d.page.getByRole("heading", { name: "Connect your browser" }).waitFor();
      await d.page.getByRole("button", { name: "Reveal" }).click();
      const token = (await d.page.getByTestId("token").textContent())!;
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      await d.page.getByRole("button", { name: "Test connection" }).click();
      await d.page.getByText("Waiting for the extension's first call").waitFor();
      // Pair through the extension's options page: its health and auth-check calls are the first authenticated ones.
      const { page } = await begin(ext, { port: d.port, token }, "/short");
      await d.page.getByText("Connected", { exact: true }).first().waitFor({ timeout: 20_000 });
      expect(await d.page.getByRole("button", { name: /^Continue/ }).isEnabled()).toBe(true);
      await d.page.getByRole("button", { name: /^Continue/ }).click();

      await ext.setSettings({ speed: 3 });
      await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
      await ext.waitState("playing");
      expect(await ext.peakRms(1000)).toBeGreaterThan(0.02);
      await ext.waitState("finished", 30_000);
    } finally {
      await d.cleanup();
    }
  });

  test("Settings > Performance changes reach the server: idleUnloadAtMs follows 'Idle unload'", async ({ ext }) => {
    const d = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0 }, env: { SPEAKKIT_TEST: "1" } });
    try {
      await d.page.getByRole("heading", { name: "Home" }).waitFor();
      const token = readFileSync(path.join(d.userData, "token"), "utf8").trim();
      const { page } = await begin(ext, { port: d.port, token }, "/short");
      await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
      await ext.setSettings({ speed: 3 });
      await ext.waitState("finished", 30_000);
      const due = async () => (await healthOf(d.port)).engine.idleUnloadAtMs;
      await expect.poll(async () => (await healthOf(d.port)).engine.state).toBe("ready");
      const pick = async (name: string) => {
        await d.page.getByRole("combobox", { name: "Idle unload" }).click();
        await d.page.getByRole("option", { name }).click();
      };
      await d.page.getByRole("link", { name: "Settings" }).click();
      await d.page.getByRole("link", { name: "Performance" }).click();
      await pick("After 15 minutes");
      await expect.poll(async () => ((await due()) ?? 0) - Date.now(), { timeout: 10_000 }).toBeGreaterThan(14 * 60_000);
      await pick("After 1 minute");
      await expect.poll(async () => ((await due()) ?? 0) - Date.now(), { timeout: 10_000 }).toBeLessThan(61_000);
      expect(await due()).toBeGreaterThan(Date.now());
      await pick("Never");
      await expect.poll(async () => await due(), { timeout: 10_000 }).toBeFalsy();
    } finally {
      await d.cleanup();
    }
  });

  test("speakkit://launch from a second launch brings the hidden first instance forward", async () => {
    const first = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0 } });
    try {
      await first.page.getByRole("heading", { name: "Home" }).waitFor();
      await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
      const visible = () => first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible()));
      expect(await visible()).toBe(false);
      const second = await launch({ userData: first.userData, port: first.port, args: ["speakkit://launch"] }).catch(() => null);
      await expect.poll(visible, { timeout: 10_000 }).toBe(true);
      await second?.cleanup();
    } finally {
      await first.cleanup();
    }
  });
});

const KEYS = {
  good: "sk-proj-E2E_good_key-0123456789abcdef",
  rejected: "sk-proj-E2E_rejected_key-0123456789abcdef",
  broke: "sk-proj-E2E_no_credit_key-0123456789abcdef",
};

/** A stand-in for api.openai.com: the key test and the client secret route, recording what it was sent. */
async function fakeOpenAi() {
  const seen: { method: string; path: string; auth: string; body: string }[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const auth = req.headers.authorization ?? "";
      seen.push({ method: req.method ?? "", path: req.url ?? "", auth, body });
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(json));
      };
      if (req.method === "POST" && req.url === "/v1/realtime/client_secrets") return send(200, { value: "ek_e2e_secret", expires_at: Math.floor(Date.now() / 1000) + 600 });
      if (auth === `Bearer ${KEYS.rejected}`) return send(401, { error: { code: "invalid_api_key" } });
      if (auth === `Bearer ${KEYS.broke}`) return send(429, { error: { code: "insufficient_quota" } });
      send(200, { data: [] });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, close: () => server.close() };
}

const filesUnder = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]));

/** Files under dir that contain one of the keys as plain text. Files Chromium holds open (EBUSY) cannot be read and are skipped. */
function filesWithKey(dir: string, keys: string[]): string[] {
  return filesUnder(dir).filter((f) => {
    try {
      const bytes = readFileSync(f);
      return keys.some((k) => bytes.includes(Buffer.from(k)));
    } catch {
      return false;
    }
  });
}

test.describe("desktop voice chat key @slow", () => {
  test("Settings > Voice chat: save, test, mint through the local API and remove, with the key never leaving main", async () => {
    const fake = await fakeOpenAi();
    const d = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0 }, env: { SPEAKKIT_TEST: "1", SPEAKKIT_OPENAI_BASE_URL: fake.url } });
    try {
      const token = readFileSync(path.join(d.userData, "token"), "utf8").trim();
      const api = (method: string, route: string) => fetch(`http://127.0.0.1:${d.port}${route}`, { method, headers: { Authorization: `Bearer ${token}` } });
      await d.page.getByRole("link", { name: "Voice chat" }).click();
      const field = d.page.getByLabel("OpenAI API key");
      const notice = d.page.getByTestId("voice-chat-notice");
      const press = (name: string) => d.page.getByRole("button", { name, exact: true });
      const typeAndSave = async (key: string) => {
        await field.fill(key);
        await press("Save").click();
        await expect(notice).toHaveText("Key saved");
        await expect(field).toHaveValue(""); // nothing of the key stays in the field
      };

      // No key yet: password field, helper text, model as plain text, nothing to test or remove.
      await expect(field).toHaveAttribute("type", "password");
      await expect(d.page.getByText("Stored on this computer, encrypted by your operating system. Sent only to OpenAI.")).toBeVisible();
      await expect(d.page.getByText("Model: gpt-realtime-2.1")).toBeVisible();
      await expect(press("Test key")).toBeDisabled();
      await expect(press("Remove key")).toBeDisabled();
      expect(await (await api("GET", "/v1/voice-chat/status")).json()).toEqual({ hasKey: false });
      const none = await api("POST", "/v1/voice-chat/session");
      expect([none.status, (await none.json()).code]).toEqual([409, "no-key"]);

      // Typing offers show/hide; the field is a plain text box only while shown.
      await field.fill(KEYS.good);
      await press("Show key").click();
      await expect(field).toHaveAttribute("type", "text");
      await press("Hide key").click();
      await expect(field).toHaveAttribute("type", "password");
      await press("Save").click();
      await expect(notice).toHaveText("Key saved");
      await expect(field).toHaveValue("");
      await expect(field).toHaveAttribute("placeholder", "Saved");
      await expect(press("Show key")).toHaveCount(0);

      // The page never holds the key, and neither does anything on disk (the blob is encrypted, config.json has no key).
      expect(await d.page.evaluate(() => document.documentElement.outerHTML)).not.toContain(KEYS.good);
      expect(filesUnder(d.userData).some((f) => path.basename(f) === "voice-chat-key.bin")).toBe(true);
      expect(filesWithKey(d.userData, [KEYS.good])).toEqual([]);

      // Test key reaches OpenAI with the key and shows the answer.
      await press("Test key").click();
      await expect(notice).toHaveText("OpenAI accepted this key");
      expect(fake.seen.at(-1)).toMatchObject({ method: "GET", path: "/v1/models", auth: `Bearer ${KEYS.good}` });

      // The extension's side: status and a minted secret over the authenticated local API; the key is not in any answer.
      expect(await (await api("GET", "/v1/voice-chat/status")).json()).toEqual({ hasKey: true });
      await d.page.getByRole("combobox", { name: "Voice chat voice" }).click();
      await d.page.getByRole("option", { name: "Cedar" }).click();
      await expect.poll(() => readFileSync(path.join(d.userData, "config.json"), "utf8")).toContain('"voiceChatVoice": "cedar"');
      const minted = await api("POST", "/v1/voice-chat/session");
      const text = await minted.text();
      expect(minted.status).toBe(200);
      expect(JSON.parse(text)).toMatchObject({ clientSecret: "ek_e2e_secret", model: "gpt-realtime-2.1", voice: "cedar", expiresAt: expect.any(Number) });
      expect(JSON.parse(text).expiresAt).toBeGreaterThan(Date.now() / 1000);
      expect(text).not.toContain(KEYS.good);
      const mint = fake.seen.at(-1)!;
      expect(mint).toMatchObject({ method: "POST", path: "/v1/realtime/client_secrets", auth: `Bearer ${KEYS.good}` });
      expect(JSON.parse(mint.body).session).toMatchObject({ type: "realtime", model: "gpt-realtime-2.1", audio: { output: { voice: "cedar" } } });
      expect((await fetch(`http://127.0.0.1:${d.port}/v1/voice-chat/session`, { method: "POST" })).status).toBe(404);

      // A rejected key and an account without credit read differently.
      await typeAndSave(KEYS.rejected);
      await press("Test key").click();
      await expect(notice).toHaveText("OpenAI did not accept this key");
      await typeAndSave(KEYS.broke);
      await press("Test key").click();
      await expect(notice).toHaveText("Your OpenAI account has no credit");

      // Removing the key deletes the blob and the API answers no-key again.
      await press("Remove key").click();
      await expect(notice).toHaveText("Key removed");
      await expect(field).toHaveAttribute("placeholder", "sk-...");
      expect(filesUnder(d.userData).some((f) => path.basename(f) === "voice-chat-key.bin")).toBe(false);
      expect(await (await api("GET", "/v1/voice-chat/status")).json()).toEqual({ hasKey: false });
      expect(filesWithKey(d.userData, Object.values(KEYS))).toEqual([]);
    } finally {
      await d.cleanup();
      fake.close();
    }
  });
});
