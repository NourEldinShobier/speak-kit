import { playbackRateFor } from "@speakkit/player/rate";
import { DEFAULT_SENTENCE_COLOR, DEFAULT_WORD_COLOR, type Settings } from "@speakkit/protocol";
import { DARK_PAGE_SENTENCE, DARK_PAGE_WORD, WORD_TEXT } from "./colors";

/** CSS Custom Highlight API wrapper, word timing and scroll helpers. No DOM mutation of the page. */

export const SENTENCE_HL = "speakkit-sentence";
export const WORD_HL = "speakkit-word";

export interface HlPalette {
  sentence: string;
  word: string;
  wordText: string;
}
const HEX = /^#[0-9a-f]{3,8}$/i;
export const DARK_PAGE_HL: HlPalette = { sentence: DARK_PAGE_SENTENCE, word: DARK_PAGE_WORD, wordText: WORD_TEXT };

export function palette(h: Settings["highlight"], darkPage: boolean): HlPalette {
  if (h.matchTheme && darkPage) return DARK_PAGE_HL;
  return {
    sentence: HEX.test(h.sentenceColor) ? h.sentenceColor : DEFAULT_SENTENCE_COLOR,
    word: HEX.test(h.wordColor) ? h.wordColor : DEFAULT_WORD_COLOR,
    wordText: WORD_TEXT,
  };
}

/**
 * The ::highlight rules. Highlights cannot pad or change weight, so the box never moves the text. Colour is not the only cue
 * (WCAG 1.4.1): the sentence carries a 1px underline and the spoken word a 2px one.
 */
export function highlightCss(p: HlPalette): string {
  return `::highlight(${SENTENCE_HL}){background-color:${p.sentence};color:inherit;text-decoration:underline 1px}::highlight(${WORD_HL}){background-color:${p.word};color:${p.wordText};text-decoration:underline 2px}`;
}

export class Highlighter {
  private sheet: CSSStyleSheet | null = null;
  private sent: Highlight | null = null;
  private word: Highlight | null = null;
  private mode: Settings["highlight"]["mode"] = "sentence+word";

  private ensure() {
    if (this.sheet || typeof CSS === "undefined" || !CSS.highlights) return;
    // adopted stylesheet: not subject to the page's style-src CSP, unlike an injected <style>
    this.sheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.sheet];
    this.sent = new Highlight();
    this.word = new Highlight();
    CSS.highlights.set(SENTENCE_HL, this.sent);
    CSS.highlights.set(WORD_HL, this.word);
  }

  style(mode: Settings["highlight"]["mode"], p: HlPalette) {
    this.ensure();
    this.mode = mode;
    this.sheet?.replaceSync(highlightCss(p));
  }

  get wantsWords() {
    return this.mode === "sentence+word" || this.mode === "word";
  }
  get wantsSentence() {
    return this.mode === "sentence+word" || this.mode === "sentence";
  }

  sentence(r: Range | null) {
    this.ensure();
    this.sent?.clear();
    if (r && this.wantsSentence) this.sent?.add(r);
  }
  words(r: Range | null) {
    this.ensure();
    this.word?.clear();
    if (r && this.wantsWords) this.word?.add(r);
  }
  clear() {
    this.sent?.clear();
    this.word?.clear();
  }
  dispose() {
    this.clear();
    if (typeof CSS !== "undefined" && CSS.highlights) {
      CSS.highlights.delete(SENTENCE_HL);
      CSS.highlights.delete(WORD_HL);
    }
    if (this.sheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== this.sheet);
    this.sheet = this.sent = this.word = null;
  }
}

// ---------------------------------------------------------------- word timing

export interface WordSpan {
  from: number;
  to: number;
  /** ms after sentence start */ at: number;
}

