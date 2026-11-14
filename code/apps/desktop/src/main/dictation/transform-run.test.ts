import { describe, expect, it } from "vite-plus/test";
import { transformToast } from "./transform-run";

describe("transformToast", () => {
  it("tells the person how to undo a change, with the key of the platform", () => {
    expect(transformToast({ status: "changed" }, "win32")).toEqual({ text: "Cleaned up the text (Ctrl+Z undoes it)", tone: "ok" });
    expect(transformToast({ status: "changed" }, "darwin").text).toBe("Cleaned up the text (Cmd+Z undoes it)");
  });

  it("explains a refused empty result and a too long field as errors", () => {
    expect(transformToast({ status: "failed", reason: "nothing-left" })).toEqual({ text: "Only filler words, nothing was changed", tone: "error" });
    expect(transformToast({ status: "failed", reason: "too-long" }).text).toBe("The text is too long to clean up at once");
    expect(transformToast({ status: "unchanged" })).toEqual({ text: "Nothing to clean up", tone: "ok" });
  });
});
