import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ClonedVoice } from "@speakkit/protocol";
import { clip } from "../../../packages/engine/tests/clip-fixture";
import { launch, removeDir, type Launched } from "./harness";

const SIDECAR = path.resolve(import.meta.dirname, "../../../packages/engine/tests/fake-sidecar.mjs");
const DONE = { setupDone: true, setupSkipped: false, preferredPort: 0 };

const running: Launched[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
  await Promise.all(dirs.splice(0).map(removeDir));
});

const scratch = () => {
  const d = mkdtempSync(path.join(tmpdir(), "speakkit-clone-"));
  dirs.push(d);
  return d;
};
const wavFile = (seconds: number, extra: Parameters<typeof clip>[2] = {}) => {
  const file = path.join(scratch(), `speech-${seconds}.wav`);
  writeFileSync(file, clip(seconds, 24000, extra));
  return file;
};

/** The app with Chatterbox on a pretend GPU and the stand-in sidecar; `installed` puts the marker file the installer would leave. */
async function start(o: { installed?: boolean; fakeMic?: string } = {}) {
  const userData = scratch();
  if (o.installed ?? true) {
    mkdirSync(path.join(userData, "engines", "chatterbox"), { recursive: true });
    writeFileSync(path.join(userData, "engines", "chatterbox", "installed"), "x");
  }
  // Chromium's fake media device, set by the test and never by the app: the microphone is a speech clip played in a loop. The fake permission
  // prompt (--use-fake-ui-for-media-stream) is left off on purpose: with it Electron grants every request without asking the app's permission
  // handler, which is the code under test.
  const args = o.fakeMic ? ["--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${o.fakeMic}`] : [];
  const l = await launch({ userData, config: DONE, args, env: { SPEAKKIT_TEST: "1", SPEAKKIT_FAKE_CHATTERBOX: `${process.execPath}|${SIDECAR}` } });
  running.push(l);
  await l.page.getByRole("heading", { name: "Home" }).waitFor();
  await l.page.getByRole("link", { name: "Voices" }).click();
  await l.page.getByRole("heading", { name: "Voices", level: 1 }).waitFor();
  return l;
}

const clonedVoices = async (l: Launched): Promise<ClonedVoice[]> => {
  const token = readFileSync(path.join(l.userData, "token"), "utf8").trim();
  const r = await fetch(`http://127.0.0.1:${l.port}/v1/voices/cloned`, { headers: { Authorization: `Bearer ${token}` } });
  return ((await r.json()) as { voices: ClonedVoice[] }).voices;
};

/** Makes the file dialog answer with this file, as a person choosing it would. */
const chooseFile = (l: Launched, file: string) =>
  l.app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as typeof dialog.showOpenDialog;
  }, file);

const consentAndContinue = async (l: Launched, source: "Upload a clip" | "Record now") => {
  await l.page.getByRole("button", { name: "Clone a voice" }).click();
  await l.page.getByRole("heading", { name: "Clone a voice", level: 1 }).waitFor();
  await l.page.getByRole("radio", { name: new RegExp(`^${source}`) }).click();
  await l.page.getByText(/the right to clone it/).click();
  await l.page.getByRole("checkbox", { name: /the right to clone it/ }).waitFor();
  expect(await l.page.getByRole("checkbox", { name: /the right to clone it/ }).isChecked()).toBe(true);
  await l.page.getByRole("button", { name: "Continue" }).click();
};

