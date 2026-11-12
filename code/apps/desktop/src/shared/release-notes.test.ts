import { describe, expect, it } from "vite-plus/test";
import { releaseNoteLines } from "./release-notes";

describe("releaseNoteLines", () => {
  it("keeps the titles of a generated release and drops authors, contributors and the changelog link", () => {
    const body = [
      "## What's Changed",
      "* feat(dictation): paste last dictation by @someone in https://github.com/o/r/pull/12",
      "* fix(tray): keep the menu open by @other-dev in #13",
      "",
      "## New Contributors",
      "* @newperson made their first contribution in https://github.com/o/r/pull/14",
      "",
      "**Full Changelog**: https://github.com/o/r/compare/v1...v2",
    ].join("\n");
    expect(releaseNoteLines(body)).toEqual(["feat(dictation): paste last dictation", "fix(tray): keep the menu open"]);
  });

  it("reads the HTML that electron-updater passes on", () => {
    expect(releaseNoteLines("<h2>What's new</h2><ul><li>Faster start &amp; less memory</li><li>New <b>tray</b> icon</li></ul>")).toEqual(["Faster start & less memory", "New tray icon"]);
  });

  it("reads a list of per-version notes", () => {
    expect(
      releaseNoteLines([
        { version: "1.1.0", note: "* One\n* Two" },
        { version: "1.0.9", note: "* Three" },
      ]),
    ).toEqual(["One", "Two", "Three"]);
  });

  it("falls back to plain lines when there are no bullets", () => {
    expect(releaseNoteLines("Speaks faster.\nFixes a crash.")).toEqual(["Speaks faster.", "Fixes a crash."]);
  });

  it("limits the count and the length of the lines", () => {
    const many = Array.from({ length: 20 }, (_, i) => `* item ${i}`).join("\n");
    expect(releaseNoteLines(many)).toHaveLength(8);
    const [long] = releaseNoteLines(`* ${"x".repeat(400)}`);
    expect(long).toHaveLength(140);
    expect(long!.endsWith("…")).toBe(true);
  });

  it("returns nothing for empty or unusable input", () => {
    for (const x of [undefined, null, 5, {}, "", "   ", [], [{ note: 3 }], "## Heading only"]) expect(releaseNoteLines(x)).toEqual([]);
  });

  it("handles Windows line endings and bold or code marks", () => {
    expect(releaseNoteLines("* **fix**: the `Esc` key\r\n* second")).toEqual(["fix: the Esc key", "second"]);
  });
});
