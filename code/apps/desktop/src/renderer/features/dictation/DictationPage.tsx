import { Banner, Button, Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { Page } from "../../ui";
import { Cleanup } from "../vocabulary";
import { dictation, platformName } from "./api";
import { AppRulesCard, FeedbackCard, MicrophoneCard, OutputCard } from "./AudioCards";
import { MicExclusions } from "./MicExclusions";
import { FirstRunCard } from "./FirstRunCard";
import { entriesText, LANGUAGE_OPTIONS, RETENTION_OPTIONS } from "./model";
import { ModelList } from "./ModelList";
import { PermissionGuide } from "./PermissionGuide";
import { hotkeyFailedCopy } from "./permissions-model";
import { usePermissions } from "./usePermissions";
import { ShortcutsSections } from "./ShortcutsSection";
import { failureTime, listenerStatus } from "./listener-model";
import { useDictation } from "./useDictation";
import "./dictation.css";

const LEAD = "Hold a key, speak, and Speak Kit types what you said into the app you are using. Speech stays on this computer.";

function General({ s }: { s: DictationStatus }) {
  const c = s.settings;
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
        label="Language"
        description="The language you speak."
        control={<Select label="Language" value={c.language} onChange={(language) => void dictation.patchSettings({ language: language as typeof c.language })} options={languages} />}
      />
    </SettingsSection>
  );
}

function StatusCard({ s }: { s: DictationStatus }) {
  const l = listenerStatus(s);
  const f = s.lastFailure;
  return (
    <SettingsSection title="Status">
      <SettingRow
        className="lm-row--control"
        label="Shortcut"
        description={l.detail}
        control={
          <span className="dict-status" data-tone={l.tone} role="status" aria-label={`Shortcut status: ${l.label}`}>
            {l.label}
          </span>
        }
      />
      {f && (
        <SettingRow
          className="lm-row--control"
          label="Last problem"
          description={`${f.text}, ${failureTime(f.at, Date.now())}.`}
          control={
            <span className="dict-status__acts">
              {f.retry && <Button onClick={() => dictation.hudAction("retry")}>Try again</Button>}
              <Button onClick={() => dictation.hudAction("dismiss")}>Dismiss</Button>
            </span>
          }
        />
      )}
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

/** Every card of the page once the speech model is set up. */
function Cards({ s, openHistory }: { s: DictationStatus; openHistory: () => void }) {
  return (
    <>
      <General s={s} />
      <StatusCard s={s} />
      <ShortcutsSections s={s} />
      <MicrophoneCard s={s} />
      <MicExclusions list={s.settings.micExclusions} />
      <OutputCard s={s} />
      <FeedbackCard s={s} />
      <AppRulesCard s={s} />
      <ModelList status={s} />
      <Cleanup s={s} />
      <TestField />
      <HistoryCard s={s} open={openHistory} />
    </>
  );
}

/** Settings > Dictation. While the speech model is being downloaded or loaded the page shows that card first. */
export function DictationPage({ openHistory }: { openHistory: () => void }) {
  const s = useDictation();
  const permissions = usePermissions();
  if (!s)
    return (
      <Page title="Dictation" lead={LEAD}>
        {null}
      </Page>
    );
  const failed = hotkeyFailedCopy(platformName(), permissions?.guides.dictation.next ?? null);
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
        <Banner tone="error" title={failed.title}>
          {failed.text}
        </Banner>
      )}
      <PermissionGuide status={permissions} onAct={(id, action) => void (action === "request" ? window.speakkitPermissions?.request(id) : window.speakkitPermissions?.openSettings(id))} />
      {!settingUp && s.modelError && (
        <Banner tone="error" title="The speech model could not be set up">
          {s.modelError}
        </Banner>
      )}
      {settingUp ? <FirstRunCard status={s} /> : <Cards s={s} openHistory={openHistory} />}
    </Page>
  );
}
