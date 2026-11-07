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

  test("shell: grey window, menu on the grey, one white 8 px panel 4 px from the menu and the edges, 824 px content", async ({ ext }) => {
    const opt = await ext.ctx.newPage();
    await opt.setViewportSize({ width: 1280, height: 800 });
    await opt.goto(ext.url("options") + "#sites");
    await expect(opt.getByRole("heading", { level: 1, name: "Sites and filters" })).toBeVisible();
    const m = await opt.evaluate(() => {
      const css = (sel: string) => getComputedStyle(document.querySelector(sel)!);
      const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const panel = r(".op-panel");
      const cur = document.querySelector('.op-nav [aria-current="page"]')!;
      return {
        window: css(".op").backgroundColor,
        nav: css(".op-nav").backgroundColor,
        panelBg: css(".op-panel").backgroundColor,
        radius: css(".op-panel").borderRadius,
        panel: [panel.left, panel.top, 1280 - panel.right, 800 - panel.bottom],
        head: r(".op-head").width,
        selected: getComputedStyle(cur).backgroundColor,
        card: [css(".op-card").backgroundColor, css(".op-card").borderRadius, css(".op-card").boxShadow],
      };
    });
    expect(m.window).toBe("rgb(240, 240, 240)");
    expect(m.nav).toBe("rgba(0, 0, 0, 0)");
    expect([m.panelBg, m.radius]).toEqual(["rgb(255, 255, 255)", "8px"]);
    expect(m.panel).toEqual([252, 4, 4, 4]);
    expect(m.head).toBe(824);
    expect(m.selected).toBe("rgba(0, 0, 0, 0.05)");
    expect(m.card.slice(0, 2)).toEqual(["rgb(255, 255, 255)", "8px"]);
    expect(m.card[2]).toContain("rgb(229, 229, 229) 0px 0px 0px 1px");
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

  test("control rows are 68 px with 36 px controls: site permissions, voice and speed, shortcuts", async ({ ext }) => {
    const opt = await ext.ctx.newPage();
    await opt.setViewportSize({ width: 1280, height: 800 });
    const size = (sel: string) =>
      opt.evaluate((q) => {
        const b = document.querySelector(q)!.getBoundingClientRect();
        return [Math.round(b.width), Math.round(b.height), Math.round(b.right)];
      }, sel);
    await opt.goto(ext.url("options") + "#sites");
    await opt.getByLabel("Site", { exact: true }).fill("reader.example.com");
    await opt.getByRole("button", { name: "Add site", exact: true }).click();
    await expect(opt.getByRole("list", { name: "Site rules" }).getByText("reader.example.com")).toBeVisible();
    expect((await size(".op-add")).slice(1, 2)).toEqual([68]);
    expect(await size('[aria-label="Add site"]')).toEqual([36, 36, (await size('[aria-label="Remove rule for reader.example.com"]'))[2]]);
    expect(await size('[aria-label="Remove rule for reader.example.com"]')).toEqual([36, 36, (await size('[aria-label="Add site"]'))[2]]);
    expect(await size(".op-add .op-rule-select")).toEqual([177, 36, (await size(".op-rules .op-rule-select"))[2]]);
    expect((await size(".op-rules li")).slice(1, 2)).toEqual([68]);
    expect((await size(".op-head-r button")).slice(1, 2)).toEqual([36]);
    await opt.goto(ext.url("options") + "#voice");
    await expect(opt.getByRole("heading", { level: 1, name: "Voice and speed" })).toBeVisible();
    for (const label of ["Default voice", "Speed", "Pause between paragraphs"]) {
      const h = await opt
        .getByText(label, { exact: true })
        .first()
        .evaluate((el) => el.closest(".lm-row")!.getBoundingClientRect().height);
      expect([label, h]).toEqual([label, 68]);
    }
    expect((await size(".op-preview")).slice(1, 2)).toEqual([68]);
    await opt.goto(ext.url("options") + "#shortcuts");
    await expect(opt.getByTestId("chrome-commands").getByText("Play / pause")).toBeVisible();
    expect((await size('[data-command="play-pause"]')).slice(1, 2)).toEqual([68]);
    expect(await size('[aria-label="Change shortcut for Play / pause"]')).toEqual([36, 36, expect.any(Number)]);
  });
});
