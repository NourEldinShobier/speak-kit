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

describe("releaseNoteLines in detail", () => {
  it("decodes the HTML entities electron-updater sends", () => {
    expect(releaseNoteLines("<li>a &lt;b&gt; &quot;c&quot; it&#39;s&nbsp;d &amp; e</li>")).toEqual([`a <b> "c" it's d & e`]);
  });

  it("turns every block tag into a line break, in any letter case, and drops the rest of the markup", () => {
    expect(releaseNoteLines("<p>one</p><div>two</div>three<br>four<br/>five<ul><LI>six</LI></ul><ol><li class='x'>seven</li></ol>")).toEqual(["six", "seven"]);
    expect(releaseNoteLines("<p>one</p><div>two</div>three<br>four<br/>five")).toEqual(["one", "two", "three", "four", "five"]);
  });

  it("treats any heading level as a heading, not as a note", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) expect(releaseNoteLines(`<h${n}>Title</h${n}><li>item</li>`)).toEqual(["item"]);
    expect(releaseNoteLines("# One\n###### Six\n* item")).toEqual(["item"]);
  });

  it("a hash that is not followed by a space is text, not a heading", () => {
    expect(releaseNoteLines("#12 is fixed")).toEqual(["#12 is fixed"]);
  });

  it("takes -, * and the bullet dot, with or without leading spaces", () => {
    expect(releaseNoteLines("- a\n  * b\n• c")).toEqual(["a", "b", "c"]);
  });

  it("needs a space after the bullet mark", () => {
    expect(releaseNoteLines("*not a bullet\n* real")).toEqual(["real"]);
  });

  it("drops the author trailer in each of its forms and nothing else", () => {
    expect(releaseNoteLines("* a by @dev in https://github.com/o/r/pull/1")).toEqual(["a"]);
    expect(releaseNoteLines("* a by @dev in http://x.example/1")).toEqual(["a"]);
    expect(releaseNoteLines("* a by @dev in #7")).toEqual(["a"]);
    expect(releaseNoteLines("* a   by   @some-dev[bot]   in   #7   ")).toEqual(["a"]);
    expect(releaseNoteLines("* a by @dev in #7 and more")).toEqual(["a by @dev in #7 and more"]);
    expect(releaseNoteLines("* the stand by @home in town")).toEqual(["the stand by @home in town"]);
    expect(releaseNoteLines("* a by dev in #7")).toEqual(["a by dev in #7"]);
  });

  it("skips the contributors section up to the next heading and the changelog link in either form", () => {
    expect(releaseNoteLines("* one\n## New Contributors\n* @a made their first\n## More\n* two")).toEqual(["one", "two"]);
    expect(releaseNoteLines("* one\n**Full Changelog**: https://x\nFull Changelog: https://y")).toEqual(["one"]);
    expect(releaseNoteLines("* one\n*Full Changelog*: https://x")).toEqual(["one"]);
  });

  it("removes bold and code marks anywhere in a line, and drops a line that is only marks", () => {
    expect(releaseNoteLines("* **a** and `b`\n* ****\n* ``")).toEqual(["a and b"]);
  });

  it("cuts at 140 characters: 140 stays, 141 is cut to 139 plus an ellipsis, trailing space trimmed before it", () => {
    expect(releaseNoteLines(`* ${"x".repeat(140)}`)[0]).toBe("x".repeat(140));
    expect(releaseNoteLines(`* ${"x".repeat(141)}`)[0]).toBe(`${"x".repeat(139)}…`);
    expect(releaseNoteLines(`* ${"x".repeat(138)} yyyy`)[0]).toBe(`${"x".repeat(138)}…`);
  });

  it("reads a list of strings and ignores list items that carry no note", () => {
    expect(releaseNoteLines(["* a", "* b"])).toEqual(["a", "b"]);
    expect(releaseNoteLines([{ version: "1" }, null, 7, { note: "* c" }])).toEqual(["c"]);
  });

  it("ignores blank lines and surrounding space", () => {
    expect(releaseNoteLines("\n\n   * a  \n\n\n* b\n")).toEqual(["a", "b"]);
  });

  it("with both bullets and plain lines, only the bullets are notes", () => {
    expect(releaseNoteLines("Intro text\n* a\nmore text\n* b")).toEqual(["a", "b"]);
  });
});
