import { afterEach, describe, expect, it } from "vite-plus/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { launch, removeDir, type Launched } from "./harness";

const running: Launched[] = [];
const dirs: string[] = [];
const start = async (o: Parameters<typeof launch>[0] = {}) => {
  const l = await launch({ ...o, env: { SPEAKKIT_TEST: "1", ...o.env } });
  running.push(l);
  return l;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
  await Promise.all(dirs.splice(0).map(removeDir));
});

const ON = { setupDone: true, setupSkipped: false, preferredPort: 0, capture: { enabled: true, consented: true, target: "screen" } };
type Hook = { [k: string]: (...a: unknown[]) => Promise<unknown> };
const hook = <T>(l: Launched, fn: string, ...args: unknown[]) =>
  l.app.evaluate((_, [f, a]) => ((globalThis as unknown as { __speakkit: { capture: Hook } }).__speakkit.capture[f as string] as (...x: unknown[]) => unknown)(...(a as unknown[])) as T, [
    fn,
    args,
  ] as const);
const until = async (f: () => Promise<boolean>, ms = 15_000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(await f()).toBe(true);
};
const open = async (l: Launched) => {
  await l.page.getByRole("link", { name: "Capture" }).click();
  await l.page.getByRole("heading", { name: "Capture", level: 1 }).waitFor();
};
const phase = async (l: Launched) => (await hook<{ session: { phase: string } }>(l, "state")).session.phase;

/** One whole capture with the scripted recorder: start, stop, wait until it is saved. */
async function record(l: Launched) {
  await hook(l, "start");
  await until(async () => (await phase(l)) === "recording");
  await hook(l, "stop");
  await until(async () => (await phase(l)) === "idle" && (await hook<{ items: unknown[] }>(l, "state")).items.length > 0);
}

