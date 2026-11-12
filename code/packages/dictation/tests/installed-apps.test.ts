import { describe, expect, it } from "vitest";
import { mergeApps, searchApps } from "../src/modes";

describe("mergeApps", () => {
  it("keeps one entry per program, the first name, sorted by name", () => {
    expect(
      mergeApps([
        { key: "Slack.exe", name: "Slack" },
        { key: "code", name: "Visual Studio Code" },
        { key: "slack", name: "Slack (work)" },
        { key: "Arc", name: "arc" },
      ]),
    ).toEqual([
      { key: "arc", name: "arc" },
      { key: "slack", name: "Slack" },
      { key: "code", name: "Visual Studio Code" },
    ]);
  });
  it("drops empty keys, empty names and helper shortcuts", () => {
    expect(
      mergeApps([
        { key: "", name: "Nothing" },
        { key: "x", name: "  " },
        { key: "unins000", name: "Uninstall Foo" },
        { key: "foohelp", name: "Foo Help" },
        { key: "foo", name: "Foo" },
      ]),
    ).toEqual([{ key: "foo", name: "Foo" }]);
  });
  it("caps the list", () => {
    const many = Array.from({ length: 2100 }, (_, i) => ({ key: `app${i}`, name: `App ${String(i).padStart(4, "0")}` }));
    expect(mergeApps(many)).toHaveLength(2000);
  });
});

describe("searchApps", () => {
  const apps = [
    { key: "code", name: "Visual Studio Code" },
    { key: "codex", name: "Codex" },
    { key: "notepad", name: "Notepad" },
  ];
  it("lists names that start with the text first, then those that contain it or its key", () => {
    expect(searchApps(apps, "cod").map((a) => a.key)).toEqual(["codex", "code"]);
    expect(searchApps(apps, "  PAD ").map((a) => a.key)).toEqual(["notepad"]);
  });
  it("matches on the key", () => {
    expect(searchApps([{ key: "com.apple.textedit", name: "TextEdit" }], "apple").map((a) => a.name)).toEqual(["TextEdit"]);
  });
  it("lists everything up to the limit for an empty query and nothing for no match", () => {
    expect(searchApps(apps, "", 2)).toEqual(apps.slice(0, 2));
    expect(searchApps(apps, "zzz")).toEqual([]);
  });
});
