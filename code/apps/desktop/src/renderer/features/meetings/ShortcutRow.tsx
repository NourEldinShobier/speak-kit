import { useEffect, useState } from "react";
import { Button, Chip, Kbd, SettingRow } from "@speakkit/ui";
import { recordKey, showAccelerator } from "../../../shared/shortcuts";
import { errorText } from "../../error-text";

interface Props {
  value: string;
  platform: string;
  disabled: boolean;
  onChange(accelerator: string): void;
}

/** The optional start and stop shortcut: Not set, or the keys, with Set shortcut and Clear. Esc cancels while recording. */
export function ShortcutRow({ value, platform, disabled, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const r = recordKey(e, platform);
      if (r.kind === "cancel") setRecording(false);
      else if (r.kind === "invalid") setProblem(errorText(r.reason));
      else if (r.kind === "accelerator") {
        setRecording(false);
        setProblem(null);
        onChange(r.accelerator);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, platform, onChange]);
  return (
    <>
      <SettingRow
        className="lm-row--control"
        label="Start and stop shortcut"
        description="Optional. Works when no call is detected."
        control={
          <div className="sk-row-actions">
            {recording ? (
              <span className="sk-rec" role="status">
                Press new keys <Kbd small>Esc</Kbd> to cancel
              </span>
            ) : value ? (
              <span className="sk-keys">
                {showAccelerator(value, platform, "global")
                  .split("+")
                  .map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
              </span>
            ) : (
              <Chip>Not set</Chip>
            )}
            <Button disabled={disabled} onClick={() => (setProblem(null), setRecording(true))}>
              {value ? "Change" : "Set shortcut"}
            </Button>
            {value ? (
              <Button disabled={disabled} onClick={() => onChange("")} aria-label="Clear the shortcut">
                Clear
              </Button>
            ) : null}
          </div>
        }
      />
      {problem ? (
        <p className="mt-error mt-row-note" role="alert">
          {problem}
        </p>
      ) : null}
    </>
  );
}
