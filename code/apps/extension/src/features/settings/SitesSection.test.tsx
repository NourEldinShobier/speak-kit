import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { byLabel, click, installDom, mount, text, typeInto } from "../../testing/dom";
import { SitesSection } from "./SitesSection";
import { defaultSettings, type Settings } from "./types";

beforeEach(installDom);
afterEach(() => Reflect.deleteProperty(globalThis, "chrome"));

const setup = async (over: Partial<Settings> = {}) => {
  let current: Settings = { ...defaultSettings(), ...over };
  const upd = vi.fn((fn: (s: Settings) => Settings) => {
    current = fn(current);
  });
  const m = await mount(<SitesSection s={current} upd={upd} saved={false} />);
  return {
    m,
    upd,
    get settings() {
      return current;
    },
  };
};

describe("SitesSection (C15)", () => {
  test("lists each site with its permission, sorted by host, and the default for other sites", async () => {
    const { m } = await setup({ sites: { "news.example.org": "never-read", "docs.example.dev": "always-dock" }, siteDefault: "never-read" });
    const hosts = [...m.root.querySelectorAll(".op-rules li")].map((li) => text(li.querySelector(".sk-grow")));
    expect(hosts).toEqual(["docs.example.dev", "news.example.org" + "Nothing on this site is sent to the voice engine."]);
    expect(text(byLabel(m.root, "Default for other sites"))).toBe("Never read");
    expect(text(byLabel(m.root, "Rule for docs.example.dev"))).toBe("Always show dock");
    await m.unmount();
  });

  test("Add turns a pasted address into a host rule and reports a bad one", async () => {
    const s = await setup();
    const input = byLabel(s.m.root, "Site")!;
    await typeInto(input, "not a site");
    await click(byLabel(s.m.root, "Add site"));
    expect(text(s.m.root.querySelector(".op-err"))).toBe("Enter a site such as news.example.com.");
    expect(s.upd).not.toHaveBeenCalled();
    await typeInto(input, "https://www.Reader.Example.com/essay?x=1");
    await click(byLabel(s.m.root, "Add site"));
    expect(s.settings.sites).toEqual({ "www.reader.example.com": "always-dock" });
    await s.m.unmount();
  });

  test("the trash button removes one site and keeps the others", async () => {
    const s = await setup({ sites: { "a.example.com": "never-read", "b.example.com": "hide-controls" } });
    await click(byLabel(s.m.root, "Remove rule for a.example.com"));
    expect(s.settings.sites).toEqual({ "b.example.com": "hide-controls" });
    await s.m.unmount();
  });

  test("Reset section clears the rules and puts the default back to Ask each time", async () => {
    const s = await setup({ sites: { "a.example.com": "never-read" }, siteDefault: "never-read" });
    const reset = [...s.m.root.querySelectorAll("button")].find((b) => text(b) === "Reset section")!;
    expect(reset.className).toBe("lm-btn lm-btn--secondary");
    await click(reset);
    expect([s.settings.sites, s.settings.siteDefault]).toEqual([{}, "ask"]);
    await s.m.unmount();
  });

  test("every control is 36 px: no small dropdown, field or button, and the rule dropdowns share one width class", async () => {
    const { m } = await setup({ sites: { "a.example.com": "never-read", "b.example.com": "hide-controls" } });
    expect(m.root.querySelectorAll(".lm-select--sm, .lm-input--sm, .lm-btn--sm, .lm-btn--xs").length).toBe(0);
    expect(m.root.querySelectorAll(".lm-select.op-rule-select").length).toBe(3);
    expect(byLabel(m.root, "Remove rule for a.example.com")!.className).toBe("lm-btn lm-btn--icon");
    expect(text(m.root.querySelector(".op-card-top h2"))).toBe("Site permissions");
    expect(m.root.querySelector(".op-card-top .lm-input")).not.toBeNull();
    await m.unmount();
  });

  test("the add row is the site field with a Use this tab's site chip inside it, the rule dropdown and a dark Add site icon button", async () => {
    const { m } = await setup();
    const row = m.root.querySelector(".op-add")!;
    expect([...row.children].map((c) => c.className)).toEqual(["lm-field", "lm-select op-rule-select", "lm-btn lm-btn--icon lm-btn--primary"]);
    const input = byLabel(m.root, "Site")!.closest(".lm-input")!;
    expect(input.lastElementChild!.className).toBe("op-chip");
    expect(text(input.querySelector(".op-chip"))).toBe("Use this tab's site");
    expect(text(byLabel(m.root, "Add site"))).toBe("");
    expect(text(row.querySelector(".lm-select__trigger"))).toBe("Always show dock");
    await m.unmount();
  });

  test("the chip fills the field with the site of the most recent web tab", async () => {
    (globalThis as Record<string, unknown>).chrome = {
      tabs: {
        query: async () => [
          { url: "chrome://extensions", lastAccessed: 9 },
          { url: "https://old.example.org/", lastAccessed: 1 },
          { url: "https://www.News.Example.com/a?b=1", lastAccessed: 5 },
        ],
      },
    };
    const { m } = await setup();
    await click(m.root.querySelector(".op-chip"));
    expect((byLabel(m.root, "Site") as HTMLInputElement).value).toBe("www.news.example.com");
    await m.unmount();
  });
});
