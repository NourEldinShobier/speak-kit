import { describe, expect, it } from "vite-plus/test";
import { DesktopFault, toDesktopError } from "./errors";

describe("toDesktopError", () => {
  it("returns the error of a fault", () => {
    expect(toDesktopError(new DesktopFault({ code: "no-free-port", args: { from: 1, to: 2 } }))).toEqual({ code: "no-free-port", args: { from: 1, to: 2 } });
  });

  it("reads a fault back from the message Electron delivers after an IPC hop", () => {
    const sent = new DesktopFault({ code: "file-exists" });
    const received = new Error(`Error invoking remote method 'speakkit:exportStart': Error: ${sent.message}`);
    expect(toDesktopError(received)).toEqual({ code: "file-exists" });
  });

  it("turns any other error into unexpected and drops the IPC prefix", () => {
    expect(toDesktopError(new Error("Error invoking remote method 'speakkit:setPort': Error: listen EACCES"))).toEqual({ code: "unexpected", args: { detail: "listen EACCES" } });
    expect(toDesktopError("plain")).toEqual({ code: "unexpected", args: { detail: "plain" } });
  });

  it("keeps the text when the JSON after the prefix is damaged", () => {
    expect(toDesktopError(new Error("speakkit-error:{oops"))).toEqual({ code: "unexpected", args: { detail: "speakkit-error:{oops" } });
  });
});
