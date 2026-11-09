import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("electron-log/main", () => ({ default: {} }));
const { jsonLine, redact, redactValue } = await import("./log");

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

describe("secrets in logs", () => {
  const KEY = "sk-proj-AbCdEf0123456789_xyz-ABCDEF";
  const SECRET = "ek_68af296e8e408191a1120ab6383263c2";

  it("blanks an OpenAI key and a client secret in the line", () => {
    const line = jsonLine({ date: new Date(0), level: "error", data: [`request failed for ${KEY}`, new Error(`bad ${SECRET}`), { headers: { Authorization: `Bearer ${KEY}` } }] });
    expect(line).not.toContain(KEY);
    expect(line).not.toContain(SECRET);
    expect(line).toContain("request failed for [redacted]");
  });

  it("redacts strings, Errors and objects before the console transport sees them", () => {
    expect(redact(`a ${KEY} b`)).toBe("a [redacted] b");
    expect(redactValue(`key=${KEY}`)).toBe("key=[redacted]");
    expect((redactValue(new Error(`x ${KEY}`)) as Error).message).toBe("x [redacted]");
    expect(redactValue({ k: KEY, n: 1 })).toEqual({ k: "[redacted]", n: 1 });
    expect(redactValue(42)).toBe(42);
  });

  it("leaves ordinary text such as a task-list word alone", () => {
    expect(redact("desk-top, risk-free, ek_ and sk-")).toBe("desk-top, risk-free, ek_ and sk-");
  });
});
