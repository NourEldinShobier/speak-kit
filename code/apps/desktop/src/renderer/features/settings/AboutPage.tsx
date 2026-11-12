import { useState } from "react";
import { Button, Modal, Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import type { Config } from "../../../shared/schemas";
import { api, Page } from "../../ui";
import { UpdateCard } from "../../UpdateCard";
import { rowAttr } from "./focus";
import { change } from "./change";
import { NetworkTable } from "./PrivacyPage";

const CHANNEL_LABEL: Record<Config["updateChannel"], string> = { stable: "Stable", early: "Early" };

function BackToStable({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Go back to Stable?"
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              void change({ updateChannel: "stable" });
            }}
          >
            Switch to Stable
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        You stay on this early version until a stable release is newer than it. Nothing is downgraded.
      </p>
    </Modal>
  );
}

const CHANNEL_HINT: Record<Config["updateChannel"], string> = {
  stable: "Stable builds are tested before they are published.",
  early: "Early builds come first and may have problems. Switching back to Stable keeps the version you have until a newer stable one is out.",
};

function Channel({ s }: { s: AppState }) {
  const [ask, setAsk] = useState(false);
  const channel = s.config.updateChannel;
  const pick = (v: string) => (v === "stable" && channel === "early" ? setAsk(true) : void change({ updateChannel: v as Config["updateChannel"] }));
  return (
    <>
      <SettingRow
        {...rowAttr("about/channel")}
        className="lm-row--control"
        label="Update channel"
        description={CHANNEL_HINT[channel]}
        control={
          <Select
            label="Update channel"
            value={channel}
            onChange={pick}
            options={[
              { value: "stable", label: CHANNEL_LABEL.stable },
              { value: "early", label: CHANNEL_LABEL.early },
            ]}
          />
        }
      />
      <BackToStable open={ask} onClose={() => setAsk(false)} />
    </>
  );
}

function Versions({ s }: { s: AppState }) {
  return (
    <SettingsSection title="Versions">
      <SettingRow {...rowAttr("about/version")} label="Speak Kit" control={<span data-testid="about-version">{s.version}</span>} />
      <SettingRow label="Voice engine" control={<span>Kokoro-82M</span>} />
      <SettingRow label="Platform" control={<span>{s.platform}</span>} />
      <SettingRow label="Channel" control={<span data-testid="about-channel">{CHANNEL_LABEL[s.config.updateChannel]}</span>} />
    </SettingsSection>
  );
}

/** Run setup again: downloaded models and settings stay, the first-run steps are shown again from the model step. */
function SetupSection() {
  return (
    <SettingsSection title="Setup" description="Go through the first-run steps again, from the model step: voice model, dictation language, practice and the browser extension.">
      <SettingRow
        className="lm-row--control"
        label="Run setup again"
        description="Downloaded models and your settings are kept."
        control={
          <Button aria-label="Run setup again" onClick={() => void change({ setupDone: false, setupSkipped: false, setupStep: 1 })}>
            Run setup again
          </Button>
        }
      />
    </SettingsSection>
  );
}

function Support() {
  return (
    <SettingsSection title="Support">
      <SettingRow
        label="Report a problem"
        description="Include the text from Diagnostics, Copy diagnostics."
        control={
          <div className="sk-row-actions">
            <Button iconLeft="external-link" onClick={() => api.openExternal("issues")}>
              Open an issue
            </Button>
            <Button iconLeft="shield-check" onClick={() => api.openExternal("security")}>
              Report a security issue
            </Button>
          </div>
        }
      />
    </SettingsSection>
  );
}

function UpdatesSection({ s }: { s: AppState }) {
  return (
    <SettingsSection
      title="Updates"
      description={
        s.platform === "darwin"
          ? "Speak Kit looks for new versions on GitHub Releases. On macOS you download and install them yourself."
          : "Updates come from GitHub Releases. They download in the background and are never installed without you."
      }
    >
      <div {...rowAttr("about/updates")} className="sk-pad" data-testid="update-section">
        <UpdateCard s={s} />
      </div>
      <Channel s={s} />
      <SettingRow
        label="Check automatically"
        description="Once a day while Speak Kit runs."
        control={<Toggle aria-label="Check for updates automatically" checked={s.config.autoUpdate} onChange={(v) => change({ autoUpdate: v })} />}
      />
    </SettingsSection>
  );
}

export function AboutPage({ s }: { s: AppState }) {
  return (
    <Page
      title="About"
      lead="Speak Kit reads text out loud on your own computer."
      action={
        <Button iconLeft="external-link" onClick={() => api.openExternal("release-notes")}>
          Release notes
        </Button>
      }
    >
      <Versions s={s} />
      <SetupSection />
      <UpdatesSection s={s} />
      <SettingsSection title="Network" description="Speak Kit sends no analytics. These are the only addresses it can reach.">
        <div {...rowAttr("about/network")} className="sk-pad">
          <NetworkTable />
        </div>
      </SettingsSection>
      <SettingsSection title="Uninstalling">
        <SettingRow
          label="Downloaded models"
          description={
            s.platform === "darwin"
              ? "Before you drag Speak Kit to the Trash, use Settings > Storage > Delete downloaded models. Otherwise remove ~/Library/Application Support/@speakkit/desktop yourself."
              : "Uninstalling Speak Kit removes the downloaded models. Your library and settings stay in the data folder."
          }
        />
      </SettingsSection>
      <Support />
      <div>
        <Button iconLeft="folder" onClick={() => api.openPath("logs")}>
          Open log folder
        </Button>
      </div>
    </Page>
  );
}
