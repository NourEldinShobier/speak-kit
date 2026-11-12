import { useState } from "react";
import { Banner, Button, Modal, Skeleton, Tabs } from "@speakkit/ui";
import type { CaptureStatus } from "../../../shared/capture/contract";
import { Page } from "../../ui";
import { capture, useCapture } from "./api";
import { CapturesTab } from "./CapturesTab";
import { Playground } from "./Playground";
import { PrivacyTab } from "./PrivacyTab";
import { SettingsTab } from "./SettingsTab";
import "./capture.css";

const LEAD = "Record your screen while you talk, or take a picture of it. Captures stay on this computer.";
const TABS = [
  { id: "captures", label: "Captures" },
  { id: "settings", label: "Settings" },
  { id: "privacy", label: "Privacy" },
];
const PLAYGROUND = { id: "playground", label: "Playground" };

function Body({ tab, s }: { tab: string; s: CaptureStatus }) {
  if (tab === "settings") return <SettingsTab s={s} />;
  if (tab === "privacy") return <PrivacyTab s={s} />;
  if (tab === "playground" && s.settings.experiments.playground) return <Playground />;
  return <CapturesTab s={s} />;
}

function ConsentDialog({ s }: { s: CaptureStatus }) {
  const accept = async () => {
    await capture.patchSettings({ consented: true });
    await capture.start();
  };
  return (
    <Modal
      open={!!s.consentRequired}
      onClose={() => undefined}
      title="Record your screen?"
      width={460}
      footer={
        <>
          <Button onClick={() => void capture.setEnabled(false)}>Not now</Button>
          <Button variant="primary" data-autofocus onClick={() => void accept()}>
            Allow capture
          </Button>
        </>
      }
    >
      Speak Kit records the window, area or screen you pick and what you say while it runs. The video, a few frames and the words are saved on this computer in <code>{s.folder}</code>. Nothing is sent
      anywhere. Speak Kit's own windows are left out of every recording.
    </Modal>
  );
}

/** Capture in the app window: the list of captures, the settings and what is recorded. */
export function CapturePage() {
  const { status, failed, retry } = useCapture();
  const [tab, setTab] = useState("captures");
  if (failed)
    return (
      <Page title="Capture" lead={LEAD}>
        <Banner tone="error" title="Capture could not start" action={<Button onClick={retry}>Try again</Button>}>
          Speak Kit could not read the capture settings.
        </Banner>
      </Page>
    );
  return (
    <Page title="Capture" lead={LEAD}>
      {status ? (
        <>
          <Tabs label="Capture" items={status.settings.experiments.playground ? [...TABS, PLAYGROUND] : TABS} value={tab} onChange={setTab} />
          <Body tab={tab} s={status} />
          <ConsentDialog s={status} />
        </>
      ) : (
        <div className="lm-card" aria-busy="true" aria-label="Loading capture">
          <Skeleton />
        </div>
      )}
    </Page>
  );
}
