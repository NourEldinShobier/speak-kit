import type { UiHandlers } from "../../shared/ui-types";
import type { VoiceInfo } from "../../shared/internal";
import type { Ctx } from "./context";
import type { Docs } from "./docs";
import type { Follow } from "./playback";
import type { ReaderSession } from "./reader-session";

const VOICES_WAIT_MS = 1500;

/** What the controller's parts hand to the in-page UI: every user action on the launcher, bubble, gutter, dock and reader. */
interface Parts {
  docs: Docs;
  follow: Follow;
  reader: ReaderSession;
}

/** The voice list: cached after the first answer; resolves with whatever it has after 1.5 s so a slow worker never blocks the popover. */
function loadVoices(c: Ctx): Promise<VoiceInfo[]> {
  return new Promise<VoiceInfo[]>((res) => {
    if (c.voices.length) {
      res(c.voices);
      return;
    }
    c.post({ t: "get-voices" }, (r) => {
      const v = (r as { voices?: VoiceInfo[] } | undefined)?.voices;
      if (Array.isArray(v) && v.length) c.voices = v;
      c.refresh();
      res(c.voices);
    });
    setTimeout(() => res(c.voices), VOICES_WAIT_MS);
  });
}

export function makeHandlers(c: Ctx, p: Parts): UiHandlers {
  return {
    listen: () => p.docs.play("page"),
    readSelection: () => p.docs.play("selection"),
    copySelection: () => {
      const t = getSelection()?.toString() ?? "";
      if (t) void navigator.clipboard?.writeText(t).catch(() => {});
    },
    readFromHere: (el) => p.docs.play("from-here", el),
    toggle: () => c.cmd({ cmd: "toggle" }),
    stop: () => c.cmd({ cmd: "stop" }),
    skip: (ms) => c.cmd({ cmd: "seek-ms", deltaMs: ms }),
    seekFrac: (f) => {
      const st = c.state;
      if (st && st.totalMs > 0) c.cmd({ cmd: "seek-ms", deltaMs: f * st.totalMs - st.elapsedMs });
    },
    nextBlock: () => c.cmd({ cmd: "next-block" }),
    prevBlock: () => c.cmd({ cmd: "prev-block" }),
    setSpeed: (n) => c.setSpeed(n),
    setVoice: (id) => {
      c.cmd({ cmd: "set-voice", voice: id });
      if (c.state) c.state = { ...c.state, voice: id };
      c.settings = { ...c.settings, voice: id };
      c.refresh();
    },
    previewVoice: (id) => c.post({ t: "preview-voice", voice: id }),
    voices: () => loadVoices(c),
    retry: () => {
      if (c.lastDoc) c.cmd({ cmd: "play", doc: c.lastDoc });
      else p.docs.play("page");
    },
    openApp: () => c.post({ t: "open-app" }),
    openOptions: () => c.post({ t: "open-options" }),
    openSidepanel: () => c.post({ t: "open-sidepanel" }),
    replay: () => {
      const id = c.state?.docId;
      const d = (id && c.docs.get(id)?.doc) || c.lastDoc;
      if (d) c.cmd({ cmd: "play", doc: { ...d, startIndex: 0 } });
      else p.docs.play("page");
    },
    hideOnSite: () => {
      void c
        .saveSettings((s) => {
          s.sites[c.host] = "hide-controls";
        })
        .then(() => {
          c.refresh();
          c.ui?.toast("Controls hidden on this site", "info", { label: "Settings", run: () => c.post({ t: "open-options" }) });
        });
    },
    moveLauncher: (y) =>
      void c.saveSettings((s) => {
        s.launcher.y = Math.round(y * 1000) / 1000;
      }),
    backToCurrent: () => p.follow.back(),
    warm: (reason) => c.warm(reason),
    openReader: () => p.reader.open(),
  };
}
