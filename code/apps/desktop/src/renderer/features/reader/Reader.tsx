import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, Icon, IconButton, Spinner } from "@speakkit/ui";
import { playbackRateFor } from "@speakkit/player";
import type { SentenceStart, Voice } from "@speakkit/protocol";
import type { DocMeta } from "../../../main/library/contract";
import type { AppState } from "../../../shared/ipc";
import { api } from "../../ui";
import { library } from "../library/api";
import { estimateMs } from "../library/model";
import { DisplayPopover } from "./DisplayPopover";
import { OcrPanel } from "./OcrPanel";
import { FinishedCard, FindBar, OutlinePanel } from "./Panels";
import { PlayerBar } from "./PlayerBar";
import { ReaderText, type TextClick } from "./ReaderText";
import { FONT_STACK, useDisplay } from "./display";
import { buildDoc, findMatches, fractionAt, outline, ProgressSaver, SentenceClock, sentenceAt, SleepTimer, toReadDoc, wordAt, type ReaderDoc } from "./model";
import { rangeIn, useHighlights } from "./useHighlights";
import { useReaderPlayer } from "./usePlayer";
import "./reader.css";

interface Loaded {
  meta: DocMeta;
  doc: ReaderDoc;
}

const SOURCE_LABEL = { paste: "Pasted text", file: "File", url: "Web page" } as const;

