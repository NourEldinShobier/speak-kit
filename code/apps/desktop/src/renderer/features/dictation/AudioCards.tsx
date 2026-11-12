import { useEffect, useState } from "react";
import { Banner, Button, Icon, Segmented, Select, SettingRow, SettingsSection, TextInput, Toggle } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { MAX_APP_RULES, type PasteMethod } from "../../../shared/dictation/settings";
import { dictation } from "./api";
import { KEEP_READY_MINUTES, METHOD_OPTIONS, micLine, OUTPUT_HELP, OUTPUT_OPTIONS } from "./mic-model";

const BARS = 24;

/** Live input level, drawn only while the page is visible: the microphone is open for the meter and let go when the person leaves. */
function Meter() {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    void dictation.micMeter(true);
    const off = dictation.onMicLevel(setLevel);
    return () => {
      off();
      void dictation.micMeter(false);
    };
  }, []);
  const lit = Math.round(level * BARS);
  return (
    <div className="dict-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
      {Array.from({ length: BARS }, (_, i) => (
        <i key={i} data-on={i < lit || undefined} />
      ))}
    </div>
  );
}

/** Automatic first, then what is plugged in. A saved device that is not plugged in stays listed, so the choice is not lost silently. */
function micOptions(devices: DictationStatus["devices"], saved: string) {
  const options = [{ value: "", label: "Automatic" }, ...devices.map((d) => ({ value: d.id, label: d.label || "Microphone" }))];
  if (saved && !devices.some((d) => d.id === saved)) options.push({ value: saved, label: "Saved microphone (not connected)" });
  return options;
}

export function MicrophoneCard({ s }: { s: DictationStatus }) {
  const c = s.settings;
  useEffect(() => void dictation.micDevices(), []);
  const line = micLine(s.mic, true);
  const options = micOptions(s.devices, c.microphone);
  return (
    <SettingsSection title="Microphone">
      <SettingRow
        className="lm-row--control"
        label="Microphone"
        description="Automatic uses the system default and never picks a virtual or phone input."
        control={<Select label="Microphone" value={c.microphone} onChange={(microphone) => void dictation.patchSettings({ microphone })} options={options} />}
      />
      <SettingRow className="lm-row--control" label="Input level" description={line.text} control={<Meter />} />
      {line.problem && (
        <Banner tone="warning" title={line.text} action={line.link ? <Button onClick={() => void dictation.openSoundSettings()}>Open privacy settings</Button> : undefined}>
          {s.mic.kind === "blocked" ? "Windows has a microphone privacy switch. When it is off, apps get silence." : "Check the connection, then try again."}
        </Banner>
      )}
      <SettingRow
        label="Avoid headset microphones"
        description="A Bluetooth headset switches to a call profile when its microphone opens, which makes music and calls sound worse. Speak Kit uses the built-in or a wired microphone instead, unless you pick the headset above."
        control={<Toggle aria-label="Avoid headset microphones" checked={c.avoidBluetooth} onChange={(avoidBluetooth) => void dictation.patchSettings({ avoidBluetooth })} />}
      />
      <SettingRow
        label="Keep the microphone ready"
        description="Keeps the microphone open between recordings, so the first word is never cut off. Windows shows its microphone indicator the whole time; macOS shows the orange dot. Off by default: the microphone is released when idle."
        control={<Toggle aria-label="Keep the microphone ready" checked={c.keepReady} onChange={(keepReady) => void dictation.patchSettings({ keepReady })} />}
      />
      {c.keepReady && (
        <SettingRow
          className="lm-row--control"
          label="Stay open for"
          description="After this time without dictation the microphone is released."
          control={<Select label="Stay open for" value={String(c.keepReadyMinutes)} onChange={(v) => void dictation.patchSettings({ keepReadyMinutes: Number(v) })} options={KEEP_READY_MINUTES} />}
        />
      )}
      <SettingRow
        label="End-of-sentence pause"
        description="Adds a short silence after you stop, for the speech models that need it to finish the last sentence."
        control={<Toggle aria-label="End-of-sentence pause" checked={c.sentencePause} onChange={(sentencePause) => void dictation.patchSettings({ sentencePause })} />}
      />
      <SettingRow
        label="Keep the computer awake while recording"
        description="Stops sleep during a recording. It is released when you stop."
        control={<Toggle aria-label="Keep the computer awake while recording" checked={c.blockSleep} onChange={(blockSleep) => void dictation.patchSettings({ blockSleep })} />}
      />
    </SettingsSection>
  );
}

export function OutputCard({ s }: { s: DictationStatus }) {
  const c = s.settings;
  return (
    <SettingsSection title="Output">
      <SettingRow
        className="lm-row--control"
        label="After you speak"
        description={OUTPUT_HELP[c.output]}
        control={
          <Segmented
            label="After you speak"
            value={c.output}
            onChange={(output) => void dictation.patchSettings({ output: output as typeof c.output })}
            items={OUTPUT_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
          />
        }
      />
      <SettingRow
        label="Return to the app"
        description="Brings the app you were in back to the front before inserting. If it cannot, nothing is pasted and the text stays in History."
        control={<Toggle aria-label="Return to the app" checked={c.returnToApp} onChange={(returnToApp) => void dictation.patchSettings({ returnToApp })} />}
      />
      <Banner tone="info" role="status">
        Windows does not send keys to a window that runs as administrator. For those the text is copied and you paste it yourself.
      </Banner>
    </SettingsSection>
  );
}

export function AppRulesCard({ s }: { s: DictationStatus }) {
  const rules = s.settings.appRules;
  const [name, setName] = useState("");
  const save = (next: DictationStatus["settings"]["appRules"]) => void dictation.patchSettings({ appRules: next });
  const add = () => {
    const key = name
      .trim()
      .toLowerCase()
      .replace(/\.exe$/, "");
    if (!key || Object.keys(rules).length >= MAX_APP_RULES) return;
    save({ ...rules, [key]: rules[key] ?? { method: "ctrl-v", delayMs: 0 } });
    setName("");
  };
  return (
    <SettingsSection title="Insert method by app" description="Terminals, remote desktop and Java programs have built-in rules. Add a program to choose its own method and delay.">
      {Object.entries(rules).map(([exe, r]) => (
        <div className="lm-row dict-rule" key={exe}>
          <span className="dict-rule__name">{exe}</span>
          <Select label={`Method for ${exe}`} value={r.method} onChange={(method) => save({ ...rules, [exe]: { ...r, method: method as PasteMethod } })} options={METHOD_OPTIONS} />
          <TextInput
            aria-label={`Delay in milliseconds for ${exe}`}
            inputMode="numeric"
            value={String(r.delayMs)}
            maxLength={4}
            frameClassName="dict-rule__delay"
            onChange={(e) => save({ ...rules, [exe]: { ...r, delayMs: Math.min(5000, Number(e.target.value.replace(/\D/g, "")) || 0) } })}
          />
          <button type="button" className="lm-btn lm-btn--icon" aria-label={`Remove rule for ${exe}`} onClick={() => save(Object.fromEntries(Object.entries(rules).filter(([k]) => k !== exe)))}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
      <form
        className="lm-row dict-rule dict-rule--add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <TextInput aria-label="Program name" placeholder="Program, for example putty" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} frameClassName="dict-rule__field" />
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          Add
        </Button>
      </form>
    </SettingsSection>
  );
}
