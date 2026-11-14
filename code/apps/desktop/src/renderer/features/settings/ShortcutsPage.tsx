import { useCallback, useEffect, useMemo, useState } from "react";
import { Banner, Button, Kbd, SettingRow, SettingsSection } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import type { DesktopError } from "../../../shared/errors";
import { errorText } from "../../error-text";
import { recordKey, resetText, showAccelerator, SHORTCUT_IDS, type ShortcutId } from "../../../shared/shortcuts";
import { useT, type Translator } from "../../i18n";
import { api, Page } from "../../ui";
import { resetShortcuts } from "../../change";

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

const clashText = (t: Translator["t"], c: NonNullable<Conflict>) => t(c.reason === "taken" ? "shortcuts.taken" : "shortcuts.clash", { keys: c.accelerator });

/** The message under a row: the last attempt on that row, else the clash found when the shortcuts were registered. */
function problemFor(t: Translator["t"], row: { id: ShortcutId; attempt: Problem | null; clash: Conflict }): Problem | null {
  const { id, attempt, clash } = row;
  if (attempt?.id === id) return attempt;
  return clash ? { id, text: clashText(t, clash), accelerator: clash.accelerator, suggestion: clash.suggestion } : null;
}

/** Sets a shortcut through the settings registry; null when it was set, else what went wrong and the alternative the system offers. */
async function setShortcut(id: ShortcutId, accelerator: string): Promise<Problem | null> {
  const r = await api.applySettings({ [`shortcuts.${id}`]: accelerator });
  if (r.ok) return null;
  if (r.shortcut) return { id, text: errorText(r.shortcut.error), accelerator, suggestion: r.shortcut.conflict?.suggestion };
  return { id, text: r.message, accelerator };
}

/** Listens for the new keys while a row is recording; Esc cancels, an unusable combination is reported, a good one is applied. */
function useRecorder(
  recording: ShortcutId | null,
  on: { cancel: () => void; invalid: (id: ShortcutId, reason: DesktopError) => void; accept: (id: ShortcutId, accelerator: string) => void },
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
  const { t } = useT();
  const name = t(`shortcut.${id}.title`);
  return (
    <div data-shortcut={id}>
      <SettingRow
        className="lm-row--control"
        label={name}
        description={t(`shortcut.${id}.description`)}
        control={
          <div className="sk-row-actions">
            {recording ? (
              <span className="sk-rec" role="status" data-testid="recording">
                {t("shortcuts.pressNew")} <Kbd small>Esc</Kbd> {t("shortcuts.toCancel")}
              </span>
            ) : (
              <Keys accelerator={s.shortcuts.bindings[id]} platform={s.platform} scope="global" />
            )}
            <Button aria-label={t("shortcuts.changeLabel", { name })} onClick={onChange}>
              {recording ? t("shortcuts.cancel") : t("shortcuts.change")}
            </Button>
          </div>
        }
      />
      {problem && (
        <div className="sk-pad" data-testid="shortcut-problem">
          <Banner
            tone="warning"
            title={problem.text}
            action={problem.suggestion ? <Button onClick={() => onUse(problem.suggestion!)}>{t("shortcuts.use", { keys: problem.suggestion })}</Button> : undefined}
          >
            {t("shortcuts.clashBody")}
          </Banner>
        </div>
      )}
    </div>
  );
}

/** Settings > Shortcuts: global Ctrl+Alt keys with a recorder; a clash is named and offers one alternative, never a silent override. */
export function ShortcutsPage({ s }: { s: AppState }) {
  const { t } = useT();
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [attempt, setAttempt] = useState<Problem | null>(null);

  const apply = useCallback(async (id: ShortcutId, accelerator: string) => setAttempt(await setShortcut(id, accelerator)), []);
  const recorder = useMemo(
    () => ({
      cancel: () => setRecording(null),
      invalid: (id: ShortcutId, reason: DesktopError) => setAttempt({ id, text: errorText(reason) }),
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
    <Page title={t("shortcuts.title")} lead={t("shortcuts.lead")}>
      <SettingsSection title={t("shortcuts.global")}>
        {SHORTCUT_IDS.map((id) => (
          <ShortcutRow
            key={id}
            s={s}
            id={id}
            recording={recording === id}
            problem={problemFor(t, { id, attempt, clash: s.shortcuts.conflicts[id] })}
            onChange={() => toggle(id)}
            onUse={(acc) => apply(id, acc)}
          />
        ))}
        <SettingRow
          className="lm-row--control"
          label={t("shortcuts.resetAll")}
          description={t("shortcuts.resetHint", { keys: resetText(s.platform, t("shortcuts.and")) })}
          control={<Button onClick={() => void resetShortcuts()}>{t("shortcuts.reset")}</Button>}
        />
      </SettingsSection>
      <SettingsSection title={t("shortcuts.inApp")}>
        <SettingRow label={t("shortcuts.search")} control={<Keys accelerator="Ctrl+K" platform={s.platform} scope="app" />} />
      </SettingsSection>
    </Page>
  );
}
