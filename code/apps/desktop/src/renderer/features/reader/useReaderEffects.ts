import { useEffect, type Dispatch, type RefObject } from "react";
import type { PlayerCommand, PlayerState } from "@speakkit/protocol";
import { api, useVisible } from "../../ui";
import { library } from "../library";
import { buildDoc, fractionAt, wordAt, ProgressSaver, type ReaderDoc, type ReaderSentence, type SentenceClock, type SleepTimer } from "./model";
import { rangeIn } from "./useHighlights";
import type { ReaderAction } from "./state";

type Send = Dispatch<ReaderAction>;

/** Loads the reading and the voice list; "missing" when the reading was deleted. */
export function useReaderLoad(id: string, dispatch: Send) {
  useEffect(() => {
    let live = true;
    void library.get(id).then((d) => {
      if (!live) return;
      if (!d) return dispatch({ type: "missing" });
      const { blocks, ...meta } = d;
      dispatch({ type: "loaded", meta, doc: buildDoc(blocks) });
      void library.markOpened(id);
    });
    void api.voices().then(
      (v) => live && dispatch({ type: "voices", voices: v.voices }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [id, dispatch]);
}

/** Saves where the person is: on every sentence change (debounced by the saver), on pause, on finish and on leaving. */
export function useProgressSaving({ id, doc, st, saver }: { id: string; doc: ReaderDoc; st: PlayerState; saver: RefObject<ProgressSaver | undefined> }) {
  const active = st.status === "playing" || st.status === "paused" || st.status === "preparing";
  useEffect(() => {
    saver.current = new ProgressSaver((p) => void library.setProgress(id, p), Date.now);
    return () => saver.current?.flush();
  }, [id, saver]);
  useEffect(() => {
    if (!active) return;
    saver.current?.update({ sentence: st.sentenceIndex, fraction: fractionAt(doc, st.sentenceIndex) });
    if (st.status === "paused") saver.current?.flush();
  }, [doc, active, st.sentenceIndex, st.status, saver]);
  useEffect(() => {
    if (st.status !== "finished") return;
    saver.current?.update({ sentence: 0, fraction: 1 }); // replaces a pending mid-reading save
    saver.current?.flush();
  }, [st.status, saver]);
}

/** Keeps the sentence clock in step with the player and estimates the spoken word from it, once per frame while playing. */
export function useWordTick({ status, sentence, clock, dispatch }: { status: PlayerState["status"]; sentence: ReaderSentence | undefined; clock: RefObject<SentenceClock>; dispatch: Send }) {
  useEffect(() => {
    const c = clock.current;
    if (status === "paused") c.pause(performance.now());
    else if (status === "playing") c.resume(performance.now());
    else if (status !== "preparing") c.stop();
  }, [status, clock]);
  useEffect(() => {
    if (status !== "playing" || !sentence) return dispatch({ type: "word", word: undefined });
    let raf = 0;
    const tick = () => {
      dispatch({ type: "word", word: wordAt(sentence.text, clock.current.fraction(performance.now())) });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, sentence, clock, dispatch]);
}

/** One timeout pauses the reading at the expiry time; the countdown display ticks once a second only while the window is visible. */
export function useSleepTimer({ sleepLeft, sleep, command, dispatch }: { sleepLeft: number; sleep: RefObject<SleepTimer>; command: (c: PlayerCommand) => void; dispatch: Send }) {
  const visible = useVisible();
  const timerOn = sleepLeft > 0;
  useEffect(() => {
    if (!timerOn) return;
    const t = setTimeout(() => {
      sleep.current.cancel();
      command({ cmd: "pause" });
      dispatch({ type: "sleep", leftMs: 0 });
    }, sleep.current.remainingMs(Date.now()));
    return () => clearTimeout(t);
  }, [timerOn, command, sleep, dispatch]);
  useEffect(() => {
    if (!timerOn || !visible) return;
    const t = setInterval(() => dispatch({ type: "sleep", leftMs: Math.max(1, sleep.current.remainingMs(Date.now())) }), 1000);
    return () => clearInterval(t);
  }, [timerOn, visible, sleep, dispatch]);
}

interface FollowArgs {
  sentence: ReaderSentence | undefined;
  follow: boolean;
  following: RefObject<boolean>;
  scroller: RefObject<HTMLDivElement | null>;
  textRoot: RefObject<HTMLDivElement | null>;
  scrollToCurrent(): void;
}

/** Scrolls the sentence into view when it nears the edge, unless the person scrolled away. */
export function useFollowScroll({ sentence, follow, following, scroller, textRoot, scrollToCurrent }: FollowArgs) {
  useEffect(() => {
    const sc = scroller.current;
    const root = textRoot.current;
    if (!sentence || !sc || !root || !following.current || !follow) return;
    const rect = rangeIn(root, sentence.block, sentence.start, sentence.end)?.getBoundingClientRect();
    const box = sc.getBoundingClientRect();
    if (rect && (rect.top < box.top + 40 || rect.bottom > box.bottom - 40)) scrollToCurrent();
  }, [sentence, follow, following, scroller, textRoot, scrollToCurrent]);
}

interface KeyArgs {
  active: boolean;
  findOpen: boolean;
  toggle(): void;
  command(c: PlayerCommand): void;
  dispatch: Send;
}

/** Ctrl or Cmd F finds, Escape closes the find bar, Space plays or pauses, the arrows skip 10 seconds. */
export function useReaderKeys({ active, findOpen, toggle, command, dispatch }: KeyArgs) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, [role=dialog], [role=slider]");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        dispatch({ type: "find-open" });
      } else if (e.key === "Escape" && findOpen) dispatch({ type: "find-close" });
      else if (typing) return;
      else if (e.key === " ") {
        e.preventDefault();
        toggle();
      } else if (active && e.key === "ArrowRight") command({ cmd: "seek-ms", deltaMs: 10_000 });
      else if (active && e.key === "ArrowLeft") command({ cmd: "seek-ms", deltaMs: -10_000 });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, active, findOpen, command, dispatch]);
}
