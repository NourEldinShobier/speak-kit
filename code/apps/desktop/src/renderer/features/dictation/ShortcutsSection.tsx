import { useState } from "react";
import { Banner, Button, Icon, Modal, Select, SettingRow, SettingsSection, TextInput, Toggle } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { hotkeyText } from "../../../shared/dictation/keys";
import type { DictationPatch } from "../../../shared/dictation/settings";
import { dictation } from "./api";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { explainerFrames, HOLD_TIME_OPTIONS, MODE_OPTIONS, modeRules, modeTitle, parseApps, resetNoticeText, shareAvailable, shortcutLead } from "./shortcuts-model";

const patch = (p: DictationPatch) => dictation.patchSettings(p);

const FRAME_LABEL = { hold: "Hold, then let go", tap: "Tap, then tap again", double: "Press twice quickly" } as const;

/** The keycap and the timeline for one kind of press. Static under reduced motion. */
function Frame({ kind }: { kind: "hold" | "tap" | "double" }) {
  const label = FRAME_LABEL[kind];
  return (
    <figure className="dict-frame" data-kind={kind}>
      <span className="dict-frame__cap" aria-hidden="true">
        <i />
        {kind === "double" && <i />}
      </span>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function Explainer({ s }: { s: DictationStatus }) {
  const c = s.settings;
  const rules = modeRules(c.mode, c.holdMs);
  return (
    <SettingsSection title={`How ${modeTitle(c.mode)} works`} description="One shortcut, and what each kind of press does.">
      <div className="lm-row dict-frames" aria-hidden={false}>
        {explainerFrames(c.mode).map((k) => (
          <Frame key={k} kind={k} />
        ))}
      </div>
      {!s.supported && (
        <SettingRow
          label="Not available on this computer yet"
          description="Shortcuts need a system-wide key listener, which this platform does not have yet. The settings are kept for when it arrives."
        />
      )}
      {rules.map((r) => (
        <SettingRow key={r.label} label={r.label} description={r.text} control={<span className="dict-badge">{r.badge}</span>} />
      ))}
    </SettingsSection>
  );
}

function AdvancedKeysDialog({ ask, close }: { ask: { hotkey: string; resolve(ok: boolean): void } | null; close(ok: boolean): void }) {
  return (
    <Modal
      open={ask !== null}
      onClose={() => close(false)}
      title="This key works in every app"
      width={440}
      footer={
        <>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => close(true)}>
            Use {ask ? hotkeyText(ask.hotkey) : ""}
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        Home, End, Page Up and Page Down move the cursor in almost every program. While Speak Kit is on, pressing it starts a dictation and the program never sees it.
      </p>
    </Modal>
  );
}

const PAUSE_MODE_OPTIONS = [
  { value: "off", label: "Never" },
  { value: "block", label: "In these programs" },
  { value: "allow", label: "Everywhere except these" },
];

function PauseApps({ rules, save }: { rules: DictationStatus["settings"]["pauseRules"]; save: (next: Partial<typeof rules>) => void }) {
  const [apps, setApps] = useState(rules.apps.join(", "));
  return (
    <SettingRow
      className="lm-row--control"
      label="Programs"
      description="Program file names separated by commas, for example game.exe, editor"
      control={<TextInput aria-label="Programs" value={apps} maxLength={800} onChange={(e) => setApps(e.target.value)} onBlur={() => save({ apps: parseApps(apps) })} />}
    />
  );
}

function PauseRules({ s }: { s: DictationStatus }) {
  const r = s.settings.pauseRules;
  const save = (next: Partial<typeof r>) => void patch({ pauseRules: { ...r, ...next } });
  return (
    <>
      <SettingRow
        className="lm-row--control"
        label="Pause in some programs (experimental)"
        description="Keys pass through to the program in front while a rule matches. Test it with your games before relying on it."
        control={<Select label="Pause in some programs" value={r.mode} onChange={(mode) => save({ mode: mode as typeof r.mode })} options={PAUSE_MODE_OPTIONS} />}
      />
      {r.mode !== "off" && <PauseApps rules={r} save={save} />}
      <SettingRow
        label="Pause in full-screen programs (experimental)"
        description="A program that covers the whole screen gets every key."
        control={<Toggle aria-label="Pause in full-screen programs" checked={r.fullscreen} onChange={(fullscreen) => save({ fullscreen })} />}
      />
    </>
  );
}

function Advanced({ s }: { s: DictationStatus }) {
  const c = s.settings;
  const [open, setOpen] = useState(false);
  const share = shareAvailable(c.mode, s.platform);
  const cancels = c.mode === "toggle" || c.mode === "tap-or-hold";
  return (
    <>
      <button type="button" className="dict-fold" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          <b>Advanced shortcut options</b>
          <small>Home, End, Page Up, Page Down, sharing the shortcut with other apps and pausing.</small>
        </span>
        <Icon name={open ? "chevron-up" : "chevron-right"} size={16} />
      </button>
      {open && (
        <SettingsSection title="Advanced shortcut options">
          <SettingRow
            label="Home, End, Page Up and Page Down"
            description="Pick them with Change on any shortcut above. They work as a whole shortcut, but they move the cursor in every app, so Speak Kit asks first."
          />
          <SettingRow
            label="Share the shortcut with other apps"
            description={share.ok ? "Push-to-talk in a chat app can use the same key. Off by default. Windows only." : share.reason}
            control={<Toggle aria-label="Share the shortcut with other apps" checked={c.shareHotkey && share.ok} disabled={!share.ok} onChange={(shareHotkey) => void patch({ shareHotkey })} />}
          />
          {cancels && (
            <SettingRow
              className="lm-row--control"
              label="Cancel key"
              description={
                c.cancelKey === "Escape"
                  ? "Cancels a recording that is running. Escape stops working in other apps while you record, so pick another key if you need it there."
                  : "Cancels a recording that is running. The key is taken only while you record."
              }
              control={<HotkeyRecorder slot="cancel" label="Cancel key" value={c.cancelKey} restore="Escape" status={s} save={(cancelKey) => patch({ cancelKey })} />}
            />
          )}
          <PauseRules s={s} />
          <SettingRow
            label="Windows that run as administrator"
            description="Windows does not let Speak Kit hear keys while an administrator window is in front, and it cannot paste into one. The text is copied instead and you get a notice. Speak Kit does not run as administrator."
          />
        </SettingsSection>
      )}
    </>
  );
}

function mouseNote(s: DictationStatus): string {
  if (!s.mouseButtons) return "Mouse buttons as shortcuts are not available on this computer yet.";
  return s.settings.mouseButton ? "Speak Kit only sees which button was pressed. It never reads where the pointer is or the wheel." : "Use Mouse 2 to 5 as a shortcut.";
}

function Primary({ s, confirm }: { s: DictationStatus; confirm: (hotkey: string) => Promise<boolean> }) {
  const c = s.settings;
  return (
    <SettingsSection title="Dictation shortcut" description={shortcutLead[c.mode]}>
      <SettingRow
        className="lm-row--control"
        label="Dictation shortcut"
        description="Starts and stops dictation in every app."
        control={<HotkeyRecorder slot="dictation" label="Dictation shortcut" value={c.hotkey} restore="ControlRight" status={s} save={(hotkey) => patch({ hotkey })} confirmAdvanced={confirm} />}
      />
      <SettingRow
        className="lm-row--control"
        label="Shortcut mode"
        description="How the shortcut starts and stops a dictation."
        control={<Select label="Shortcut mode" value={c.mode} onChange={(m) => void patch({ mode: m as typeof c.mode })} options={MODE_OPTIONS} />}
      />
      <SettingRow
        className="lm-row--control"
        label="Hold time"
        description="A press shorter than this is ignored. No tone, nothing pasted."
        control={<Select label="Hold time" value={String(c.holdMs)} onChange={(ms) => void patch({ holdMs: Number(ms) as typeof c.holdMs })} options={HOLD_TIME_OPTIONS} />}
      />
      <SettingRow
        className="lm-row--control"
        label="Second shortcut"
        description="For a laptop keyboard and an external one. Either starts dictation, and the one you pressed ends it."
        control={<HotkeyRecorder slot="second" label="Second shortcut" value={c.secondHotkey} remove status={s} save={(secondHotkey) => patch({ secondHotkey })} confirmAdvanced={confirm} />}
      />
      <SettingRow
        className="lm-row--control"
        label="Mouse button"
        description={mouseNote(s)}
        control={
          <HotkeyRecorder
            slot="mouse"
            label="Mouse button"
            value={c.mouseButton}
            mouse
            remove
            disabled={!s.mouseButtons}
            addLabel="Choose button"
            status={s}
            save={(mouseButton) => patch({ mouseButton: mouseButton as typeof c.mouseButton })}
          />
        }
      />
    </SettingsSection>
  );
}

function Others({ s, confirm }: { s: DictationStatus; confirm: (hotkey: string) => Promise<boolean> }) {
  const c = s.settings;
  return (
    <SettingsSection title="Other shortcuts">
      <SettingRow
        className="lm-row--control"
        label="Dictate without processing"
        description="The same dictation with clean-up and replacements off. Not set until you record one."
        control={<HotkeyRecorder slot="raw" label="Dictate without processing" value={c.rawHotkey} remove status={s} save={(rawHotkey) => patch({ rawHotkey })} confirmAdvanced={confirm} />}
      />
      <SettingRow
        className="lm-row--control"
        label="Paste last dictation"
        description="Types the last dictation again into the window in front."
        control={
          <HotkeyRecorder
            slot="pasteLast"
            label="Paste last dictation"
            value={c.pasteLastHotkey}
            restore="ControlLeft+AltLeft+KeyV"
            status={s}
            save={(pasteLastHotkey) => patch({ pasteLastHotkey })}
            confirmAdvanced={confirm}
          />
        }
      />
      <SettingRow
        className="lm-row--control"
        label="Clean up the field"
        description="Applies your clean-up rules and replacements to the text in the field in front: the selection, or all of it when nothing is selected. Not used in password fields or terminals. Not set until you record one."
        control={
          <HotkeyRecorder slot="transform" label="Clean up the field" value={c.transformHotkey} remove status={s} save={(transformHotkey) => patch({ transformHotkey })} confirmAdvanced={confirm} />
        }
      />
    </SettingsSection>
  );
}

/** Dictation shortcut, mode, hold time, second shortcut, mouse button, the explainer, the advanced fold and the other shortcuts. */
export function ShortcutsSections({ s }: { s: DictationStatus }) {
  const [ask, setAsk] = useState<{ hotkey: string; resolve(ok: boolean): void } | null>(null);
  const confirm = (hotkey: string) => new Promise<boolean>((resolve) => setAsk({ hotkey, resolve }));
  const close = (ok: boolean) => (ask?.resolve(ok), setAsk(null));
  const notice = s.settings.resetNotice;
  return (
    <>
      {notice && (
        <Banner tone="warning" title="A shortcut was reset" action={<Button onClick={() => void patch({})}>Dismiss</Button>}>
          {resetNoticeText[notice]}
        </Banner>
      )}
      <Primary s={s} confirm={confirm} />
      <Explainer s={s} />
      <Advanced s={s} />
      <AdvancedKeysDialog ask={ask} close={close} />
      <Others s={s} confirm={confirm} />
    </>
  );
}
