import { useState } from "react";
import { Banner, Button, Icon, Segmented, Select, SettingRow, SettingsSection, TextInput, Toggle } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import type { Replacement } from "../../../shared/dictation/settings";
import { MAX_REPLACEMENTS } from "../../../shared/dictation/settings";
import { Page } from "../../ui";
import { dictation, platformName } from "./api";
import { FirstRunCard } from "./FirstRunCard";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { entriesText, hotkeyHelp, LANGUAGE_OPTIONS, RETENTION_OPTIONS } from "./model";
import { ModelList } from "./ModelList";
import { PermissionGuide } from "./PermissionGuide";
import { hotkeyFailedCopy } from "./permissions-model";
import { usePermissions } from "./usePermissions";
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

function ReplacementRow({ r, onDelete }: { r: Replacement; onDelete: () => void }) {
  return (
    <div className="lm-row dict-repl">
      <span className="dict-repl__from">{r.from}</span>
      <Icon name="arrow-right" size={14} className="dict-repl__arrow" />
      <span className="dict-repl__to">{r.to}</span>
      <button type="button" className="lm-btn lm-btn--icon dict-repl__del" aria-label={`Delete replacement ${r.from}`} onClick={onDelete}>
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

function Replacements({ list }: { list: Replacement[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const add = () => {
    const key = from.trim();
    if (!key || list.length >= MAX_REPLACEMENTS) return;
    void dictation.patchSettings({ replacements: [...list.filter((r) => r.from.toLowerCase() !== key.toLowerCase()), { from: key, to }] });
    setFrom("");
    setTo("");
  };
  return (
    <SettingsSection title="Replacements" description="Swap a word or phrase for other text after you speak it. Capital letters are ignored when matching.">
      {list.map((r) => (
        <ReplacementRow key={r.from} r={r} onDelete={() => void dictation.patchSettings({ replacements: list.filter((x) => x !== r) })} />
      ))}
      <form
        className="lm-row dict-repl dict-repl--add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <TextInput aria-label="When I say" placeholder="When I say" value={from} onChange={(e) => setFrom(e.target.value)} maxLength={80} frameClassName="dict-repl__field" />
        <Icon name="arrow-right" size={14} className="dict-repl__arrow" />
        <TextInput aria-label="Replace with" placeholder="Replace with" value={to} onChange={(e) => setTo(e.target.value)} maxLength={200} frameClassName="dict-repl__field dict-repl__field--wide" />
        <Button type="submit" variant="primary" disabled={!from.trim()}>
          Add
        </Button>
      </form>
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
      {settingUp ? (
        <FirstRunCard status={s} />
      ) : (
        <>
          <General s={s} />
          <ModelList status={s} />
          <Replacements list={s.settings.replacements} />
          <TestField />
          <HistoryCard s={s} open={openHistory} />
        </>
      )}
    </Page>
  );
}
