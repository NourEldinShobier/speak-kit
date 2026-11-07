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
    await opt
      .getByRole("link", { name: "Shortcuts" })
      .or(opt.getByRole("button", { name: "Shortcuts" }))
      .first()
      .click();
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

  test("site permissions: add a site, change the default for other sites, remove the site", async ({ ext }) => {
    const opt = await ext.ctx.newPage();
    await opt.goto(ext.url("options") + "#sites");
    await opt.getByLabel("Site", { exact: true }).fill("https://Reader.Example.com/essay");
    await opt.getByRole("button", { name: "Add site", exact: true }).click();
    await expect.poll(async () => (await ext.settings()).sites).toEqual({ "reader.example.com": "always-dock" });
    await expect(opt.getByRole("list", { name: "Site rules" }).getByText("reader.example.com")).toBeVisible();
    await opt.getByRole("combobox", { name: "Default for other sites" }).click();
    await opt.getByRole("option", { name: "Never read" }).click();
    await expect.poll(async () => (await ext.settings()).siteDefault).toBe("never-read");
    await opt.reload();
    await expect(opt.getByRole("combobox", { name: "Default for other sites" })).toContainText("Never read");
    await opt.getByRole("button", { name: "Remove rule for reader.example.com" }).click();
    await expect.poll(async () => (await ext.settings()).sites).toEqual({});
  });

  test("a default of Never read keeps the controls off a page without a rule", async ({ ext, app }) => {
    await ext.pair(app);
    await ext.setSettings({ siteDefault: "never-read" });
    const page = await ext.open("/article");
    await page.mouse.move(5, 5);
    await page.waitForTimeout(800);
    await expect(page.locator('[data-sk="launcher-tab"]')).toHaveCount(0);
    await ext.setSettings({ siteDefault: "ask", sites: {} });
    await expect(page.locator('[data-sk="launcher-tab"]')).toBeVisible({ timeout: 5000 });
  });

  test("shortcuts: Chrome's assigned keys show no warning", async ({ ext }) => {
    const opt = await ext.ctx.newPage();
    await opt.goto(ext.url("options") + "#shortcuts");
    await expect(opt.getByTestId("chrome-commands").getByText("Play / pause")).toBeVisible();
    await expect(opt.getByRole("alert")).toHaveCount(0);
  });

  test("shortcuts: a command Chrome left unassigned gets a Not assigned badge and a banner (C16)", async ({ ext }) => {
    const opt = await ext.ctx.newPage();
    await opt.addInitScript(() => {
      const real = chrome.commands.getAll.bind(chrome.commands);
      chrome.commands.getAll = async () => (await real()).map((c: { name?: string }) => (c.name === "read-selection" ? { ...c, shortcut: "" } : c));
    });
    await opt.goto(ext.url("options") + "#shortcuts");
    const row = opt.locator('[data-command="read-selection"]');
    await expect(row.getByText("Not assigned")).toBeVisible();
    await expect(opt.locator('[data-command="play-pause"]').getByText("Not assigned")).toHaveCount(0);
    await expect(opt.getByRole("alert").getByText("A shortcut is not assigned")).toBeVisible();
  });

  test("a site rule row with a long host wraps at 320 px: the name keeps its width and the dropdown takes its own line", async ({ ext }) => {
    const opt = await ext.ctx.newPage();
    await opt.setViewportSize({ width: 320, height: 640 });
    await opt.goto(ext.url("options") + "#sites");
    const host = "a-very-long-subdomain.reader-example-hosting-service.com";
    await opt.getByLabel("Site", { exact: true }).fill(host);
    await opt.getByRole("button", { name: "Add site", exact: true }).click();
    await expect(opt.getByRole("list", { name: "Site rules" }).getByText(host)).toBeAttached();
    const m = await opt.evaluate(() => {
      const li = document.querySelector(".op-rules li")!;
      const box = (el: Element) => el.getBoundingClientRect();
      const name = box(li.querySelector(".sk-grow > div")!);
      const select = box(li.querySelector(".op-rule-select")!);
      const trash = box(li.querySelector("button[aria-label^='Remove rule']")!);
      const row = box(li);
      return {
        nameWidth: Math.round(name.width),
        nameAboveSelect: name.bottom <= select.top,
        selectInside: select.left >= row.left && select.right <= row.right,
        trashInside: trash.right <= row.right,
        rowOverflows: li.scrollWidth > li.clientWidth,
        pageScrolls: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(m.nameWidth).toBeGreaterThanOrEqual(150);
    expect([m.nameAboveSelect, m.selectInside, m.trashInside, m.rowOverflows, m.pageScrolls]).toEqual([true, true, true, false, false]);
  });
});
