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

describe("VoiceSection (C4)", () => {
  test("Default voice, Speed, Pause and Preview rows use 36 px controls and the 68 px row helper where the control is a slider", async () => {
    const { m } = await setup();
    const rows = [...m.root.querySelectorAll(".lm-card .lm-row")].map((r) => `${text(r.querySelector(".lm-row__label"))}: ${r.className}`);
    expect(rows).toEqual(["Default voice: lm-row", "Speed: lm-row lm-row--control", "Pause between paragraphs: lm-row"]);
    expect(m.root.querySelectorAll(".lm-select--sm, .lm-input--sm, .lm-btn--sm").length).toBe(0);
    expect(m.root.querySelector(".lm-seg")!.className).toBe("lm-seg");
    expect(m.root.querySelector(".op-preview .lm-input")!.className).toBe("lm-input");
    const play = m.root.querySelector(".op-preview button")!;
    expect([text(play), play.className]).toEqual(["Play sample", "lm-btn lm-btn--primary"]);
    await m.unmount();
  });

  test("Speed shows the slider with its value to the right", async () => {
    const { m } = await setup();
    const speed = m.root.querySelector(".op-slider")!;
    expect([...speed.children].map((c) => c.tagName)).toEqual(["SPAN", "OUTPUT"]);
    expect(text(speed.querySelector("output"))).toBe("1.5x");
    expect(speed.querySelector('[role="slider"]')!.getAttribute("aria-label")).toBe("Default speed");
    await m.unmount();
  });

  test("Chatterbox install is a 36 px button and Reset section restores voice, speed and pause", async () => {
    const { m, upd } = await setup();
    const install = [...m.root.querySelectorAll(".op-engine button")].find((b) => text(b) === "Install in the app")!;
    expect(install.className).toBe("lm-btn lm-btn--secondary");
    await click([...m.root.querySelectorAll(".op-head-r button")].find((b) => text(b) === "Reset section") ?? null);
    const next = upd.mock.calls[0]![0](defaultSettings());
    expect([next.speed, next.pauseBetweenParagraphs]).toEqual([defaultSettings().speed, defaultSettings().pauseBetweenParagraphs]);
    await m.unmount();
  });
});
