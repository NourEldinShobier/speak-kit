import { describe, expect, it } from "vite-plus/test";
import type { PageEvent } from "@speakkit/protocol";
import { createPageContext, pageContextText } from ".";

const page = "http://localhost:3000/orders";
const events: PageEvent[] = [
  { type: "click", at: 13_000, page, element: { tag: "button", label: "Save", component: "OrderForm", path: "main > button#save" } },
  { type: "click", at: 20_400, page, element: { tag: "div", role: "tab" } },
  { type: "console-error", at: 71_000, page, message: "Cannot read x" },
  { type: "failed-request", at: 72_000, page, method: "POST", path: "/api/orders", status: 500 },
  { type: "failed-request", at: 73_000, page, method: "GET", path: "/api/me", status: 0 },
];

describe("pageContextText", () => {
  it("lists each event with its time in the recording", () => {
    expect(pageContextText(events, 10_000)).toBe(
      [
        "Page events from http://localhost:3000/orders",
        '0:03 click button "Save" in OrderForm (main > button#save)',
        "0:10 click tab",
        "1:01 console error: Cannot read x",
        "1:02 request failed: POST /api/orders 500",
        "1:03 request failed: GET /api/me no answer",
      ].join("\n"),
    );
  });

  it("gives nothing when the page reported nothing, and never a negative time", () => {
    expect(pageContextText([], 0)).toBeUndefined();
    expect(pageContextText([events[1]!], 99_000)).toBe("Page events from http://localhost:3000/orders\n0:00 click tab");
  });
});

describe("createPageContext", () => {
  it("asks only when the experiment is on, with the recording's range", async () => {
    const asked: unknown[] = [];
    let on = false;
    const read = createPageContext({
      enabled: () => on,
      events: async (r) => (asked.push(r), [events[0]!]),
    });
    expect(await read({ from: 10_000, to: 20_000 })).toBeUndefined();
    expect(asked).toEqual([]);
    on = true;
    expect(await read({ from: 10_000, to: 20_000 })).toBe('Page events from http://localhost:3000/orders\n0:03 click button "Save" in OrderForm (main > button#save)');
    expect(asked).toEqual([{ from: 10_000, to: 20_000 }]);
  });

  it("gives no text when the server cannot be asked", async () => {
    const read = createPageContext({
      enabled: () => true,
      events: async () => {
        throw new Error("connection refused");
      },
    });
    expect(await read({ from: 0, to: 1 })).toBeUndefined();
  });
});
