import { afterEach, describe, expect, it } from "vite-plus/test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { launch, removeDir, type Launched } from "./harness";

const running: Launched[] = [];
const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
  await Promise.all(tmpDirs.splice(0).map(removeDir));
});
const tmp = (what: string) => {
  const d = mkdtempSync(path.join(tmpdir(), `speakkit-${what}-`));
  tmpDirs.push(d);
  return d;
};

/** 16 kHz mono 16-bit tone, as a WAVE file. */
function wav(file: string, seconds: number, rate = 16_000): string {
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 9000), 44 + i * 2);
  writeFileSync(file, buf);
  return file;
}

const DONE = { setupDone: true, setupSkipped: false, preferredPort: 0 };
const ZOOM = { micUsers: [{ pid: 10, exe: "zoom" }], windows: [{ pid: 10, exe: "zoom", title: "Zoom Meeting" }] };

/** Calls a function of the main process's test hook, by dotted path (for example "meetings.poll"). */
const hook = <T>(l: Launched, fn: string, ...a: unknown[]) =>
  l.app.evaluate(
    (_, [name, args]) => {
      type Fn = (...x: unknown[]) => unknown;
      let o = (globalThis as unknown as { __speakkit: Record<string, unknown> }).__speakkit;
      const parts = (name as string).split(".");
      for (const k of parts.slice(0, -1)) o = o[k] as Record<string, unknown>;
      return (o[parts.at(-1)!] as Fn)(...(args as unknown[])) as T;
    },
    [fn, a] as const,
  );

const until = async (f: () => Promise<boolean>, ms = 20_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timed out");
};

const shot = async (l: Launched, name: string) => {
  if (process.env.SHOTS) await l.page.screenshot({ path: path.join(process.env.SHOTS, `meetings-${name}.png`) });
};

async function start(o: { config?: object; env?: Record<string, string> } = {}) {
  const l = await launch({ config: { ...DONE, ...o.config }, env: { SPEAKKIT_TEST: "1", ...o.env } });
  running.push(l);
  await l.page.getByRole("heading", { name: "Home" }).waitFor();
  return l;
}

const openSettings = async (l: Launched, page = "Meetings") => {
  const nav = l.page.getByRole("navigation", { name: "Settings" });
  if (!(await nav.isVisible())) await l.page.getByRole("link", { name: "Settings" }).click();
  await nav.getByRole("link", { name: page, exact: true }).click();
  await l.page.getByRole("heading", { name: page, level: 1 }).waitFor();
};
const openMeetingsTab = async (l: Launched) => {
  await l.page.getByRole("link", { name: "History" }).click();
  await l.page.getByRole("radio", { name: "Meetings" }).click();
  await l.page.getByRole("textbox", { name: "Search titles, summaries and what was said" }).waitFor();
};
const capsule = (l: Launched) => hook<{ kind: string; app?: string; secondsLeft?: number | null } | null>(l, "meetings.capsule");

