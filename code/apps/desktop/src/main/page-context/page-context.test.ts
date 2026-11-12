import { describe, expect, it } from "vite-plus/test";
import { createActivePage } from "./index";

describe("the active page", () => {
  it("is empty before any report", () => {
    expect(createActivePage({ now: () => 0 }).current()).toBeUndefined();
  });
  it("holds the reported host until the time is up, and a new report renews it", () => {
    const clock = { t: 1000 };
    const page = createActivePage({ now: () => clock.t, ttlMs: 100 });
    page.report("mail.google.com");
    clock.t = 1099;
    expect(page.current()).toBe("mail.google.com");
    clock.t = 1100;
    expect(page.current()).toBeUndefined();
    page.report("a.com");
    clock.t = 1150;
    page.report("a.com");
    clock.t = 1249;
    expect(page.current()).toBe("a.com");
  });
  it("forgets the page at once when the report is empty (the browser lost focus)", () => {
    const page = createActivePage({ now: () => 0 });
    page.report("a.com");
    page.report("");
    expect(page.current()).toBeUndefined();
  });
});
