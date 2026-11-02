import { useCallback, useEffect, useMemo, useState } from "react";
import { Banner, Button, Kbd, SettingRow, SettingsSection } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { recordKey, showAccelerator, SHORTCUT_IDS, SHORTCUT_LABELS, type ShortcutId } from "../../../shared/shortcuts";
import { api, Page } from "../../ui";

const Keys = ({ accelerator, platform, scope }: { accelerator: string; platform: string; scope: "app" | "global" }) => (
  <span className="sk-keys">
    {showAccelerator(accelerator, platform, scope)
      .split("+")
      .map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
  </span>
);

interface Problem {
  id: ShortcutId;
  text: string;
  accelerator?: string;
  suggestion?: string | null | undefined;
}

type Conflict = AppState["shortcuts"]["conflicts"][ShortcutId];

const clashText = (c: NonNullable<Conflict>) => (c.reason === "taken" ? `Another app is using ${c.accelerator}.` : `${c.accelerator} is already used by another Speak Kit action.`);

/** The message under a row: the last attempt on that row, else the clash found when the shortcuts were registered. */
function problemFor(id: ShortcutId, attempt: Problem | null, clash: Conflict): Problem | null {
  if (attempt?.id === id) return attempt;
  return clash ? { id, text: clashText(clash), accelerator: clash.accelerator, suggestion: clash.suggestion } : null;
}

/** Listens for the new keys while a row is recording; Esc cancels, an unusable combination is reported, a good one is applied. */
function useRecorder(
  recording: ShortcutId | null,
  on: { cancel: () => void; invalid: (id: ShortcutId, reason: string) => void; accept: (id: ShortcutId, accelerator: string) => void },
  platform: string,
) {
  const { cancel, invalid, accept } = on;
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const r = recordKey(e, platform);
      if (r.kind === "cancel") cancel();
      else if (r.kind === "invalid") invalid(recording, r.reason);
      else if (r.kind === "accelerator") accept(recording, r.accelerator);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, cancel, invalid, accept, platform]);
}

interface RowProps {
  s: AppState;
  id: ShortcutId;
  recording: boolean;
  problem: Problem | null;
  onChange: () => void;
  onUse: (accelerator: string) => void;
}

function ShortcutRow({ s, id, recording, problem, onChange, onUse }: RowProps) {
  const label = SHORTCUT_LABELS[id];
  return (
    <div data-shortcut={id}>
      <SettingRow
        label={label.title}
        description={label.description}
        control={
          <div className="sk-row-actions">
            {recording ? (
              <span className="sk-rec" role="status" data-testid="recording">
                Press new keys <Kbd small>Esc</Kbd> to cancel
              </span>
            ) : (
              <Keys accelerator={s.shortcuts.bindings[id]} platform={s.platform} scope="global" />
            )}
            <Button size="sm" aria-label={`Change ${label.title} shortcut`} onClick={onChange}>
              {recording ? "Cancel" : "Change"}
            </Button>
          </div>
        }
      />
      {problem && (
        <div className="sk-pad" data-testid="shortcut-problem">
          <Banner
            tone="warning"
            title={problem.text}
            action={
              problem.suggestion ? (
                <Button size="sm" onClick={() => onUse(problem.suggestion!)}>
                  Use {problem.suggestion}
                </Button>
              ) : undefined
            }
          >
            Speak Kit never takes a shortcut another app owns. Pick another combination or use the suggestion.
          </Banner>
        </div>
      )}
    </div>
  );
}

/** Settings > Shortcuts (H5, H11, H16): global Ctrl+Alt keys with a recorder; a clash is named and offers one alternative, never a silent override. */
export function ShortcutsPage({ s }: { s: AppState }) {
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [attempt, setAttempt] = useState<Problem | null>(null);

  const apply = useCallback(async (id: ShortcutId, accelerator: string) => {
    const r = await api.setShortcut(id, accelerator);
    if (r.ok) setAttempt(null);
    else setAttempt({ id, text: r.error, accelerator, suggestion: r.conflict?.suggestion });
  }, []);
  const recorder = useMemo(
    () => ({
      cancel: () => setRecording(null),
      invalid: (id: ShortcutId, text: string) => setAttempt({ id, text }),
      accept: (id: ShortcutId, accelerator: string) => {
        setRecording(null);
        void apply(id, accelerator);
      },
    }),
    [apply],
  );
  useRecorder(recording, recorder, s.platform);
  const toggle = (id: ShortcutId) => {
    if (recording !== id) setAttempt(null);
    setRecording(recording === id ? null : id);
  };

  return (
    <Page title="Shortcuts" lead="Global shortcuts work in any app. Click a shortcut, then press the new keys.">
      <SettingsSection title="Global">
        {SHORTCUT_IDS.map((id) => (
          <ShortcutRow key={id} s={s} id={id} recording={recording === id} problem={problemFor(id, attempt, s.shortcuts.conflicts[id])} onChange={() => toggle(id)} onUse={(acc) => apply(id, acc)} />
        ))}
        <SettingRow
          label="Reset all"
          description={`Back to ${showAccelerator("Ctrl+Alt", s.platform, "global")}+S, Space, X and C.`}
          control={
            <Button size="sm" onClick={() => api.resetShortcuts()}>
              Reset
            </Button>
          }
        />
      </SettingsSection>
      <SettingsSection title="In this app">
        <SettingRow label="Search and commands" control={<Keys accelerator="Ctrl+K" platform={s.platform} scope="app" />} />
        <SettingRow label="New reading" control={<Keys accelerator="Ctrl+N" platform={s.platform} scope="app" />} />
      </SettingsSection>
    </Page>
  );
}
