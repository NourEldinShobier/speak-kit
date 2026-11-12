import { useState } from "react";
import { Banner, Button, Segmented, Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { Page } from "../../ui";
import { Cleanup } from "../vocabulary";
import { dictation } from "./api";
import { FirstRunCard } from "./FirstRunCard";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { entriesText, hotkeyHelp, LANGUAGE_OPTIONS, RETENTION_OPTIONS } from "./model";
import { ModelList } from "./ModelList";
import { useDictation } from "./useDictation";
import "./dictation.css";

const LEAD = "Hold a key, speak, and Speak Kit types what you said into the app you are using. Speech stays on this computer.";

function General({ s }: { s: DictationStatus }) {
  const c = s.settings;
  const [capturing, setCapturing] = useState(false);
  const model = s.models.find((m) => m.selected);
  const languages = LANGUAGE_OPTIONS.filter((l) => l.value === "auto" || !model || model.languages.includes(l.value));
  return (
    <SettingsSection title="General">
      <SettingRow
        label="Dictation"
        description="Turn on to use the hotkey in any app."
        control={<Toggle aria-label="Dictation" checked={c.enabled} disabled={!s.supported} onChange={(on) => void dictation.setEnabled(on)} />}
      />
      <SettingRow
        className="lm-row--control"
        label="Hotkey"
        description={hotkeyHelp(capturing)}
        control={<HotkeyRecorder value={c.hotkey} onRecording={setCapturing} onChange={(hotkey) => void dictation.patchSettings({ hotkey })} />}
      />
      <SettingRow
        className="lm-row--control"
        label="Mode"
        description="Hold to talk, or press once to start and again to stop."
        control={
          <Segmented
            label="Mode"
            value={c.mode}
            onChange={(mode) => void dictation.patchSettings({ mode: mode as "hold" | "toggle" })}
            items={[
              { id: "hold", label: "Hold to talk" },
              { id: "toggle", label: "Press to toggle" },
            ]}
          />
        }
      />
      <SettingRow
        className="lm-row--control"
        label="Language"
        description="The language you speak."
        control={<Select label="Language" value={c.language} onChange={(language) => void dictation.patchSettings({ language: language as typeof c.language })} options={languages} />}
      />
    </SettingsSection>
  );
}

function TestField() {
  return (
    <section className="lm-section">
      <header className="lm-section__head">
        <h3 className="lm-section__title">Test dictation</h3>
        <p className="lm-section__desc">Click the field, hold the hotkey and speak. The text appears here the way it will in other apps.</p>
      </header>
      <textarea className="dict-test" aria-label="Test dictation" placeholder="Try it here" rows={4} />
    </section>
  );
}

function HistoryCard({ s, open }: { s: DictationStatus; open: () => void }) {
  return (
    <SettingsSection title="History">
      <SettingRow
        className="lm-row--control"
        label="Keep history for"
        description="Stored on this computer. Older entries are removed automatically."
        control={
          <Select
            label="Keep history for"
            value={s.settings.retention}
            onChange={(retention) => void dictation.patchSettings({ retention: retention as typeof s.settings.retention })}
            options={RETENTION_OPTIONS}
          />
        }
      />
      <SettingRow
        className="lm-row--control"
        label="Dictation history"
        description={`${entriesText(s.historyCount)}. Search, copy or delete what you dictated.`}
        control={<Button onClick={open}>View history</Button>}
      />
    </SettingsSection>
  );
}

/** Settings > Dictation. While the speech model is being downloaded or loaded the page shows that card first. */
export function DictationPage({ openHistory }: { openHistory: () => void }) {
  const s = useDictation();
  if (!s)
    return (
      <Page title="Dictation" lead={LEAD}>
        {null}
      </Page>
    );
  const selected = s.models.find((m) => m.selected);
  // The first card shows while the chosen model cannot be used yet. A second model downloading, or failing, does not take the page away.
  const loading = !s.modelReady && !s.models.some((m) => m.progress);
  const settingUp = s.enabled && (!selected?.installed || (loading && !s.modelError));
  return (
    <Page title="Dictation" lead={LEAD}>
      {!s.supported && (
        <Banner tone="info" title="Not supported on this platform yet">
          Dictation needs a system-wide key hook, which exists on Windows only for now. The settings are kept for when it arrives.
        </Banner>
      )}
      {s.hotkeyFailed && (
        <Banner tone="error" title="The hotkey could not start">
          Dictation does not hear the hotkey. Turn Dictation off and on again; if that does not help, restart Speak Kit.
        </Banner>
      )}
      {!settingUp && s.modelError && (
        <Banner tone="error" title="The speech model could not be set up">
          {s.modelError}
        </Banner>
      )}
      {settingUp ? (
        <FirstRunCard status={s} />
      ) : (
        <>
          <General s={s} />
          <ModelList status={s} />
          <Cleanup s={s} />
          <TestField />
          <HistoryCard s={s} open={openHistory} />
        </>
      )}
    </Page>
  );
}
