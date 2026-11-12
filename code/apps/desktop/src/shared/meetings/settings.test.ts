import { describe, expect, it } from "vite-plus/test";
import { parseConfig } from "../schemas";
import { MeetingsConfigSchema, retentionOf } from "./settings";
import * as v from "valibot";

describe("meetings settings", () => {
  it("loads a config from before meetings existed with the defaults", () => {
    const c = parseConfig({ port: 3000 }).meetings;
    expect(c).toEqual({
      enabled: true,
      stopWhenEnds: true,
      shortcut: "",
      policies: {},
      apps: [],
      recordSource: "call-app",
      output: "automatic",
      mic: "dictation",
      summary: false,
      audioHours: 24,
      textDays: 30,
      trashDays: 30,
      folder: "",
      positions: {},
      inputDevice: "",
    });
  });

  it("keeps good values and replaces each bad one with its default", () => {
    const c = parseConfig({
      meetings: { enabled: false, audioHours: 5, textDays: "x", policies: { zoom: "always", slack: "sometimes" }, shortcut: "nonsense", summary: 1, positions: { a: { x: 1, y: 2 } } },
    }).meetings;
    expect(c).toMatchObject({ enabled: false, audioHours: 24, textDays: 30, shortcut: "", summary: false, positions: { a: { x: 1, y: 2 } } });
    // A bad policy for one app becomes "ask"; the good one stays.
    expect(c.policies).toEqual({ zoom: "always", slack: "ask" });
  });

  it("normalises a stored shortcut and keeps summary off unless it is exactly true", () => {
    expect(parseConfig({ meetings: { shortcut: "ctrl+alt+m", summary: true } }).meetings).toMatchObject({ shortcut: "Ctrl+Alt+M", summary: true });
  });

  it("gives every config its own defaults, so a change to one does not reach the next", () => {
    const a = parseConfig({});
    a.meetings.policies = { zoom: "never" };
    expect(parseConfig({}).meetings.policies).toEqual({});
  });

  it("limits what is stored: too many apps, positions and long names", () => {
    const many = Array.from({ length: 41 }, (_, i) => ({ name: `App ${i}`, exe: "x" }));
    expect(v.parse(MeetingsConfigSchema, { apps: many }).apps).toEqual([]);
    expect(v.parse(MeetingsConfigSchema, { apps: [{ name: "x".repeat(61) }] }).apps).toEqual([]);
  });

  it("hands the retention to the meetings package as hours and days", () => {
    expect(retentionOf(parseConfig({ meetings: { audioHours: 72, textDays: 0, trashDays: 7 } }).meetings)).toEqual({ audioHours: 72, textDays: 0, trashDays: 7 });
  });
});
