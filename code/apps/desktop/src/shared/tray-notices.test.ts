import { describe, expect, it } from "vite-plus/test";
import { createTrayNotices, NOTICE_TTL_MS, noticeText } from "./tray-notices";

describe("noticeText", () => {
  it("turns an error into one short line and ignores other activity", () => {
    expect(noticeText({ kind: "error", title: "The voice engine failed to start" })).toBe("The voice engine failed to start");
    expect(noticeText({ kind: "error", title: "  two   spaces\nand a newline " })).toBe("two spaces and a newline");
    expect(noticeText({ kind: "update", title: "Update ready" })).toBeNull();
    expect(noticeText({ kind: "pair", title: "Browser paired" })).toBeNull();
    expect(noticeText({ kind: "error", title: "   " })).toBeNull();
  });

  it("cuts a long title at 60 characters", () => {
    const t = noticeText({ kind: "error", title: "x".repeat(100) })!;
    expect(t).toHaveLength(60);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("createTrayNotices", () => {
  it("shows the newest notice and replaces an older one", () => {
    const n = createTrayNotices(() => 0);
    expect(n.current()).toBeUndefined();
    n.add("first");
    n.add("second");
    expect(n.current()).toBe("second");
  });

  it("expires after ten minutes", () => {
    let t = 1000;
    const n = createTrayNotices(() => t);
    n.add("problem");
    t += NOTICE_TTL_MS - 1;
    expect(n.current()).toBe("problem");
    t += 1;
    expect(n.current()).toBeUndefined();
  });

  it("clears at once", () => {
    const n = createTrayNotices(() => 0);
    n.add("problem");
    n.clear();
    expect(n.current()).toBeUndefined();
  });
});

describe("tray notices, edges", () => {
  it("ten minutes is the default life", () => expect(NOTICE_TTL_MS).toBe(600_000));
  it("trims a cut title before the ellipsis", () => {
    expect(noticeText({ kind: "error", title: `${"x".repeat(58)} yyyy` })).toBe(`${"x".repeat(58)}…`);
  });
  it("keeps a title of exactly 60 characters", () => {
    expect(noticeText({ kind: "error", title: "x".repeat(60) })).toBe("x".repeat(60));
  });
});
