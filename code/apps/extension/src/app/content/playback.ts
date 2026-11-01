import type { PlayerState, SentenceStart } from "@speakkit/protocol";
import { Highlighter, isDarkPage, isInView, keepInView, palette, planWords, WordClock, type WordSpan } from "../../features/highlight";
import { sentenceRange, wordRange } from "../../features/reader";
import type { Ctx } from "./context";

const AUTO_SCROLL_GRACE_MS = 1200;
const USER_INPUT_GRACE_MS = 1000;

/** Keeps the highlighted sentence in view while reading, notices when the user scrolls away, and drives the "Back to current" pill. */
export class Follow {
  private userScrolled = false;
  private autoUntil = 0;
  private lastInput = -Infinity;
  private raf = 0;
  private on = false;
  private readonly c: Ctx;

  constructor(c: Ctx) {
    this.c = c;
  }

  private onUserScroll = () => {
    if (this.c.reading) {
      this.userScrolled = true;
      this.lastInput = performance.now();
      this.schedule();
    }
  };
  private onScroll = () => {
    if (!this.c.reading) return;
    const now = performance.now();
    if (now > this.autoUntil || now - this.lastInput < USER_INPUT_GRACE_MS) this.userScrolled = true;
    this.schedule();
    const ui = this.c.ui;
    ui?.placeGutter();
    if (ui?.bubbleVisible) ui.hideBubble();
  };

  /** Scroll, wheel and touch listeners exist only while something is being read: an idle page costs nothing. */
  sync() {
    const want = this.c.reading;
    if (want === this.on) return;
    this.on = want;
    const op = want ? "addEventListener" : "removeEventListener";
    document[op]("scroll", this.onScroll, { capture: true, passive: true });
    document[op]("wheel", this.onUserScroll, { passive: true });
    document[op]("touchmove", this.onUserScroll, { passive: true });
    if (!want) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.userScrolled = false;
    }
  }

  /** A new sentence is current: scroll to it unless the user has scrolled away. */
  follow(range: Range | null) {
    if (range && this.c.settings.show.autoScroll && !this.userScrolled && keepInView(range)) this.autoUntil = performance.now() + AUTO_SCROLL_GRACE_MS;
  }

  private schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.check();
    });
  }

  /** Shows the "Back to current" pill when the sentence is out of view and the page will not scroll to it by itself. */
  check() {
    const c = this.c;
    const r = c.current?.range;
    if (!r || !c.reading || c.reader) {
      c.ui?.showBack(false);
      return;
    }
    if (isInView(r)) {
      if (this.userScrolled && c.settings.show.autoScroll && performance.now() - this.lastInput > USER_INPUT_GRACE_MS) this.userScrolled = false;
      c.ui?.showBack(false);
      return;
    }
    if (this.userScrolled || !c.settings.show.autoScroll) c.ensureUi().showBack(true, (r.getClientRects()[0]?.top ?? 0) > innerHeight);
  }

  back() {
    const r = this.c.current?.range;
    this.userScrolled = false;
    this.c.ui?.showBack(false);
    if (r) {
      this.autoUntil = performance.now() + AUTO_SCROLL_GRACE_MS;
      keepInView(r, true);
    }
  }
}

/** Player state to highlight: the sentence and word marks on the page (or in the reader), and the word clock that moves them. */
export class Playback {
  dark = false;
  private readonly hl = new Highlighter();
  private readonly clock = new WordClock((w, i) => this.onWord(w, i));
  private readonly c: Ctx;
  private readonly follow: Follow;

  constructor(c: Ctx, follow: Follow) {
    this.c = c;
    this.follow = follow;
  }

  /** Re-reads the page background and restyles the highlight (settings or theme changed). */
  restyle() {
    this.dark = isDarkPage();
    this.hl.style(this.c.settings.highlight.mode, palette(this.c.settings.highlight, this.dark));
  }

  onState(st: PlayerState) {
    const c = this.c;
    c.state = st;
    this.restyle();
    const d = st.docId ? c.docs.get(st.docId) : undefined;
    if (st.status === "idle" || st.status === "finished" || st.status === "error") this.stopHighlight();
    else if (d) this.followState(st);
    if (st.status === "playing" || st.status === "preparing") c.lastDoc = d?.doc ?? c.lastDoc;
    c.refresh();
  }

  /** Nothing is being read: clear the marks and the back pill. */
  private stopHighlight() {
    const c = this.c;
    this.clock.stop();
    this.hl.clear();
    c.current = null;
    c.ui?.showBack(false);
    c.reader?.clearHighlight();
  }

  /** Something is being read: show the sentence when it changed, run the word clock only while playing. */
  private followState(st: PlayerState) {
    const cur = this.c.current;
    if (!cur || cur.docId !== st.docId || cur.index !== st.sentenceIndex) this.showSentence(st.docId!, st.sentenceIndex);
    if (st.status === "playing") this.clock.resume();
    else this.clock.pause();
  }

  onSentenceStart(s: SentenceStart) {
    const d = this.c.docs.get(s.docId);
    const sentence = d?.ex.sentences[s.index];
    if (!sentence) return;
    this.showSentence(s.docId, s.index);
    this.clock.start(planWords(sentence.text, s.durationMs, s.speed), this.c.state?.status !== "paused");
  }

  private inReader(docId: string) {
    return !!this.c.reader && this.c.readerDoc === docId;
  }

  private showSentence(docId: string, index: number) {
    const c = this.c;
    const d = c.docs.get(docId);
    if (!d) return;
    const range = sentenceRange(document, d.ex, index);
    c.current = { docId, index, range };
    this.clock.stop();
    this.hl.words(null);
    if (this.inReader(docId)) {
      this.hl.sentence(null);
      c.reader!.highlightSentence(index);
      return;
    }
    this.hl.sentence(range);
    this.follow.follow(range);
    this.follow.check();
  }

  private onWord(w: WordSpan | null, i = -1) {
    const c = this.c;
    const cur = c.current;
    const d = cur && c.docs.get(cur.docId);
    if (!cur || !d || !w) {
      this.hl.words(null);
      return;
    }
    if (this.inReader(cur.docId)) c.reader!.highlightWord(i);
    else this.hl.words(wordRange(document, d.ex, { index: cur.index, from: w.from, to: w.to }));
  }
}