describe("Settings, Meetings", () => {
  it("shows the calls, the Parked calendar and a policy per app; a policy change and an added app are saved", async () => {
    const l = await start();
    await openSettings(l);
    await l.page.getByRole("switch", { name: "Offer to record calls" }).waitFor();
    await l.page.getByText("Connect a calendar").waitFor();
    await l.page.getByText("Parked").first().waitFor();
    for (const app of ["Microsoft Teams", "Zoom", "Google Meet", "Slack huddles", "Discord"]) await l.page.getByRole("combobox", { name: `What to do for ${app}` }).waitFor();
    await shot(l, "settings");
    // A policy.
    await l.page.getByRole("combobox", { name: "What to do for Zoom" }).click();
    await l.page.getByRole("option", { name: "Always record" }).click();
    await until(async () => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8")).meetings?.policies?.zoom === "always");
    // Add an app: a short link is refused and the button waits.
    await l.page.getByRole("button", { name: "Add app", exact: true }).click();
    const dialog = l.page.getByRole("dialog", { name: "Add an app for calls" });
    await dialog.getByRole("textbox", { name: "App name" }).fill("Whereby");
    await dialog.getByRole("textbox", { name: "Meeting link" }).fill("https://meet.example.com/a");
    await dialog.getByText("too short to name one meeting").waitFor();
    expect(await dialog.getByRole("button", { name: "Add app" }).isDisabled()).toBe(true);
    await shot(l, "add-app");
    await dialog.getByRole("textbox", { name: "Meeting link" }).fill("https://meet.example.com/my-room-name");
    await dialog.getByRole("button", { name: "Add app" }).click();
    await dialog.waitFor({ state: "detached" });
    await l.page.getByRole("combobox", { name: "What to do for Whereby" }).waitFor();
    await until(async () => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8")).meetings?.apps?.[0]?.name === "Whereby");
  });

  it("turning the offer off dims the other rows and hides the Meetings tab", async () => {
    const l = await start();
    await l.page.getByRole("link", { name: "History" }).click();
    await l.page.getByRole("radio", { name: "Meetings" }).waitFor();
    await openSettings(l);
    await l.page.getByRole("switch", { name: "Offer to record calls" }).click();
    await l.page.getByText("Meetings are off").waitFor();
    expect(await l.page.getByRole("switch", { name: "Stop when the call ends" }).isDisabled()).toBe(true);
    await shot(l, "off");
    await l.page.keyboard.press("Escape");
    await l.page.getByRole("link", { name: "History" }).click();
    await l.page.getByRole("radio", { name: "Transcripts" }).waitFor();
    expect(await l.page.getByRole("radio", { name: "Meetings" }).count()).toBe(0);
  });

  it("the Call recording card says what this computer can and cannot do", async () => {
    const l = await start();
    await openSettings(l, "Voice and playback");
    await l.page.getByText("Call sound comes from").waitFor();
    await l.page.getByText("Your microphone", { exact: true }).waitFor();
    await l.page.getByText(/records everything it plays/).waitFor();
    await shot(l, "call-recording");
  });
});

describe("a call, from the offer to the transcript", () => {
  it("offers, records both sides from the offer, stops, and lists the meeting with its words", async () => {
    const dir = tmp("mic");
    const l = await start({ env: { SPEAKKIT_FAKE_MIC: wav(path.join(dir, "mic.wav"), 30) } });
    await hook(l, "dictation.say", "we agreed to ship on Friday");
    await openMeetingsTab(l);
    await l.page.getByText("No meetings yet").waitFor();
    await shot(l, "empty");
    await hook(l, "meetings.probe", ZOOM);
    await hook(l, "meetings.poll");
    expect(await capsule(l)).toMatchObject({ kind: "offer", app: "Zoom" });
    // No answer for a long while: the offer stays.
    await hook(l, "meetings.poll");
    expect(await capsule(l)).toMatchObject({ kind: "offer" });
    // The capsule is its own window: its pill is what the person answers.
    let pill: import("@playwright/test").Page | undefined;
    await until(async () => ((pill = l.app.windows().find((w) => w.url().includes("meeting-capsule"))), !!pill));
    await pill!.getByRole("group", { name: "Record this call?" }).waitFor();
    await pill!.getByText("Zoom call started").waitFor();
    if (process.env.SHOTS) await pill!.screenshot({ path: path.join(process.env.SHOTS, "meetings-capsule-offer.png") });
    await pill!.getByRole("button", { name: "Not now" }).click();
    await pill!.getByRole("menuitem", { name: "Not for this call" }).waitFor();
    if (process.env.SHOTS) await pill!.screenshot({ path: path.join(process.env.SHOTS, "meetings-capsule-menu.png") });
    await pill!.getByRole("button", { name: "Not now" }).click();
    await pill!.getByRole("button", { name: "Record", exact: true }).click();
    await until(async () => (await hook<string>(l, "meetings.phase")) === "recording");
    await pill!.getByRole("group", { name: "Recording a meeting" }).waitFor();
    if (process.env.SHOTS) await pill!.screenshot({ path: path.join(process.env.SHOTS, "meetings-capsule-recording.png") });
    await l.page.locator('[data-testid="meeting-row"][data-status="recording"]').waitFor();
    await l.page.getByRole("timer").first().waitFor();
    await shot(l, "recording");
    // The call ends: the prompt counts down and the person keeps recording.
    await hook(l, "meetings.probe", { micUsers: [], windows: [] });
    await new Promise((r) => setTimeout(r, 7000));
    await hook(l, "meetings.poll");
    await until(async () => (await capsule(l))?.kind === "ending");
    await pill!.getByRole("group", { name: "The call ended" }).waitFor();
    if (process.env.SHOTS) await pill!.screenshot({ path: path.join(process.env.SHOTS, "meetings-capsule-ending.png") });
    await pill!.getByRole("button", { name: "Keep recording", exact: true }).click();
    await until(async () => (await capsule(l))?.kind === "recording");
    await new Promise((r) => setTimeout(r, 1500));
    await pill!.getByRole("button", { name: "Stop and save" }).click();
    await l.page.locator('[data-testid="meeting-row"][data-status="done"]').waitFor({ timeout: 40_000 });
    const row = l.page.locator('[data-testid="meeting-row"]').first();
    await row.getByText(/Zoom/).first().waitFor();
    await row.getByText(/Audio removed in/).waitFor();
    await shot(l, "list");
    // Search finds it by what was said, then open it: You is labelled.
    await l.page.getByRole("textbox", { name: "Search titles, summaries and what was said" }).fill("friday");
    await row.getByText("friday", { exact: false }).first().waitFor();
    await row.getByRole("button", { name: /^Open:/ }).click();
    await l.page.getByTestId("meeting-view").waitFor();
    await l.page.getByText("we agreed to ship on Friday").first().waitFor();
    await shot(l, "view-early");
    await l.page.locator(".mt-line__who").first().waitFor();
    await shot(l, "view");
  });

  it("a recording that cannot open the microphone says why and leaves no meeting", async () => {
    const l = await start();
    await hook(l, "meetings.denyMic", true);
    await openMeetingsTab(l);
    await hook(l, "meetings.probe", ZOOM);
    await hook(l, "meetings.poll");
    const offer = (await capsule(l)) as unknown as { sessionId: string };
    await hook(l, "meetings.act", { type: "record", sessionId: offer.sessionId });
    await new Promise((r) => setTimeout(r, 1500));
    expect(await hook<string>(l, "meetings.phase")).toBe("ready");
    await l.page.getByText("No meetings yet").waitFor();
  });
});
