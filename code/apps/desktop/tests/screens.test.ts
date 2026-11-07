import { afterEach, describe, expect, it } from "vite-plus/test";
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

describe("voices toolbar", () => {
  it("filters voices through one dropdown with five options", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("link", { name: "Voices" }).click();
    await l.page.getByRole("heading", { name: "Voices", exact: true }).waitFor();
    await l.page.getByTestId("voices").waitFor();
    const trigger = l.page.getByRole("combobox", { name: "Filter voices" });
    expect(await trigger.textContent()).toBe("Voices: all");
    await trigger.click();
    expect(await l.page.getByRole("option").allTextContents()).toEqual(["All", "US English", "UK English", "Female", "Male"]);
    await l.page.getByRole("option", { name: "UK English" }).click();
    expect(await trigger.textContent()).toBe("Voices: UK English");
  });
});

describe("voice drawer", () => {
  const openVoices = async (l: Launched) => {
    await l.page.getByRole("link", { name: "Voices" }).click();
    await l.page.getByTestId("voices").locator("[data-voice=af_heart]").waitFor();
  };
  const count = (l: Launched) => l.page.locator(".sk-vdrawer__count").textContent();
  const configVoice = (l: Launched) => l.page.evaluate(async () => (await window.speakkit.state()).config.voice);

  it("steps to the next and previous voice with the buttons and the arrow keys, and counts within the filtered list", async () => {
    const l = await start({ config: DONE });
    await openVoices(l);
    await l.page.locator("[data-voice=af_heart] b").click();
    const drawer = l.page.getByRole("dialog", { name: "Heart" });
    await drawer.waitFor();
    expect(await drawer.getByRole("button", { name: "Previous voice" }).isDisabled()).toBe(true);
    await drawer.getByRole("button", { name: "Next voice" }).click();
    await l.page.getByRole("dialog", { name: "Bella" }).waitFor();
    expect(await count(l)).toBe("2 of 28");
    await l.page.getByRole("button", { name: "Previous voice" }).click();
    await l.page.getByRole("dialog", { name: "Heart" }).waitFor();
    expect(await count(l)).toBe("1 of 28");
    await l.page.locator(".sk-vdrawer").focus();
    await l.page.keyboard.press("ArrowRight");
    await l.page.keyboard.press("ArrowRight");
    await l.page.getByRole("dialog", { name: "Nicole" }).waitFor();
    await l.page.keyboard.press("ArrowLeft");
    await l.page.getByRole("dialog", { name: "Bella" }).waitFor();
    expect(await count(l)).toBe("2 of 28");

    await l.page.keyboard.press("Escape");
    await l.page.getByRole("combobox", { name: "Filter voices" }).click();
    await l.page.getByRole("option", { name: "UK English" }).click();
    await l.page.locator("[data-voice=bf_emma] b").click();
    await l.page.getByRole("dialog", { name: "Emma" }).waitFor();
    expect(await count(l)).toBe("1 of 8");
  });

  it("makes the voice the default (the setting of Settings, Voice) and shows the Default voice state", async () => {
    const l = await start({ config: DONE });
    await openVoices(l);
    await l.page.locator("[data-voice=af_bella] b").click();
    const drawer = l.page.getByRole("dialog", { name: "Bella" });
    await drawer.getByRole("button", { name: "Make default" }).click();
    await drawer.getByRole("button", { name: "Default voice" }).waitFor();
    expect(await drawer.getByRole("button", { name: "Default voice" }).isDisabled()).toBe(true);
    expect(await configVoice(l)).toBe("af_bella");
    expect(await l.page.locator("[data-voice=af_bella] .lm-badge").textContent()).toBe("Default");
  });

  it("previews the voice from the drawer, and Escape closes it and puts focus back on the card", async () => {
    const l = await start({ config: DONE });
    await openVoices(l);
    await l.page.locator("[data-voice=af_bella] b").click();
    const drawer = l.page.getByRole("dialog", { name: "Bella" });
    await drawer.getByRole("button", { name: "Preview Bella" }).click();
    await drawer.getByRole("button", { name: "Stop Bella" }).waitFor();
    await drawer.getByRole("button", { name: "Stop Bella" }).click();
    await drawer.getByRole("button", { name: "Preview Bella" }).waitFor();
    await l.page.locator(".sk-vdrawer").focus();
    await l.page.keyboard.press("Escape");
    await drawer.waitFor({ state: "detached" });
    expect(await l.page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.voice)).toBe("af_bella");
    await l.page.keyboard.press("Enter");
    await l.page.getByRole("dialog", { name: "Bella" }).waitFor();
  });
});
