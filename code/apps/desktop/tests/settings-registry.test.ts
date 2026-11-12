import { afterEach, describe, expect, it } from "vite-plus/test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

const DONE = { setupDone: true, setupSkipped: false, preferredPort: 0 };
const configOf = (l: Launched) => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8"));
const openGeneral = async (l: Launched, settings = "Settings", general = "General") => {
  await l.page.getByRole("heading", { name: "Home" }).waitFor();
  await l.page.getByRole("link", { name: settings }).click();
  await l.page.getByRole("heading", { name: general, exact: true, level: 1 }).waitFor();
};
const pickFile = (l: Launched, file: string | null) => l.app.evaluate((_e, f) => (globalThis as unknown as { __speakkit: { settingsFile(f: string | null): void } }).__speakkit.settingsFile(f), file);

describe("interface language", () => {
  it("choosing Spanish changes the menu, the page and the document language, and is kept in the settings file", async () => {
    const l = await start({ config: DONE });
    await openGeneral(l);
    await l.page.getByRole("combobox", { name: "Language" }).click();
    await l.page.getByRole("option", { name: "Español" }).click();
    await l.page.getByRole("heading", { name: "General", level: 1 }).waitFor();
    await l.page.getByRole("combobox", { name: "Idioma" }).waitFor();
    await l.page.getByRole("navigation", { name: "Ajustes" }).waitFor();
    await l.page.getByText("Abrir al iniciar sesión").waitFor();
    expect(await l.page.evaluate(() => document.documentElement.lang)).toBe("es");
    await expect.poll(() => configOf(l).language).toBe("es");
  }, 60_000);

  it("starts in Spanish when the file says so, and an unknown language falls back to English", async () => {
    const es = await start({ config: { ...DONE, language: "es" } });
    await es.page.getByRole("link", { name: "Ajustes" }).waitFor();
    const odd = await start({ config: { ...DONE, language: "klingon" } });
    await odd.page.getByRole("link", { name: "Settings" }).waitFor();
  }, 60_000);
});

describe("settings import", () => {
  it("applies the valid settings of a picked file, reports the rest, and keeps what it left out", async () => {
    const l = await start({ config: { ...DONE, voice: "af_heart" } });
    const file = path.join(mkdtempSync(path.join(tmpdir(), "speakkit-import-")), "settings.json");
    writeFileSync(file, JSON.stringify({ voice: "af_bella", speed: 99, setupDone: false, startMinimized: true, dictation: { mode: "toggle" } }));
    await openGeneral(l);
    await l.page.getByRole("button", { name: "Advanced" }).click();
    await pickFile(l, file);
    await l.page.getByRole("button", { name: "Import", exact: true }).click();
    await l.page.getByText("Imported 3 settings. Left out: speed, setupDone.").waitFor();
    await expect.poll(() => configOf(l)).toMatchObject({ voice: "af_bella", startMinimized: true, setupDone: true, dictation: { mode: "toggle" } });
    expect(configOf(l).speed).not.toBe(99);
  }, 60_000);

  it("says so when the file holds nothing usable, and when the dialog is cancelled does nothing", async () => {
    const l = await start({ config: DONE });
    const file = path.join(mkdtempSync(path.join(tmpdir(), "speakkit-import-")), "settings.json");
    writeFileSync(file, "not json");
    await openGeneral(l);
    await l.page.getByRole("button", { name: "Advanced" }).click();
    await pickFile(l, file);
    await l.page.getByRole("button", { name: "Import", exact: true }).click();
    await l.page.getByText("Could not import: the file is not valid JSON.").waitFor();
    await pickFile(l, null);
    await l.page.getByRole("button", { name: "Import", exact: true }).click();
    await l.page.getByRole("button", { name: "Import", exact: true }).waitFor();
    expect(await l.page.getByText("Could not import").count()).toBe(1);
  }, 60_000);
});
