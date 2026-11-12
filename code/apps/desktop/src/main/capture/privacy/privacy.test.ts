import { describe, expect, it } from "vitest";
import { labelsOnly, logInput, MAX_LABELS, withoutOwn } from "./index";

describe("input log", () => {
  it("keeps that a key was pressed but not which key", () => {
    expect(logInput({ kind: "key", key: "p", atMs: 5 }, "events")).toEqual({ kind: "key", atMs: 5 });
    expect(JSON.stringify(logInput({ kind: "key", key: "hunter2", atMs: 5 }, "events"))).not.toContain("hunter2");
  });
  it("keeps clicks, scrolls and ink as events", () => {
    expect(logInput({ kind: "click", x: 1, y: 2, atMs: 3 }, "events")).toEqual({ kind: "click", x: 1, y: 2, atMs: 3 });
    expect(logInput({ kind: "scroll", atMs: 3 }, "events")).toEqual({ kind: "scroll", atMs: 3 });
  });
  it("logs nothing when the log is off", () => {
    expect(logInput({ kind: "click", x: 1, y: 2, atMs: 3 }, "off")).toBeUndefined();
  });
});

describe("agent context labels", () => {
  it("keeps names and roles and drops values", () => {
    const out = labelsOnly([{ role: "button", name: "Save", value: "secret value" }]);
    expect(out).toEqual([{ role: "button", name: "Save" }]);
    expect(JSON.stringify(out)).not.toContain("secret value");
  });
  it("never includes password or secure fields, however they are marked", () => {
    expect(
      labelsOnly([
        { role: "edit", name: "Account", password: true },
        { role: "edit", name: "Account", secure: true },
        { role: "edit", name: "Password" },
        { role: "edit", name: "Card number" },
        { role: "password text", name: "Anything" },
        { role: "edit", name: "Email" },
      ]),
    ).toEqual([{ role: "edit", name: "Email" }]);
  });
  it("drops empty and offscreen nodes, repeats, and trims long names", () => {
    const out = labelsOnly([
      { role: "button", name: "  " },
      { role: "button", name: "Hidden", offscreen: true },
      { role: "button", name: "OK" },
      { role: "button", name: "OK" },
      { role: "text", name: "x".repeat(500) },
    ]);
    expect(out.map((l) => l.name.length)).toEqual([2, 80]);
  });
  it("caps the count", () => {
    expect(labelsOnly(Array.from({ length: 500 }, (_, i) => ({ role: "button", name: `b${i}` })))).toHaveLength(MAX_LABELS);
  });
});

describe("own windows", () => {
  it("removes the app's windows from the sources", () => {
    expect(withoutOwn([{ id: "window:1" }, { id: "window:2" }], [{ id: "window:2" }])).toEqual([{ id: "window:1" }]);
  });
});
