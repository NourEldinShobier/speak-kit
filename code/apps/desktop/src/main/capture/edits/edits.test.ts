import { describe, expect, it } from "vitest";
import { canEditFile, editableFiles, editedName, isPng, refuseEdit, shownFile } from ".";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const shot = { kind: "screenshot", media: "shot.png", frames: [] } as const;
const rec = { kind: "recording", media: "video.webm", frames: ["f-0.jpg", "f-3000.jpg"] } as const;

describe("capture edits", () => {
  it("lists the screenshot, or the frames of a recording", () => {
    expect(editableFiles(shot)).toEqual(["shot.png"]);
    expect(editableFiles(rec)).toEqual(["f-0.jpg", "f-3000.jpg"]);
  });

  it("names the copy after the picture, always as a PNG", () => {
    expect(editedName("shot.png")).toBe("edit-shot.png");
    expect(editedName("f-3000.jpg")).toBe("edit-f-3000.png");
  });

  it("saves the copy of a frame in the capture folder, whichever separator the frame path has", () => {
    expect(editedName("frames/f-00003000.jpg")).toBe("edit-f-00003000.png");
    expect(editedName("frames\\f-00003000.jpg")).toBe("edit-f-00003000.png");
  });

  it("shows the edit when there is one", () => {
    expect(shownFile({ edits: { "shot.png": "edit-shot.png" } }, "shot.png")).toBe("edit-shot.png");
    expect(shownFile({}, "shot.png")).toBe("shot.png");
  });

  it("recognises a PNG by its signature and size", () => {
    expect(isPng(png)).toBe(true);
    expect(isPng(new Uint8Array([0x89, 0x50]))).toBe(false);
    expect(isPng(new Uint8Array(20))).toBe(false);
  });

  it("opens only the pictures of a finished capture", () => {
    expect(canEditFile(shot, "shot.png")).toBe(true);
    expect(canEditFile(shot, "../shot.png")).toBe(false);
    expect(canEditFile({ ...shot, finishing: true }, "shot.png")).toBe(false);
    expect(canEditFile(undefined, "shot.png")).toBe(false);
  });

  it("refuses a missing or unfinished capture, a file that is not a picture of it, and a body that is not a PNG", () => {
    expect(refuseEdit(undefined, "shot.png", png)).toBe("gone");
    expect(refuseEdit({ ...shot, finishing: true }, "shot.png", png)).toBe("gone");
    expect(refuseEdit(shot, "../x.png", png)).toBe("not-editable");
    expect(refuseEdit(rec, "video.webm", png)).toBe("not-editable");
    expect(refuseEdit(shot, "shot.png", new Uint8Array(30))).toBe("not-png");
    expect(refuseEdit(shot, "shot.png", png)).toBeUndefined();
  });
});
