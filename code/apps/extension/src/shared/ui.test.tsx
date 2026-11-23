import { act } from "react";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { click, installDom, mount, text } from "../testing/dom";
import { Advanced, PageHead } from "./ui";

beforeEach(installDom);

describe("PageHead", () => {
  test("Reset section is a 36 px secondary button, not a link, and calls onReset", async () => {
    const onReset = vi.fn();
    const m = await mount(<PageHead title="Voice and speed" desc="Defaults for every page." onReset={onReset} />);
    const btn = m.root.querySelector(".op-head-r button")!;
    expect(btn.className).toBe("lm-btn lm-btn--secondary");
    expect(text(btn)).toBe("Reset section");
    expect(btn.querySelector("svg")).not.toBeNull();
    expect(m.root.querySelector(".sk-link")).toBeNull();
    await click(btn);
    expect(onReset).toHaveBeenCalledTimes(1);
    await m.unmount();
  });

  test("shows Saved and no button when there is nothing to reset", async () => {
    const m = await mount(<PageHead title="General" desc="How the extension talks to the app." saved />);
    expect(text(m.root.querySelector(".op-saved"))).toBe("Saved");
    expect(m.root.querySelector(".op-head-r button")).toBeNull();
    await m.unmount();
  });
});

describe("Advanced", () => {
  test("starts collapsed without building its content, and builds it once opened", async () => {
    const m = await mount(
      <Advanced>
        <p className="inside">Where it appears</p>
      </Advanced>,
    );
    const fold = m.root.querySelector("details")!;
    expect(text(fold.querySelector("summary"))).toBe("Advanced");
    expect(fold.hasAttribute("open")).toBe(false);
    expect(m.root.querySelector(".inside")).toBeNull();
    fold.setAttribute("open", "");
    await act(async () => void fold.dispatchEvent(new Event("toggle")));
    expect(text(m.root.querySelector(".inside"))).toBe("Where it appears");
    await m.unmount();
  });
});
