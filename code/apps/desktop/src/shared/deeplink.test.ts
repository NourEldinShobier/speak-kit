import { describe, expect, it } from "vite-plus/test";
import { findDeepLink, handleDeepLink, parseDeepLink } from "./deeplink";

describe("deep links", () => {
  it("accepts launch and pair", () => {
    expect(parseDeepLink("speakkit://launch")).toEqual({ kind: "launch" });
    expect(parseDeepLink("speakkit://pair")).toEqual({ kind: "pair" });
    expect(parseDeepLink("speakkit://pair/?token=abc")).toEqual({ kind: "pair" });
  });
  it("rejects other schemes, hosts and credentials", () => {
    for (const bad of [
      "https://launch",
      "speakkit://settings",
      "speakkit://settings/",
      "speakkit://settings/nowhere",
      "speakkit://settings/../x",
      "speakkit://",
      "speakkit://u:p@launch",
      "speakkit://launch:80",
      "nonsense",
      "",
    ])
      expect(parseDeepLink(bad)).toBeNull();
  });
  it("opens a settings page by name, ignoring the query so a link never changes a switch", () => {
    expect(parseDeepLink("speakkit://settings/privacy")).toEqual({ kind: "settings", page: "privacy" });
    expect(parseDeepLink("speakkit://settings/automation/")).toEqual({ kind: "settings", page: "automation" });
    expect(parseDeepLink("speakkit://settings/general?dictation=off&enabled=false")).toEqual({ kind: "settings", page: "general" });
    const calls: string[] = [];
    handleDeepLink({ kind: "settings", page: "privacy" }, { ensureServer: () => calls.push("server"), showWindow: () => calls.push("show"), navigate: (p) => calls.push(`nav:${p}`) });
    expect(calls).toEqual(["server", "show", "nav:privacy"]);
  });

  it("finds the first valid link in a command line", () => {
    expect(findDeepLink(["electron.exe", ".", "--flag", "speakkit://nope", "speakkit://pair"])).toEqual({ kind: "pair" });
    expect(findDeepLink(["electron.exe", "."])).toBeNull();
  });
  it("launch shows the window and starts the server; pair also opens the Browser page", () => {
    const calls: string[] = [];
    const a = { ensureServer: () => calls.push("server"), showWindow: () => calls.push("show"), navigate: (p: string) => calls.push(`nav:${p}`) };
    handleDeepLink({ kind: "launch" }, a);
    expect(calls).toEqual(["server", "show"]);
    calls.length = 0;
    handleDeepLink({ kind: "pair" }, a);
    expect(calls).toEqual(["server", "show", "nav:browser"]);
  });
});
