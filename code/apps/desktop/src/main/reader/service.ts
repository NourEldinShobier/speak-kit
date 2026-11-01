import { clipboard } from "electron";
import type { Ctx } from "../context";
import type { PreviewAudio } from "../../shared/ipc";
import type { ReaderCommand, ReaderSource, ReaderState } from "../../shared/reader";
import type { ToastCenter } from "../toasts";
import { captureSelection } from "../system/selection";
import { sendCopyKeys } from "../system/keys";
import { electronClipboard } from "../system/clipboard";
import { cornerOf, FloatWindow } from "../windows";
import { ReaderController } from "./controller";

/** The finished or failed mini player stays this long, then goes away (the design's "shrinks after quiet"). */
const LINGER_MS = 6000;

interface Reading {
  readonly controller: ReaderController;
  readSelection(): Promise<void>;
  /** False when the clipboard holds no text. */
  readClipboard(): Promise<boolean>;
  readText(text: string, source: ReaderSource): boolean;
  command(c: ReaderCommand): void;
  started(epoch: number, index: number): void;
  done(epoch: number, index: number): void;
  owns(contents: Electron.WebContents): boolean;
  dispose(): void;
}

/**
 * Reading from anywhere: global shortcuts, the clipboard prompt and the tray all end up here. Owns the reader controller and the
 * mini player window, which plays the audio and exists only while something is being read.
 */
export function createReading(ctx: Ctx, toasts: ToastCenter, onChange: (r: ReaderState) => void): Reading {
  const mini = new FloatWindow("mini", { width: 360, height: 112, webPreferences: { backgroundThrottling: false } }, () => ctx.state);
  ctx.sinks.add((state) => mini.sendState(state));
  let linger: NodeJS.Timeout | undefined;
  let notifiedFinish = false;

  const onState = (s: ReaderState) => {
    ctx.state.reader = s;
    clearTimeout(linger);
    if (s.status === "idle") mini.close();
    else {
      // showInactive: the app being read keeps the keyboard.
      mini.open(cornerOf(), false);
      if (s.status === "finished" || s.status === "error") linger = setTimeout(() => controller.command({ type: "stop" }), LINGER_MS);
    }
    if (s.status === "finished" && !notifiedFinish) {
      notifiedFinish = true;
      toasts.notify({ event: "reading-finished", taskKey: s.title, title: "Finished reading", body: s.title, onClick: ctx.showWindow });
    } else if (s.status !== "finished") notifiedFinish = false;
    onChange(s);
    ctx.publish();
  };

  const controller: ReaderController = new ReaderController({
    synth: (text, voice, speed, signal): Promise<PreviewAudio> => ctx.server.speak(text, voice, speed, signal),
    voice: () => ctx.config.voice,
    speed: () => ctx.config.speed,
    emit: onState,
    player: {
      chunk: (epoch, index, audio) => mini.sendUi({ type: "chunk", epoch, index, audio }),
      pause: () => mini.sendUi({ type: "player", op: "pause" }),
      resume: () => mini.sendUi({ type: "player", op: "resume" }),
      flush: () => mini.sendUi({ type: "player", op: "flush" }),
    },
  });

  const readText = (text: string, source: ReaderSource) => {
    const ok = controller.start(text, source);
    if (!ok) controller.fail("There is no text to read.");
    return ok;
  };
  let capturing = false;

  return {
    controller,
    readText,
    async readSelection() {
      if (capturing) return;
      capturing = true;
      try {
        const text = await captureSelection({ clip: electronClipboard, copy: sendCopyKeys, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
        if (text.trim()) readText(text, "selection");
        else controller.fail("No text is selected. Select some text, then try again.");
      } catch (e) {
        ctx.log.warn("reading the selection failed", e instanceof Error ? e.message : e);
        controller.fail(e instanceof Error ? e.message : "Could not read the selection.");
      } finally {
        capturing = false;
      }
    },
    async readClipboard() {
      const text = await clipboard.readText();
      if (!text.trim()) {
        controller.fail("The clipboard has no text.");
        return false;
      }
      return readText(text, "clipboard");
    },
    command(c) {
      if (c.type === "keep-on-top") mini.window?.setAlwaysOnTop(c.on, "floating");
      else if (c.type === "open-app") ctx.showWindow();
      else controller.command(c);
    },
    started: (epoch, index) => controller.started(epoch, index),
    done: (epoch, index) => controller.done(epoch, index),
    owns: (contents) => mini.owns(contents),
    dispose() {
      clearTimeout(linger);
      mini.close();
    },
  };
}
