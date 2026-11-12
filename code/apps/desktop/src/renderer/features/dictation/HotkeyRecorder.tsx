import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button, Icon, Kbd } from "@speakkit/ui";
import { findConflict, type Slot } from "../../../shared/dictation/conflicts";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { hotkeyLabels, usesAdvancedKey } from "../../../shared/dictation/keys";
import { interpretButton, interpretKeys, REFUSAL_TEXT, type Refusal } from "../../../shared/dictation/recorder-model";
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

/** While `active`, the next mouse button press is the shortcut. The left button is refused, and the page never sees the click. */
function useButtonCapture(active: boolean, h: { pick(key: string): void; refused(why: Refusal): void; stop(): void }): void {
  const pick = useEffectEvent(h.pick);
  const refuse = useEffectEvent(h.refused);
  const cancel = useEffectEvent(h.stop);
  useEffect(() => {
    if (!active) return;
    const swallow = (e: Event) => (e.preventDefault(), e.stopPropagation());
    const down = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest("[data-recorder-control]")) return; // the Cancel button keeps working
      swallow(e);
      const r = interpretButton(e.button);
      if (r.ok) pick(r.key);
      else refuse(r.refusal);
    };
    const key = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      swallow(e);
      cancel();
    };
    window.addEventListener("mousedown", down, true);
    window.addEventListener("contextmenu", swallow, true);
    window.addEventListener("auxclick", swallow, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("contextmenu", swallow, true);
      window.removeEventListener("auxclick", swallow, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [active]);
}

interface Props {
  slot: Slot;
  /** Accessible name of the control group, for example "Dictation shortcut". */
  label: string;
  /** The stored shortcut; "" is not set. */
  value: string;
  status: DictationStatus;
  /** Saves the shortcut; resolves with the status after the save. The page shows Saved only after this resolves. */
  save(value: string): Promise<DictationStatus>;
  /** "Add shortcut" or "Choose button" when nothing is set. */
  addLabel?: string;
  /** Set for a recorder that can be cleared. */
  remove?: boolean;
  /** The value Restore default goes back to; the button is disabled while it is already in use. */
  restore?: string;
  /** Records a mouse button instead of keys. */
  mouse?: boolean;
  /** Called with the keys of a shortcut that needs the advanced warning before it is saved. */
  confirmAdvanced?: (hotkey: string) => Promise<boolean>;
  onRecording?: (on: boolean) => void;
}

const Chips = ({ value }: { value: string }) => (
  <span className="dict-hotkey__chips">
    {hotkeyLabels(value).map((k) => (
      <Kbd key={k}>{k}</Kbd>
    ))}
  </span>
);

/**
 * One shortcut as keycaps and Change, a recorder while changing, and a line for the result: refused keys, a clash with another shortcut, saving, saved,
 * could not save. The row has a fixed width so the buttons never move while the state changes.
 */
export function HotkeyRecorder({ slot, label, value, status, save, addLabel = "Add shortcut", remove, restore, mouse, confirmAdvanced, onRecording }: Props) {
  const [recording, setRecordingState] = useState(false);
  const [note, setNote] = useState<RecorderNote | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const setRecording = (on: boolean) => (setRecordingState(on), onRecording?.(on));
  const stop = () => (setRecording(false), setNote(null));

  const commit = async (next: string) => {
    const other = findConflict(allShortcuts(status), slot, next);
    if (other) return setNote({ kind: "conflict", text: conflictText(next, other) });
    if (usesAdvancedKey(next) && confirmAdvanced && !(await confirmAdvanced(next))) return stop();
    setRecording(false);
    setNote({ kind: "saving" });
    try {
      const after = await save(next);
      if (after.rejected?.slot === slot) return setNote({ kind: "conflict", text: conflictText(next, after.rejected.with) });
      setNote(next && !mouse ? { kind: "saved" } : null);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setNote((n) => (n?.kind === "saved" ? null : n)), 2500);
    } catch {
      setNote({ kind: "failed" });
    }
  };

  useKeyCapture(recording && !mouse, {
    keys: (hotkey) => void commit(hotkey),
    refused: (why) => setNote(why ? { kind: "refused", text: REFUSAL_TEXT[why] } : null),
    stop,
  });
  useButtonCapture(recording && !!mouse, { pick: (key) => void commit(key), refused: (why) => setNote({ kind: "refused", text: REFUSAL_TEXT[why] }), stop });

  const line = note && <RecorderLine note={note} value={value} ready={status.hotkeyReady} />;
  if (recording)
    return (
      <div className="dict-hotkey" role="group" aria-label={label}>
        <div className="dict-hotkey__field" role="status" aria-live="polite">
          <i className="dict-hotkey__dot" />
          {mouse ? "Waiting for a click" : "Press the new keys"}
        </div>
        <Button data-recorder-control onClick={stop}>
          Cancel
        </Button>
        {line}
      </div>
    );
  return (
    <div className="dict-hotkey" role="group" aria-label={label}>
      <Resting label={label} value={value} addLabel={addLabel} restore={restore} remove={remove} start={() => (setNote(null), setRecording(true))} commit={(v) => void commit(v)} />
      {line}
    </div>
  );
}

interface RestingProps {
  label: string;
  value: string;
  addLabel: string;
  restore: string | undefined;
  remove: boolean | undefined;
  start(): void;
  commit(value: string): void;
}

/** The row when nothing is being recorded: keycaps with Change (and Restore default or Remove), or Not set with an add button. */
function Resting({ label, value, addLabel, restore, remove, start, commit }: RestingProps) {
  if (!value)
    return (
      <>
        <span className="dict-hotkey__unset">Not set</span>
        <Button aria-label={`${addLabel}: ${label}`} onClick={start}>
          {addLabel}
        </Button>
      </>
    );
  return (
    <>
      <Chips value={value} />
      <Button aria-label={`Change ${label}`} onClick={start}>
        Change
      </Button>
      {restore !== undefined && (
        <Button aria-label={`Restore the default ${label}`} disabled={value === restore} onClick={() => commit(restore)}>
          Restore default
        </Button>
      )}
      {remove && (
        <Button aria-label={`Remove ${label}`} onClick={() => commit("")}>
          Remove
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
          <Icon name="check" size={12} /> Saved. {ready ? `Try it: press ${hotkeyLabels(value).join(" ")}.` : "Waiting for the keyboard listener to start before you can try it."}
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
