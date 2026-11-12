import { describe, expect, it, vi } from "vitest";
import { createContextReader, handleOfSource, macScript, parseNodes, windowsScript } from "./readers";

const own = { ownPid: 4242 };

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
    expect(await reader.read(own)).toEqual([{ role: "ControlType.Button", name: "Save", secure: false, depth: 1 }]);
    expect(run).toHaveBeenCalledWith("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", windowsScript(own)], 6000);
  });

  it("runs osascript with JavaScript on macOS", async () => {
    const run = vi.fn(async () => "[]");
    expect(await createContextReader("darwin", run)!.read(own)).toEqual([]);
    expect(run).toHaveBeenCalledWith("osascript", ["-l", "JavaScript", "-e", macScript(own)], 6000);
  });

  it("has no reader elsewhere", () => {
    expect(createContextReader("linux")).toBeUndefined();
  });

  it("gives undefined when the program fails, times out or prints something else", async () => {
    expect(await createContextReader("win32", async () => Promise.reject(new Error("timeout")))!.read(own)).toBeUndefined();
    expect(await createContextReader("darwin", async () => "execution error: not allowed assistive access")!.read(own)).toBeUndefined();
  });

  it("the scripts ask for names and the password flag, never a value", () => {
    for (const script of [windowsScript(own), macScript(own)]) expect(script).not.toMatch(/\.value\(|ValuePattern|TextPattern|\.Value\b|AXValue/);
    expect(windowsScript(own)).toContain("IsPassword");
    expect(macScript(own)).toContain("AXSecureTextField");
  });

  it("reads the recorded window by its handle, not the one in front", () => {
    const script = windowsScript({ ownPid: 4242, windowHandle: "197254" });
    expect(script).toContain("[System.IntPtr][long]197254");
    expect(script).not.toContain("$h = [SK.Win]::GetForegroundWindow()");
  });

  it("falls back to the window in front for a screen or an area", () => {
    expect(windowsScript(own)).toContain("$h = [SK.Win]::GetForegroundWindow()");
  });

  it("prints nothing for a window of this app on both systems", () => {
    expect(windowsScript(own)).toContain("if ($owner -eq 4242) { '[]'; exit }");
    expect(macScript(own)).toContain("front.unixId() === 4242 ? [] : front.windows()");
  });

  it("takes the handle out of a window source id only", () => {
    expect(handleOfSource("window:197254:0")).toBe("197254");
    expect(handleOfSource("screen:0:0")).toBeUndefined();
    expect(handleOfSource("window:1;calc:0")).toBeUndefined();
    expect(handleOfSource(undefined)).toBeUndefined();
  });
});
