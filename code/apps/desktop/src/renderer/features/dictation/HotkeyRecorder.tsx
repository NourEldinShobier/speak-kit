import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { Button, Icon, Kbd } from "@speakkit/ui";
import { findConflict, type Slot } from "../../../shared/dictation/conflicts";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { hotkeyLabels, usesAdvancedKey } from "../../../shared/dictation/keys";
import { interpretKeys, REFUSAL_TEXT, type Refusal } from "../../../shared/dictation/recorder-model";
import { dictation, platformName } from "./api";
import { allShortcuts, conflictText } from "./shortcuts-model";

/** What the line under a recorder says. */
export type RecorderNote = { kind: "refused"; text: string } | { kind: "conflict"; text: string } | { kind: "saving" } | { kind: "saved" } | { kind: "failed" };

interface CaptureHandlers {
  keys(hotkey: string, advanced: boolean): void;
  refused(why: Refusal | null): void;
  stop(): void;
}

/** While `active`, the keys held together are collected; when the last one is released they become a shortcut (or a refusal). Escape stops. */
function useKeyCapture(active: boolean, handlers: CaptureHandlers): void {
  const keys = useEffectEvent(handlers.keys);
  const refused = useEffectEvent(handlers.refused);
  const stop = useEffectEvent(handlers.stop);
  useEffect(() => {
    if (!active) return;
    const held = new Set<string>();
    const seen = new Set<string>();
    let altGraph = false;
    const swallow = (e: KeyboardEvent) => (e.preventDefault(), e.stopPropagation());
    const down = (e: KeyboardEvent) => {
      swallow(e);
      if (e.code === "Escape") return stop();
      held.add(e.code);
      seen.add(e.code);
      altGraph ||= e.getModifierState?.("AltGraph") === true;
      refused(null);
    };
    const up = (e: KeyboardEvent) => {
      swallow(e);
      held.delete(e.code);
      if (held.size > 0 || seen.size === 0) return;
      const r = interpretKeys([...seen], { altGraph });
      seen.clear();
      altGraph = false;
      if (r.ok) keys(r.hotkey, r.advanced);
      else refused(r.refusal);
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [active]);
}

/** Waits for a press on the mouse; the button pressed becomes the shortcut. Leaving the page ends the wait. */
function useMouseLearn(commit: (value: string) => Promise<void>, setNote: (n: RecorderNote | null) => void) {
  const [learning, setLearning] = useState(false);
  useEffect(() => (learning ? () => void dictation.cancelLearnButton() : undefined), [learning]);
  const start = async () => {
    setNote(null);
    setLearning(true);
    const r = await dictation.learnButton();
    setLearning(false);
    if (r.ok) void commit(r.id);
    else if (r.reason !== "cancelled") setNote({ kind: "refused", text: MOUSE_FAILED[r.reason] });
  };
  return { learning, start: () => void start(), cancel: () => void dictation.cancelLearnButton() };
}

interface Props {
  /** With `status`, the slot is checked against the other shortcuts; a recorder without them leaves both out. */
  slot?: Slot;
  /** Accessible name of the control group, for example "Dictation shortcut". */
  label: string;
  /** The stored shortcut; "" is not set. */
  value: string;
  status?: DictationStatus;
  /** Saves the shortcut; resolves with the status after the save. The page shows Saved only after this resolves. */
  save(value: string): Promise<DictationStatus | void>;
  /** The value Restore default goes back to; the button is disabled while it is already in use. */
  restore?: string;
  /** Called with the keys of a shortcut that needs the advanced warning before it is saved. */
  confirmAdvanced?: (hotkey: string) => Promise<boolean>;
  onRecording?: (on: boolean) => void;
  /** Offers a Logitech mouse button as the shortcut (Windows only), next to the keys. */
  mouse?: boolean;
}

const MOUSE_FAILED = {
  unavailable: "No Logitech mouse answered. Turn it on, connect it and try again.",
  timeout: "No button was pressed. Try again.",
} as const;

const refusalText = (why: Refusal): string => (why === "needs-key" && platformName() === "darwin" ? "Use a modifier such as Command, or a key such as F9." : REFUSAL_TEXT[why]);

const Chips = ({ value }: { value: string }) => (
  <span className="dict-hotkey__chips">
    {hotkeyLabels(value, platformName()).map((k) => (
      <Kbd key={k}>{k}</Kbd>
    ))}
  </span>
);

function RecordingRow({ label, prompt, stop, line }: { label: string; prompt: string; stop(): void; line: ReactNode }) {
  return (
    <div className="dict-hotkey" role="group" aria-label={label}>
      <div className="dict-hotkey__field" role="status" aria-live="polite">
        <i className="dict-hotkey__dot" />
        {prompt}
      </div>
      <Button onClick={stop}>Cancel</Button>
      {line}
    </div>
  );
}

/**
 * One shortcut as keycaps and Change, a recorder while changing, and a line for the result: refused keys, a clash with another shortcut, saving, saved,
 * could not save. The row has a fixed width so the buttons never move while the state changes.
 */
export function HotkeyRecorder({ slot, label, value, status, save, restore, confirmAdvanced, onRecording, mouse }: Props) {
  const [recording, setRecordingState] = useState(false);
  const [note, setNote] = useState<RecorderNote | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const setRecording = (on: boolean) => (setRecordingState(on), onRecording?.(on));
  const stop = () => (setRecording(false), setNote(null));

  const commit = async (next: string) => {
    const other = slot && status ? findConflict(allShortcuts(status), slot, next) : undefined;
    if (other) return setNote({ kind: "conflict", text: conflictText(next, other) });
    if (usesAdvancedKey(next) && confirmAdvanced && !(await confirmAdvanced(next))) return stop();
    setRecording(false);
    setNote({ kind: "saving" });
    try {
      const after = await save(next);
      if (after?.rejected && after.rejected.slot === slot) return setNote({ kind: "conflict", text: conflictText(next, after.rejected.with) });
      setNote({ kind: "saved" });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setNote((n) => (n?.kind === "saved" ? null : n)), 2500);
    } catch {
      setNote({ kind: "failed" });
    }
  };

  const mouseLearn = useMouseLearn(commit, setNote);

  useKeyCapture(recording, {
    keys: (hotkey) => void commit(hotkey),
    refused: (why) => setNote(why ? { kind: "refused", text: refusalText(why) } : null),
    stop,
  });

  const line = note && <RecorderLine note={note} value={value} ready={status?.hotkeyReady ?? true} />;
  if (recording) return <RecordingRow label={label} prompt="Press the new keys" stop={stop} line={line} />;
  if (mouseLearn.learning) return <RecordingRow label={label} prompt="Press a button on your mouse" stop={mouseLearn.cancel} line={line} />;
  return (
    <div className="dict-hotkey" role="group" aria-label={label}>
      <Resting
        label={label}
        value={value}
        restore={restore}
        start={() => (setNote(null), setRecording(true))}
        mouse={mouse && platformName() === "win32" ? mouseLearn.start : undefined}
        commit={(v) => void commit(v)}
      />
      {line}
    </div>
  );
}

interface RestingProps {
  label: string;
  value: string;
  restore: string | undefined;
  start(): void;
  /** Learns a mouse button; absent where the shortcut cannot be one. */
  mouse: (() => void) | undefined;
  commit(value: string): void;
}

/** The row when nothing is being recorded: keycaps with Change (and Restore default), or Not set with an add button. */
function Resting({ label, value, restore, start, mouse, commit }: RestingProps) {
  const mouseButton = mouse && (
    <Button aria-label={`Use a mouse button for ${label}`} onClick={mouse}>
      Mouse button
    </Button>
  );
  if (!value)
    return (
      <>
        <span className="dict-hotkey__unset">Not set</span>
        <Button aria-label={`Add shortcut: ${label}`} onClick={start}>
          Add shortcut
        </Button>
        {mouseButton}
      </>
    );
  return (
    <>
      <Chips value={value} />
      <Button aria-label={`Change ${label}`} onClick={start}>
        Change
      </Button>
      {mouseButton}
      {restore !== undefined && (
        <Button aria-label={`Restore the default ${label}`} disabled={value === restore} onClick={() => commit(restore)}>
          Restore default
        </Button>
      )}
    </>
  );
}

function RecorderLine({ note, value, ready }: { note: RecorderNote; value: string; ready: boolean }) {
  switch (note.kind) {
    case "refused":
    case "conflict":
      return (
        <span className="dict-hotkey__problem" role="alert">
          {note.text}
        </span>
      );
    case "saving":
      return (
        <span className="dict-hotkey__note" role="status">
          Saving
        </span>
      );
    case "saved":
      return (
        <span className="dict-hotkey__note dict-hotkey__note--ok" role="status">
          <Icon name="check" size={12} /> Saved. {ready ? `Try it: press ${hotkeyLabels(value, platformName()).join(" ")}.` : "Waiting for the keyboard listener to start before you can try it."}
        </span>
      );
    case "failed":
      return (
        <span className="dict-hotkey__problem" role="alert">
          Could not save. The shortcut was not changed.
        </span>
      );
  }
}
