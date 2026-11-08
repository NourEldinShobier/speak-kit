import { afterEach, describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { freePort, health, launch, type Launched } from "./harness";

const running: Launched[] = [];
const start = async (o: Parameters<typeof launch>[0] = {}) => {
  const l = await launch(o);
  running.push(l);
  return l;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
});

const SETUP_DONE = { setupDone: true, setupSkipped: false, preferredPort: 0 };

describe("desktop app", () => {
  it("first run: wizard, title, health at the port, token reveal and copy, quit", async () => {
    const { app, page, port, userData } = await start();
    expect(await page.title()).toBe("Speak Kit");
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getTitle())).toBe("Speak Kit");

    await page.getByRole("heading", { name: "Read anything out loud." }).waitFor();
    await page.getByRole("button", { name: /Get started/ }).click();
    await page.getByRole("heading", { name: "Kokoro-82M is ready" }).waitFor();
    await page.getByRole("button", { name: /^Continue/ }).click();

    await page.getByRole("heading", { name: "Connect your browser" }).waitFor();
    const cont = page.getByRole("button", { name: /^Continue/ });
    expect(await cont.isDisabled()).toBe(true);
    const tokenBox = page.getByTestId("token");
    expect(await tokenBox.textContent()).not.toMatch(/[0-9a-f]{64}/);
    await page.getByRole("button", { name: "Reveal" }).click();
    const token = (await tokenBox.textContent())!;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).toBe(readFileSync(path.join(userData, "token"), "utf8").trim());

    await page.getByRole("button", { name: "Copy" }).click();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(token);
    await expect.poll(() => cont.isDisabled()).toBe(false);

    const h = await health(port);
    expect(h.app).toBe("speakkit");
    expect(h.engine.state).toBe("ready");
    const auth = (t?: string) =>
      fetch(`http://127.0.0.1:${port}/v1/auth/check`, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      }).then((r) => r.status);
    expect(await auth(token)).toBe(204);
    expect(await auth("wrong")).toBe(401);

    await cont.click();
    await page.getByRole("heading", { name: "You're all set" }).waitFor();
    await page.getByRole("button", { name: /Open Speak Kit/ }).click();
    await page.getByRole("heading", { name: "Home" }).waitFor();
    expect(await page.getByTestId("server-address").textContent()).toBe(`127.0.0.1:${port}`);
    expect(await page.getByTestId("server-status").textContent()).toContain("Running");

    const proc = app.process();
    await app.close();
    await new Promise<void>((r) => (proc.exitCode !== null ? r() : proc.once("exit", () => r())));
    await expect(health(port)).rejects.toThrow();
  });

  it("home: pairing token regenerates and the old token stops working", async () => {
    const { page, port } = await start({ config: { ...SETUP_DONE, preferredPort: 0 } });
    await page.getByRole("heading", { name: "Home" }).waitFor();
    await page.getByRole("button", { name: "Reveal" }).click();
    const box = page.getByTestId("token");
    const before = (await box.textContent())!;
    await page.getByRole("button", { name: "Regenerate" }).click();
    await page.waitForFunction((old) => document.querySelector("[data-testid=token]")?.getAttribute("data-revealed") === "false" && !document.body.textContent?.includes(old), before);
    await page.getByRole("button", { name: "Reveal" }).click();
    const after = (await box.textContent())!;
    expect(after).toMatch(/^[0-9a-f]{64}$/);
    expect(after).not.toBe(before);
    const status = (t: string) =>
      fetch(`http://127.0.0.1:${port}/v1/auth/check`, {
        headers: { Authorization: `Bearer ${t}` },
      }).then((r) => r.status);
    expect(await status(before)).toBe(401);
    expect(await status(after)).toBe(204);
    expect((await health(port)).engine.state).toBe("ready");
  });

  it("voices: lists voices and previews one", async () => {
    const { page } = await start({ config: SETUP_DONE });
    await page.getByRole("link", { name: "Voices" }).click();
    const cards = page.locator("[data-voice]");
    await cards.first().waitFor();
    expect(await cards.count()).toBeGreaterThan(10);
    const heart = page.locator("[data-voice=af_heart]");
    expect(await heart.textContent()).toContain("Default");
    await heart.getByRole("button", { name: "Preview Heart" }).click();
    // Synthesis succeeded when no error notice shows up; the button returns to Preview when playback ends.
    await page.getByRole("button", { name: /^(Stop|Preview) Heart$/ }).waitFor();
    expect(await page.getByRole("alert").count()).toBe(0);
    await page.getByLabel("Search voices").fill("bella");
    await expect.poll(() => cards.count()).toBeLessThan(5);
    expect(await cards.first().textContent()).toMatch(/bella/i);
  });

  it("closing the window hides it to the tray; a second launch focuses the first", async () => {
    const first = await start({ config: SETUP_DONE });
    await first.page.getByRole("heading", { name: "Home" }).waitFor();
    await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    const visible = () => first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible()));
    expect(await visible()).toBe(false);
    expect(await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect((await health(first.port)).app).toBe("speakkit");

    // Same userData -> same single-instance lock: the second process quits and the first shows its window.
    const second = await launch({ userData: first.userData, port: first.port }).catch(() => null);
    await expect.poll(visible, { timeout: 15_000 }).toBe(true);
    await second?.cleanup();
  });

  it("falls back to the next free port and tells the user", async () => {
    const busy = freePort();
    const blocker = net.createServer().listen(busy, "127.0.0.1");
    await new Promise((r) => blocker.once("listening", r));
    try {
      const { page } = await start({
        port: busy,
        config: { setupDone: true, setupSkipped: false, preferredPort: busy },
      });
      await page.getByRole("heading", { name: "Home" }).waitFor();
      expect(await page.getByTestId("server-address").textContent()).toBe(`127.0.0.1:${busy + 1}`);
      expect((await health(busy + 1)).app).toBe("speakkit");
      expect(await page.getByText(`Port ${busy} is in use`).count()).toBe(1);
    } finally {
      blocker.close();
    }
  });

  it("download failure shows the paused screen and retry recovers", async () => {
    const { page } = await start({ env: { SPEAKKIT_FAKE_STATE: "error" } });
    await page.getByRole("button", { name: /Get started/ }).click();
    await page.getByRole("heading", { name: "Download paused" }).waitFor();
    expect(await page.getByRole("alert").textContent()).toContain("ECONNRESET");
    await page.getByRole("button", { name: /Retry download/ }).click();
    await page.getByRole("heading", { name: "Kokoro-82M is ready" }).waitFor();
  });
});
