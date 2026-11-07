import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ClonedVoice } from "@speakkit/protocol";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { cloningAvailability } from "./availability";
import { CheckRows } from "./CheckRows";
import { ChooseScreen, CONSENT, micText, MicDialog, RecordingScreen, ReviewScreen } from "./ChooseScreens";
import { CloneButton, CloningUnavailable } from "./Entry";
import { initClone } from "./model";
import { AnalyzingScreen, NamingScreen, RejectedScreen } from "./ResultScreens";

const noop = () => {};
const take = { wav: new Uint8Array(44), durationMs: 14000, label: "maya.mp3" };
const voice: ClonedVoice = { id: "cb_0a1b2c3d", name: "maya", durationMs: 14000, createdAt: 1, checks: [] };
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("G3 choose a reference", () => {
  const choose = (over = {}) =>
    renderToStaticMarkup(
      <ChooseScreen state={{ ...(initClone() as Extract<ReturnType<typeof initClone>, { step: "choose" }>), ...over }} onConsent={noop} onSource={noop} onContinue={noop} onCancel={noop} />,
    );

  it("offers upload and record, the consent sentence and a disabled Continue", () => {
    const html = choose();
    expect(text(html)).toBe(
      "Upload a clip WAV, MP3, M4A or FLAC, up to 30 seconds. Record now Read a few sentences aloud. " +
        "This is my own voice, or I have the right to clone it and the permission of the person speaking. " +
        "Cloned voices speak through Chatterbox. Speak Kit switches to it while you clone and use them. Cancel Continue",
    );
    expect(CONSENT).toContain("the right to clone it");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue<\/button>/);
  });

  it("the sources are one tab stop: the selected one, or the first when none is selected", () => {
    const stops = (html: string) => [...html.matchAll(/data-source="(\w+)"[^>]*tabindex="(-?\d)"/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(stops(choose())).toEqual(["upload:0", "record:-1"]);
    expect(stops(choose({ source: "record" }))).toEqual(["upload:-1", "record:0"]);
  });

  it("enables Continue with consent and a source, and shows a failure to read the file", () => {
    const html = choose({ consent: true, source: "upload", error: "maya.mp3 could not be read as audio." });
    expect(html).not.toMatch(/disabled=""[^>]*>Continue/);
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("maya.mp3 could not be read as audio.");
    expect(html).toContain('aria-checked="true" class="sk-clone-source" data-source="upload"');
  });
});

describe("K6 microphone access", () => {
  const dialog = (problem: "denied" | "missing" | null, platform = "win32") =>
    renderToStaticMarkup(<MicDialog problem={problem} platform={platform} onUpload={noop} onSettings={noop} onClose={noop} />);

  it("is closed without a problem", () => {
    expect(dialog(null)).toBe("");
  });

  it("says Windows blocks the microphone and offers its settings and an upload", () => {
    expect(micText("denied", "win32")).toEqual({
      title: "Microphone access is off",
      body: "Windows blocks Speak Kit from using the microphone, which is needed to record a voice sample. You can upload an audio file instead.",
      settings: "Open Windows settings",
    });
  });

  it("names macOS, and offers no settings page where the OS has none", () => {
    expect(micText("denied", "darwin")).toMatchObject({ body: expect.stringContaining("macOS blocks Speak Kit"), settings: "Open System Settings" });
    expect(micText("denied", "linux")).toMatchObject({ body: expect.stringContaining("Your system blocks Speak Kit"), settings: null });
  });

  it("says when there is no microphone at all", () => {
    expect(micText("missing", "win32")).toEqual({ title: "No microphone found", body: "Speak Kit found no microphone. Connect one and try again, or upload an audio file instead.", settings: null });
  });
});

describe("G4 recording and G15 review", () => {
  it("shows the timer out of 30 seconds, both bars and the minimum-length hint", () => {
    const html = renderToStaticMarkup(<RecordingScreen elapsedMs={3000} level={0.5} onStop={noop} onCancel={noop} />);
    expect(text(html)).toBe("0:03 / 0:30 Stop Keep recording until at least 0:05. Cancel");
    expect(html).toContain('aria-label="Recording length" aria-valuemin="0" aria-valuemax="100" aria-valuenow="10"');
    expect(html).toContain('aria-label="Microphone level"');
  });

  it("says when to stop once the minimum is reached", () => {
    expect(text(renderToStaticMarkup(<RecordingScreen elapsedMs={8000} level={0} onStop={noop} onCancel={noop} />))).toContain("Press Stop when you are done.");
  });

  it("lets a take of 14 seconds be played, recorded again or used", () => {
    const html = renderToStaticMarkup(<ReviewScreen take={take} playing={false} onPlay={noop} onAgain={noop} onUse={noop} />);
    expect(text(html)).toBe("Play take 0:14 Length: passed 14 s, between 5 s and 30 s. Record again Use this take");
    expect(html).not.toMatch(/disabled=""[^>]*>Use this take/);
  });

  it("does not let a take of 3 seconds be used", () => {
    const html = renderToStaticMarkup(<ReviewScreen take={{ ...take, durationMs: 3000 }} playing onPlay={noop} onAgain={noop} onUse={noop} />);
    expect(text(html)).toBe("Stop 0:03 Length: failed 3 s. Use a clip of 5 s to 30 s. Record again Use this take");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Use this take<\/button>/);
  });
});

