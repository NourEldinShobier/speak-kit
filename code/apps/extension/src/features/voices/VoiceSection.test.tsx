import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { click, installDom, mount, text } from "../../testing/dom";
import { defaultSettings } from "../settings";
import { VoiceSection } from "./VoiceSection";

beforeEach(installDom);

const setup = async () => {
  const upd = vi.fn();
  const m = await mount(<VoiceSection s={{ ...defaultSettings(), speed: 1.5 }} upd={upd} saved={false} />);
  return { m, upd };
};

describe("VoiceSection", () => {
  test("Speed shows the slider with its value to the right", async () => {
    const { m } = await setup();
    const speed = m.root.querySelector(".op-slider")!;
    expect([...speed.children].map((c) => c.tagName)).toEqual(["SPAN", "OUTPUT"]);
    expect(text(speed.querySelector("output"))).toBe("1.5x");
    expect(speed.querySelector('[role="slider"]')!.getAttribute("aria-label")).toBe("Default speed");
    await m.unmount();
  });

  test("the Engine card lists Kokoro only, and Reset section restores voice, speed and pause", async () => {
    const { m, upd } = await setup();
    expect([...m.root.querySelectorAll(".op-engine b")].map((b) => text(b))).toEqual(["Kokoro-82M"]);
    await click([...m.root.querySelectorAll(".op-head-r button")].find((b) => text(b) === "Reset section") ?? null);
    const next = upd.mock.calls[0]![0](defaultSettings());
    expect([next.speed, next.pauseBetweenParagraphs]).toEqual([defaultSettings().speed, defaultSettings().pauseBetweenParagraphs]);
    await m.unmount();
  });
});
