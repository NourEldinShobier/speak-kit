import { describe, expect, it } from "vite-plus/test";
import { rig } from "./fakes";

async function pasting() {
  const r = await rig({ keepReady: true });
  let release!: () => void;
  r.ins.state.hold = new Promise<void>((res) => (release = res));
  r.stt.state.result = { ok: true, text: "a long text" };
  await r.hold(1000);
  await r.time.advance(400);
  return { r, release };
}

describe("cancel while the text is going in", () => {
  it("the cancel key stops the insertion and is swallowed", async () => {
    const { r, release } = await pasting();
    expect(r.dictation.state().status).toBe("pasting");
    expect(r.keys.send("Escape", true, r.time.clock.now())).toBe(true);
    expect(r.ins.state.cancels).toBe(1);
    release();
    await r.time.advance(100);
  });

  it("a cancel from a button does the same", async () => {
    const { r, release } = await pasting();
    r.dictation.cancel();
    expect(r.ins.state.cancels).toBe(1);
    release();
    await r.time.advance(100);
  });

  it("another key is not a cancel", async () => {
    const { r, release } = await pasting();
    expect(r.keys.send("KeyA", true, r.time.clock.now())).toBe(false);
    expect(r.ins.state.cancels).toBe(0);
    release();
    await r.time.advance(100);
  });

  it("does nothing while transcribing or idle, so the cancel key still belongs to the app in front", async () => {
    const r = await rig({ keepReady: true });
    expect(r.keys.send("Escape", true, r.time.clock.now())).toBe(false);
    r.dictation.cancel();
    expect(r.ins.state.cancels).toBe(0);
  });
});
