import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { clip } from "../../packages/engine/tests/clip-fixture";
import { GROUPS, S, type Ctx, type Scenario } from "./scenarios";
import { DONE, desktopShot, type Opts } from "./desktop";
import { sleep } from "./support";

// Chatterbox engine states and the voice cloning flow, driven against the stand-in sidecar (no GPU, no Python).
// Same recipe as apps/desktop/tests/cloning.test.ts: a marker file makes Chatterbox "installed", the fake microphone is a speech clip.

const here = dirname(fileURLToPath(import.meta.url));
const SIDECAR = resolve(here, "../../packages/engine/tests/fake-sidecar.mjs");
const V = GROUPS.voices;

interface CbOpts extends Omit<Opts, "userData" | "args"> {
  installed?: boolean;
  mic?: number;
  file?: number;
}

/** A user-data directory with (or without) the Chatterbox marker, and the audio files the flow needs. */
const withChatterbox = (c: Ctx, o: CbOpts) => {
  const dir = mkdtempSync(join(tmpdir(), "sk-visual-cb-"));
  const wav = (seconds: number) => {
    const f = join(dir, `speech-${seconds}.wav`);
    writeFileSync(f, clip(seconds, 24000));
    return f;
  };
  if (o.installed ?? true) {
    mkdirSync(join(dir, "engines", "chatterbox"), { recursive: true });
    writeFileSync(join(dir, "engines", "chatterbox", "installed"), "x");
  }
  const args = o.mic ? ["--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav(o.mic)}`] : [];
  const file = o.file ? wav(o.file) : null;
  const drive: NonNullable<Opts["drive"]> = async (p, ctx) => {
    if (file) await ctx.app.evaluate(({ dialog }, f) => void (dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as typeof dialog.showOpenDialog), file);
    await o.drive?.(p, ctx);
  };
  const run = () =>
    desktopShot(c, {
      ...o,
      config: { ...DONE, ...o.config },
      userData: dir,
      args,
      env: { SPEAKKIT_FAKE_CHATTERBOX: `${process.execPath}|${SIDECAR}`, ...o.env },
      drive,
    });
  return run().finally(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
};
const cb = (id: string, state: string, title: string, o: CbOpts, extra: { design?: boolean } = {}) => S(id, state, V, title, (c) => withChatterbox(c, o), extra);

const goto = (name: string, heading: string) => async (p: Page) => {
  await p.getByRole("link", { name }).click();
  await p.getByRole("heading", { name: heading, level: 1 }).waitFor();
};
const toVoices = goto("Voices", "Voices");
const toEngines = goto("Engines", "Engines");

const consent = async (p: Page, source: "Upload a clip" | "Record now") => {
  await p.getByRole("button", { name: "Clone a voice" }).click();
  await p.getByRole("heading", { name: "Clone a voice", level: 1 }).waitFor();
  await p.getByRole("radio", { name: new RegExp(`^${source}`) }).click();
  await p.getByText(/the right to clone it/).click();
};
const next = async (p: Page, source: "Upload a clip" | "Record now") => {
  await consent(p, source);
  await p.getByRole("button", { name: "Continue" }).click();
};
const toName = async (p: Page) => {
  await next(p, "Upload a clip");
  await p.getByLabel("Name").waitFor({ timeout: 30_000 });
  await p.getByLabel("Name").fill("Maya");
  await sleep(300);
};
const recordTake = async (p: Page) => {
  await next(p, "Record now");
  await p.getByText("Keep recording until at least 0:05.").waitFor();
  await sleep(6000);
  await p.getByRole("button", { name: "Stop" }).click();
  await p.getByRole("button", { name: "Play take" }).waitFor();
};
const saved = async (p: Page) => {
  await toName(p);
  await p.getByRole("button", { name: "Save voice" }).click();
  await p.getByText("Maya is saved").waitFor();
};

export const moreScenarios: Scenario[] = [
  cb("G17", "chatterbox-not-installed", "Engines · Chatterbox not installed (fake GPU)", { installed: false, drive: toEngines }),
  cb("G16", "chatterbox-ready", "Engines · Chatterbox ready (stand-in sidecar)", {
    drive: async (p) => {
      await toEngines(p);
      await sleep(800);
    },
  }),
  cb("G18", "remove-confirmation", "Engines · remove confirmation", {
    drive: async (p) => {
      await toEngines(p);
      await p.getByRole("button", { name: "Remove" }).first().click();
      await p.getByRole("dialog").waitFor();
    },
  }),
  cb("G14", "cloning-unavailable", "Voices · cloning unavailable", { installed: false, drive: toVoices }),
  cb("G1", "voices-cloning-ready", "Voices · Clone a voice enabled", { drive: toVoices }, { design: false }),
  cb("G3", "clone-choose", "Clone · choose reference", {
    drive: async (p) => {
      await toVoices(p);
      await p.getByRole("button", { name: "Clone a voice" }).click();
      await p.getByRole("heading", { name: "Clone a voice", level: 1 }).waitFor();
    },
  }),
  cb(
    "G3",
    "clone-choose-consent",
    "Clone · choose reference, upload selected and consent given",
    {
      file: 8,
      drive: async (p) => {
        await toVoices(p);
        await consent(p, "Upload a clip");
        await sleep(300);
      },
    },
    { design: false },
  ),
  cb("G7", "clone-bad-reference", "Clone · bad reference (3 s clip)", {
    file: 3,
    drive: async (p) => {
      await toVoices(p);
      await next(p, "Upload a clip");
      await p.getByText("This clip cannot be used yet.").waitFor();
      await sleep(300);
    },
  }),
  cb("G4", "clone-recording", "Clone · recording", {
    mic: 8,
    drive: async (p) => {
      await toVoices(p);
      await next(p, "Record now");
      await p.getByText("Keep recording until at least 0:05.").waitFor();
      await sleep(2500);
    },
  }),
  cb("G15", "clone-review-take", "Clone · review take", {
    mic: 8,
    drive: async (p) => {
      await toVoices(p);
      await recordTake(p);
      await p.getByText(/^Length: passed/).waitFor();
    },
  }),
  cb("G5", "clone-analyzing", "Clone · analyzing the clip", {
    file: 8,
    env: { SPEAKKIT_FAKE_LOAD_MS: "20000" },
    drive: async (p) => {
      await toVoices(p);
      await next(p, "Upload a clip");
      await sleep(2500);
    },
  }),
  cb("G6", "clone-name-test", "Clone · name and test sentence", {
    file: 8,
    drive: async (p) => {
      await toVoices(p);
      await toName(p);
    },
  }),
  cb(
    "G6",
    "clone-saved",
    "Clone · voice saved",
    {
      file: 8,
      drive: async (p) => {
        await toVoices(p);
        await saved(p);
      },
    },
    { design: false },
  ),
  cb(
    "G1",
    "voices-with-cloned",
    "Voices · Your voices with a cloned voice",
    {
      file: 8,
      drive: async (p) => {
        await toVoices(p);
        await saved(p);
        await p.getByRole("button", { name: "Done" }).click();
        await p.getByRole("region", { name: "Your voices" }).getByText("Maya", { exact: true }).waitFor();
      },
    },
    { design: false },
  ),
  cb("G11", "voice-style", "Chatterbox · voice style", {
    file: 8,
    drive: async (p) => {
      await toVoices(p);
      await saved(p);
      await p.getByRole("button", { name: "Done" }).click();
      await p.getByRole("button", { name: "Voice style: Maya" }).click();
      await p.getByRole("dialog", { name: "Voice style: Maya" }).waitFor();
      await sleep(300);
    },
  }),
  cb("K6", "microphone-blocked", "Permission · microphone blocked", {
    mic: 1,
    drive: async (p, { app }) => {
      await app.evaluate(({ session }) => session.defaultSession.setPermissionRequestHandler((_c, _p, done) => done(false)));
      await toVoices(p);
      await next(p, "Record now");
      await p.getByRole("dialog", { name: "Microphone access is off" }).waitFor();
      await sleep(300);
    },
  }),
];
