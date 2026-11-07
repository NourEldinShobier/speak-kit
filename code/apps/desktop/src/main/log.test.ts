import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("electron-log/main", () => ({ default: {} }));
const { jsonLine } = await import("./log");

describe("jsonLine", () => {
  it("writes time, level, process id and the values as one line", () => {
    const line = jsonLine({ date: new Date("2026-01-02T03:04:05.000Z"), level: "info", data: ["deep link", "pair"] });
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({ t: "2026-01-02T03:04:05.000Z", level: "info", pid: process.pid, data: ["deep link", "pair"] });
  });

  it("keeps the message and stack of an Error", () => {
    const err = new Error("port busy");
    const { data } = JSON.parse(jsonLine({ date: new Date(0), level: "error", data: ["listen failed", err] }));
    expect(data[1]).toMatchObject({ name: "Error", message: "port busy", stack: expect.stringContaining("port busy") });
  });
});
