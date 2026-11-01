import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { byLabel, click, installDom, mount, text, typeInto } from "../../testing/dom";
import { SitesSection } from "./SitesSection";
import { defaultSettings, type Settings } from "./types";

beforeEach(installDom);

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
    await click([...s.m.root.querySelectorAll("button")].find((b) => text(b) === "Add") ?? null);
    expect(text(s.m.root.querySelector(".op-err"))).toBe("Enter a site such as news.example.com.");
    expect(s.upd).not.toHaveBeenCalled();
    await typeInto(input, "https://www.Reader.Example.com/essay?x=1");
    await click([...s.m.root.querySelectorAll("button")].find((b) => text(b) === "Add") ?? null);
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
    await click([...s.m.root.querySelectorAll("button")].find((b) => text(b).startsWith("Reset section")) ?? null);
    expect([s.settings.sites, s.settings.siteDefault]).toEqual([{}, "ask"]);
    await s.m.unmount();
  });
});
