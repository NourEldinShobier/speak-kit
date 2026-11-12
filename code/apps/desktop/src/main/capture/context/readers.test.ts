import { describe, expect, it, vi } from "vitest";
import { createContextReader, MAC_SCRIPT, parseNodes, WINDOWS_SCRIPT } from "./readers";

describe("context parsing", () => {
  it("reads a list of controls", () => {
    expect(parseNodes('[{"role":"ControlType.Button","name":"Save","secure":false,"depth":1}]')).toEqual([{ role: "ControlType.Button", name: "Save", secure: false, depth: 1 }]);
  });

  it("reads one control that PowerShell printed as an object", () => {
    expect(parseNodes('{"role":"ControlType.Window","name":"Notepad","secure":false,"depth":0}')).toEqual([{ role: "ControlType.Window", name: "Notepad", secure: false, depth: 0 }]);
  });

  it("accepts a missing or null name", () => {
    expect(parseNodes('[{"role":"AXGroup","name":null,"depth":2},{"role":"AXGroup","depth":2}]')).toEqual([
      { role: "AXGroup", name: undefined, secure: undefined, depth: 2 },
      { role: "AXGroup", name: undefined, secure: undefined, depth: 2 },
    ]);
  });

  it.each(["", "not json", '"text"', '[{"role":1,"depth":0}]', '[{"role":"x","depth":-1}]', '[{"role":"x"}]'])("refuses %j", (text) => {
    expect(parseNodes(text)).toBeUndefined();
  });

  it("keeps at most 400 controls", () => {
    const many = JSON.stringify(Array.from({ length: 500 }, () => ({ role: "AXButton", name: "b", depth: 1 })));
    expect(parseNodes(many)).toHaveLength(400);
  });
});

describe("context reader", () => {
  it("runs PowerShell on Windows and parses what it prints", async () => {
    const run = vi.fn(async () => '[{"role":"ControlType.Button","name":"Save","secure":false,"depth":1}]');
    const reader = createContextReader("win32", run)!;
    expect(await reader.read()).toEqual([{ role: "ControlType.Button", name: "Save", secure: false, depth: 1 }]);
    expect(run).toHaveBeenCalledWith("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_SCRIPT], 6000);
  });

  it("runs osascript with JavaScript on macOS", async () => {
    const run = vi.fn(async () => "[]");
    expect(await createContextReader("darwin", run)!.read()).toEqual([]);
    expect(run).toHaveBeenCalledWith("osascript", ["-l", "JavaScript", "-e", MAC_SCRIPT], 6000);
  });

  it("has no reader elsewhere", () => {
    expect(createContextReader("linux")).toBeUndefined();
  });

  it("gives undefined when the program fails, times out or prints something else", async () => {
    expect(await createContextReader("win32", async () => Promise.reject(new Error("timeout")))!.read()).toBeUndefined();
    expect(await createContextReader("darwin", async () => "execution error: not allowed assistive access")!.read()).toBeUndefined();
  });

  it("the scripts ask for names and the password flag, never a value", () => {
    for (const script of [WINDOWS_SCRIPT, MAC_SCRIPT]) expect(script).not.toMatch(/\.value\(|ValuePattern|TextPattern|\.Value\b|AXValue/);
    expect(WINDOWS_SCRIPT).toContain("IsPassword");
    expect(MAC_SCRIPT).toContain("AXSecureTextField");
  });
});
