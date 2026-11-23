import { describe, expect, it } from "vite-plus/test";
import { createMicOwners } from "./mic-owners";

function clock() {
  const pending = new Map<number, { at: number; fn: () => void }>();
  let now = 0;
  let id = 0;
  return {
    timers: { set: (fn: () => void, ms: number) => (pending.set(++id, { at: now + ms, fn }), id), clear: (t: unknown) => void pending.delete(t as number) },
    advance(ms: number) {
      now += ms;
      for (const [k, t] of pending) {
        if (t.at > now) continue;
        pending.delete(k);
        t.fn();
      }
    },
  };
}

describe("microphone owners", () => {
  it("names the holder while a claim is open and none after release, also when released twice", () => {
    const o = createMicOwners();
    const release = o.claim("Voice chat");
    expect(o.owner()).toBe("Voice chat");
    release();
    release();
    expect(o.owner()).toBeUndefined();
  });

  it("keeps a lease while it is renewed and lets it lapse when the reports stop", () => {
    const c = clock();
    const o = createMicOwners();
    const beat = o.lease("Voice chat", 30_000, c.timers);
    beat(true);
    c.advance(20_000);
    beat(true);
    c.advance(20_000);
    expect(o.owner()).toBe("Voice chat");
    c.advance(10_000);
    expect(o.owner()).toBeUndefined();
  });

  it("releases a lease at once when told the microphone is closed, and does not double claim on repeated reports", () => {
    const c = clock();
    const o = createMicOwners();
    const beat = o.lease("Voice chat", 30_000, c.timers);
    beat(true);
    beat(true);
    beat(false);
    expect(o.owner()).toBeUndefined();
    beat(false);
    expect(o.owner()).toBeUndefined();
  });
});

describe("voice chat claims", () => {
  it("holds the microphone through a lease for the conversation in the browser", () => {
    const o = createMicOwners();
    const vc = o.voiceChat();
    vc.mic(true);
    expect(o.owner()).toBe("Voice chat");
    vc.mic(false);
    expect(o.owner()).toBeUndefined();
  });
});
