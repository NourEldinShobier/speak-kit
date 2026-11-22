import { Banner, Button, Icon, Kbd, Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { Page } from "../../ui";
import { Cleanup } from "../vocabulary";
import { hotkeyLabels } from "../../../shared/dictation/keys";
import { dictation, patchDictation, platformName } from "./api";
import { OtherAudioCard } from "./OtherAudioCard";
import { FeedbackCard, MicrophoneCard, OutputCard } from "./AudioCards";
import { entriesText, LANGUAGE_OPTIONS, RETENTION_OPTIONS, usageHint } from "./model";
import { ModelList } from "./ModelList";
import { PermissionGuide } from "./PermissionGuide";
import { hotkeyFailedCopy } from "./permissions-model";
import { usePermissions } from "./usePermissions";
import { ShortcutsSections } from "./ShortcutsSection";
import { failureTime, listenerStatus } from "./listener-model";
import { useDictation } from "./useDictation";
import "./dictation.css";

const LEAD = "Hold a key, speak, and Speak Kit types what you said into the app you are using. Speech stays on this computer.";

/** One line at the top: which keys to use and how. The test field sits right under it. */
function UsageHint({ s }: { s: DictationStatus }) {
  const { before, after } = usageHint(s.settings.mode, s.enabled);
  if (!s.settings.hotkey) return null;
  return (
    <p className="dict-hint" data-testid="dictation-hint">
      <Icon name="info-circle" size={16} />
      <span>
        {before}{" "}
        {hotkeyLabels(s.settings.hotkey, platformName()).map((k) => (
          <Kbd key={k} small>
            {k}
          </Kbd>
        ))}{" "}
        {after}
      </span>
    </p>
  );
}

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
        control={<Select label="Language" value={c.language} onChange={(language) => void patchDictation({ language: language as typeof c.language })} options={languages} />}
      />
    </SettingsSection>
  );
}

/** Only when the shortcut cannot work (no microphone, no permission, the hook stopped): said at the top, where it is seen first. A healthy listener needs no card, the hint already names the keys. */
function ProblemBanner({ s }: { s: DictationStatus }) {
  const l = listenerStatus(s);
  // "No microphone" is also what the status says before the first check, so it stays in the Microphone card until the list is known.
  return l.tone === "problem" && s.mic.kind !== "none" ? (
    <Banner tone="error" title={l.label}>
      {l.detail}
    </Banner>
  ) : null;
}

/** The last dictation that failed, with a way to run it again; nothing when there is none. */
function LastProblem({ s }: { s: DictationStatus }) {
  const f = s.lastFailure;
  if (!f) return null;
  return (
    <SettingsSection title="Last problem">
      <SettingRow
        className="lm-row--control"
        label={f.text}
        description={failureTime(f.at, Date.now())}
        control={
          <span className="dict-status__acts">
            {f.retry && <Button onClick={() => dictation.hudAction("retry")}>Try again</Button>}
            <Button onClick={() => dictation.hudAction("dismiss")}>Dismiss</Button>
          </span>
        }
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
      <textarea id="dict-test" className="dict-test" aria-label="Test dictation" placeholder="Try it here" rows={4} />
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
            onChange={(retention) => void patchDictation({ retention: retention as typeof s.settings.retention })}
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

/** Every card of the page. The speech model card comes first and says what is missing; nothing hides the rest. */
function Cards({ s, openHistory }: { s: DictationStatus; openHistory: () => void }) {
  return (
    <>
      <ProblemBanner s={s} />
      <UsageHint s={s} />
      <TestField />
      <General s={s} />
      <ModelList status={s} />
      <LastProblem s={s} />
      <ShortcutsSections s={s} />
      <MicrophoneCard s={s} />
      <OutputCard s={s} />
      <FeedbackCard s={s} />
      <OtherAudioCard s={s} />
      <Cleanup s={s} />
      <HistoryCard s={s} open={openHistory} />
    </>
  );
}

/** Settings > Dictation. */
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
      <Cards s={s} openHistory={openHistory} />
    </Page>
  );
}