describe("G5 analyzing", () => {
  const state = (phase: "checking" | "loading") => ({ step: "analyzing" as const, take, phase, voice: phase === "loading" ? voice : null });

  it("checks the clip first", () => {
    const html = renderToStaticMarkup(<AnalyzingScreen state={state("checking")} progress={null} onCancel={noop} />);
    expect(text(html)).toBe("Clip received Checking the clip Loading Chatterbox onto the GPU Cancel");
    expect(html).toContain('data-state="waiting"');
  });

  it("then shows how far Chatterbox has loaded", () => {
    const html = renderToStaticMarkup(<AnalyzingScreen state={state("loading")} progress={0.64} onCancel={noop} />);
    expect(text(html)).toBe("Clip received Checking the clip Loading Chatterbox onto the GPU, 64% Cancel");
    expect(html).toContain('aria-valuenow="64"');
  });
});

describe("G7 bad reference", () => {
  const checks = [
    { id: "length" as const, ok: false, message: "6 seconds. Use a clip of 10 to 30 seconds." },
    { id: "noise" as const, ok: false, message: "Too much background noise. Try a quieter room." },
    { id: "loudness" as const, ok: true, message: "Level is good." },
  ];

  it("shows one row per criterion with the server's sentence", () => {
    const html = renderToStaticMarkup(<RejectedScreen message="x" checks={checks} onUpload={noop} onRecord={noop} />);
    expect(text(html)).toBe(
      "Length: failed 6 seconds. Use a clip of 10 to 30 seconds. Noise: failed Too much background noise. Try a quieter room. Loudness: passed Level is good. Choose another file Record",
    );
    expect(html.match(/<li /g)).toHaveLength(3);
    expect(html).toContain('data-check="noise" data-ok="false"');
  });

  it("shows the message when the file was not audio the server could read", () => {
    const html = renderToStaticMarkup(<RejectedScreen message="not a WAV file" checks={[]} onUpload={noop} onRecord={noop} />);
    expect(text(html)).toBe("not a WAV file Choose another file Record");
  });

  it("words every criterion", () => {
    const all = (["length", "sample-rate", "loudness", "silence", "noise"] as const).map((id) => ({ id, ok: true, message: "." }));
    expect(text(renderToStaticMarkup(<CheckRows checks={all} />))).toBe("Length: passed . Sample rate: passed . Loudness: passed . Silence: passed . Noise: passed .");
  });
});

describe("G6 name and test", () => {
  const naming = (over = {}) => ({ step: "naming" as const, voice, name: "", exaggeration: 0.5, saving: false, error: null, ...over });
  const screen = (over = {}) => renderToStaticMarkup(<NamingScreen state={naming(over)} playing={false} onName={noop} onStyle={noop} onPlay={noop} onSave={noop} onCancel={noop} />);

  it("asks for a name and keeps Save voice disabled until there is one", () => {
    const html = screen();
    expect(text(html)).toBe("Name Play test Hello, I am your new voice. This is how I sound when reading to you. Exaggeration Higher is more expressive. 0.50 Calm Dramatic Cancel Save voice");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save voice<\/button>/);
  });

  it("speaks the test sentence with the name and enables Save voice", () => {
    const html = screen({ name: "Maya", exaggeration: 0.7 });
    expect(text(html)).toContain("Hello, I am Maya. This is how I sound when reading to you.");
    expect(text(html)).toContain("0.70");
    expect(html).not.toMatch(/disabled=""[^>]*>Save voice/);
  });

  it("shows why saving failed", () => {
    expect(text(screen({ name: "Maya", error: "The server did not answer." }))).toContain("The server did not answer.");
  });
});

describe("G14 cloning unavailable", () => {
  const unavailable = cloningAvailability({
    active: "kokoro",
    engines: [
      { id: "kokoro", name: "Kokoro", state: "ready", optional: false, cloning: false },
      { id: "chatterbox", name: "Chatterbox", state: "missing", reason: "not-installed", optional: true, cloning: true, gpu: { name: "NVIDIA GeForce RTX 3060", vramMb: 8192 } },
    ],
  });

  it("disables the button and says what is needed, with a way to the Engines page", () => {
    expect(renderToStaticMarkup(<CloneButton availability={unavailable} onClick={noop} />)).toMatch(/<button[^>]*disabled=""[^>]*>.*Clone a voice<\/button>/);
    expect(renderToStaticMarkup(<CloningUnavailable availability={unavailable} onOpenEngines={noop} />)).toContain('role="status"');
    expect(text(renderToStaticMarkup(<CloningUnavailable availability={unavailable} onOpenEngines={noop} />))).toBe(
      "Cloning needs Chatterbox (2.4 GB) Install it on the Engines page. Found NVIDIA GeForce RTX 3060 with 8 GB of video memory. Open Engines",
    );
  });

  it("shows an enabled button and no banner when Chatterbox is installed", () => {
    const ready = cloningAvailability({ active: "kokoro", engines: [{ id: "chatterbox", name: "Chatterbox", state: "unloaded", optional: true, cloning: true }] });
    expect(renderToStaticMarkup(<CloneButton availability={ready} onClick={noop} />)).not.toContain("disabled");
    expect(renderToStaticMarkup(<CloningUnavailable availability={ready} onOpenEngines={noop} />)).toBe("");
  });
});