/** Split a sentence into words and give each a start time proportional to its character weight. */
export function planWords(text: string, durationMs: number, speed = 1): WordSpan[] {
  const words: { from: number; to: number; w: number }[] = [];
  const re = /\S+/g;
  let total = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const raw = m[0];
    let to = m.index + raw.length;
    const core = raw.replace(/[.,;:!?…)"'”’\]]+$/, "");
    if (core) to = m.index + core.length;
    // commas and sentence-internal stops carry a short pause
    const w = raw.length + (/[,;:]$/.test(raw) ? 2 : /[.!?…]["'”’)]*$/.test(raw) ? 3 : 0);
    words.push({ from: m.index, to, w });
    total += w;
  }
  const dur = durationMs / playbackRateFor(speed);
  let acc = 0;
  return words.map((x) => {
    const s = { from: x.from, to: x.to, at: total ? (acc / total) * dur : 0 };
    acc += x.w;
    return s;
  });
}

/** Index of the word being spoken at `t` ms (last word whose start has passed). */
export function wordIndexAt(plan: WordSpan[], t: number): number {
  let lo = 0;
  let hi = plan.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (plan[mid]!.at <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Drives word changes for the current sentence; pausable. Uses rAF so it costs nothing in background tabs or while paused. */
export class WordClock {
  private plan: WordSpan[] = [];
  private t0 = 0;
  private offset = 0;
  private running = false;
  private raf = 0;
  private last = -2;
  private readonly onWord: (w: WordSpan | null, i: number) => void;
  private readonly now: () => number;

  constructor(onWord: (w: WordSpan | null, i: number) => void, now: () => number = () => performance.now()) {
    this.onWord = onWord;
    this.now = now;
  }

  start(plan: WordSpan[], running: boolean) {
    this.stop();
    this.plan = plan;
    this.offset = 0;
    this.last = -2;
    if (running) this.resume();
    else this.tick();
  }
  elapsed() {
    return this.running ? this.offset + (this.now() - this.t0) : this.offset;
  }
  resume() {
    if (this.running || !this.plan.length) return;
    this.running = true;
    this.t0 = this.now();
    this.loop();
  }
  pause() {
    if (!this.running) return;
    this.offset += this.now() - this.t0;
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.plan = [];
    if (this.last !== -2) {
      this.last = -2;
      this.onWord(null, -1);
    }
  }
  private loop = () => {
    if (!this.running) return;
    this.tick();
    this.raf = requestAnimationFrame(this.loop);
  };
  tick() {
    const i = wordIndexAt(this.plan, this.elapsed());
    if (i !== this.last) {
      this.last = i;
      this.onWord(i >= 0 ? this.plan[i]! : null, i);
    }
  }
}

// ---------------------------------------------------------------- scrolling and theme

const rgba = (s: string): [number, number, number, number] | null => {
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) return null;
  const p = m[1]!
    .split(/[ ,/]+/)
    .filter(Boolean)
    .map(Number);
  return p.length >= 3 ? [p[0]!, p[1]!, p[2]!, p[3] ?? 1] : null;
};

/** True when the page's effective background is dark. */
export function isDarkPage(doc: Document = document): boolean {
  for (const el of [doc.body, doc.documentElement]) {
    if (!el) continue;
    const c = rgba(getComputedStyle(el).backgroundColor);
    if (c && c[3] > 0.1) {
      const lin = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]) < 0.18;
    }
  }
  return /dark/.test(getComputedStyle(doc.documentElement).colorScheme) && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function scrollerOf(el: Element | null): Element | null {
  for (let p = el; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

export const firstRect = (r: Range): DOMRect | null => r.getClientRects()[0] ?? (r.getBoundingClientRect().height ? r.getBoundingClientRect() : null);

export function isInView(r: Range): boolean {
  const q = firstRect(r);
  if (!q) return true;
  return q.bottom > 0 && q.top < innerHeight;
}

/** Keep the sentence in the comfortable band of the viewport; returns true when it scrolled. */
export function keepInView(r: Range, force = false): boolean {
  const q = firstRect(r);
  if (!q) return false;
  const sc = scrollerOf(r.startContainer.nodeType === 1 ? (r.startContainer as Element) : r.startContainer.parentElement);
  const box = sc ? sc.getBoundingClientRect() : { top: 0, height: innerHeight };
  const top = q.top - box.top;
  const h = box.height;
  if (!force && top >= h * 0.12 && top + q.height <= h * 0.78) return false;
  const delta = top - h * 0.3;
  (sc ?? window).scrollBy({ top: delta, behavior: "smooth" });
  return true;
}
