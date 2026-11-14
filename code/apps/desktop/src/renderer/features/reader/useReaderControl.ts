import { useCallback, useEffect, useMemo, useRef, type Dispatch, type RefObject } from "react";
import { playbackRateFor, type PlayerConfig } from "@speakkit/player";
import type { PlayerCommand, PlayerState, ReadDoc, SentenceStart } from "@speakkit/protocol";
import type { AppState } from "../../../shared/ipc";
import type { DocMeta } from "../../../shared/library/contract";
import { change } from "../../change";
import { library } from "../library";
import { fractionAt, SentenceClock, sleepMsPerMinute, SleepTimer, toReadDoc, type ProgressSaver, type ReaderDoc } from "./model";
import type { ReaderAction, ReaderUi } from "./state";

type Send = Dispatch<ReaderAction>;

/** Mutable things the effects and handlers share without re-rendering. */
export interface ReaderRefs {
  scroller: RefObject<HTMLDivElement | null>;
  textRoot: RefObject<HTMLDivElement | null>;
  clock: RefObject<SentenceClock>;
  sleep: RefObject<SleepTimer>;
  /** The view follows the sentence being read; false once the person scrolled away. */
  following: RefObject<boolean>;
  saver: RefObject<ProgressSaver | undefined>;
}

export function useReaderRefs(): ReaderRefs {
  return {
    scroller: useRef<HTMLDivElement>(null),
    textRoot: useRef<HTMLDivElement>(null),
    clock: useRef(new SentenceClock()),
    sleep: useRef(new SleepTimer()),
    following: useRef(true),
    saver: useRef(undefined),
  };
}

/** Tells the sentence clock how long the sentence that just started will be heard. */
export const sentenceClockHandler = (clock: RefObject<SentenceClock>) => (start: SentenceStart) => clock.current.start(performance.now(), start.durationMs / playbackRateFor(start.speed));

interface Args {
  s: AppState;
  autoplay: boolean;
  meta: DocMeta;
  doc: ReaderDoc;
  ui: ReaderUi;
  st: PlayerState;
  refs: ReaderRefs;
  dispatch: Send;
  play(doc: ReadDoc, cfg: PlayerConfig): void;
  command(c: PlayerCommand): void;
}

/** Where reading starts and how Space behaves: first start, restart after an error or the end, pause and resume. */
function usePlayStart({ s, autoplay, meta, doc, ui, st, refs, dispatch, play, command }: Args) {
  const cfg = useMemo(() => ({ port: s.port, token: s.token, voice: ui.voiceId, speed: ui.speed, pause: "short" as const }), [s.port, s.token, ui.voiceId, ui.speed]);
  const resumeIndex = meta.finished ? 0 : Math.min(meta.progress.sentence, Math.max(0, doc.sentences.length - 1));
  const blocked = !!meta.needsOcr || !doc.sentences.length;
  const startAt = useCallback(
    (index: number) => {
      if (!doc.sentences.length) return;
      dispatch({ type: "restart" });
      refs.following.current = true;
      play(toReadDoc(doc, meta, index), cfg);
    },
    [meta, doc, cfg, play, dispatch, refs.following],
  );
  const started = useRef(false);
  useEffect(() => {
    if (autoplay && !started.current && !blocked) {
      started.current = true;
      startAt(resumeIndex);
    }
  }, [autoplay, blocked, resumeIndex, startAt]);

  const toggle = useCallback(() => {
    if (blocked) return;
    if (st.status === "idle") startAt(resumeIndex);
    else if (st.status === "error") startAt(st.sentenceIndex);
    else if (st.status === "finished") startAt(0);
    else command({ cmd: "toggle" });
  }, [blocked, st.status, st.sentenceIndex, resumeIndex, startAt, command]);
  return { blocked, resumeIndex, startAt, toggle };
}

/** Playback controls of one reading: where it starts, play or pause, seeking, speed, voice, sleep timer. */
export function useReaderControl(args: Args) {
  const { meta, doc, st, refs, dispatch, command } = args;
  const start = usePlayStart(args);
  const active = st.status === "playing" || st.status === "paused" || st.status === "preparing";
  const seekFraction = (f: number) => {
    if (!active) {
      const i = doc.sentences.findIndex((_, k) => fractionAt(doc, k) >= f);
      return start.startAt(i < 0 ? doc.sentences.length - 1 : i);
    }
    command({ cmd: "seek-ms", deltaMs: f * (st.totalMs || 1) - st.elapsedMs });
  };
  const changeSleep = (min: number | null) => {
    if (min === null) refs.sleep.current.cancel();
    else refs.sleep.current.start(min, Date.now(), sleepMsPerMinute());
    dispatch({ type: "sleep", leftMs: min === null ? 0 : min * sleepMsPerMinute() });
  };
  const changeSpeed = (v: number) => {
    dispatch({ type: "speed", speed: v });
    command({ cmd: "set-speed", speed: v });
    void change({ speed: v });
  };
  const changeVoice = (v: string) => {
    dispatch({ type: "voice", voiceId: v });
    command({ cmd: "set-voice", voice: v });
    void library.setVoice(meta.id, v);
  };
  /** `here` is the sentence the bookmark button saves: the one being heard, else where reading would start. */
  return { ...start, active, here: active ? st.sentenceIndex : start.resumeIndex, seekFraction, changeSleep, changeSpeed, changeVoice };
}
