import { describe, expect, it } from "vite-plus/test";
import { parseConfig } from "../schemas";
import { planImport } from "./import";

describe("settings import round trip", () => {
  it("takes every key of a stored settings file except the install state and the machine's own records", () => {
    const stored = JSON.parse(JSON.stringify(parseConfig({})));
    const plan = planImport(JSON.stringify(stored));
    expect(plan).toMatchObject({ ok: true });
    if (!plan.ok) return;
    expect(plan.change).toMatchObject({
      port: 47615,
      voice: "af_heart",
      "dictation.mode": "hold",
      "meetings.output": "automatic",
      "transcripts.language": stored.transcripts.language,
    });
    expect(plan.skipped).toEqual([
      "setupDone",
      "setupSkipped",
      "setupStep",
      "appliedMigrations",
      "configVersion",
      "whatsNew",
      "dictation.enabled",
      "capture.enabled",
      "capture.folder",
      "capture.narrationCommand",
      "capture.consented",
      "capture.lastTargets",
      "transcripts.folder",
      "engines.failedDevices",
      "engines.timedDevices",
      "engines.dismissedHints",
      "engines.skippedModel",
      "engines.lastUsed",
      "meetings.policies",
      "meetings.apps",
      "meetings.folder",
      "meetings.positions",
      "meetings.inputDevice",
    ]);
  });

  it("lets an explicit port win over preferredPort without a duplicate", () => {
    expect(planImport('{"preferredPort": 50000, "port": 51000}')).toMatchObject({ ok: true, change: { port: 51000 }, skipped: [] });
  });

  it("takes the server port from the stored name preferredPort", () => {
    expect(planImport('{"preferredPort": 50000}')).toMatchObject({ ok: true, change: { port: 50000 }, skipped: [] });
  });
});
