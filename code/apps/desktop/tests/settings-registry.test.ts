import { afterEach, describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
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

const DONE = { setupDone: true, setupSkipped: false };
const configOf = (l: Launched) => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8"));
const openGeneral = async (l: Launched, settings = "Settings", general = "General") => {
  await l.page.getByRole("heading", { name: "Dictation", exact: true }).waitFor();
  await l.page.getByRole("link", { name: settings }).click();
  await l.page.getByRole("heading", { name: general, exact: true, level: 1 }).waitFor();
};

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
