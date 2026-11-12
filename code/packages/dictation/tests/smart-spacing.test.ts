import { describe, expect, it } from "vite-plus/test";
import { rig } from "./fakes";

async function say(r: Awaited<ReturnType<typeof rig>>, text = "next words") {
  r.stt.state.result = { ok: true, text };
  await r.hold(1000);
  await r.time.advance(2000);
}

describe("smart spacing", () => {
  it("is off by default and never reads the field", async () => {
    const r = await rig();
    r.ins.state.caret = { before: "d", selected: false };
    await say(r);
    expect(r.ins.state.caretReads).toBe(0);
    expect(r.ins.inserted.map((i) => i.text)).toEqual(["Next words "]);
  });

  it("adds a space after a letter and keeps the history text clean", async () => {
    const r = await rig({ keepReady: true, smartSpacing: true });
    r.ins.state.caret = { before: "d", selected: false };
    await say(r);
    expect(r.ins.inserted.map((i) => i.text)).toEqual([" Next words "]);
    expect((await r.dictation.history.list())[0]?.text).toBe("Next words ");
  });

  it("adds nothing after a line break", async () => {
    const r = await rig({ keepReady: true, smartSpacing: true });
    r.ins.state.caret = { before: "\n", selected: false };
    await say(r);
    expect(r.ins.inserted.map((i) => i.text)).toEqual(["Next words "]);
  });

  it("adds nothing when text is selected", async () => {
    const r = await rig({ keepReady: true, smartSpacing: true });
    r.ins.state.caret = { before: "d", selected: true };
    await say(r);
    expect(r.ins.inserted.map((i) => i.text)).toEqual(["Next words "]);
  });

  it("pastes unchanged when the field cannot be read", async () => {
    const r = await rig({ keepReady: true, smartSpacing: true });
    r.ins.state.caret = undefined;
    await say(r);
    expect(r.ins.inserted.map((i) => i.text)).toEqual(["Next words "]);
  });

  it("pastes unchanged when reading the field throws, with one log line", async () => {
    const log: string[] = [];
    const r = await rig({ keepReady: true, smartSpacing: true }, undefined, { log: (stage, why) => log.push(`${stage}:${why}`) });
    r.ins.state.caretThrows = true;
    await say(r);
    expect(r.ins.inserted.map((i) => i.text)).toEqual(["Next words "]);
    expect(log).toContain("caret:failed");
  });

  it("does not read the field when the text is only copied", async () => {
    const r = await rig({ keepReady: true, smartSpacing: true, insertMode: "copy" });
    r.ins.state.caret = { before: "d", selected: false };
    await say(r);
    expect(r.ins.state.caretReads).toBe(0);
  });
});
