import { useState } from "react";
import { Button, Modal, Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import type { Config } from "../../../shared/schemas";
import { api, Page } from "../../ui";
import { UpdateCard } from "../../UpdateCard";
import { rowAttr } from "./focus";
import { change } from "../../change";
import { NetworkTable } from "./PrivacyPage";
import "../../../shared/i18n/packs/settings";
import { useT } from "../../i18n";

const CHANNEL_LABEL = { stable: "s.about.stable", early: "s.about.early" } as const;

function BackToStable({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t } = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("s.about.backTitle")}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              void change({ updateChannel: "stable" });
            }}
          >
            {t("s.about.switchStable")}
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        {t("s.about.backBody")}
      </p>
    </Modal>
  );
}

const CHANNEL_HINT = { stable: "s.about.hintStable", early: "s.about.hintEarly" } as const;

function Channel({ s }: { s: AppState }) {
  const { t } = useT();
  const [ask, setAsk] = useState(false);
  const channel = s.config.updateChannel;
  const pick = (v: string) => (v === "stable" && channel === "early" ? setAsk(true) : void change({ updateChannel: v as Config["updateChannel"] }));
  return (
    <>
      <SettingRow
        {...rowAttr("about/channel")}
        className="lm-row--control"
        label={t("s.about.channel")}
        description={t(CHANNEL_HINT[channel])}
        control={
          <Select
            label={t("s.about.channel")}
            value={channel}
            onChange={pick}
            options={[
              { value: "stable", label: t(CHANNEL_LABEL.stable) },
              { value: "early", label: t(CHANNEL_LABEL.early) },
            ]}
          />
        }
      />
      <BackToStable open={ask} onClose={() => setAsk(false)} />
    </>
  );
}

function Versions({ s }: { s: AppState }) {
  const { t } = useT();
  return (
    <SettingsSection title={t("s.about.versions")}>
      <SettingRow {...rowAttr("about/version")} label="Speak Kit" control={<span data-testid="about-version">{s.version}</span>} />
      <SettingRow label={t("s.about.engine")} control={<span>Kokoro-82M</span>} />
      <SettingRow label={t("s.about.platform")} control={<span>{s.platform}</span>} />
      <SettingRow label={t("s.about.channelShort")} control={<span data-testid="about-channel">{t(CHANNEL_LABEL[s.config.updateChannel])}</span>} />
    </SettingsSection>
  );
}

/** Run setup again: downloaded models and settings stay, the first-run steps are shown again from the model step. */
function SetupSection() {
  const { t } = useT();
  return (
    <SettingsSection title={t("s.about.setup")} description={t("s.about.setupLead")}>
      <SettingRow
        className="lm-row--control"
        label={t("s.about.runSetup")}
        description={t("s.about.runSetupHint")}
        control={
          <Button aria-label={t("s.about.runSetup")} onClick={() => void change({ setupDone: false, setupSkipped: false, setupStep: 1 })}>
            {t("s.about.runSetup")}
          </Button>
        }
      />
    </SettingsSection>
  );
}

function Support() {
  const { t } = useT();
  return (
    <SettingsSection title={t("s.about.support")}>
      <SettingRow
        label={t("s.about.report")}
        description={t("s.about.reportHint")}
        control={
          <div className="sk-row-actions">
            <Button iconLeft="external-link" onClick={() => api.openExternal("issues")}>
              {t("s.about.openIssue")}
            </Button>
            <Button iconLeft="shield-check" onClick={() => api.openExternal("security")}>
              {t("s.about.reportSecurity")}
            </Button>
          </div>
        }
      />
    </SettingsSection>
  );
}

function UpdatesSection({ s }: { s: AppState }) {
  const { t } = useT();
  return (
    <SettingsSection title={t("s.about.updates")} description={t(s.platform === "darwin" ? "s.about.updatesMac" : "s.about.updatesWin")}>
      <div {...rowAttr("about/updates")} className="sk-pad" data-testid="update-section">
        <UpdateCard s={s} />
      </div>
      <Channel s={s} />
      <SettingRow
        label={t("s.about.checkAuto")}
        description={t("s.about.checkAutoHint")}
        control={<Toggle aria-label={t("s.about.checkAutoAria")} checked={s.config.autoUpdate} onChange={(v) => change({ autoUpdate: v })} />}
      />
    </SettingsSection>
  );
}

export function AboutPage({ s }: { s: AppState }) {
  const { t } = useT();
  return (
    <Page
      title={t("s.about.title")}
      lead={t("s.about.lead")}
      action={
        <Button iconLeft="external-link" onClick={() => api.openExternal("release-notes")}>
          {t("s.about.releaseNotes")}
        </Button>
      }
    >
      <Versions s={s} />
      <SetupSection />
      <UpdatesSection s={s} />
      <SettingsSection title={t("s.about.network")} description={t("s.about.networkLead")}>
        <div {...rowAttr("about/network")} className="sk-pad">
          <NetworkTable />
        </div>
      </SettingsSection>
      <SettingsSection title={t("s.about.uninstall")}>
        <SettingRow label={t("s.about.models")} description={t(s.platform === "darwin" ? "s.about.uninstallMac" : "s.about.uninstallWin")} />
      </SettingsSection>
      <Support />
      <div>
        <Button iconLeft="folder" onClick={() => api.openPath("logs")}>
          {t("s.about.openLogs")}
        </Button>
      </div>
    </Page>
  );
}