describe("voice cloning flow", () => {
  it("records a take from the fake microphone, names and tests the voice, saves it, previews it and deletes it", async () => {
    const l = await start({ fakeMic: wavFile(8) });
    await consentAndContinue(l, "Record now");
    await l.page.getByText("Keep recording until at least 0:05.").waitFor();
    await l.page.getByText("Press Stop when you are done.").waitFor();
    await l.page.getByRole("button", { name: "Stop" }).click();

    await l.page.getByRole("button", { name: "Play take" }).waitFor();
    await l.page.getByText(/^Length: passed/).waitFor();
    await l.page.getByRole("button", { name: "Use this take" }).click();

    await l.page.getByRole("heading", { name: "Clone a voice", level: 1 }).waitFor();
    await l.page.getByLabel("Name").waitFor({ timeout: 30_000 }); // checks, then Chatterbox loads
    await l.page.getByLabel("Name").fill("Maya");
    await l.page.getByText("Hello, I am Maya. This is how I sound when reading to you.").waitFor();
    await l.page.getByRole("button", { name: "Play test" }).click();
    await l.page.getByRole("button", { name: "Play test" }).waitFor({ timeout: 15_000 }); // the sentence played to its end
    await l.page.getByRole("button", { name: "Save voice" }).click();
    await l.page.getByText("Maya is saved").waitFor();

    const [voice] = await clonedVoices(l);
    expect(voice).toMatchObject({ name: "Maya", exaggeration: 0.5 });
    expect(voice!.durationMs).toBeGreaterThan(5000);

    await l.page.getByRole("button", { name: "Done" }).click();
    await l.page.getByRole("region", { name: "Your voices" }).getByText("Maya", { exact: true }).waitFor();
    await l.page.getByRole("button", { name: "Preview Maya" }).click();
    await l.page.getByRole("button", { name: "Preview Maya" }).waitFor({ timeout: 15_000 });

    await l.page.getByRole("button", { name: "Voice style: Maya" }).click();
    await l.page.getByRole("dialog", { name: "Voice style: Maya" }).getByRole("slider", { name: "Exaggeration" }).press("End");
    await l.page.getByRole("button", { name: "Done" }).click();
    await expect.poll(async () => (await clonedVoices(l))[0]?.exaggeration).toBe(1);

    await l.page.getByRole("button", { name: "Delete Maya" }).click();
    await l.page.getByRole("dialog", { name: "Delete Maya?" }).getByRole("button", { name: "Delete" }).click();
    await expect.poll(() => clonedVoices(l)).toEqual([]);
  });

  it("shows one row per failed check when the server rejects a clip, and keeps nothing", async () => {
    const l = await start();
    await chooseFile(l, wavFile(3));
    await consentAndContinue(l, "Upload a clip");
    await l.page.getByText("This clip cannot be used yet.").waitFor();
    const rows = l.page.getByTestId("clone-checks").getByRole("listitem");
    await rows.first().waitFor();
    expect(await rows.allTextContents()).toEqual([
      "Length: failedClip is 3.0 s; at least 5.0 s is needed.",
      "Sample rate: passed24000 Hz.",
      "Loudness: passedLevel is fine.",
      "Silence: passedEnough speech.",
      "Noise: passedBackground noise is low.",
    ]);
    expect(await l.page.getByRole("button", { name: "Choose another file" }).count()).toBe(1);
    expect(await l.page.getByRole("button", { name: "Record" }).count()).toBe(1);
    expect(await clonedVoices(l)).toEqual([]);
  });

  it("moves focus to the heading of each step and announces a rejected clip and a saved voice in the polite status", async () => {
    const l = await start();
    const focused = () => l.page.evaluate(() => document.activeElement?.textContent ?? "");
    const status = () => l.page.getByTestId("clone-status").textContent();
    await l.page.getByRole("button", { name: "Clone a voice" }).click();
    await expect.poll(focused).toBe("Choose a voice sample");
    expect(await l.page.getByTestId("clone-status").getAttribute("aria-live")).toBe("polite");
    await l.page.keyboard.press("Tab"); // the two sources are one tab stop; the arrow keys move inside it
    expect(await l.page.evaluate(() => document.activeElement?.getAttribute("data-source"))).toBe("upload");
    await l.page.keyboard.press("ArrowRight");
    expect(await l.page.evaluate(() => [document.activeElement?.getAttribute("data-source"), document.activeElement?.getAttribute("aria-checked")])).toEqual(["record", "true"]);
    await l.page.keyboard.press("ArrowLeft");
    expect(await l.page.evaluate(() => [document.activeElement?.getAttribute("data-source"), document.activeElement?.getAttribute("aria-checked")])).toEqual(["upload", "true"]);
    await chooseFile(l, wavFile(3));
    await l.page.getByRole("radio", { name: /^Upload a clip/ }).click();
    await l.page.getByText(/the right to clone it/).click();
    await l.page.getByRole("button", { name: "Continue" }).click();
    await expect.poll(focused).toBe("Clip not accepted");
    expect(await status()).toBe("The clip was not accepted. Failed: length.");

    await chooseFile(l, wavFile(8));
    await l.page.getByRole("button", { name: "Choose another file" }).click();
    await l.page.getByLabel("Name").waitFor({ timeout: 30_000 });
    await expect.poll(focused).toBe("Name your voice");
    await l.page.getByLabel("Name").fill("Maya");
    await l.page.getByRole("button", { name: "Save voice" }).click();
    await expect.poll(focused).toBe("Voice saved");
    expect(await status()).toBe("Voice saved: Maya.");
  });

  it("the exaggeration slider spans the card, from the start of the label to the end of Dramatic", async () => {
    const l = await start();
    await chooseFile(l, wavFile(8));
    await consentAndContinue(l, "Upload a clip");
    await l.page.getByLabel("Name").waitFor({ timeout: 30_000 });
    const widths = await l.page.evaluate(() =>
      [".lm-slider", ".sk-clone-slider__ends"].map((q) => Math.round(document.querySelector(".sk-clone-slider")!.querySelector(q)!.getBoundingClientRect().width)),
    );
    expect(widths[0]).toBe(widths[1]);
  });

  it("uploads a good file, and cancelling the name step deletes the voice again", async () => {
    const l = await start();
    await chooseFile(l, wavFile(8));
    await consentAndContinue(l, "Upload a clip");
    await l.page.getByLabel("Name").waitFor({ timeout: 30_000 });
    expect(await clonedVoices(l)).toHaveLength(1);
    await l.page.getByRole("button", { name: "Cancel" }).click();
    await l.page.getByRole("heading", { name: "Voices", level: 1 }).waitFor();
    await expect.poll(() => clonedVoices(l)).toEqual([]);
  });
});

