import { describe, expect, it } from "vite-plus/test";
import { createMicClaim } from "./mic-claim";

function rig() {
  const log: string[] = [];
  const claim = createMicClaim((name) => {
    log.push(`claim ${name}`);
    return () => void log.push("release");
  });
  return { log, claim };
}

describe("screen capture microphone claim", () => {
  it("claims once while recording with narration and releases when the recording ends", () => {
    const { log, claim } = rig();
    claim.sync(true, true);
    claim.sync(true, true);
    claim.sync(false, true);
    expect(log).toEqual(["claim Screen capture", "release"]);
  });

  it("never claims a recording without narration, so dictation is not refused", () => {
    const { log, claim } = rig();
    claim.sync(true, false);
    expect(log).toEqual([]);
  });

  it("releases when narration is switched off mid-recording", () => {
    const { log, claim } = rig();
    claim.sync(true, true);
    claim.sync(true, false);
    expect(log).toEqual(["claim Screen capture", "release"]);
  });

  it("release on dispose frees a held claim and does nothing twice", () => {
    const { log, claim } = rig();
    claim.sync(true, true);
    claim.release();
    claim.release();
    expect(log).toEqual(["claim Screen capture", "release"]);
  });

  it("works without a registry", () => {
    const claim = createMicClaim(undefined);
    expect(() => claim.sync(true, true)).not.toThrow();
  });
});
