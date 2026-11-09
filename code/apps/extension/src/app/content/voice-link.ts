import type { Ctx } from "./context";
import type { Docs } from "./docs";
import type { Voice, VoiceDeps } from "./voice";

/** What the voice conversation needs of the controller. */
type Host = Ctx & { openReader(): void; showTab(): boolean };

/** The page address without its fragment: moving to #section is not a new page. */
const pageKey = () => location.href.replace(/#.*/, "");

/** The voice conversation as the controller holds it: content-voice.js is fetched on the first Talk, and later calls reach it only if it was. */
export class VoiceLink {
  /** a conversation is open (the launcher's Talk button is filled) */
  open = false;
  private voice: Promise<Voice> | null = null;
  private readonly host: Host;
  private readonly deps: VoiceDeps;

  constructor(host: Host, docs: Docs) {
    this.host = host;
    this.deps = {
      page: () => docs.voicePage(),
      onOpen: (open) => {
        this.open = open;
        host.refresh();
      },
      post: (msg) => host.post(msg),
      openReader: () => host.openReader(),
    };
    // another page in the same document (single-page app): the conversation is about the old one until the user updates it
    let at = pageKey();
    (globalThis as { navigation?: EventTarget }).navigation?.addEventListener("currententrychange", () => {
      if (pageKey() === at) return;
      at = pageKey();
      this.ifLoaded((v) => v.pageMoved());
    });
  }

  /** Starts a conversation about the page, or ends the open one (the Talk button, the keyboard command). */
  toggle() {
    const h = this.host;
    if (h.frame || !h.alive() || h.rule() === "never-read") return;
    h.showTab();
    this.voice ??= import(/* @vite-ignore */ chrome.runtime.getURL("content-voice.js")).then((m: { createVoice: (d: VoiceDeps) => Voice }) => m.createVoice(this.deps));
    this.voice.then(
      (v) => v.toggle(),
      () => (this.voice = null), // the file could not be fetched (extension reloaded, page policy): the next press tries again
    );
  }

  /** Runs `fn` on the conversation when it was ever loaded. */
  ifLoaded(fn: (v: Voice) => void) {
    void this.voice?.then(fn, () => {
      /* it never loaded: there is nothing to tell */
    });
  }
}
