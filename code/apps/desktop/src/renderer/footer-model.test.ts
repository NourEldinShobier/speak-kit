import { describe, expect, it } from "vite-plus/test";
import { IDLE_READER } from "../shared/reader";
import { footerItems } from "./footer-model";

const base = { engine: "ready", voice: "Heart", docs: 3, reader: IDLE_READER } as const;

describe("footerItems", () => {
  it("shows engine, voice and the library count when idle", () => {
    expect(footerItems(base)).toEqual(["Kokoro ready", "Voice: Heart", "3 readings"]);
  });
  it("uses the singular and says when the engine sleeps", () => {
    expect(footerItems({ ...base, engine: "unloaded", docs: 1 })).toEqual(["Voice engine asleep", "Voice: Heart", "1 reading"]);
  });
  it("shows the reading that plays instead of the count", () => {
    const reader = { ...IDLE_READER, status: "playing", title: "The first lines" } as const;
    expect(footerItems({ ...base, reader })).toEqual(["Kokoro ready", "Voice: Heart", "Reading: The first lines"]);
  });
  it("leaves out what is not known yet", () => {
    expect(footerItems({ ...base, engine: "starting", voice: undefined, docs: null })).toEqual(["Starting the voice engine"]);
  });
});
