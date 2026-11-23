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
const DONE = { setupDone: true, setupSkipped: false };

describe("voices page", () => {
  it("lists the voices with a search box, no filter dropdown and no detail drawer", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("link", { name: "Voices" }).click();
    await l.page.getByRole("heading", { name: "Voices", exact: true }).waitFor();
    await l.page.getByTestId("voices").locator("[data-voice=af_heart]").waitFor();
    expect(await l.page.getByRole("textbox", { name: "Search voices" }).count()).toBe(1);
    expect(await l.page.getByRole("combobox", { name: "Filter voices" }).count()).toBe(0);
    await l.page.locator("[data-voice=af_heart] b").click();
    expect(await l.page.getByRole("dialog").count()).toBe(0);
  });
});
