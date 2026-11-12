import { describe, expect, it } from "vite-plus/test";
import { LABS, LAB_IDS, isLabId, labsArgs, runLabsCommand, visibleLabs, type LabsState } from ".";

const off: LabsState = { "hide-tray-icon": false, "verbose-log": false };

describe("registry", () => {
  it("gives every lab a title, audience and group", () => {
    for (const id of LAB_IDS) expect(LABS[id]).toMatchObject({ title: expect.any(String), audience: expect.stringMatching(/^(everyone|developers)$/), group: expect.any(String) });
  });
  it("hides developer labs unless asked for", () => {
    expect(visibleLabs(false)).toEqual(["hide-tray-icon"]);
    expect(visibleLabs(true)).toEqual(["hide-tray-icon", "verbose-log"]);
  });
  it("recognises ids without matching inherited names", () => {
    expect(isLabId("verbose-log")).toBe(true);
    expect(isLabId("toString")).toBe(false);
    expect(isLabId("")).toBe(false);
  });
});

describe("runLabsCommand", () => {
  it("lists every lab with its state", () => {
    expect(runLabsCommand(["list"], { ...off, "verbose-log": true })).toEqual({
      code: 0,
      out: "hide-tray-icon\toff\teveryone\tHide the tray icon\nverbose-log\ton\tdevelopers\tDetailed log",
    });
  });
  it("turns a lab on and off without touching the others", () => {
    expect(runLabsCommand(["on", "verbose-log"], off)).toEqual({ code: 0, out: "verbose-log on", next: { ...off, "verbose-log": true } });
    expect(runLabsCommand(["off", "hide-tray-icon"], { ...off, "hide-tray-icon": true }).next).toEqual(off);
  });
  it("turning on twice is the same as once", () => {
    const once = runLabsCommand(["on", "verbose-log"], off).next!;
    expect(runLabsCommand(["on", "verbose-log"], once).next).toEqual(once);
  });
  it("answers an unknown lab with code 3 and the known ids", () => {
    expect(runLabsCommand(["on", "nope"], off)).toEqual({ code: 3, out: 'unknown lab "nope". Known: hide-tray-icon, verbose-log' });
    expect(runLabsCommand(["on", "constructor"], off).code).toBe(3);
  });
  it.each([[[]], [["on"]], [["list", "x"]], [["on", "verbose-log", "extra"]], [["toggle", "verbose-log"]], [[""]]])("rejects %j with code 2 and no change", (args) => {
    const r = runLabsCommand(args, off);
    expect(r.code).toBe(2);
    expect(r.next).toBeUndefined();
  });
});

describe("labsArgs", () => {
  it("takes what follows the labs word", () => {
    expect(labsArgs(["app.exe", "--hidden", "labs", "on", "verbose-log"])).toEqual(["on", "verbose-log"]);
    expect(labsArgs(["app.exe", "labs"])).toEqual([]);
  });
  it("is null for any other command line", () => {
    expect(labsArgs(["app.exe", "--hidden"])).toBeNull();
  });
});
