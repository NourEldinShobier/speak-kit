import { useEffect, useState } from "react";
import { Banner, Button, Kbd, SettingRow, SettingsSection } from "@speakkit/ui";
import type { AppState } from "../shared/ipc";
import { recordKey, SHORTCUT_IDS, SHORTCUT_LABELS, type ShortcutId } from "../shared/shortcuts";
import { api, Page } from "./ui";

export const Keys = ({ accelerator }: { accelerator: string }) => (
  <span className="sk-keys">
    {accelerator.split("+").map((k) => (
      <Kbd key={k}>{k}</Kbd>
    ))}
  </span>
);

interface Problem {
  id: ShortcutId;
  text: string;
  accelerator?: string;
  suggestion?: string | null;
}

/** Settings > Shortcuts (H5, H11, H16): global Ctrl+Alt keys with a recorder; a clash is named and offers one alternative, never a silent override. */
export function ShortcutsPage({ s }: { s: AppState }) {
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  const apply = async (id: ShortcutId, accelerator: string) => {
    const r = await api.setShortcut(id, accelerator);
    if (r.ok) setProblem(null);
    else setProblem({ id, text: r.error, accelerator, suggestion: r.conflict?.suggestion });
  };

  useEffect(() => {
    if (!recording) return;
    const id = recording;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const r = recordKey(e);
      if (r.kind === "waiting") return;
      if (r.kind === "cancel") setRecording(null);
      else if (r.kind === "invalid") setProblem({ id, text: r.reason });
      else {
        setRecording(null);
        void apply(id, r.accelerator);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording]);

  return (
    <Page title="Shortcuts" lead="Global shortcuts work in any app. Click a shortcut, then press the new keys.">
      <SettingsSection title="Global">
        {SHORTCUT_IDS.map((id) => {
          const acc = s.shortcuts.bindings[id];
          const clash = s.shortcuts.conflicts[id];
          const p = problem?.id === id ? problem : clash ? { id, text: clash.reason === "taken" ? `Another app is using ${clash.accelerator}.` : `${clash.accelerator} is already used by another SpeakKit action.`, accelerator: clash.accelerator, suggestion: clash.suggestion } : null;
          const on = recording === id;
          return (
            <div key={id} data-shortcut={id}>
              <SettingRow
                label={SHORTCUT_LABELS[id].title}
                description={SHORTCUT_LABELS[id].description}
                control={
                  <div className="sk-row-actions">
                    {on ? (
                      <span className="sk-rec" role="status" data-testid="recording">
                        Press new keys <Kbd small>Esc</Kbd> to cancel
                      </span>
                    ) : (
                      <Keys accelerator={acc} />
                    )}
                    <Button size="sm" aria-label={`Change ${SHORTCUT_LABELS[id].title} shortcut`} onClick={() => (on ? setRecording(null) : (setProblem(null), setRecording(id)))}>
                      {on ? "Cancel" : "Change"}
                    </Button>
                  </div>
                }
              />
              {p && (
                <div className="sk-pad" data-testid="shortcut-problem">
                  <Banner
                    tone="warning"
                    title={p.text}
                    action={p.suggestion ? <Button size="sm" onClick={() => apply(id, p.suggestion!)}>Use {p.suggestion}</Button> : undefined}
                  >
                    SpeakKit never takes a shortcut another app owns. Pick another combination or use the suggestion.
                  </Banner>
                </div>
              )}
            </div>
          );
        })}
        <SettingRow label="Reset all" description="Back to Ctrl+Alt+S, Space, X and C." control={<Button size="sm" onClick={() => api.resetShortcuts()}>Reset</Button>} />
      </SettingsSection>
      <SettingsSection title="In this app">
        <SettingRow label="Search and commands" control={<Keys accelerator="Ctrl+K" />} />
        <SettingRow label="New reading" control={<Keys accelerator="Ctrl+N" />} />
      </SettingsSection>
    </Page>
  );
}