export function Reader({ s, id, autoplay, onBack }: { s: AppState; id: string; autoplay: boolean; onBack(): void }) {
  const [loaded, setLoaded] = useState<Loaded | null | "missing">(null);
  const [display, setDisplay] = useDisplay();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [speed, setSpeed] = useState(s.config.speed);
  const [voiceId, setVoiceId] = useState(s.config.voice);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [find, setFind] = useState<{ open: boolean; query: string; current: number }>({ open: false, query: "", current: 0 });
  const [pick, setPick] = useState<(TextClick & { sentence: number }) | null>(null);
  const [away, setAway] = useState(false);
  const [dismissedFinish, setDismissedFinish] = useState(false);
  const [sleepLeft, setSleepLeft] = useState(0);
  const [word, setWord] = useState<ReturnType<typeof wordAt>>();

  const scroller = useRef<HTMLDivElement>(null);
  const textRoot = useRef<HTMLDivElement>(null);
  const clock = useRef(new SentenceClock());
  const sleep = useRef(new SleepTimer());
  const following = useRef(true);
  const saver = useRef<ProgressSaver>(undefined);

  const onSentence = useCallback((start: SentenceStart) => clock.current.start(performance.now(), start.durationMs / playbackRateFor(start.speed)), []);
  const { state: st, play, command } = useReaderPlayer(onSentence);
  const active = st.status === "playing" || st.status === "paused" || st.status === "preparing";

  // ---- load ----
  useEffect(() => {
    let live = true;
    void library.get(id).then((d) => {
      if (!live) return;
      if (!d) return setLoaded("missing");
      const { blocks, ...meta } = d;
      setLoaded({ meta, doc: buildDoc(blocks) });
      if (meta.voice) setVoiceId(meta.voice);
      void library.markOpened(id);
    });
    void api.voices().then((v) => live && setVoices(v.voices), () => {});
    return () => {
      live = false;
    };
  }, [id]);

  const meta = loaded && loaded !== "missing" ? loaded.meta : undefined;
  const doc = loaded && loaded !== "missing" ? loaded.doc : undefined;
  const cfg = useMemo(() => ({ port: s.port, token: s.token, voice: voiceId, speed, pause: "short" as const }), [s.port, s.token, voiceId, speed]);
  const resumeIndex = meta && doc && !meta.finished ? Math.min(meta.progress.sentence, Math.max(0, doc.sentences.length - 1)) : 0;
  const blocked = !!meta?.needsOcr || !doc?.sentences.length;

  const startAt = useCallback(
    (index: number) => {
      if (!meta || !doc || !doc.sentences.length) return;
      setDismissedFinish(false);
      following.current = true;
      setAway(false);
      play(toReadDoc(doc, meta, index), cfg);
    },
    [meta, doc, cfg, play],
  );

  const started = useRef(false);
  useEffect(() => {
    if (autoplay && !started.current && meta && doc && !blocked) {
      started.current = true;
      startAt(resumeIndex);
    }
  }, [autoplay, meta, doc, blocked, resumeIndex, startAt]);

  // ---- progress ----
  useEffect(() => {
    saver.current = new ProgressSaver((p) => void library.setProgress(id, p), Date.now);
    return () => saver.current?.flush();
  }, [id]);
  useEffect(() => {
    if (!doc || !active) return;
    saver.current?.update({ sentence: st.sentenceIndex, fraction: fractionAt(doc, st.sentenceIndex) });
    if (st.status === "paused") saver.current?.flush();
  }, [doc, active, st.sentenceIndex, st.status]);
  useEffect(() => {
    if (st.status === "finished") void library.setProgress(id, { sentence: 0, fraction: 1 });
  }, [st.status, id]);

  // ---- highlight, word estimate, follow ----
  const sentence = doc && active ? doc.sentences[st.sentenceIndex] : undefined;
  const matches = useMemo(() => (doc && find.open ? findMatches(doc.blocks, find.query) : []), [doc, find.open, find.query]);
  useHighlights(textRoot, { sentence, word, matches, current: find.current });

  useEffect(() => {
    const c = clock.current;
    if (st.status === "paused") c.pause(performance.now());
    else if (st.status === "playing") c.resume(performance.now());
    else if (st.status !== "preparing") c.stop();
  }, [st.status]);
  useEffect(() => {
    if (st.status !== "playing" || !sentence) return setWord(undefined);
    let raf = 0;
    const tick = () => {
      const w = wordAt(sentence.text, clock.current.fraction(performance.now()));
      setWord((cur) => (cur && w && cur.start === w.start ? cur : w));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [st.status, sentence]);

  const scrollToCurrent = useCallback(() => {
    const sc = scroller.current;
    const root = textRoot.current;
    if (!sc || !root || !sentence) return;
    const rect = rangeIn(root, sentence.block, sentence.start, sentence.end)?.getBoundingClientRect();
    const box = sc.getBoundingClientRect();
    if (rect) sc.scrollTo({ top: sc.scrollTop + rect.top - box.top - box.height * 0.35, behavior: "smooth" });
  }, [sentence]);
  useEffect(() => {
    if (!sentence) return;
    const sc = scroller.current;
    const root = textRoot.current;
    if (!sc || !root || !following.current || !display.follow) return;
    const rect = rangeIn(root, sentence.block, sentence.start, sentence.end)?.getBoundingClientRect();
    const box = sc.getBoundingClientRect();
    if (rect && (rect.top < box.top + 40 || rect.bottom > box.bottom - 40)) scrollToCurrent();
  }, [sentence, display.follow, scrollToCurrent]);
  const leaveFollow = () => {
    if (following.current && st.status === "playing") {
      following.current = false;
      setAway(true);
    }
  };

  // ---- sleep timer ----
  useEffect(() => {
    if (sleepLeft <= 0) return;
    const t = setInterval(() => {
      if (sleep.current.expired(Date.now())) {
        command({ cmd: "pause" });
        setSleepLeft(0);
      } else setSleepLeft(sleep.current.remainingMs(Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [sleepLeft > 0, command]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- keyboard ----
  const toggle = useCallback(() => {
    if (blocked) return;
    if (st.status === "idle" || st.status === "finished" || st.status === "error") startAt(st.status === "idle" ? resumeIndex : st.status === "error" ? st.sentenceIndex : 0);
    else command({ cmd: "toggle" });
  }, [blocked, st.status, st.sentenceIndex, resumeIndex, startAt, command]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, [role=dialog], [role=slider]");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFind((f) => ({ ...f, open: true }));
      } else if (e.key === "Escape" && find.open) setFind({ open: false, query: "", current: 0 });
      else if (!typing && e.key === " ") {
        e.preventDefault();
        toggle();
      } else if (!typing && active && e.key === "ArrowRight") command({ cmd: "seek-ms", deltaMs: 10_000 });
      else if (!typing && active && e.key === "ArrowLeft") command({ cmd: "seek-ms", deltaMs: -10_000 });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, active, find.open, command]);

  // ---- actions ----
  const stepFind = (dir: 1 | -1) => {
    if (!matches.length) return;
    const current = (find.current + dir + matches.length) % matches.length;
    setFind({ ...find, current });
    const m = matches[current]!;
    textRoot.current?.querySelector(`[data-block="${m.block}"]`)?.scrollIntoView({ block: "center" });
  };
  const seekFraction = (f: number) => {
    if (!doc) return;
    if (!active) {
      const i = doc.sentences.findIndex((_, k) => fractionAt(doc, k) >= f);
      return startAt(i < 0 ? doc.sentences.length - 1 : i);
    }
    command({ cmd: "seek-ms", deltaMs: f * (st.totalMs || 1) - st.elapsedMs });
  };
  const changeSpeed = (v: number) => {
    setSpeed(v);
    command({ cmd: "set-speed", speed: v });
    void api.patchConfig({ speed: v });
  };
  const changeVoice = (v: string) => {
    setVoiceId(v);
    command({ cmd: "set-voice", voice: v });
    void library.setVoice(id, v);
  };
  const changeSleep = (min: number | null) => {
    if (min === null) {
      sleep.current.cancel();
      setSleepLeft(0);
    } else {
      sleep.current.start(min, Date.now());
      setSleepLeft(min * 60_000);
    }
  };
  const readFrom = (sentenceIndex: number) => {
    setPick(null);
    if (active) command({ cmd: "seek-sentence", index: sentenceIndex });
    else startAt(sentenceIndex);
  };
  const jumpTo = (block: number) => {
    textRoot.current?.querySelector(`[data-block="${block}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    const first = doc?.firstSentence[block] ?? -1;
    if (active && first >= 0) {
      following.current = true;
      command({ cmd: "seek-sentence", index: first });
    }
  };
  const outlineItems = useMemo(() => (doc && meta ? outline(doc.blocks, meta.format === "pdf") : []), [doc, meta]);
  const refresh = () =>
    library.get(id).then((d) => {
      if (!d) return;
      const { blocks, ...m } = d;
      setLoaded({ meta: m, doc: buildDoc(blocks) });
    });

  if (loaded === "missing")
    return (
      <div className="rd rd--empty">
        <Banner tone="warning" title="This reading is gone" action={<Button size="sm" onClick={onBack}>Back to library</Button>}>It was deleted from the library.</Banner>
      </div>
    );
  if (!meta || !doc) return <div className="rd rd--empty"><Spinner size={20} /></div>;

  const style = { "--rd-size": `${display.size}px`, "--rd-line": display.line, "--rd-width": `${display.width}px`, "--rd-font": FONT_STACK[display.font] } as React.CSSProperties;
  return (
    <div className="rd" data-theme={display.theme === "app" ? undefined : display.theme} style={style} data-testid="reader" data-status={st.status}>
      <header className="rd-top">
        <IconButton name="arrow-left" label="Back to library" onClick={onBack} />
        <button type="button" className="rd-crumb" onClick={onBack}>Library</button>
        <span className="rd-source">{SOURCE_LABEL[meta.source]} · {meta.origin}</span>
        <span className="rd-spacer" />
        <IconButton name="search" label="Find in text" onClick={() => setFind((f) => ({ ...f, open: true }))} />
        <DisplayPopover d={display} onChange={setDisplay} />
        <IconButton name="layout-sidebar-right" label="Outline" aria-pressed={outlineOpen} onClick={() => setOutlineOpen(!outlineOpen)} />
      </header>
      {find.open && <FindBar query={find.query} count={matches.length} current={find.current} onQuery={(query) => setFind({ open: true, query, current: 0 })} onStep={stepFind} onClose={() => setFind({ open: false, query: "", current: 0 })} />}
      <div className="rd-main">
        <div className="rd-scroll" ref={scroller} onWheel={leaveFollow} onPointerDown={leaveFollow} data-testid="reader-scroll">
          <article className="rd-article" ref={textRoot}>
            <h1 className="rd-title">{meta.title}</h1>
            <p className="rd-meta">{meta.wordCount.toLocaleString()} words{meta.pages ? ` · ${meta.pages} pages` : ""}</p>
            {meta.needsOcr && <OcrPanel id={id} pages={meta.pages ?? 0} onDone={() => void refresh()} />}
            {st.error && <Banner tone="error" title="Reading stopped" action={<Button size="sm" onClick={toggle}>Try again</Button>}>{st.error.message}</Banner>}
            <ReaderText blocks={doc.blocks} onPick={(c) => setPick({ ...c, sentence: sentenceAt(doc, c.block, c.offset) })} />
          </article>
          {pick && (
            <div className="rd-chip" style={{ left: pick.x, top: pick.y - 44 }} role="toolbar">
              <Button size="sm" variant="primary" iconLeft="player-play" onClick={() => readFrom(pick.sentence)}>Read from here</Button>
              <Button size="sm" iconLeft="copy" onClick={() => { void api.copy(doc.sentences[pick.sentence]?.text ?? ""); setPick(null); }}>Copy</Button>
            </div>
          )}
        </div>
        {outlineOpen && <OutlinePanel items={outlineItems} current={sentence?.block ?? 0} onPick={jumpTo} onClose={() => setOutlineOpen(false)} />}
        {away && st.status === "playing" && (
          <button type="button" className="rd-back" onClick={() => { following.current = true; setAway(false); scrollToCurrent(); }}>
            <Icon name="arrow-down" size={14} /> Back to current
          </button>
        )}
        {st.status === "preparing" && st.elapsedMs > 0 && <div className="rd-prepare" role="status"><Spinner size={14} /> Preparing next paragraph</div>}
        {st.status === "finished" && !dismissedFinish && <FinishedCard title={meta.title} onBack={onBack} onReplay={() => startAt(0)} />}
      </div>
      <PlayerBar
        title={meta.title}
        state={st}
        estimatedTotalMs={estimateMs(meta.wordCount, speed)}
        speed={speed}
        voices={voices}
        voiceId={voiceId}
        sleepLeftMs={sleepLeft}
        disabled={blocked}
        outlineOpen={outlineOpen}
        onToggle={toggle}
        onSkip={(d) => active && command({ cmd: "seek-ms", deltaMs: d })}
        onBlock={(d) => (active ? command({ cmd: d === 1 ? "next-block" : "prev-block" }) : toggle())}
        onSeek={seekFraction}
        onSpeed={changeSpeed}
        onVoice={changeVoice}
        onSleep={changeSleep}
        onOutline={() => setOutlineOpen(!outlineOpen)}
      />
    </div>
  );
}
