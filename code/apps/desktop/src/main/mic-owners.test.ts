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
    const release = o.claim("Screen capture");
    expect(o.owner()).toBe("Screen capture");
    release();
    release();
    expect(o.owner()).toBeUndefined();
  });

  it("holds the microphone for the length of a call, also when it throws", async () => {
    const o = createMicOwners();
    const f = o.holding("Screen look", async () => {
      expect(o.owner()).toBe("Screen look");
      throw new Error("x");
    });
    await expect(f()).rejects.toThrow("x");
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
  it("holds the microphone during a look and through a lease, under different names", async () => {
    const o = createMicOwners();
    const seen: (string | undefined)[] = [];
    const vc = o.voiceChat(async () => void seen.push(o.owner()));
    await vc.look();
    expect(seen).toEqual(["Screen look"]);
    vc.mic(true);
    expect(o.owner()).toBe("Voice chat");
    vc.mic(false);
    expect(o.owner()).toBeUndefined();
  });
});
