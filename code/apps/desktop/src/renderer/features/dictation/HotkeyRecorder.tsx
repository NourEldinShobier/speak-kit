import { useEffect, useEffectEvent, useState } from "react";
import { Button, Kbd } from "@speakkit/ui";
import { hotkeyFrom, hotkeyLabels } from "../../../shared/dictation/keys";

interface Handlers {
  /** The keys were released as an allowed hotkey. */
  keys(hotkey: string): void;
  /** The keys were released but are not an allowed hotkey (a lone letter, say); `true` while that is the last thing that happened. */
  problem(on: boolean): void;
  stop(): void;
}

/** While `active`, the keys held together are collected; when the last one is released they become a hotkey. Escape stops. */
function useKeyCapture(active: boolean, handlers: Handlers): void {
  const on = useEffectEvent(handlers.keys);
  const problem = useEffectEvent(handlers.problem);
  const stop = useEffectEvent(handlers.stop);
  useEffect(() => {
    if (!active) return;
    const held = new Set<string>();
    const seen = new Set<string>();
    const swallow = (e: KeyboardEvent) => (e.preventDefault(), e.stopPropagation());
    const down = (e: KeyboardEvent) => {
      swallow(e);
      if (e.code === "Escape") return stop();
      held.add(e.code);
      seen.add(e.code);
      problem(false);
    };
    const up = (e: KeyboardEvent) => {
      swallow(e);
      held.delete(e.code);
      if (held.size > 0 || seen.size === 0) return;
      const hotkey = hotkeyFrom([...seen]);
      seen.clear();
      if (hotkey) on(hotkey);
      else problem(true);
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [active]);
}

/** The hotkey as keycaps and a Change button; while changing, the keys held together become the hotkey when they are released. Escape cancels. */
export function HotkeyRecorder({ value, onChange }: { value: string; onChange: (hotkey: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState(false);
  const stop = () => (setRecording(false), setProblem(false));
  useKeyCapture(recording, { keys: (hotkey) => (stop(), onChange(hotkey)), problem: setProblem, stop });
  if (!recording)
    return (
      <div className="dict-hotkey">
        {hotkeyLabels(value).map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
        <Button onClick={() => setRecording(true)}>Change</Button>
      </div>
    );
  return (
    <div className="dict-hotkey">
      <div className="dict-hotkey__field" role="status" aria-live="polite">
        <i className="dict-hotkey__dot" />
        Press the new keys
      </div>
      <Button onClick={stop}>Cancel</Button>
      {problem && (
        <span className="dict-hotkey__problem" role="alert">
          Use a modifier such as Ctrl, or a key such as F9.
        </span>
      )}
    </div>
  );
}
