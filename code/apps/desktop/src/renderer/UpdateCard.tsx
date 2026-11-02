import { Banner, Button, LoadingLabel, Popover, ProgressBar, StatusPill } from "@speakkit/ui";
import { useState } from "react";
import type { AppState } from "../shared/ipc";
import { updateBlockers, type UpdateAction } from "../shared/updates";
import { updateErrorText } from "./error-text";
import { api } from "./ui";

const act = (a: UpdateAction) => () => void api.updateAction(a);

/** The update flow in one place (Settings > About, H9, and the title bar popover, H18). Nothing here installs without a click. */
export function UpdateCard({ s }: { s: AppState }) {
  const u = s.update;
  const [confirm, setConfirm] = useState(false);
  switch (u.kind) {
    case "unsupported":
      return <p className="sk-modal-text">Updates are delivered to the installed app. This copy runs from a folder, so it does not update itself. The Windows installer keeps itself up to date.</p>;
    case "idle":
      return (
        <div className="sk-row-actions" data-testid="update-idle">
          <span>{u.checkedAtMs ? "Speak Kit is up to date." : "Speak Kit checks for updates in the background."}</span>
          <Button size="sm" onClick={act("check")}>
            Check for updates
          </Button>
        </div>
      );
    case "checking":
      return <LoadingLabel>Checking for updates</LoadingLabel>;
    case "available":
      return (
        <Banner
          tone="info"
          title={`Speak Kit ${u.version} is available`}
          action={
            <Button size="sm" variant="primary" onClick={act("download")}>
              Download
            </Button>
          }
        >
          It downloads in the background. Nothing is installed until you say so.
        </Banner>
      );
    case "downloading":
      return (
        <div data-testid="update-downloading">
          <p className="sk-modal-text">
            Downloading {u.version}, {u.percent}%
          </p>
          <ProgressBar value={u.percent} label="Update download" />
        </div>
      );
    case "ready": {
      const b = updateBlockers(s);
      const busy = b.reading || b.exports > 0;
      if (confirm && busy && !u.onQuit)
        return (
          <div data-testid="update-confirm">
            <Banner
              tone="warning"
              title={`Restart to install ${u.version}?`}
              action={
                <div className="sk-row-actions">
                  <Button size="sm" onClick={() => setConfirm(false)}>
                    Keep working
                  </Button>
                  <Button size="sm" variant="danger" onClick={act("install-now-anyway")}>
                    Restart anyway
                  </Button>
                </div>
              }
            >
              {[b.reading && "The reading in progress stops", b.exports > 0 && (b.exports === 1 ? "The export is cancelled" : "The exports are cancelled")].filter(Boolean).join(" and ")}. Choose
              Install when I quit to let it finish first.
            </Banner>
          </div>
        );
      return (
        <div data-testid="update-ready">
          <Banner
            tone="info"
            icon="circle-check"
            title={`Speak Kit ${u.version} is ready`}
            action={
              <div className="sk-row-actions">
                {!u.onQuit && (
                  <Button size="sm" onClick={act("install-on-quit")}>
                    Install when I quit
                  </Button>
                )}
                <Button size="sm" variant="primary" onClick={busy ? () => setConfirm(true) : act("install-now")}>
                  Restart now
                </Button>
              </div>
            }
          >
            {u.onQuit ? "It installs when you quit Speak Kit." : "Restarting closes the app for a moment, then it reopens where you left off. Readings and exports in progress stop."}
          </Banner>
          {!u.onQuit && (
            <Button size="sm" variant="ghost" onClick={act("remind-later")}>
              Remind me later
            </Button>
          )}
        </div>
      );
    }
    case "manual":
      return (
        <div data-testid="update-manual">
          <Banner
            tone="info"
            title={`Speak Kit ${u.version} is available`}
            action={
              <div className="sk-row-actions">
                <Button size="sm" onClick={act("open-release")}>
                  Release notes
                </Button>
                <Button size="sm" variant="primary" onClick={act("open-release")}>
                  Download
                </Button>
              </div>
            }
          >
            This copy cannot replace itself. Download the new version from the release page and open it to update.
          </Banner>
          <Button size="sm" variant="ghost" onClick={act("remind-later")}>
            Remind me later
          </Button>
        </div>
      );
    case "restarting":
      return <LoadingLabel>Restarting to install {u.version}</LoadingLabel>;
    case "error": {
      const t = updateErrorText(u.error, u.phase);
      return (
        <Banner
          tone="error"
          title={t.title}
          action={
            <Button size="sm" onClick={act("check")}>
              Try again
            </Button>
          }
        >
          {t.body}
        </Banner>
      );
    }
  }
}

/** Green pill in the title bar once an update is downloaded (H18); opens the same card in a popover. */
export function UpdatePill({ s }: { s: AppState }) {
  // "Remind me later" hides the pill for a day; Settings > About and the tray still show the update.
  const u = s.update;
  if ((u.kind !== "ready" && u.kind !== "manual") || Date.now() < s.config.updateRemindAtMs) return null;
  return (
    <Popover
      title={u.kind === "ready" ? "Update ready" : "Update available"}
      side="bottom"
      align="end"
      width={380}
      trigger={(t) => (
        <button type="button" className="sk-pillbtn" data-testid="update-pill" {...t}>
          <StatusPill tone="green" icon="circle-check">
            {u.kind === "ready" ? "Update ready" : "Update available"} · {u.version}
          </StatusPill>
        </button>
      )}
    >
      <UpdateCard s={s} />
    </Popover>
  );
}

/** Small card while the update installs (H19). */
export function UpdatingCard({ s }: { s: AppState }) {
  if (s.update.kind !== "restarting") return null;
  return (
    <div className="sk-updating" role="status" data-testid="updating-card">
      <b>Updating to {s.update.version}</b>
      <span>Speak Kit will reopen where you left off.</span>
      <ProgressBar thin label="Installing the update" />
    </div>
  );
}
