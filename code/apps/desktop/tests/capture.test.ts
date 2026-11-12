import { afterEach, describe, expect, it } from "vite-plus/test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

describe("editing and trimming a recording", () => {
  const seed = () => {
    const userData = mkdtempSync(path.join(tmpdir(), "speakkit-capture-"));
    dirs.push(userData);
    const dir = path.join(userData, "captures", "r1");
    mkdirSync(path.join(dir, "frames"), { recursive: true });
    const png = makePng(320, 200);
    const frames = [0, 2000, 4000].map((ms) => path.join("frames", `f-${String(ms).padStart(8, "0")}.jpg`));
    for (const f of frames) writeFileSync(path.join(dir, f), png);
    writeFileSync(path.join(dir, "video.webm"), "video");
    writeFileSync(path.join(dir, "sheet.jpg"), png);
    const words = [
      { text: "before", startMs: 100, endMs: 300 },
      { text: "kept", startMs: 2500, endMs: 2700 },
    ];
    const record = {
      id: "r1",
      kind: "recording",
      title: "Pricing page",
      at: Date.now(),
      dir: "r1",
      durationMs: 6000,
      bytes: png.length,
      media: "video.webm",
      frames,
      sheet: "sheet.jpg",
      words,
      chips: ["saved"],
    };
    writeFileSync(path.join(userData, "captures", "index.json"), JSON.stringify([record]));
    return { userData, dir };
  };
  const index = (userData: string) => JSON.parse(readFileSync(path.join(userData, "captures", "index.json"), "utf8"))[0];
  const openDetail = async (l: Launched) => {
    await open(l);
    await l.page.getByRole("button", { name: /^Open Pricing page/ }).click();
    await l.page.getByTestId("capture-detail").waitFor();
  };

  it("editing a frame saves a copy and builds the contact sheet again", async () => {
    const { userData, dir } = seed();
    const l = await start({ config: ON, userData });
    await openDetail(l);
    await l.page.getByText(/nothing in the video file/).waitFor();
    await l.page.getByRole("button", { name: "Edit picture at 0:02" }).click();
    await l.page.getByRole("dialog", { name: "Edit picture" }).waitFor();
    await l.page.getByRole("button", { name: "Rectangle" }).click();
    const box = (await l.page.getByLabel(/^Picture, 320 by 200/).boundingBox())!;
    await l.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await l.page.mouse.down();
    await l.page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 4 });
    await l.page.mouse.up();
    await l.page.getByRole("button", { name: "Save a copy" }).click();
    await l.page.getByRole("dialog", { name: "Edit picture" }).waitFor({ state: "detached" });
    await l.page.getByText("0:02 (edited)").waitFor();
    expect(existsSync(path.join(dir, "edit-f-00002000.png"))).toBe(true);
    expect(Object.values(index(userData).edits)).toEqual(["edit-f-00002000.png"]);
    // the scripted recorder builds a different sheet than the one that was seeded
    expect(readFileSync(path.join(dir, "sheet.jpg")).equals(makePng(320, 200))).toBe(false);
  });

  it("trims the video, keeps the original, and reduces the frames and words to what is kept", async () => {
    const { userData, dir } = seed();
    const l = await start({ config: ON, userData });
    await openDetail(l);
    await l.page.getByRole("button", { name: "Trim video" }).click();
    await l.page.getByRole("region", { name: "Trim video" }).waitFor();
    const start1 = l.page.getByRole("slider", { name: "Start" });
    await start1.focus();
    for (let i = 0; i < 3; i++) await l.page.keyboard.press("ArrowRight");
    await l.page.getByText("Start 0:02").waitFor();
    await l.page.getByRole("button", { name: "Save trimmed video" }).click();
    await l.page.getByRole("region", { name: "Trim video" }).waitFor({ state: "detached" });
    await until(async () => index(userData).media === "video-trim.webm");
    expect(index(userData)).toMatchObject({ trim: { startMs: 1500, endMs: 6000 }, frames: [path.join("frames", "f-00002000.jpg"), path.join("frames", "f-00004000.jpg")], words: [{ text: "kept" }] });
    expect(readFileSync(path.join(dir, "video.webm"), "utf8")).toBe("video");
    expect(existsSync(path.join(dir, "video-trim.webm"))).toBe(true);
  });

  it("Cancel leaves the video alone", async () => {
    const { userData } = seed();
    const l = await start({ config: ON, userData });
    await openDetail(l);
    await l.page.getByRole("button", { name: "Trim video" }).click();
    await l.page.getByRole("button", { name: "Cancel" }).click();
    await l.page.getByRole("region", { name: "Trim video" }).waitFor({ state: "detached" });
    expect(index(userData).media).toBe("video.webm");
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

describe("own windows and real screen capture", () => {
  it("the app window is absent from a real capture of the screen while recording, and present again after", async (t) => {
    // macOS lets the app read the screen only after the person allowed it in System Settings: no such answer exists in a test run
    if (process.platform !== "win32") t.skip();
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

describe("zooming a recording", () => {
  const ZOOM = { ...ON, capture: { ...ON.capture, experiments: { zoomExport: true } } };
  const seed = () => {
    const userData = mkdtempSync(path.join(tmpdir(), "speakkit-capture-"));
    dirs.push(userData);
    const dir = path.join(userData, "captures", "z1");
    mkdirSync(path.join(dir, "frames"), { recursive: true });
    const png = makePng(320, 200);
    const frames = [0, 2000, 4000].map((ms) => path.join("frames", `f-${String(ms).padStart(8, "0")}.jpg`));
    for (const f of frames) writeFileSync(path.join(dir, f), png);
    writeFileSync(path.join(dir, "video.webm"), "video");
    writeFileSync(path.join(dir, "sheet.jpg"), png);
    const rest = Array.from({ length: 6 }, (_, i) => ({ atMs: 3000 + i * 200, x: 0.5, y: 0.5 }));
    writeFileSync(path.join(dir, "pointer.json"), JSON.stringify(rest));
    const record = {
      id: "z1",
      kind: "recording",
      title: "Checkout flow",
      at: Date.now(),
      dir: "z1",
      durationMs: 6000,
      bytes: png.length,
      media: "video.webm",
      frames,
      sheet: "sheet.jpg",
      chips: ["saved"],
    };
    writeFileSync(path.join(userData, "captures", "index.json"), JSON.stringify([record]));
    return { userData, dir };
  };
  const index = (userData: string) => JSON.parse(readFileSync(path.join(userData, "captures", "index.json"), "utf8"))[0];
  const openDetail = async (l: Launched) => {
    await open(l);
    await l.page.getByRole("button", { name: /^Open Checkout flow/ }).click();
    await l.page.getByTestId("capture-detail").waitFor();
  };

  it("offers the zoom only while the experiment is on", async () => {
    const { userData } = seed();
    const l = await start({ config: ON, userData });
    await openDetail(l);
    await l.page.getByRole("button", { name: "Trim video" }).waitFor();
    expect(await l.page.getByRole("button", { name: "Zoom video" }).count()).toBe(0);
  });

  it("adds a zoom by hand, saves the zoomed video next to the original and shows its contact sheet", async () => {
    const { userData, dir } = seed();
    const l = await start({ config: ZOOM, userData });
    await openDetail(l);
    await l.page.getByRole("button", { name: "Zoom video" }).click();
    const panel = l.page.getByRole("region", { name: "Zoom video" });
    await panel.waitFor();
    await panel.getByText(/No zoom yet/).waitFor();
    const end = panel.getByRole("slider", { name: "Zoom end" });
    await end.focus();
    await l.page.keyboard.press("ArrowRight");
    await panel.getByRole("button", { name: "Add zoom" }).click();
    await panel.getByRole("list", { name: "Zooms" }).waitFor();
    await panel.getByRole("button", { name: "Save zoomed video" }).click();
    await panel.waitFor({ state: "detached" });
    await until(async () => index(userData).media === "video-zoom.webm");
    expect(index(userData)).toMatchObject({ zoom: [{ startMs: 0, endMs: 4500, x: 0.5, y: 0.5, scale: 2 }], zoomSheet: "sheet-zoom.jpg" });
    expect(readFileSync(path.join(dir, "video.webm"), "utf8")).toBe("video");
    expect(existsSync(path.join(dir, "video-zoom.webm"))).toBe(true);
    expect(existsSync(path.join(dir, "sheet-zoom.jpg"))).toBe(true);
    await l.page.getByRole("button", { name: "Zoom video" }).click();
    await l.page.getByRole("img", { name: "Contact sheet of the zoomed parts" }).waitFor();
  });

  it("suggests a zoom where the pointer rested, and Remove zoom puts the video back", async () => {
    const { userData } = seed();
    const l = await start({ config: ZOOM, userData });
    await openDetail(l);
    await l.page.getByRole("button", { name: "Zoom video" }).click();
    const panel = l.page.getByRole("region", { name: "Zoom video" });
    await panel.getByRole("button", { name: "Suggest zooms" }).click();
    await panel.getByText("0:03 to 0:05, 2x at 50% across, 50% down").waitFor();
    await panel.getByRole("button", { name: "Save zoomed video" }).click();
    await until(async () => index(userData).media === "video-zoom.webm");
    expect(index(userData).zoom).toEqual([{ startMs: 3000, endMs: 4800, x: 0.5, y: 0.5, scale: 2 }]);
    await l.page.getByRole("button", { name: "Zoom video" }).click();
    await l.page.getByRole("button", { name: "Remove the zoom at 0:03" }).click();
    await l.page.getByRole("button", { name: "Remove zoom" }).click();
    await until(async () => index(userData).media === "video.webm");
    expect(index(userData)).toMatchObject({ zoom: [], zoomSheet: "" });
  });

  it("says so when there is nothing to suggest, and Cancel leaves the video alone", async () => {
    const { userData, dir } = seed();
    rmSync(path.join(dir, "pointer.json"));
    const l = await start({ config: ZOOM, userData });
    await openDetail(l);
    await l.page.getByRole("button", { name: "Zoom video" }).click();
    const panel = l.page.getByRole("region", { name: "Zoom video" });
    await panel.getByRole("button", { name: "Suggest zooms" }).click();
    await panel.getByText("No zoom to suggest").waitFor();
    await panel.getByRole("button", { name: "Cancel" }).click();
    await panel.waitFor({ state: "detached" });
    expect(index(userData).media).toBe("video.webm");
  });
});

describe("page context in a capture", () => {
  const PAGE = { ...ON, capture: { ...ON.capture, experiments: { pageContext: true } } };
  const post = (l: Launched, events: unknown[], origin?: string) =>
    fetch(`http://127.0.0.1:${l.port}/v1/capture/page-context`, {
      method: "POST",
      headers: { authorization: `Bearer ${readFileSync(path.join(l.userData, "token"), "utf8").trim()}`, "content-type": "application/json", ...(origin && { origin }) },
      body: JSON.stringify({ page: { url: "http://localhost:3000/orders?token=x", title: "Orders" }, events }),
    });
  const recorded = async (l: Launched) => {
    await hook(l, "start");
    await until(async () => (await phase(l)) === "recording");
    await post(l, [
      { type: "click", at: Date.now(), element: { tag: "button", label: "Pay now" } },
      { type: "console-error", at: Date.now(), message: "Cannot read total" },
      { type: "failed-request", at: Date.now(), method: "POST", url: "/api/pay?card=1", status: 500 },
    ]);
    await hook(l, "stop");
    await until(async () => (await phase(l)) === "idle" && (await hook<{ items: unknown[] }>(l, "state")).items.length > 0);
    return JSON.parse(readFileSync(path.join(l.userData, "captures", "index.json"), "utf8"))[0] as { context?: string };
  };

  it("keeps what a development page reported during the recording, without queries or typed text", async () => {
    const l = await start({ config: PAGE });
    await open(l);
    const r = await recorded(l);
    expect(r.context).toContain("Page events from http://localhost:3000/orders\n");
    expect(r.context).toContain('click button "Pay now"');
    expect(r.context).toContain("console error: Cannot read total");
    expect(r.context).toContain("request failed: POST /api/pay 500");
    expect(r.context).not.toContain("token=");
    expect(r.context).not.toContain("card=1");
  });

  it("lets a page on this computer post with the token from the browser, and refuses other pages", async () => {
    const l = await start({ config: PAGE });
    expect((await post(l, [], "http://localhost:3000")).status).toBe(202);
    expect((await post(l, [], "https://example.com")).status).toBe(403);
  });

  it("keeps nothing while the experiment is off", async () => {
    const l = await start({ config: ON });
    await open(l);
    expect((await recorded(l)).context).toBeUndefined();
  });
});

describe("speech engine for narration", () => {
  const ENGINES = { ...ON, capture: { ...ON.capture, experiments: { speechEngines: true } } };

  it("offers the live engine and the Windows recognizer, and keeps the choice", async () => {
    const l = await start({ config: ENGINES });
    await l.page.getByRole("link", { name: "Capture" }).click();
    await l.page.getByRole("tab", { name: "Settings" }).click();
    await l.page.getByRole("combobox", { name: "Speech engine" }).click();
    const options = await l.page.getByRole("option").allTextContents();
    expect(options).toEqual(process.platform === "win32" ? ["Dictation model", "Dictation model, live", "Windows speech", "Command"] : ["Dictation model", "Dictation model, live", "Command"]);
    await l.page.getByRole("option", { name: "Dictation model, live" }).click();
    await until(async () => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8")).capture?.narrationEngine === "live");
  });

  it("makes a capture with the live engine on (the scripted microphone is silent, so no words)", async () => {
    const l = await start({ config: { ...ENGINES, capture: { ...ENGINES.capture, narrationEngine: "live" } } });
    await open(l);
    await record(l);
    expect((await hook<{ items: unknown[] }>(l, "state")).items).toHaveLength(1);
  });
});

describe("replay buffer", () => {
  const REPLAY_ON = { ...ON, capture: { ...ON.capture, replayBuffer: true, replayConsented: true, experiments: { replay: true } } };
  const kind = async (l: Launched) => (await hook<{ capsule: { kind: string } | null }>(l, "state")).capsule?.kind ?? null;
  const items = async (l: Launched) => (await hook<{ items: { title: string }[] }>(l, "state")).items;
  const configOf = (l: Launched) => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8")).capture;

  it("shows its pill while it keeps the screen, and saves the last 15 seconds as a capture with its pieces", async () => {
    const l = await start({ config: REPLAY_ON });
    await open(l);
    await until(async () => (await kind(l)) === "replay");
    expect(await hook(l, "commands")).toContain("replay-start");
    await hook(l, "capsule", "replay-save");
    await until(async () => (await items(l)).length === 1);
    const [item] = await items(l);
    expect(item!.title).toMatch(/^Replay · /);
    const dir = path.join(l.userData, "captures", JSON.parse(readFileSync(path.join(l.userData, "captures", "index.json"), "utf8"))[0].dir);
    expect(readdirSync(dir).filter((f) => f.startsWith("video"))).toEqual(["video-2.webm", "video.webm"]);
    expect(existsSync(path.join(dir, "sheet.jpg"))).toBe(true);
    await until(async () => (await kind(l)) === "saved");
    expect(await hook(l, "commands")).toContain("replay-save");
  });

  it("turns off from the pill, remembers it, and stops the recorder", async () => {
    const l = await start({ config: REPLAY_ON });
    await until(async () => (await kind(l)) === "replay");
    await hook(l, "capsule", "replay-off");
    await until(async () => (await kind(l)) === null);
    await until(async () => configOf(l).replayBuffer === false);
    expect(await hook(l, "commands")).toContain("replay-stop");
  });

  it("gives way to a capture and starts again when it is saved", async () => {
    const l = await start({ config: REPLAY_ON });
    await open(l);
    await until(async () => (await kind(l)) === "replay");
    await record(l);
    await hook(l, "capsule", "dismiss");
    await until(async () => (await kind(l)) === "replay");
    const commands = (await hook<string[]>(l, "commands")).filter((c) => c.startsWith("replay") || c === "start");
    expect(commands).toEqual(["replay-start", "replay-stop", "start", "replay-start"]);
  });

  it("does not start without the experiment, the choice or the consent", async () => {
    for (const capture of [
      { ...REPLAY_ON.capture, experiments: { replay: false } },
      { ...REPLAY_ON.capture, replayBuffer: false },
      { ...REPLAY_ON.capture, replayConsented: false },
    ]) {
      const l = await start({ config: { ...ON, capture } });
      await open(l);
      await hook(l, "state");
      expect(await kind(l)).not.toBe("replay");
      expect(await hook<string[]>(l, "commands")).not.toContain("replay-start");
    }
  });

  it("asks for consent before the first time, and turns on only after it", async () => {
    const l = await start({ config: { ...ON, capture: { ...ON.capture, experiments: { replay: true } } } });
    await l.page.getByRole("link", { name: "Capture" }).click();
    await l.page.getByRole("tab", { name: "Settings" }).click();
    await l.page.getByRole("switch", { name: "Replay buffer" }).click();
    const dialog = l.page.getByRole("dialog", { name: "Keep the last 15 seconds of your screen?" });
    await dialog.getByText(/including passwords and private windows/).waitFor();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "detached" });
    expect(configOf(l).replayBuffer).not.toBe(true);
    expect(await kind(l)).not.toBe("replay");
    await l.page.getByRole("switch", { name: "Replay buffer" }).click();
    await dialog.getByRole("button", { name: "Turn on replay" }).click();
    await until(async () => configOf(l).replayBuffer === true && configOf(l).replayConsented === true);
    await until(async () => (await kind(l)) === "replay");
    await l.page.getByRole("switch", { name: "Replay buffer" }).click();
    await until(async () => configOf(l).replayBuffer === false);
    await until(async () => (await kind(l)) !== "replay");
  });
});