describe("capture page", () => {
  it("shows the empty state, the three tabs and the capture key", async () => {
    const l = await start({ config: ON });
    await open(l);
    await l.page.getByText("No captures yet").waitFor();
    expect(await l.page.getByRole("tab").allTextContents()).toEqual(["Captures", "Settings", "Privacy"]);
    expect(await l.page.getByRole("button", { name: /Take a capture/ }).isEnabled()).toBe(true);
  });

  it("records, lists the capture, opens it, searches, and deletes it after a confirm", async () => {
    const l = await start({ config: ON });
    await open(l);
    await record(l);
    const row = l.page.getByTestId("capture-row");
    await row.first().waitFor();
    expect(await row.count()).toBe(1);
    expect((await l.page.getByText("Saved").first().isVisible()) || (await l.page.getByText("Copied").first().isVisible())).toBe(true);
    // no microphone words in a scripted capture: the page says so
    await l.page.getByText("No words were saved").first().waitFor();

    await l.page.getByRole("textbox", { name: "Search captures" }).fill("zzzz");
    await l.page.getByText("No captures match").waitFor();
    await l.page.getByRole("textbox", { name: "Search captures" }).fill("");

    await l.page.getByRole("button", { name: /^Open Display/ }).click();
    await l.page.getByTestId("capture-detail").waitFor();
    await l.page.getByText("No narration was saved for this capture.").waitFor();
    await l.page.getByRole("button", { name: "Delete" }).click();
    await l.page.getByRole("dialog", { name: "Delete this capture?" }).waitFor();
    await l.page.getByRole("button", { name: /Move to/ }).click();
    await l.page.getByText("No captures yet").waitFor();
    expect((await hook<{ items: unknown[] }>(l, "state")).items).toEqual([]);
  });

  it("one capture at a time and a cancel returns to idle", async () => {
    const l = await start({ config: ON });
    await open(l);
    await hook(l, "start");
    await until(async () => (await phase(l)) === "recording");
    await hook(l, "start");
    expect(await phase(l)).toBe("recording");
    await hook(l, "discard");
    expect(await phase(l)).toBe("idle");
    expect((await hook<{ items: unknown[] }>(l, "state")).items).toEqual([]);
  });

  it("a recording with no frames says nothing was recorded and saves nothing", async () => {
    const l = await start({ config: ON });
    await open(l);
    await hook(l, "script", { frames: 0 });
    await hook(l, "start");
    await until(async () => (await phase(l)) === "recording");
    await hook(l, "stop");
    await l.page.getByText("Nothing was recorded").first().waitFor();
    expect((await hook<{ items: unknown[] }>(l, "state")).items).toEqual([]);
  });

  it("settings: turning capture off shows the banner, the keep time and the hotkey are saved", async () => {
    const l = await start({ config: ON });
    await open(l);
    await l.page.getByRole("tab", { name: "Settings" }).click();
    await l.page.getByTestId("capture-settings").waitFor();
    await l.page.getByRole("switch", { name: "Capture" }).click();
    await l.page.getByRole("tab", { name: "Captures" }).click();
    await l.page.getByText("Capture is off").waitFor();
    await l.page.getByRole("button", { name: "Turn on" }).click();
    await l.page.getByText("Capture is off").waitFor({ state: "detached" });
    await l.page.getByRole("tab", { name: "Settings" }).click();
    await l.page.getByRole("combobox", { name: "Keep captures" }).click();
    await l.page.getByRole("option", { name: "7 days" }).click();
    await until(async () => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8")).capture?.retentionDays === 7);
  });

  it("privacy tab says what is hidden and recorded", async () => {
    const l = await start({ config: ON });
    await open(l);
    await l.page.getByRole("tab", { name: "Privacy" }).click();
    await l.page.getByTestId("capture-privacy").waitFor();
    await l.page.getByText("The capsule, the picker and Speak Kit itself never appear in a capture.").waitFor();
    expect(await l.page.getByRole("checkbox", { name: "Hide Speak Kit windows from recordings" }).isChecked()).toBe(true);
  });

  it("first capture asks for consent", async () => {
    const l = await start({ config: { ...ON, capture: { ...ON.capture, consented: false } } });
    await l.page.getByRole("link", { name: "Capture" }).click();
    await l.page.getByRole("dialog", { name: "Record your screen?" }).waitFor();
    await l.page.getByRole("button", { name: "Allow capture" }).click();
    await l.page.getByRole("dialog").waitFor({ state: "detached" });
    expect(JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8")).capture.consented).toBe(true);
  });
});

describe("recovery after a crash", () => {
  it("finishes an interrupted capture whose media was saved, removes one that had nothing, and says so", async () => {
    const userData = mkdtempSync(path.join(tmpdir(), "speakkit-capture-"));
    dirs.push(userData);
    const root = path.join(userData, "captures");
    for (const [id, stage, media] of [
      ["cdone", "media-saved", "video.webm"],
      ["cempty", "recording", undefined],
      ["ccut", "recording", undefined],
    ] as const) {
      mkdirSync(path.join(root, id, "frames"), { recursive: true });
      writeFileSync(path.join(root, id, "journal.json"), JSON.stringify({ id, stage, startedAt: Date.now() - 5000, ...(media && { media }) }));
      if (media) writeFileSync(path.join(root, id, media), "x");
    }
    // cut off while recording, after pictures were streamed to disk: kept
    writeFileSync(path.join(root, "ccut", "frames", "f-00000000.jpg"), "x");
    const l = await start({ config: ON, userData });
    await open(l);
    await l.page.getByText("Captures recovered after Speak Kit closed unexpectedly").waitFor();
    await l.page.getByText("Recovered capture").first().waitFor();
    expect((await hook<{ items: unknown[] }>(l, "state")).items).toHaveLength(2);
    expect(existsSync(path.join(root, "ccut", "frames", "f-00000000.jpg"))).toBe(true);
    expect(existsSync(path.join(root, "cempty"))).toBe(false);
    expect(existsSync(path.join(root, "cdone", "video.webm"))).toBe(true);
  });
});

describe("folder and quit", () => {
  it("saves new captures in the folder chosen in Settings", async () => {
    const folder = mkdtempSync(path.join(tmpdir(), "speakkit-capture-folder-"));
    dirs.push(folder);
    const l = await start({ config: ON });
    await open(l);
    await hook(l, "settings", { folder });
    await record(l);
    const [item] = (await hook<{ items: { id: string; dir: string }[] }>(l, "state")).items;
    expect(item).toBeDefined();
    expect(existsSync(path.join(folder, "index.json"))).toBe(true);
    expect(existsSync(path.join(folder, item!.dir, "journal.json"))).toBe(true);
    expect(JSON.parse(readFileSync(path.join(folder, item!.dir, "journal.json"), "utf8")).stage).toBe("complete");
    expect(existsSync(path.join(l.userData, "captures", item!.dir))).toBe(false);
  });

  it("quitting while recording saves the capture", async () => {
    const l = await start({ config: ON });
    await open(l);
    await hook(l, "start");
    await until(async () => (await phase(l)) === "recording");
    await hook(l, "quit");
    const state = await hook<{ session: { phase: string }; items: unknown[] }>(l, "state");
    expect(state.session.phase).toBe("idle");
    expect(state.items).toHaveLength(1);
  });
});

describe("experiments", () => {
  it("lists the Capture cards and turns the screenshot card on and off", async () => {
    const l = await start({ config: ON });
    await l.page.getByRole("link", { name: "Settings" }).click();
    await l.page.getByRole("link", { name: "Experiments" }).click();
    await l.page.getByRole("heading", { name: "Experiments" }).waitFor();
    const card = l.page.locator('[data-id="capture-screenshots"]');
    await card.getByText("Screenshots with a corner card").waitFor();
    await card.getByRole("button", { name: /Turn on/ }).click();
    await card.getByRole("button", { name: /Turn off/ }).waitFor();
    await until(async () => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8")).capture?.experiments?.screenshots === true);
    await card.getByRole("button", { name: /Turn off/ }).click();
    await card.getByRole("button", { name: /Turn on/ }).waitFor();
  });
});

/** A small PNG made here: a grey picture with a lighter band, so an edit is easy to tell from the original. */
function makePng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width * 3; x++) rows[y * (width * 3 + 1) + 1 + x] = y > height / 3 && y < (2 * height) / 3 ? 220 : 120;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

describe("editing a screenshot", () => {
  const seed = () => {
    const userData = mkdtempSync(path.join(tmpdir(), "speakkit-capture-"));
    dirs.push(userData);
    const dir = path.join(userData, "captures", "s1");
    mkdirSync(dir, { recursive: true });
    const png = makePng(320, 200);
    writeFileSync(path.join(dir, "shot.png"), png);
    const record = { id: "s1", kind: "screenshot", title: "Screenshot - Display 1", at: Date.now(), dir: "s1", bytes: png.length, media: "shot.png", frames: [], chips: ["saved", "copied"] };
    writeFileSync(path.join(userData, "captures", "index.json"), JSON.stringify([record]));
    return { userData, dir };
  };
  const openEditor = async (l: Launched) => {
    await open(l);
    await l.page.getByRole("button", { name: /^Open Screenshot/ }).click();
    await l.page.getByTestId("capture-detail").waitFor();
    await l.page.getByRole("button", { name: /^Edit picture at/ }).click();
    await l.page.getByRole("dialog", { name: "Edit picture" }).waitFor();
  };

  it("draws a rectangle with the mouse, saves a copy next to the original, and shows it as edited", async () => {
    const { userData, dir } = seed();
    const l = await start({ config: ON, userData });
    await openEditor(l);
    const save = l.page.getByRole("button", { name: "Save a copy" });
    expect(await save.isDisabled()).toBe(true);
    await l.page.getByRole("button", { name: "Rectangle" }).click();
    const canvas = l.page.getByLabel(/^Picture, 320 by 200/);
    const box = (await canvas.boundingBox())!;
    await l.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await l.page.mouse.down();
    await l.page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 4 });
    await l.page.mouse.up();
    expect(await save.isDisabled()).toBe(false);
    await l.page.getByRole("button", { name: "Undo" }).click();
    expect(await save.isDisabled()).toBe(true);
    await l.page.getByRole("button", { name: "Redo" }).click();
    await save.click();
    await l.page.getByRole("dialog", { name: "Edit picture" }).waitFor({ state: "detached" });
    await l.page.getByText("Picture (edited)").waitFor();
    const edited = readFileSync(path.join(dir, "edit-shot.png"));
    expect([...edited.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(edited.equals(readFileSync(path.join(dir, "shot.png")))).toBe(false);
    expect(JSON.parse(readFileSync(path.join(userData, "captures", "index.json"), "utf8"))[0].edits).toEqual({ "shot.png": "edit-shot.png" });
  });

  it("draws with the keyboard alone: arrows move, Space marks the two corners", async () => {
    const { userData, dir } = seed();
    const l = await start({ config: ON, userData });
    await openEditor(l);
    await l.page.getByRole("button", { name: "Highlight" }).click();
    await l.page.getByLabel(/^Picture, 320 by 200/).focus();
    await l.page.keyboard.press("Space");
    for (let i = 0; i < 5; i++) await l.page.keyboard.press("ArrowRight");
    for (let i = 0; i < 4; i++) await l.page.keyboard.press("ArrowDown");
    await l.page.keyboard.press("Space");
    const save = l.page.getByRole("button", { name: "Save a copy" });
    expect(await save.isDisabled()).toBe(false);
    await l.page.keyboard.press("Control+z");
    expect(await save.isDisabled()).toBe(true);
    await l.page.keyboard.press("Control+y");
    await save.click();
    await l.page.getByRole("dialog", { name: "Edit picture" }).waitFor({ state: "detached" });
    expect(existsSync(path.join(dir, "edit-shot.png"))).toBe(true);
  });

  it("cropping saves a smaller picture and Cancel leaves the original alone", async () => {
    const { userData, dir } = seed();
    const l = await start({ config: ON, userData });
    await openEditor(l);
    await l.page.getByRole("button", { name: "Cancel" }).click();
    await l.page.getByRole("dialog", { name: "Edit picture" }).waitFor({ state: "detached" });
    expect(existsSync(path.join(dir, "edit-shot.png"))).toBe(false);
    await l.page.getByRole("button", { name: /^Edit picture at/ }).click();
    await l.page.getByRole("button", { name: "Crop" }).click();
    const box = (await l.page.getByLabel(/^Picture, 320 by 200/).boundingBox())!;
    await l.page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await l.page.mouse.down();
    await l.page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.75, { steps: 3 });
    await l.page.mouse.up();
    await l.page.getByText(/^Crop 160 by 100/).waitFor();
    await l.page.getByRole("button", { name: "Save a copy" }).click();
    await l.page.getByRole("dialog", { name: "Edit picture" }).waitFor({ state: "detached" });
    const edited = readFileSync(path.join(dir, "edit-shot.png"));
    expect([edited.readUInt32BE(16), edited.readUInt32BE(20)]).toEqual([160, 100]);
  });
});

describe("send to Voice chat", () => {
  const SEND = { ...ON, capture: { ...ON.capture, autoSend: "3s" } };
  const capsule = async (l: Launched) => (await hook<{ capsule: { kind: string; held?: boolean; canUndo?: boolean } | null }>(l, "state")).capsule;
  const startSend = async (l: Launched) => {
    await open(l);
    await hook(l, "start");
    await until(async () => (await phase(l)) === "recording");
    await hook(l, "stop");
    await until(async () => (await capsule(l))?.kind === "countdown");
  };

  it("counts down, sends, and Undo takes the capture back before Voice chat read it", async () => {
    const l = await start({ config: SEND });
    await startSend(l);
    await until(async () => (await capsule(l))?.kind === "sent", 10_000);
    expect(await capsule(l)).toMatchObject({ kind: "sent", canUndo: true });
    await hook(l, "capsule", "undo");
    expect((await capsule(l))?.kind).toBe("undone");
    expect(await hook(l, "readSent")).toEqual({ ok: false, code: "no-capture" });
  });

  it("Hold stops the countdown, Send now sends it, and a read capture cannot be undone", async () => {
    const l = await start({ config: SEND });
    await startSend(l);
    await hook(l, "capsule", "hold");
    expect(await capsule(l)).toMatchObject({ kind: "countdown", held: true });
    await new Promise((r) => setTimeout(r, 3500));
    expect(await capsule(l)).toMatchObject({ kind: "countdown", held: true });
    await hook(l, "capsule", "send-now");
    await until(async () => (await capsule(l))?.kind === "sent");
    const read = await hook<{ ok: boolean; look?: { scope: string; image: string } }>(l, "readSent");
    expect(read.ok).toBe(true);
    expect(read.look?.scope).toBe("capture");
    expect(read.look?.image.length).toBeGreaterThan(0);
    await until(async () => (await capsule(l))?.canUndo === false);
    await hook(l, "capsule", "undo");
    expect((await capsule(l))?.kind).toBe("sent");
    expect((await hook<{ items: { chips: string[] }[] }>(l, "state")).items[0]!.chips).toContain("sent");
  });

  it("Undo inside the countdown sends nothing", async () => {
    const l = await start({ config: SEND });
    await startSend(l);
    await hook(l, "capsule", "undo");
    await new Promise((r) => setTimeout(r, 3500));
    expect((await capsule(l))?.kind).toBe("undone");
    expect(await hook(l, "readSent")).toEqual({ ok: false, code: "no-capture" });
  });
});

describe("screen recording key", () => {
  const REC = { ...ON, capture: { ...ON.capture, experiments: { recording: true } } };

  it("starts a recording without narration and the next press stops and saves it", async () => {
    const l = await start({ config: REC });
    await open(l);
    await hook(l, "record");
    await until(async () => (await phase(l)) === "recording");
    expect(await hook(l, "narrationFlags")).toEqual([false]);
    await hook(l, "record");
    await until(async () => (await phase(l)) === "idle" && (await hook<{ items: unknown[] }>(l, "state")).items.length > 0);
    // the next capture with the capture key narrates again
    await record(l);
    expect(await hook(l, "narrationFlags")).toEqual([false, true]);
  });

  it("does nothing while the experiment is off", async () => {
    const l = await start({ config: ON });
    await open(l);
    await hook(l, "record");
    expect(await phase(l)).toBe("idle");
  });
});

describe("input log", () => {
  const withPen = async (l: Launched) => {
    await open(l);
    await hook(l, "start");
    await until(async () => (await phase(l)) === "recording");
    await hook(l, "capsule", "pen");
    await hook(l, "capsule", "pen");
    await hook(l, "stop");
    await until(async () => (await phase(l)) === "idle" && (await hook<{ items: unknown[] }>(l, "state")).items.length > 0);
    return (await hook<{ items: { dir: string }[] }>(l, "state")).items[0]!.dir;
  };

  it("keeps the pen events with their times next to the capture, and nothing else", async () => {
    const l = await start({ config: ON });
    const dir = await withPen(l);
    const events = JSON.parse(readFileSync(path.join(l.userData, "captures", dir, "events.json"), "utf8")) as { atMs: number; kind: string }[];
    expect(events.map((e) => e.kind)).toEqual(["pen-on", "pen-off"]);
    expect(events.every((e) => Object.keys(e).sort().join() === "atMs,kind" && e.atMs >= 0)).toBe(true);
  });

  it("writes no file when the input log is off", async () => {
    const l = await start({ config: { ...ON, capture: { ...ON.capture, inputLog: "off" } } });
    const dir = await withPen(l);
    expect(existsSync(path.join(l.userData, "captures", dir, "events.json"))).toBe(false);
  });
});

describe.runIf(process.platform === "win32")("own windows and real screen capture", () => {
  it("the app window is absent from a real capture of the screen while recording, and present again after", async () => {
    const l = await start({ config: ON });
    await l.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]!;
      w.setBounds({ x: 80, y: 80, width: 640, height: 480 });
      w.setAlwaysOnTop(true, "screen-saver");
      w.show();
      w.focus();
    });
    await l.page.evaluate(() => {
      const d = document.createElement("div");
      d.style.cssText = "position:fixed;inset:0;background:#00ff00;z-index:2147483647";
      document.body.append(d);
    });
    await new Promise((r) => setTimeout(r, 1200));
    // the share of the middle of the window in the real capture that is the vivid green of the page
    const greenShare = () =>
      l.app.evaluate(async ({ BrowserWindow, desktopCapturer, screen }) => {
        const b = BrowserWindow.getAllWindows()[0]!.getBounds();
        const d = screen.getDisplayMatching(b);
        const sf = d.scaleFactor;
        const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: Math.round(d.size.width * sf), height: Math.round(d.size.height * sf) } });
        const src = sources.find((s) => s.display_id === String(d.id)) ?? sources[0]!;
        const img = src.thumbnail;
        const { width } = img.getSize();
        const bmp = img.toBitmap();
        let green = 0;
        let total = 0;
        const x0 = Math.round((b.x - d.bounds.x + b.width / 2 - 100) * sf);
        const y0 = Math.round((b.y - d.bounds.y + b.height / 2 - 100) * sf);
        for (let y = y0; y < y0 + 200; y += 4)
          for (let x = x0; x < x0 + 200; x += 4) {
            const i = (y * width + x) * 4;
            total++;
            if (bmp[i + 1]! > 200 && bmp[i]! < 60 && bmp[i + 2]! < 60) green++;
          }
        return green / total;
      });
    // the real screen takes a moment to show a change: wait for it
    const seen: string[] = [];
    const untilShare = (step: string, ok: (n: number) => boolean) =>
      until(async () => {
        const n = await greenShare();
        seen.push(`${step}:${n.toFixed(2)}`);
        return ok(n);
      }, 8000).catch((e: unknown) => {
        throw new Error(`${String(e)} ${seen.slice(-6).join(" ")}`);
      });
    await untilShare("visible", (n) => n > 0.9);
    await hook(l, "hideOwnWindows", true);
    await untilShare("hidden", (n) => n < 0.05);
    await hook(l, "hideOwnWindows", false);
    await untilShare("visible again", (n) => n > 0.9);
  });
});
