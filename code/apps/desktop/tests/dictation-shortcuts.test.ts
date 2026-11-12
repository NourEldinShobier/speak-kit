import { afterEach, describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { launch, type Launched } from "./harness";

const running: Launched[] = [];
const start = async (dictation: object = {}) => {
  const l = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0, dictation }, env: { SPEAKKIT_TEST: "1" } });
  running.push(l);
  await l.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Dictation" }).click();
  await l.page.getByRole("heading", { name: "Dictation shortcut" }).waitFor();
  return l;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
});

const saved = (l: Launched) => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8")).dictation;
const group = (l: Launched, name: string) => l.page.getByRole("group", { name });

describe("Dictation shortcuts page", () => {
  it("shows the default rows with nothing set, and Restore default disabled", async () => {
    const l = await start();
    for (const t of ["Dictation shortcut", "Shortcut mode", "Hold time", "Second shortcut", "Mouse button", "Advanced shortcut options", "Dictate without processing", "Paste last dictation"])
      expect(await l.page.getByText(t, { exact: true }).first().isVisible()).toBe(true);
    expect(await l.page.getByRole("button", { name: "Restore the default Dictation shortcut" }).isDisabled()).toBe(true);
    expect(await group(l, "Second shortcut").getByText("Not set").isVisible()).toBe(true);
  });

  it("records a second shortcut, shows Saved only after it is written, and Remove clears it", async () => {
    const l = await start();
    await l.page.getByRole("button", { name: "Add shortcut: Dictate without processing" }).click();
    await l.page.getByText("Press the new keys").waitFor();
    await l.page.keyboard.down("F8");
    await l.page.keyboard.up("F8");
    await l.page.getByText(/Saved\./).waitFor();
    expect(saved(l).rawHotkey).toBe("F8");
    await l.page.getByRole("button", { name: "Remove Dictate without processing" }).click();
    await group(l, "Dictate without processing").getByText("Not set").waitFor();
    expect(saved(l).rawHotkey).toBe("");
  });

  it("says Unsupported key, refuses a lone letter, and Escape cancels the recorder", async () => {
    const l = await start();
    await l.page.getByRole("button", { name: "Add shortcut: Second shortcut" }).click();
    await l.page.keyboard.down("Numpad1");
    await l.page.keyboard.up("Numpad1");
    await l.page.getByText("Unsupported key").waitFor();
    await l.page.keyboard.down("A");
    await l.page.keyboard.up("A");
    await l.page.getByText("Use a modifier such as Ctrl").waitFor();
    await l.page.keyboard.press("Escape");
    await l.page.getByRole("button", { name: "Add shortcut: Second shortcut" }).waitFor();
    expect(saved(l)?.secondHotkey ?? "").toBe("");
  });

  it("refuses a shortcut that another one already uses and names it, saving nothing", async () => {
    const l = await start();
    await l.page.getByRole("button", { name: "Change Paste last dictation" }).click();
    await l.page.keyboard.down("ControlRight");
    await l.page.keyboard.up("ControlRight");
    await l.page.getByText("Right Ctrl is already the Dictation shortcut. Pick another shortcut.").waitFor();
    expect(saved(l)?.pasteLastHotkey ?? "ControlLeft+AltLeft+KeyV").toBe("ControlLeft+AltLeft+KeyV");
  });

  it("changes Paste last and enables Restore default, which puts it back", async () => {
    const l = await start();
    await l.page.getByRole("button", { name: "Change Paste last dictation" }).click();
    await l.page.keyboard.down("ControlLeft");
    await l.page.keyboard.down("ShiftLeft");
    await l.page.keyboard.down("KeyV");
    await l.page.keyboard.up("KeyV");
    await l.page.keyboard.up("ShiftLeft");
    await l.page.keyboard.up("ControlLeft");
    await l.page.getByText(/Saved\./).waitFor();
    expect(saved(l).pasteLastHotkey).toBe("ControlLeft+ShiftLeft+KeyV");
    await l.page.getByRole("button", { name: "Restore the default Paste last dictation" }).click();
    await l.page.waitForFunction(() => document.body.innerText.includes("Saved."));
    expect(saved(l).pasteLastHotkey).toBe("ControlLeft+AltLeft+KeyV");
  });

  it("picks a mouse button by clicking: the left button is refused, a side button is saved, Remove clears it", async () => {
    const l = await start();
    await l.page.getByRole("button", { name: "Choose button: Mouse button" }).click();
    await l.page.getByText("Waiting for a click").waitFor();
    await l.page.mouse.click(300, 300);
    await l.page.getByText("The left button cannot be a shortcut. Pick Mouse 2 to 5.").waitFor();
    await l.page.mouse.click(300, 300, { button: "middle" });
    await group(l, "Mouse button").getByText("Mouse 3").waitFor();
    expect(saved(l).mouseButton).toBe("Mouse3");
    await l.page.getByRole("button", { name: "Remove Mouse button" }).click();
    await group(l, "Mouse button").getByText("Not set").waitFor();
    expect(saved(l).mouseButton).toBe("");
  });

  it("changes the mode and the explainer, and offers sharing only in Hold mode", async () => {
    const l = await start();
    await l.page.getByRole("button", { name: "Advanced shortcut options" }).click();
    expect(await l.page.getByRole("switch", { name: "Share the shortcut with other apps" }).isDisabled()).toBe(true);
    await l.page.getByRole("combobox", { name: "Shortcut mode" }).click();
    await l.page.getByRole("option", { name: "Hold", exact: true }).click();
    await l.page.getByRole("heading", { name: "How Hold works" }).waitFor();
    expect(saved(l).mode).toBe("hold-only");
    expect(await l.page.getByRole("switch", { name: "Share the shortcut with other apps" }).isEnabled()).toBe(true);
    await l.page.getByRole("combobox", { name: "Shortcut mode" }).click();
    await l.page.getByRole("option", { name: "Tap or hold" }).click();
    await l.page.getByRole("heading", { name: "How Tap or hold works" }).waitFor();
    await l.page.getByText("Cancel key", { exact: true }).waitFor();
  });

  it("asks before saving Home as a shortcut and saves it after the person agrees", async () => {
    const l = await start();
    await l.page.getByRole("button", { name: "Add shortcut: Second shortcut" }).click();
    await l.page.keyboard.down("Home");
    await l.page.keyboard.up("Home");
    await l.page.getByRole("heading", { name: "This key works in every app" }).waitFor();
    await l.page.getByRole("button", { name: "Use Home" }).click();
    await l.page.getByText(/Saved\./).waitFor();
    expect(saved(l).secondHotkey).toBe("Home");
  });

  it("tells the person when a saved left mouse button was reset, and clears the notice on dismiss", async () => {
    const l = await start({ hotkey: "Mouse1" });
    await l.page.getByText("The saved left mouse button was reset to the default shortcut.").waitFor();
    await l.page.getByRole("button", { name: "Dismiss" }).click();
    await l.page.getByText("A shortcut was reset").waitFor({ state: "detached" });
    expect(saved(l).hotkey).toBe("ControlRight");
  });

  it("holds its layout at 960 px: no horizontal scroll, and every button stays inside its row", async () => {
    const l = await start({ secondHotkey: "ControlLeft+AltLeft+KeyD", mouseButton: "Mouse4", rawHotkey: "AltRight" });
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 680));
    await l.page.waitForFunction(() => innerWidth === 960);
    expect(await l.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const overflow = await l.page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".dict-hotkey .lm-btn")].filter((b) => {
        const row = b.closest(".lm-row")!.getBoundingClientRect();
        const r = b.getBoundingClientRect();
        return r.right > row.right || r.left < row.left;
      }).length,
    );
    expect(overflow).toBe(0);
    expect((await l.page.getByRole("button", { name: "Change Dictation shortcut" }).boundingBox())!.height).toBe(36);
  });
});
