import { useState } from "react";
import { Banner, Button, Modal, Select, SettingRow, SettingsSection } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { hotkeyText } from "../../../shared/dictation/keys";
import { Advanced } from "../settings";
import type { DictationPatch } from "../../../shared/dictation/settings";
import { patchDictation } from "./api";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { MODE_OPTIONS, resetNoticeText, shortcutLead } from "./shortcuts-model";

const patch = (p: DictationPatch) => patchDictation(p);

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

/** The key that cancels a recording that is running; Escape by default. */
function CancelKeyRow({ s }: { s: DictationStatus }) {
  const c = s.settings;
  return (
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
  );
}

function Primary({ s, confirm }: { s: DictationStatus; confirm: (hotkey: string) => Promise<boolean> }) {
  const c = s.settings;
  return (
    <SettingsSection title="Dictation shortcut" description={shortcutLead[c.mode]}>
      <SettingRow
        className="lm-row--control"
        label="Dictation shortcut"
        description="Starts and stops dictation in every app."
        control={<HotkeyRecorder slot="dictation" label="Dictation shortcut" value={c.hotkey} restore="ControlRight" status={s} save={(hotkey) => patch({ hotkey })} confirmAdvanced={confirm} mouse />}
      />
      <SettingRow
        className="lm-row--control"
        label="Shortcut mode"
        description="How the shortcut starts and stops a dictation."
        control={<Select label="Shortcut mode" value={c.mode} onChange={(m) => void patch({ mode: m as typeof c.mode })} options={MODE_OPTIONS} />}
      />
      {(c.mode === "toggle" || c.mode === "tap-or-hold") && <CancelKeyRow s={s} />}
    </SettingsSection>
  );
}

function Others({ s, confirm }: { s: DictationStatus; confirm: (hotkey: string) => Promise<boolean> }) {
  const c = s.settings;
  return (
    <SettingsSection title="Other shortcuts">
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
            mouse
          />
        }
      />
    </SettingsSection>
  );
}

/** The shortcut that learns a fix made in another app; the History Fix dialog does the same without a shortcut. */
function Learn({ s, confirm }: { s: DictationStatus; confirm: (hotkey: string) => Promise<boolean> }) {
  return (
    <div className="lm-card">
      <SettingRow
        className="lm-row--control"
        label="Learn correction"
        description="After you fix a misheard word in the app you dictated into, press this to teach Speak Kit the fix. It reads that text once, when you press the key, and nothing leaves this computer."
        control={
          <HotkeyRecorder slot="learn" label="Learn correction" value={s.settings.learnHotkey} restore="" status={s} save={(learnHotkey) => patch({ learnHotkey })} confirmAdvanced={confirm} mouse />
        }
      />
    </div>
  );
}

/** Dictation shortcut, mode, cancel key and the other shortcuts. */
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
      {!s.supported && (
        <Banner tone="info" title="Not available on this computer yet">
          Shortcuts need a system-wide key listener, which this platform does not have yet. The settings are kept for when it arrives.
        </Banner>
      )}
      <Primary s={s} confirm={confirm} />
      <AdvancedKeysDialog ask={ask} close={close} />
      <Others s={s} confirm={confirm} />
      <Advanced page="dictation" subtitle="Learn a fix from another app" count={1}>
        <Learn s={s} confirm={confirm} />
      </Advanced>
    </>
  );
}
