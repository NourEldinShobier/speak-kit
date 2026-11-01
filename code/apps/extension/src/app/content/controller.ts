/// <reference types="chrome" />
import {
  SETTINGS_KEY,
  type BgToContent, type ContentToBg, type ExtractReply, type PlayerCommand, type PlayerState, type ReadDoc, type SentenceStart, type SiteRule,
} from "@speakkit/protocol";
import { Highlighter, isDarkPage, isInView, keepInView, palette, planWords, WordClock } from "../../features/highlight";
import { extract, findMainRoot, sentenceIndexAt, sentenceRange, wordRange, type Extraction, type ReaderView } from "../../features/reader";
import { defaultSettings, withDefaults, type ReaderSettings, type Settings } from "../../features/settings";
import type { ExtraBgToContent, ExtraToBg, VoiceInfo } from "../../shared/internal";
import type { UiHandlers, UiModel } from "../../shared/ui-types";
import { defer, loadUi } from "./lazy";
import type { Ui } from "./ui";

/** The lazy half of the content script: settings, extraction, highlight and the Shadow DOM UI. Loaded by index.ts. */

const BLOCK_SEL = "p,li,blockquote,h1,h2,h3,h4,h5,h6,dd,figcaption";
const ACTIVE = ["preparing", "playing", "paused"];
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const editable = (t: EventTarget | null) => {
  const e = t as HTMLElement | null;
  return !!e && (e.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(e.tagName) || e.getAttribute?.("role") === "button");
};

/** Stored settings over the defaults. Validation (valibot) happens in the service worker and the extension pages, not in the page. */
export const mergeSettings = (stored: Partial<Settings> | undefined): Settings => withDefaults(stored);

interface Doc { ex: Extraction; doc: ReadDoc; blocks: number[] }

class Controller {
  settings: Settings = defaultSettings();
  private ui: Ui | null = null;
  private hl = new Highlighter();
  private clock = new WordClock((w, i) => this.onWord(w, i));
  private docs = new Map<string, Doc>();
  private state: PlayerState | null = null;
  private current: { docId: string; index: number; range: Range | null } | null = null;
  private dark = false;
  private root: { el: Element; t: number } | null = null;
  private est: { t: number; chars: number } | null = null;
  private voices: VoiceInfo[] = [];
  private voicesAsked = false;
  private ctx: { node: Node; offset: number; t: number } | null = null;
  private userScrolled = false;
  private autoUntil = 0;
  private raf = 0;
  private lastDoc: ReadDoc | null = null;
  private reader: ReaderView | null = null;
  private readerDoc: string | null = null;
  private scrollOn = false;

