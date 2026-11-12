import { expect, test } from "@playwright/test";
import { DictationRig, sleep, startRig, until, VK } from "../support/dictation";

// Takes over the keyboard and the foreground window for a few seconds per test: real key hook, real paste, real microphone page (fed from a wav file).
test.describe.configure({ mode: "serial" });

// A plain `if`, not test.skip: the key hook, key injection and foreground control exist on Windows only, and a skipped test would count against the integrity baseline.
if (process.platform !== "win32")
  test("needs Windows: key hook, key injection and foreground control are not implemented elsewhere", () => {
    expect(process.platform).not.toBe("win32");
  });
else dictationSpec();

function dictationSpec() {
  test.describe("dictation, signed in @slow", () => {
    let rig: DictationRig;

    test.beforeAll(async () => {
      rig = await startRig();
    });
    test.afterAll(async () => {
      await rig?.close();
    });
    test.beforeEach(async () => {
      await rig.hook("failTranscription", false);
      await rig.hook("say", "hello there");
      await rig.bridge("patchSettings", { mode: "hold" });
      await rig.focusTarget();
    });
    test.afterEach(async () => {
      rig.up();
      await until(async () => (await rig.hook("state")).status === "idle", "dictation to settle", 8000);
    });

    test("hold: speaking while the key is down pastes the text into the program in front", async () => {
      rig.down();
      await until(async () => (await rig.hook("hud"))?.kind === "recording", "the recording HUD");
      await sleep(700);
      rig.up();
      await until(async () => (await rig.typed()) === "Hello there ", "the pasted text");
      // The microphone page really recorded the tone: the engine was given about a second of loud samples.
      const call = (await rig.hook("calls")).at(-1)!;
      expect(call.samples).toBeGreaterThan(8000);
      expect(call.peak).toBeGreaterThan(5000);
    });

    test("the clipboard is back to what it was after the paste", async () => {
      await rig.setClipboard("my own clipboard");
      await rig.tap(700);
      await until(async () => (await rig.typed()) === "Hello there ", "the pasted text");
      await until(async () => (await rig.clipboard()) === "my own clipboard", "the old clipboard");
    });

    test("the HUD shows while recording and never takes the focus", async () => {
      rig.down();
      const hud = await until(async () => (await rig.hudWindowInfo())[0]?.visible && (await rig.hudWindowInfo())[0], "the HUD window");
      expect(hud).toMatchObject({ focused: false, focusable: false, alwaysOnTop: true });
      expect(rig.fgPid()).toBe(rig.targetPid);
      await sleep(400);
      expect(rig.fgPid()).toBe(rig.targetPid);
      rig.up();
      await until(async () => (await rig.typed()) === "Hello there ", "the pasted text");
      expect(rig.fgPid()).toBe(rig.targetPid);
    });

    test("toggle: press once to start, again to stop", async () => {
      await rig.bridge("patchSettings", { mode: "toggle" });
      await rig.tap();
      await until(async () => (await rig.hook("state")).status === "recording", "recording to start");
      await sleep(600);
      await rig.tap();
      await until(async () => (await rig.typed()) === "Hello there ", "the pasted text");
    });

    test("Escape cancels a toggled recording, is not delivered to the program, and nothing is pasted", async () => {
      await rig.bridge("patchSettings", { mode: "toggle" });
      await rig.tap();
      await until(async () => (await rig.hook("state")).status === "recording", "recording to start");
      const before = (await rig.hook("calls")).length;
      rig.press(VK.escape);
      await until(async () => (await rig.hook("state")).status === "idle", "the cancel");
      await sleep(600);
      expect(await rig.typed()).toBe("");
      expect(await rig.keysSeen()).not.toContain("Escape");
      expect((await rig.hook("calls")).length).toBe(before);
    });

    test("paste and keep leaves the dictated text on the clipboard", async () => {
      await rig.bridge("patchSettings", { output: "keep" });
      try {
        await rig.setClipboard("my own clipboard");
        await rig.tap(700);
        await until(async () => (await rig.typed()) === "Hello there ", "the pasted text");
        await sleep(1200);
        expect(await rig.clipboard()).toBe("Hello there ");
      } finally {
        await rig.bridge("patchSettings", { output: "restore" });
      }
    });

    test("copy only puts the text on the clipboard and sends no keys", async () => {
      await rig.bridge("patchSettings", { output: "copy" });
      try {
        await rig.tap(700);
        await until(async () => (await rig.clipboard()) === "Hello there ", "the copied text");
        expect(await rig.typed()).toBe("");
      } finally {
        await rig.bridge("patchSettings", { output: "restore" });
      }
    });

    test("the Audio and Output settings are saved and the microphone list comes back", async () => {
      const status = await rig.bridge("patchSettings", { keepReady: true, keepReadyMinutes: 15, avoidBluetooth: false, appRules: { putty: { method: "shift-insert", delayMs: 50 } } });
      try {
        expect(status.settings).toMatchObject({ keepReady: true, keepReadyMinutes: 15, avoidBluetooth: false, appRules: { putty: { method: "shift-insert", delayMs: 50 } } });
        await rig.bridge("micDevices");
        await until(async () => (await rig.bridge("status")).devices.length > 0, "the microphone list", 8000);
      } finally {
        await rig.bridge("patchSettings", { keepReady: false, keepReadyMinutes: 0, avoidBluetooth: true, appRules: {} });
      }
    });

    test("a short tap is discarded: nothing is transcribed or pasted", async () => {
      const before = (await rig.hook("calls")).length;
      await rig.tap(80);
      await sleep(1200);
      expect(await rig.typed()).toBe("");
      expect((await rig.hook("calls")).length).toBe(before);
    });

    test("a double tap locks the recording until the key is pressed again", async () => {
      await rig.tap(60);
      await sleep(80);
      await rig.tap(60);
      await until(async () => (await rig.hook("state")).status === "locked", "the lock");
      await until(async () => (await rig.hook("hud"))?.kind === "recording", "the locked HUD");
      expect(await rig.hook("hud")).toMatchObject({ kind: "recording", locked: true });
      await sleep(700);
      await rig.tap(60);
      await until(async () => (await rig.typed()) === "Hello there ", "the pasted text");
    });

    test("a recording is saved to the history, which the history page lists", async () => {
      await rig.tap(700);
      await until(async () => (await rig.typed()) === "Hello there ", "the pasted text");
      const items = await until(async () => {
        const list = await rig.bridge("historyList");
        return list.length ? list : null;
      }, "a history entry");
      expect(items[0]).toMatchObject({ text: "Hello there ", app: "electron.exe" });
      expect((await rig.bridge("status")).historyCount).toBeGreaterThan(0);
    });

    test("a failed transcription says so, keeps the audio, and Try again on the HUD runs it once more", async () => {
      await rig.hook("failTranscription", true);
      await rig.tap(700);
      await until(async () => (await rig.hook("hud"))?.kind === "error", "the failure HUD");
      expect(await rig.hook("hud")).toMatchObject({ kind: "error", text: "Could not transcribe", action: { id: "retry" } });
      expect(await rig.typed()).toBe("");
      await rig.hook("failTranscription", false);
      const hud = await until(() => rig.hudPage(), "the HUD page");
      await hud.getByRole("button", { name: "Try again" }).click();
      await until(async () => (await rig.typed()) === "Hello there ", "the retried text");
    });

    test("with the speech model missing, a recording ends in a Download prompt", async () => {
      await rig.hook("setInstalled", "large-v3-turbo-q5_0", false);
      await rig.tap(700);
      await until(async () => (await rig.hook("hud"))?.kind === "error", "the failure HUD");
      expect(await rig.hook("hud")).toMatchObject({ kind: "error", text: "Speech model missing", action: { id: "download" } });
      expect(await rig.typed()).toBe("");
      await rig.hook("setInstalled", "large-v3-turbo-q5_0", true);
    });

    test("turning dictation off removes the hook, the HUD and the microphone page", async () => {
      await rig.bridge("setEnabled", false);
      await until(async () => !(await rig.hook("hotkeyActive")), "the hook to stop");
      await rig.tap(700);
      await sleep(500);
      expect(await rig.typed()).toBe("");
      expect(await rig.hook("hud")).toBeNull();
      expect(rig.windows()).toHaveLength(0);
      expect((await rig.bridge("status")).enabled).toBe(false);
      await rig.bridge("setEnabled", true);
      await until(() => rig.hook("hotkeyActive"), "the hook to start again");
    });
  });

  test.describe("dictation, microphone refused @slow", () => {
    test("a denied microphone ends in an error with a Sound settings button, and nothing is pasted", async () => {
      const rig = await startRig({ dictation: { enabled: true } });
      try {
        await rig.hook("denyMic", true);
        await rig.hook("say", "hello there");
        await rig.focusTarget();
        await rig.tap(700);
        await until(async () => (await rig.hook("hud"))?.kind === "error", "the failure HUD");
        expect(await rig.hook("hud")).toMatchObject({ kind: "error", text: "Microphone access is blocked", action: { id: "sound-settings" } });
        expect(await rig.typed()).toBe("");
      } finally {
        await rig.close();
      }
    });
  });

  test.describe("dictation page, audio cards @slow", () => {
    const windows = (rig: DictationRig) => rig.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.webContents.getURL().split("/").pop()));

    test("with dictation off the page opens no microphone window; turned on, the cards show Automatic at 36 px and the meter follows the window", async () => {
      const rig = await startRig({ dictation: { enabled: false } });
      try {
        await rig.page.getByRole("link", { name: "Dictation", exact: true }).click();
        await rig.page.getByRole("heading", { name: "Microphone", exact: true }).waitFor();
        await sleep(600);
        expect(await windows(rig)).not.toContain("recorder.html");
        expect(await rig.hook("meterOn")).toBe(false);

        await rig.page.getByRole("switch", { name: "Dictation" }).click();
        await until(() => rig.hook("meterOn"), "the level meter", 8000);
        const picker = rig.page.getByRole("combobox", { name: "Microphone", exact: true });
        await expect(picker).toHaveText(/Automatic/);
        const heights = await rig.page.evaluate(() => {
          const h = (s: string) => Math.round(document.querySelector(s)!.getBoundingClientRect().height);
          const field = document.querySelector('input[aria-label="Program name"]')!.closest(".lm-input")!;
          return { field: Math.round(field.getBoundingClientRect().height), add: h("form.dict-rule--add button") };
        });
        expect(heights).toEqual({ field: 36, add: 36 });

        await rig.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.webContents.getURL().includes("index.html"))
            ?.hide(),
        );
        await until(async () => !(await rig.hook("meterOn")), "the meter to let go of a hidden window", 8000);
      } finally {
        await rig.close();
      }
    });
  });

  test.describe("dictation history page @slow", () => {
    const entry = (n: number, extra: object = {}) => ({
      id: `${Date.now() - n}-0`,
      at: Date.now() - n * 1000,
      text: `Entry number ${n}`,
      raw: `entry ${n}`,
      app: "notepad.exe",
      durationMs: 2000,
      ...extra,
    });

    test("rows show details, several can be selected and deleted at once, and the statistics add up", async () => {
      const history = JSON.stringify([entry(1, { outcome: "sent" }), entry(2, { outcome: "copied", kind: "interrupted" }), entry(3, { outcome: "failed", displayName: "Notes" }), entry(4)]);
      const rig = await startRig({ files: { "dictation-history.json": history } });
      try {
        await rig.page.getByRole("link", { name: "History", exact: true }).click();
        await expect(rig.page.getByTestId("history-row")).toHaveCount(4);
        await expect(rig.page.getByText("Copied only", { exact: true })).toBeVisible();
        await expect(rig.page.getByText("Cut short", { exact: true })).toBeVisible();
        await expect(rig.page.getByText("Not inserted", { exact: true })).toBeVisible();
        await expect(rig.page.getByText("Notes", { exact: true })).toBeVisible();

        await rig.page.getByRole("button", { name: "Statistics" }).click();
        await expect(rig.page.getByRole("dialog", { name: "Dictation statistics" })).toContainText("Dictations4");
        await rig.page.getByRole("button", { name: "Close" }).click();

        await rig.page.getByRole("button", { name: "Select", exact: true }).click();
        await rig.page.getByRole("checkbox", { name: "Select: Entry number 1" }).check({ force: true });
        await rig.page.getByRole("checkbox", { name: "Select: Entry number 2" }).check({ force: true });
        await rig.page.getByRole("button", { name: "Delete selected (2)" }).click();
        await rig.page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
        await expect(rig.page.getByTestId("history-row")).toHaveCount(2);
        expect((await rig.bridge("historyList")).map((i) => i.text).sort()).toEqual(["Entry number 3", "Entry number 4"]);
      } finally {
        await rig.close();
      }
    });
  });

  test.describe("dictation, first run @slow", () => {
    test("turning dictation on without a model shows the download card, then the settings once it is ready", async () => {
      const rig = await startRig({ dictation: { enabled: false } });
      try {
        await rig.hook("setInstalled", "large-v3-turbo-q5_0", false);
        await rig.page.getByRole("link", { name: "Dictation", exact: true }).click();
        await rig.page.getByRole("switch", { name: "Dictation" }).click();
        await rig.page.getByText("Set up dictation").waitFor();
        await expect(rig.page.getByText("Step 1 of 2")).toBeVisible();
        await expect(rig.page.getByRole("progressbar", { name: "Speech model download" })).toBeVisible();
        await rig.hook("finishDownload");
        await rig.page.getByRole("heading", { name: "Speech model" }).waitFor();
        expect((await rig.bridge("status")).modelReady).toBe(true);
      } finally {
        await rig.close();
      }
    });
  });
}
