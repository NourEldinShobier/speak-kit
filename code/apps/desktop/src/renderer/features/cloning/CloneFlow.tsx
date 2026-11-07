import { useEffect, useReducer, useRef, useState } from "react";
import { Banner, Button } from "@speakkit/ui";
import { CLONE_MAX_MS, CLONE_MIN_MS } from "@speakkit/protocol";
import type { AppState } from "../../../shared/ipc";
import { toDesktopError } from "../../../shared/errors";
import { usePlayer } from "../../pages";
import { api, cleanError, Page, playAudio } from "../../ui";
import { ChooseScreen, MicDialog, RecordingScreen, ReviewScreen } from "./ChooseScreens";
import { decodeTake, takeAudio, UnreadableAudio } from "./decode";
import { cloneReducer, engineWait, initClone, testSentence, type CloneAction, type CloneState } from "./model";
import { micProblem, startRecording, type Recording } from "./recorder";
import { AnalyzingScreen, NamingScreen, RejectedScreen } from "./ResultScreens";

const sec = (ms: number) => `${Math.round(ms / 1000)}`;
const LEAD: Record<CloneState["step"], (s: CloneState) => string> = {
  choose: () => `Give Chatterbox ${sec(CLONE_MIN_MS)} to ${sec(CLONE_MAX_MS)} seconds of one person speaking clearly.`,
  recording: () => "Recording. Read a few sentences aloud in your normal voice.",
  review: () => "Listen to your take before it is used.",
  analyzing: () => "Analyzing your clip. This takes about a minute.",
  rejected: () => "This clip cannot be used yet.",
  naming: () => "Your voice is ready. Name it and hear a test.",
  done: (s) => (s.step === "done" ? `${s.name} is ready.` : ""),
};

const clipName = (label: string) => label.replace(/\.[^.]+$/, "").slice(0, 60) || "Recording";
/** A voice that could not be deleted stays listed under Your voices, where it can be deleted again: nothing more to do here. */
const leftBehind = (): void => {};
const forget = (id: string) => void api.deleteClonedVoice(id).catch(leftBehind);

/** What the server said about a clip becomes a screen: a rejected clip is G7, anything else goes back with a message. */
function failure(e: unknown): CloneAction {
  const err = toDesktopError(e);
  return err.code === "clip-rejected" ? { type: "clone-rejected", message: err.args.message, checks: err.args.checks } : { type: "clone-failed", message: cleanError(e) };
}

/** The voice the flow has created on the server but not saved yet. */
function pendingVoice(st: CloneState): string | null {
  if (st.step === "naming") return st.voice.id;
  return st.step === "analyzing" ? (st.voice?.id ?? null) : null;
}

/** Sends the take to the server while the flow is on the "checking" phase. A result that arrives after the person left is discarded. */
function useCloneRequest(st: CloneState, dispatch: (a: CloneAction) => void) {
  const take = st.step === "analyzing" && st.phase === "checking" ? st.take : null;
  useEffect(() => {
    if (!take) return;
    let alive = true;
    api.cloneVoice({ name: clipName(take.label), consent: true, audio: take.wav }).then(
      (voice) => (alive ? dispatch({ type: "cloned", voice }) : forget(voice.id)),
      (e) => alive && dispatch(failure(e)),
    );
    return () => {
      alive = false;
    };
  }, [take, dispatch]);
}

/** Makes Chatterbox the engine in use and follows its load from the health the app already polls. */
function useEngineLoad(st: CloneState, s: AppState, dispatch: (a: CloneAction) => void) {
  const voice = st.step === "analyzing" && st.phase === "loading" ? st.voice : null;
  const wait = engineWait(s.health);
  const failed = wait.kind === "failed" ? wait.message : null;
  useEffect(() => {
    if (!voice) return;
    api
      .selectEngine("chatterbox")
      .then(() => api.warmEngine())
      .catch((e) => {
        forget(voice.id);
        dispatch({ type: "clone-failed", message: cleanError(e) });
      });
  }, [voice, dispatch]);
  useEffect(() => {
    if (!voice) return;
    if (wait.kind === "ready") dispatch({ type: "engine-ready" });
    if (failed !== null) {
      forget(voice.id);
      dispatch({ type: "clone-failed", message: failed });
    }
  }, [voice, wait.kind, failed, dispatch]);
  return wait.kind === "waiting" ? wait.progress : null;
}

/** The recorder and the take player: what must be stopped when the flow is left. */
function useMedia(dispatch: (a: CloneAction) => void) {
  const rec = useRef<Recording | null>(null);
  const starting = useRef<AbortController | null>(null);
  const stopTake = useRef<(() => void) | null>(null);
  const [takePlaying, setTakePlaying] = useState(false);
  /** Ends the recording, or the start still waiting for the permission prompt. */
  const cancelRecording = () => {
    starting.current?.abort();
    rec.current?.cancel();
  };
  useEffect(
    () => () => {
      cancelRecording();
      stopTake.current?.();
    },
    [],
  );
  const record = async () => {
    dispatch({ type: "record-start" });
    const ac = (starting.current = new AbortController());
    try {
      rec.current = await startRecording(
        {
          onTick: (elapsedMs, level) => dispatch({ type: "record-tick", elapsedMs, level }),
          onDone: (take) => dispatch({ type: "record-done", take }),
          onFailed: (problem, message) => dispatch({ type: "record-failed", problem, message }),
        },
        ac.signal,
      );
    } catch (e) {
      if (ac.signal.aborted) return; // cancelled while the prompt was open: nothing to report
      const problem = micProblem(e);
      dispatch({ type: "record-failed", problem, message: `The microphone could not be used: ${e instanceof Error ? e.message : String(e)}` });
    }
  };
  const playTake = (st: CloneState) => {
    if (takePlaying) return stopTake.current?.();
    if (st.step !== "review") return;
    setTakePlaying(true);
    stopTake.current = playAudio(takeAudio(st.take), () => setTakePlaying(false));
  };
  return { rec, record, cancelRecording, playTake, takePlaying };
}