describe("cloning unavailable and the microphone", () => {
  it("G14: without Chatterbox the button is disabled and the banner links to the Engines page", async () => {
    const l = await start({ installed: false });
    await l.page.getByText("Cloning needs Chatterbox (2.4 GB)").waitFor();
    await l.page.getByText(/^Install it on the Engines page\. Found Test GPU with 12 GB of video memory\.$/).waitFor();
    expect(await l.page.getByRole("button", { name: "Clone a voice" }).isDisabled()).toBe(true);
    await l.page.getByRole("button", { name: "Open Engines" }).click();
    await l.page.getByRole("heading", { name: "Engines", level: 1 }).waitFor();
  });

  it("K6: when the system refuses the microphone the dialog offers settings and an upload, and the settings link is the allowlisted one", async () => {
    const l = await start();
    await l.app.evaluate(({ session, shell }) => {
      session.defaultSession.setPermissionRequestHandler((_c, _p, cb) => cb(false)); // what a blocking OS looks like to the page
      (globalThis as { __opened?: string[] }).__opened = [];
      shell.openExternal = (async (url: string) => void (globalThis as { __opened?: string[] }).__opened!.push(url)) as typeof shell.openExternal;
    });
    await consentAndContinue(l, "Record now");
    const dialog = l.page.getByRole("dialog", { name: "Microphone access is off" });
    await dialog.waitFor();
    expect(await dialog.getByRole("button", { name: "Upload a file" }).count()).toBe(1);
    expect(await dialog.getByText("blocks Speak Kit from using the microphone, which is needed to record a voice sample. You can upload an audio file instead.").count()).toBe(1);
    if (process.platform === "win32") {
      await dialog.getByRole("button", { name: "Open Windows settings" }).click();
      expect(await l.app.evaluate(() => (globalThis as { __opened?: string[] }).__opened)).toEqual(["ms-settings:privacy-microphone"]);
    }
  });

  it("grants the main window audio only: a camera request is refused while the microphone works", async () => {
    const l = await start({ fakeMic: wavFile(8) });
    const outcome = await l.page.evaluate(async () => {
      const ask = (c: MediaStreamConstraints) =>
        navigator.mediaDevices.getUserMedia(c).then(
          (s) => (s.getTracks().forEach((t) => t.stop()), "granted"),
          (e: DOMException) => e.name,
        );
      return { audio: await ask({ audio: true }), video: await ask({ video: true }), both: await ask({ audio: true, video: true }) };
    });
    expect(outcome).toEqual({ audio: "granted", video: "NotAllowedError", both: "NotAllowedError" });
  });
});