  async init() {
    await this.loadSettings();
    chrome.storage.onChanged.addListener((ch, area) => { if (area === "sync" && ch[SETTINGS_KEY]) void this.loadSettings().then(() => this.refresh()); });
    document.addEventListener("pointerup", this.onPointerUp, true);
    document.addEventListener("keyup", this.onKeyUp, true);
    document.addEventListener("selectionchange", this.onSelChange);
    document.addEventListener("pointermove", this.onMove, { passive: true });
    document.addEventListener("contextmenu", this.onContext, true);
    document.addEventListener("keydown", this.onKey, true);
    document.documentElement.addEventListener("pointerleave", () => this.ui?.scheduleGutterHide());
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.refresh());
    this.dark = isDarkPage();
    this.applyStyle();
    this.refresh();
    // pick up a reading that is already running (page reloaded or UI enabled mid-reading)
    this.post({ t: "get-state" }, (r) => { const s = (r as { state?: PlayerState } | PlayerState | undefined); const st = s && "state" in s ? s.state : (s as PlayerState | undefined); if (st && typeof st === "object" && "status" in st && !this.state) this.onState(st); });
  }

  // ------------------------------------------------------------ settings and model

  private async loadSettings() {
    try {
      const r = await chrome.storage.sync.get(SETTINGS_KEY);
      this.settings = mergeSettings(r[SETTINGS_KEY] as Partial<Settings> | undefined);
    } catch { this.settings = defaultSettings(); }
  }
  private async saveSettings(mut: (s: Settings) => void) {
    try {
      const r = await chrome.storage.sync.get(SETTINGS_KEY);
      const s = mergeSettings(r[SETTINGS_KEY] as Partial<Settings> | undefined);
      mut(s);
      await chrome.storage.sync.set({ [SETTINGS_KEY]: s });
      this.settings = s;
    } catch { /* extension reloaded: nothing to save to */ }
  }

  get host() { return location.hostname.replace(/^www\./, ""); }
  rule(): SiteRule | undefined { return this.settings.sites[this.host] ?? this.settings.sites[location.hostname]; }

  private applyStyle() { this.hl.style(this.settings.highlight.mode, palette(this.settings.highlight, this.dark)); }

  private voiceName(id: string) { return this.voices.find((v) => v.id === id)?.name ?? id.replace(/^[a-z]{2}_/, "").replace(/^./, (c) => c.toUpperCase()); }

  private estimate = () => {
    const now = performance.now();
    if (!this.est || now - this.est.t > 20000) {
      const ex = extract(document, { skip: this.settings.skip });
      let chars = 0;
      for (const s of ex.sentences) chars += s.text.length;
      this.est = { t: now, chars };
    }
    return (this.est.chars / 15 / Math.max(0.5, this.state?.speed ?? this.settings.speed)) * 1000;
  };

  /** "Paragraph n of N": blocks of the document being read, counted from 1. */
  private paragraph(): UiModel["paragraph"] {
    const st = this.state;
    const d = st?.docId ? this.docs.get(st.docId) : undefined;
    const s = d?.doc.sentences[st!.sentenceIndex];
    if (!d || !s) return undefined;
    const n = d.blocks.indexOf(s.block) + 1;
    return n > 0 ? { n, of: d.blocks.length } : undefined;
  }

  private model(): UiModel {
    const s = this.settings;
    const rule = this.rule();
    const off = rule === "hide-controls" || rule === "never-read";
    const st = rule === "never-read" ? null : this.state;
    return {
      status: st?.status ?? "idle",
      elapsedMs: st?.elapsedMs ?? 0, totalMs: st?.totalMs ?? 0,
      speed: st?.speed ?? s.speed, voice: st?.voice ?? s.voice, voiceName: this.voiceName(st?.voice ?? s.voice),
      error: st?.error, estimate: this.estimate, paragraph: this.paragraph(), dark: this.dark,
      showDock: s.show.dock && !off, alwaysDock: rule === "always-dock",
      launcher: s.launcher.enabled && !off ? s.launcher : null,
      showBubble: s.show.bubble && !off, showGutter: s.show.gutter && !off,
      readerOpen: !!this.reader,
    };
  }

  private wantsUi(m: UiModel) { return !!m.launcher || m.alwaysDock || m.showBubble || m.showGutter || (m.showDock && m.status !== "idle") || m.status === "error"; }

  /** Create the UI on demand and push the current model. */
  private refresh() {
    const m = this.model();
    if (!this.ui) {
      if (!this.wantsUi(m)) return;
      this.ui = this.makeUi(m);
    } else this.ui.render(m);
    this.syncScrollListeners();
  }
  private ensureUi() { if (!this.ui) this.ui = this.makeUi(this.model()); return this.ui; }
  /** The UI lives in content-ui.js (loaded now, on first need); the returned handle queues calls until it has arrived. */
  private makeUi(m: UiModel): Ui {
    return defer(loadUi(chrome.runtime.getURL("content-ui.js"), this.handlers, m), ["render"]);
  }

  // ------------------------------------------------------------ bg messaging

  private post(msg: ContentToBg | ExtraToBg, cb?: (r: unknown) => void) {
    try { void chrome.runtime.sendMessage(msg).then(cb, () => {}); } catch { /* extension context invalidated */ }
  }
  private cmd(command: PlayerCommand) { this.post({ t: "player", command }); }

  onMessage(msg: BgToContent | ExtraBgToContent) {
    switch (msg.t) {
      case "state": this.onState(msg.state); break;
      case "sentence-start": this.onSentenceStart(msg.start); break;
      case "settings-changed": void this.loadSettings().then(() => { this.dark = isDarkPage(); this.applyStyle(); this.refresh(); this.reader?.apply(); }); break;
      case "toast": {
        const act = msg.action;
        this.ensureUi().toast(msg.message, msg.kind ?? "ok", act ? { label: msg.actionLabel ?? "View queue", run: () => (act === "open-sidepanel" ? this.post({ t: "open-sidepanel" }) : this.post({ t: "open-options" })) } : undefined);
        break;
      }
      case "reader": if (msg.open) this.openReader(); else this.closeReader(); break;
    }
  }

  // ------------------------------------------------------------ extraction

  private currentSelection(): Range | undefined {
    const s = getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return undefined;
    const r = s.getRangeAt(0);
    return /\S/.test(r.toString()) ? r : undefined;
  }

  private mainRoot(): Element {
    const now = performance.now();
    if (!this.root || !this.root.el.isConnected || now - this.root.t > 15000) this.root = { el: findMainRoot(document), t: now };
    return this.root.el;
  }

  /** "from here" anchor: explicit element, recent context-menu point, selection start, else the first block in view. */
  private anchor(mode: string, el?: Element): { node: Node; offset: number; precise: boolean } | null {
    if (el) return { node: el, offset: 0, precise: false };
    if (this.ctx && performance.now() - this.ctx.t < 60000) return { node: this.ctx.node, offset: this.ctx.offset, precise: true };
    const s = getSelection();
    if (s?.rangeCount && s.anchorNode && !this.ui?.hasPopover) return { node: s.anchorNode, offset: s.anchorOffset, precise: true };
    void mode;
    const at = document.elementFromPoint(innerWidth / 2, Math.min(120, innerHeight / 3));
    return at ? { node: at, offset: 0, precise: false } : null;
  }

  build(mode: "page" | "selection" | "from-here", el?: Element): ReadDoc | { error: "page-unreadable" } {
    if (this.rule() === "never-read") return { error: "page-unreadable" };
    // With the reader open, reading the page means reading the document the reader shows, so its highlight follows.
    const shown = this.reader && this.readerDoc && mode === "page" ? this.docs.get(this.readerDoc)?.doc : undefined;
    if (shown && shown.source !== "selection") return { ...shown, startIndex: 0 };
    const sel = mode === "selection" ? this.currentSelection() : undefined;
    const effective = mode === "selection" && !sel ? "page" : mode;
    let ex: Extraction;
    try { ex = extract(document, { skip: this.settings.skip, selection: sel }); } catch { return { error: "page-unreadable" }; }
    if (!ex.sentences.length) return { error: "page-unreadable" };
    let startIndex = 0;
    if (effective === "from-here") {
      const a = this.anchor(mode, el);
      if (a) startIndex = sentenceIndexAt(ex, a.node, a.offset, a.precise);
      this.ctx = null;
    }
    const doc: ReadDoc = {
      docId: uid(), tabId: -1, // the service worker fills tabId from sender.tab.id
      url: location.href, title: ex.title,
      sentences: ex.sentences.map((s) => ({ text: s.text, block: s.block })),
      startIndex, source: effective === "selection" ? "selection" : effective === "from-here" ? "from-here" : "page",
    };
    this.docs.set(doc.docId, { ex, doc, blocks: [...new Set(doc.sentences.map((s) => s.block))].sort((a, b) => a - b) });
    while (this.docs.size > 4) this.docs.delete(this.docs.keys().next().value!);
    return doc;
  }

  /** Reply to a background 'extract' request. */
  extractReply(mode: "page" | "selection" | "from-here"): ExtractReply {
    const r = this.build(mode);
    return "error" in r ? { error: r.error } : { doc: r };
  }

  private play(mode: "page" | "selection" | "from-here", el?: Element) {
    const r = this.build(mode, el);
    if ("error" in r) { this.ensureUi().toast("SpeakKit can't read this page", "err"); return; }
    this.lastDoc = r;
    this.cmd({ cmd: "play", doc: r });
  }

  // ------------------------------------------------------------ reader view

  /** Open the reader on the document being read, or on the whole page when nothing is playing. */
  openReader() {
    if (this.reader) return;
    let id = this.state && ACTIVE.includes(this.state.status) ? this.state.docId : undefined;
    if (!id || !this.docs.has(id) || this.docs.get(id)!.doc.source === "selection") {
      const r = this.build("page");
      if ("error" in r) { this.ensureUi().toast("SpeakKit can't read this page", "err"); return; }
      this.lastDoc = r;
      id = r.docId;
    }
    const d = this.docs.get(id)!;
    const ui = this.ensureUi();
    ui.hideBubble();
    ui.showGutter(null);
    this.readerDoc = id;
    const docId = id;
    this.reader = defer((ui as unknown as { ready: Promise<Ui> }).ready.then((u) => u.openReader(d.ex, docId, {
      settings: () => this.settings.reader,
      save: (p) => this.saveReader(p),
      onClose: () => this.closeReader(),
      onPlayFrom: (i) => this.playFrom(docId, i),
      host: this.host,
    })));
    if (this.current?.docId === id) { this.reader.highlightSentence(this.current.index); }
    this.refresh();
  }

  closeReader() {
    if (!this.reader) return;
    this.reader.close();
    this.reader = null;
    this.readerDoc = null;
    this.refresh();
  }

  private saveReader(p: Partial<ReaderSettings>) {
    this.settings = { ...this.settings, reader: { ...this.settings.reader, ...p } };
    void this.saveSettings((s) => { s.reader = { ...s.reader, ...p }; });
  }

  /** Read from sentence `i` of the reader's document: seek when it is the one playing, else start it there. */
  private playFrom(docId: string, i: number) {
    const d = this.docs.get(docId);
    if (!d) return;
    if (this.state && ACTIVE.includes(this.state.status) && this.state.docId === docId) this.cmd({ cmd: "seek-sentence", index: i });
    else { this.lastDoc = { ...d.doc, startIndex: i }; this.cmd({ cmd: "play", doc: this.lastDoc }); }
  }

  // ------------------------------------------------------------ player state -> highlight

  private onState(st: PlayerState) {
    if (this.rule() === "never-read") return;
    this.state = st;
    this.dark = isDarkPage();
    this.applyStyle();
    const d = st.docId ? this.docs.get(st.docId) : undefined;
    if (st.status === "idle" || st.status === "finished" || st.status === "error") {
      this.clock.stop(); this.hl.clear(); this.current = null; this.ui?.showBack(false); this.reader?.clearHighlight();
    } else if (d) {
      if (!this.current || this.current.docId !== st.docId || this.current.index !== st.sentenceIndex) this.showSentence(st.docId!, st.sentenceIndex);
      if (st.status === "playing") this.clock.resume(); else this.clock.pause();
    }
    if (st.status === "playing" || st.status === "preparing") this.lastDoc = d?.doc ?? this.lastDoc;
    this.refresh();
  }

  private onSentenceStart(s: SentenceStart) {
    const d = this.docs.get(s.docId);
    if (!d || !d.ex.sentences[s.index]) return;
    this.showSentence(s.docId, s.index);
    this.clock.start(planWords(d.ex.sentences[s.index]!.text, s.durationMs, s.speed), this.state?.status !== "paused");
  }

  private showSentence(docId: string, index: number) {
    const d = this.docs.get(docId);
    if (!d) return;
    const range = sentenceRange(document, d.ex, index);
    this.current = { docId, index, range };
    this.clock.stop();
    this.hl.words(null);
    if (this.reader && this.readerDoc === docId) {
      this.hl.sentence(null);
      this.reader.highlightSentence(index);
    } else {
      this.hl.sentence(range);
      if (range && this.settings.show.autoScroll && !this.userScrolled) { if (keepInView(range)) this.autoUntil = performance.now() + 1200; }
      this.checkBack();
    }
  }

  private onWord(w: { from: number; to: number } | null, i = -1) {
    const c = this.current;
    const d = c && this.docs.get(c.docId);
    if (!c || !d || !w) { this.hl.words(null); return; }
    if (this.reader && this.readerDoc === c.docId) { this.reader.highlightWord(i); return; }
    this.hl.words(wordRange(document, d.ex, c.index, w.from, w.to));
  }

  // ------------------------------------------------------------ scroll tracking and back pill

  private lastInput = -Infinity;
  private onUserScroll = () => { if (this.reading) { this.userScrolled = true; this.lastInput = performance.now(); this.scheduleCheck(); } };
  private onScroll = () => {
    if (!this.reading) return;
    const now = performance.now();
    if (now > this.autoUntil || now - this.lastInput < 1000) this.userScrolled = true;
    this.scheduleCheck();
    this.ui?.placeGutter();
    if (this.ui?.bubbleVisible) this.ui.hideBubble();
  };
  private get reading() { return !!this.state && ACTIVE.includes(this.state.status); }
  /** Scroll, wheel and touch listeners exist only while something is being read: an idle page costs nothing. */
  private syncScrollListeners() {
    const want = this.reading;
    if (want === this.scrollOn) return;
    this.scrollOn = want;
    const op = want ? "addEventListener" : "removeEventListener";
    document[op]("scroll", this.onScroll, { capture: true, passive: true });
    document[op]("wheel", this.onUserScroll, { passive: true });
    document[op]("touchmove", this.onUserScroll, { passive: true });
    if (!want) { cancelAnimationFrame(this.raf); this.raf = 0; this.userScrolled = false; }
  }
  private scheduleCheck() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.checkBack(); }); }
  private checkBack() {
    const r = this.current?.range;
    if (!r || !this.reading || this.reader) { this.ui?.showBack(false); return; }
    const visible = isInView(r);
    if (visible) { if (this.userScrolled && this.settings.show.autoScroll && performance.now() - this.lastInput > 1000) this.userScrolled = false; this.ui?.showBack(false); return; }
    if (this.userScrolled || !this.settings.show.autoScroll) this.ensureUi().showBack(true, (r.getClientRects()[0]?.top ?? 0) > innerHeight);
  }
  private backToCurrent() {
    const r = this.current?.range;
    this.userScrolled = false;
    this.ui?.showBack(false);
    if (r) { this.autoUntil = performance.now() + 1200; keepInView(r, true); }
  }

  // ------------------------------------------------------------ page events

  private inUi = (e: Event) => !!this.ui && e.composedPath().includes(this.ui.host);

  private onPointerUp = (e: PointerEvent) => { if (!this.inUi(e)) setTimeout(() => this.checkSelection(), 10); };
  private onKeyUp = (e: KeyboardEvent) => { if (e.shiftKey || e.key === "a") setTimeout(() => this.checkSelection(), 10); };
  private onSelChange = () => { const s = getSelection(); if (s?.isCollapsed) this.ui?.hideBubble(); };

  private checkSelection() {
    const m = this.model();
    if (!m.showBubble || this.reader) return;
    const r = this.currentSelection();
    if (!r) { this.ui?.hideBubble(); return; }
    const a = document.activeElement;
    if (a && ((a as HTMLElement).isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName))) return;
    const text = r.toString();
    if (!/[\p{L}\p{N}]{2}/u.test(text)) return;
    const rects = r.getClientRects();
    const b = r.getBoundingClientRect();
    if (!rects.length) return;
    const first = rects[0]!;
    this.ensureUi().showBubble(new DOMRect(b.left, first.top, b.width, b.height));
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch" || !this.settings.show.gutter || this.reader) return;
    const ui = this.ui;
    if (!ui) { if (!this.model().showGutter) return; this.ensureUi(); }
    const u = this.ui!;
    if (e.target === u.host) { u.cancelGutterHide(); return; }
    const t = e.target as Element | null;
    const el = t?.closest?.(BLOCK_SEL);
    if (!el || !this.mainRoot().contains(el) || (el.textContent?.length ?? 0) < 20 || editable(el)) { u.scheduleGutterHide(); return; }
    u.cancelGutterHide();
    if (u.gutterTarget !== el) u.showGutter(el);
  };

  private onContext = (e: MouseEvent) => {
    const r = (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(e.clientX, e.clientY);
    const s = getSelection();
    if (s && !s.isCollapsed && s.rangeCount) this.ctx = { node: s.getRangeAt(0).startContainer, offset: s.getRangeAt(0).startOffset, t: performance.now() };
    else if (r) this.ctx = { node: r.startContainer, offset: r.startOffset, t: performance.now() };
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape" && this.reader && !this.ui?.hasPopover) { e.preventDefault(); e.stopPropagation(); this.closeReader(); return; }
    if (!this.reading) return;
    const t = e.composedPath()[0] ?? e.target;
    if (editable(t) && e.key !== "Escape") return;
    if (t === this.ui?.host) return;
    // keys that belong to a kit control (slider, list) are not reading shortcuts
    if (t instanceof HTMLElement && t.closest("[role=slider],[role=listbox],[role=menu]") && this.ui && e.composedPath().includes(this.ui.host)) return;
    const st = this.state!;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    switch (e.key) {
      case "ArrowRight": stop(); this.cmd({ cmd: "next-block" }); break;
      case "ArrowLeft": stop(); this.cmd({ cmd: "prev-block" }); break;
      case "ArrowUp": stop(); this.setSpeed(Math.min(3, Math.round((st.speed + 0.1) * 20) / 20)); break;
      case "ArrowDown": stop(); this.setSpeed(Math.max(0.5, Math.round((st.speed - 0.1) * 20) / 20)); break;
      case " ": if (!editable(t)) { stop(); this.cmd({ cmd: "toggle" }); } break;
      case "Escape": if (this.ui?.hasPopover) { this.ui.closePop(); stop(); } else { stop(); this.cmd({ cmd: "stop" }); } break;
    }
  };

  private setSpeed(v: number) {
    this.cmd({ cmd: "set-speed", speed: v });
    if (this.state) this.state = { ...this.state, speed: v };
    this.refresh();
  }

  // ------------------------------------------------------------ UI handlers

  private handlers: UiHandlers = {
    listen: () => this.play("page"),
    readSelection: () => this.play("selection"),
    copySelection: () => { const t = getSelection()?.toString() ?? ""; if (t) void navigator.clipboard?.writeText(t).catch(() => {}); },
    readFromHere: (el) => this.play("from-here", el),
    toggle: () => this.cmd({ cmd: "toggle" }),
    stop: () => this.cmd({ cmd: "stop" }),
    skip: (ms) => this.cmd({ cmd: "seek-ms", deltaMs: ms }),
    seekFrac: (f) => { const st = this.state; if (st && st.totalMs > 0) this.cmd({ cmd: "seek-ms", deltaMs: f * st.totalMs - st.elapsedMs }); },
    nextBlock: () => this.cmd({ cmd: "next-block" }),
    prevBlock: () => this.cmd({ cmd: "prev-block" }),
    setSpeed: (n) => this.setSpeed(n),
    setVoice: (id) => { this.cmd({ cmd: "set-voice", voice: id }); if (this.state) this.state = { ...this.state, voice: id }; this.settings = { ...this.settings, voice: id }; this.refresh(); },
    previewVoice: (id) => this.post({ t: "preview-voice", voice: id }),
    voices: () => new Promise<VoiceInfo[]>((res) => {
      if (this.voices.length) { res(this.voices); return; }
      this.post({ t: "get-voices" }, (r) => { const v = (r as { voices?: VoiceInfo[] } | undefined)?.voices; if (Array.isArray(v) && v.length) this.voices = v; this.refresh(); res(this.voices); });
      setTimeout(() => res(this.voices), 1500);
    }),
    retry: () => { const d = this.lastDoc; if (d) this.cmd({ cmd: "play", doc: d }); else this.play("page"); },
    openApp: () => this.post({ t: "open-app" }),
    openOptions: () => this.post({ t: "open-options" }),
    openSidepanel: () => this.post({ t: "open-sidepanel" }),
    replay: () => { const id = this.state?.docId; const d = (id && this.docs.get(id)?.doc) || this.lastDoc; if (d) this.cmd({ cmd: "play", doc: { ...d, startIndex: 0 } }); else this.play("page"); },
    hideOnSite: () => {
      void this.saveSettings((s) => { s.sites[this.host] = "hide-controls"; }).then(() => {
        this.refresh();
        this.ui?.toast("Controls hidden on this site", "info", { label: "Settings", run: () => this.post({ t: "open-options" }) });
      });
    },
    moveLauncher: (y) => void this.saveSettings((s) => { s.launcher.y = Math.round(y * 1000) / 1000; }),
    backToCurrent: () => this.backToCurrent(),
    warm: (reason) => this.warm(reason),
    openReader: () => this.openReader(),
  };

  private lastWarm = -Infinity;
  /** Load the model ahead of the click; hover and selection events are noisy, so at most one request per 3 s leaves the page. */
  private warm(reason: "hover" | "selection" | "dock") {
    const now = performance.now();
    if (now - this.lastWarm < 3000) return;
    this.lastWarm = now;
    this.post({ t: "warm", reason });
  }
}

let instance: Promise<Controller> | null = null;
export const boot = (): Promise<Controller> => (instance ??= (async () => { const c = new Controller(); await c.init(); return c; })());
export type { Controller };
