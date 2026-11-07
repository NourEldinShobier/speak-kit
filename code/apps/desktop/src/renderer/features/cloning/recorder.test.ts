import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { micProblem, startRecording } from "./recorder";

const events = { onTick: vi.fn(), onDone: vi.fn(), onFailed: vi.fn() };
afterEach(() => vi.unstubAllGlobals());

/** A getUserMedia that answers when the test says so, as a permission prompt does. */
function pendingMic() {
  const track = { stop: vi.fn() };
  let allow = () => {};
  const getUserMedia = vi.fn(() => new Promise((res) => (allow = () => res({ getTracks: () => [track] }))));
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  return { track, allow: () => allow() };
}

describe("startRecording while the permission prompt is open", () => {
  it("stops the stream at once when the person cancelled before the answer arrived, so the microphone indicator goes off", async () => {
    const mic = pendingMic();
    const ac = new AbortController();
    const started = startRecording(events, ac.signal);
    ac.abort();
    mic.allow();
    await expect(started).rejects.toMatchObject({ name: "AbortError" });
    expect(mic.track.stop).toHaveBeenCalledTimes(1);
    expect(events.onTick).not.toHaveBeenCalled();
  });
});

describe("micProblem", () => {
  it("tells a refusal from a missing device; each has its own screen (K6)", () => {
    const named = (name: string) => new DOMException("x", name);
    expect(["NotAllowedError", "SecurityError"].map((n) => micProblem(named(n)))).toEqual(["denied", "denied"]);
    expect(["NotFoundError", "OverconstrainedError"].map((n) => micProblem(named(n)))).toEqual(["missing", "missing"]);
    expect([micProblem(named("AbortError")), micProblem(new Error("x")), micProblem(null)]).toEqual([null, null, null]);
  });
});
