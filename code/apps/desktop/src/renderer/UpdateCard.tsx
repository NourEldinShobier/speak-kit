import { Banner, Button, LoadingLabel, Popover, ProgressBar, StatusPill } from "@speakkit/ui";
import { useState } from "react";
import { listOf } from "../shared/i18n";
import type { AppState } from "../shared/ipc";
import { updateBlockers, type UpdateAction } from "../shared/updates";
import { updateErrorText } from "./error-text";
import { useT } from "./i18n";
import { api } from "./ui";

/** The lines of the release the update brings, when it has any. */
function UpdateNotes({ notes }: { notes?: string[] | undefined }) {
  const { t } = useT();
  if (!notes?.length) return null;
  return (
    <ul className="sk-notes" data-testid="update-notes" aria-label={t("update.notes")}>
      {notes.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ul>
  );
}

const act = (a: UpdateAction) => () => void api.updateAction(a);

/** The update flow in one place (Settings > About and the title bar popover). Nothing here installs without a click. */
export function UpdateCard({ s }: { s: AppState }) {
  const u = s.update;
  const { t, locale } = useT();
  const [confirm, setConfirm] = useState(false);
  switch (u.kind) {
    case "unsupported":
      return <p className="sk-modal-text">{t("update.unsupported")}</p>;
    case "idle":
      return (
        <div className="sk-row-actions" data-testid="update-idle">
          <span>{u.checkedAtMs ? t("update.upToDate") : t("update.background")}</span>
          <Button size="sm" onClick={act("check")}>
            {t("update.check")}
          </Button>
        </div>
      );
    case "checking":
      return <LoadingLabel>{t("update.checking")}</LoadingLabel>;
    case "available":
      return (
        <Banner
          tone="info"
          title={t("update.available", { version: u.version })}
          action={
            <Button size="sm" variant="primary" onClick={act("download")}>
              {t("update.download")}
            </Button>
          }
        >
          {t("update.availableBody")}
          <UpdateNotes notes={u.notes} />
        </Banner>
      );
    case "downloading":
      return (
        <div data-testid="update-downloading">
          <p className="sk-modal-text">{t("update.downloading", { version: u.version, percent: u.percent })}</p>
          <ProgressBar value={u.percent} label={t("update.downloadLabel")} />
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
              title={t("update.restartTitle", { version: u.version })}
              action={
                <div className="sk-row-actions">
                  <Button size="sm" onClick={() => setConfirm(false)}>
                    {t("update.keepWorking")}
                  </Button>
                  <Button size="sm" variant="danger" onClick={act("install-now-anyway")}>
                    {t("update.restartAnyway")}
                  </Button>
                </div>
              }
            >
              {listOf(
                locale,
                [b.reading && t("update.stopsReading"), b.exports > 0 && t("update.stopsExports", { n: b.exports })].filter((x): x is string => !!x),
              )}
              . {t("update.chooseOnQuit")}
            </Banner>
          </div>
        );
      return (
        <div data-testid="update-ready">
          <Banner
            tone="info"
            icon="circle-check"
            title={t("update.ready", { version: u.version })}
            action={
              <div className="sk-row-actions">
                {!u.onQuit && (
                  <Button size="sm" onClick={act("install-on-quit")}>
                    {t("update.installOnQuit")}
                  </Button>
                )}
                <Button size="sm" variant="primary" onClick={busy ? () => setConfirm(true) : act("install-now")}>
                  {t("update.restartNow")}
                </Button>
              </div>
            }
          >
            {u.onQuit ? t("update.onQuitBody") : t("update.restartBody")}
            <UpdateNotes notes={u.notes} />
          </Banner>
        </div>
      );
    }
    case "manual":
      return (
        <div data-testid="update-manual">
          <Banner
            tone="info"
            title={t("update.available", { version: u.version })}
            action={
              <div className="sk-row-actions">
                <Button size="sm" onClick={act("open-release")}>
                  {t("nav.releaseNotes")}
                </Button>
                <Button size="sm" variant="primary" onClick={act("open-release")}>
                  {t("update.download")}
                </Button>
              </div>
            }
          >
            {t("update.manualBody")}
            <UpdateNotes notes={u.notes} />
          </Banner>
        </div>
      );
    case "restarting":
      return <LoadingLabel>{t("update.restarting", { version: u.version })}</LoadingLabel>;
    case "error": {
      const err = updateErrorText(u.error, u.phase);
      return (
        <Banner
          tone="error"
          title={err.title}
          action={
            <Button size="sm" onClick={act("check")}>
              {t("common.tryAgain")}
            </Button>
          }
        >
          {err.body}
        </Banner>
      );
    }
  }
}

/** Green pill in the title bar once an update is downloaded; opens the same card in a popover. */
export function UpdatePill({ s }: { s: AppState }) {
  const u = s.update;
  const { t } = useT();
  if (u.kind !== "ready" && u.kind !== "manual") return null;
  return (
    <Popover
      title={u.kind === "ready" ? t("update.pillReady") : t("update.pillAvailable")}
      side="bottom"
      align="end"
      width={380}
      trigger={(tp) => (
        <button type="button" className="sk-pillbtn" data-testid="update-pill" {...tp}>
          <StatusPill tone="green" icon="circle-check">
            {u.kind === "ready" ? t("update.pillReady") : t("update.pillAvailable")} · {u.version}
          </StatusPill>
        </button>
      )}
    >
      <UpdateCard s={s} />
    </Popover>
  );
}

/** Small card while the update installs. */
export function UpdatingCard({ s }: { s: AppState }) {
  const { t } = useT();
  if (s.update.kind !== "restarting") return null;
  return (
    <div className="sk-updating" role="status" data-testid="updating-card">
      <b>{t("update.updatingTo", { version: s.update.version })}</b>
      <span>{t("update.reopens")}</span>
      <ProgressBar thin label={t("update.installing")} />
    </div>
  );
}
