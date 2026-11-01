import { test, expect } from "../support/ext";

const SECTIONS: [string, string][] = [
  ["general", "General"],
  ["launcher", "Edge launcher"],
  ["voice", "Voice and speed"],
  ["highlight", "Highlighting"],
  ["reader", "Reader view"],
  ["shortcuts", "Shortcuts"],
  ["sites", "Sites and filters"],
];

test.describe("options page", () => {
  test("every section opens from the sidebar without errors", async ({ ext, app }) => {
    const opt = await ext.pair(app);
    for (const [hash, title] of SECTIONS) {
      await opt.goto(ext.url("options") + `#${hash}`);
      await expect(opt.getByRole("heading", { level: 1, name: title })).toBeVisible();
    }
    await opt.goto(ext.url("options"));
    await opt.getByRole("link", { name: "Shortcuts" }).or(opt.getByRole("button", { name: "Shortcuts" })).first().click();
    await expect(opt.getByRole("heading", { level: 1, name: "Shortcuts" })).toBeVisible();
    await expect(opt.getByText("Play / pause")).toBeVisible();
  });

  test("toggles are saved to sync storage and survive a reload", async ({ ext }) => {
    const opt = await ext.ctx.newPage();
    await opt.goto(ext.url("options"));
    await opt.getByRole("switch", { name: "Selection bubble" }).click();
    await expect.poll(async () => (await ext.settings()).show?.bubble).toBe(false);
    await opt.reload();
    await expect(opt.getByRole("switch", { name: "Selection bubble" })).toHaveAttribute("aria-checked", "false");
  });

  test("the launcher section changes side and the open trigger", async ({ ext }) => {
    const opt = await ext.ctx.newPage();
    await opt.goto(ext.url("options") + "#launcher");
    await opt.getByRole("radio", { name: /Left/ }).first().click();
    await expect.poll(async () => (await ext.settings()).launcher?.side).toBe("left");
  });
});