/** A reference file: the file dialog, then the audio is decoded in this window. Cancelling the dialog is not an error. */
async function pickTake(dispatch: (a: CloneAction) => void) {
  dispatch({ type: "pick-start" });
  try {
    const file = await api.pickReference();
    if (!file) return dispatch({ type: "pick-failed", message: "" });
    dispatch({ type: "picked", take: await decodeTake(file.bytes, file.name) });
  } catch (e) {
    dispatch({ type: "pick-failed", message: e instanceof UnreadableAudio ? `${e.message} could not be read as audio.` : cleanError(e) });
  }
}

interface Flow {
  s: AppState;
  st: CloneState;
  dispatch: (a: CloneAction) => void;
  media: ReturnType<typeof useMedia>;
  progress: number | null;
  cancel(): void;
}

/** G3, G4, G15: choosing and recording the reference. */
function ReferenceScreens({ st, dispatch, media, cancel }: Flow) {
  if (st.step === "choose") {
    const go = () => void (st.source === "record" ? media.record() : pickTake(dispatch));
    return <ChooseScreen state={st} onConsent={(on) => dispatch({ type: "consent", on })} onSource={(source) => dispatch({ type: "source", source })} onContinue={go} onCancel={cancel} />;
  }
  if (st.step === "recording") {
    const stop = () => media.rec.current?.stop();
    const abort = () => {
      media.cancelRecording();
      dispatch({ type: "back" });
    };
    return <RecordingScreen elapsedMs={st.elapsedMs} level={st.level} onStop={stop} onCancel={abort} />;
  }
  if (st.step !== "review") return null;
  const again = () => void media.record();
  return <ReviewScreen take={st.take} playing={media.takePlaying} onPlay={() => media.playTake(st)} onAgain={again} onUse={() => dispatch({ type: "use-take" })} />;
}

/** G5, G7, G6 and the success message. */
function ResultScreens({ st, dispatch, media, progress, cancel, onClose }: Flow & { onClose(saved?: string): void }) {
  const player = usePlayer();
  if (st.step === "analyzing") return <AnalyzingScreen state={st} progress={progress} onCancel={cancel} />;
  if (st.step === "rejected") return <RejectedScreen message={st.message} checks={st.checks} onUpload={() => void pickTake(dispatch)} onRecord={() => void media.record()} />;
  if (st.step === "done") return <Saved name={st.name} onDone={() => onClose(st.name)} />;
  if (st.step !== "naming") return null;
  const playTest = async () => {
    try {
      await api.updateClonedVoice(st.voice.id, { exaggeration: st.exaggeration }); // the test uses the style on the slider
      await player.toggle(st.voice.id, testSentence(st.name), "clone-test");
    } catch (e) {
      dispatch({ type: "save-failed", message: cleanError(e) });
    }
  };
  const save = async () => {
    dispatch({ type: "save-start" });
    try {
      await api.updateClonedVoice(st.voice.id, { name: st.name.trim(), exaggeration: st.exaggeration });
      dispatch({ type: "saved" });
    } catch (e) {
      dispatch({ type: "save-failed", message: cleanError(e) });
    }
  };
  return (
    <NamingScreen
      state={st}
      playing={player.playing === "clone-test"}
      onName={(name) => dispatch({ type: "rename", name })}
      onStyle={(exaggeration) => dispatch({ type: "style", exaggeration })}
      onPlay={() => void playTest()}
      onSave={() => void save()}
      onCancel={cancel}
    />
  );
}

function Saved({ name, onDone }: { name: string; onDone(): void }) {
  return (
    <>
      <Banner tone="info" icon="circle-check" title={`${name} is saved`}>
        It is under Your voices, where you can preview it, change its style or delete it. The reference clip stays on this computer as the voice file.
      </Banner>
      <div className="sk-clone-actions">
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    </>
  );
}

/** G3 to G7, G15 and K6: the cloning flow on the Voices page. `onClose` gets the name of the voice that was saved, or nothing. */
export function CloneFlow({ s, onClose }: { s: AppState; onClose(saved?: string): void }) {
  const [st, dispatch] = useReducer(cloneReducer, undefined, initClone);
  const media = useMedia(dispatch);
  const pending = useRef<string | null>(null);
  pending.current = pendingVoice(st);
  useCloneRequest(st, dispatch);
  const progress = useEngineLoad(st, s, dispatch);
  useEffect(() => () => void (pending.current && forget(pending.current)), []);
  const cancel = () => {
    if (pending.current) forget(pending.current);
    pending.current = null;
    onClose();
  };
  const flow: Flow = { s, st, dispatch, media, progress, cancel };
  const upload = () => {
    dispatch({ type: "dismiss-mic" });
    void pickTake(dispatch);
  };
  return (
    <Page title="Clone a voice" lead={LEAD[st.step](st)}>
      <ReferenceScreens {...flow} />
      <ResultScreens {...flow} onClose={onClose} />
      <MicDialog
        problem={st.step === "choose" ? st.mic : null}
        platform={s.platform}
        onUpload={upload}
        onSettings={() => void api.openExternal("microphone-settings")}
        onClose={() => dispatch({ type: "dismiss-mic" })}
      />
    </Page>
  );
}
