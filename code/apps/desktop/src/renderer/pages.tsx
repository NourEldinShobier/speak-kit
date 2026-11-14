import { createContext, useContext, useState } from "react";
import { Banner, Button, StatusPill } from "@speakkit/ui";
import type { AppState } from "../shared/ipc";
import { engineView } from "../shared/engine-view";
import { api, usePreview } from "./ui";
import { Rich, useT } from "./i18n";

export const PreviewCtx = createContext<ReturnType<typeof usePreview> | null>(null);
export const usePlayer = () => useContext(PreviewCtx)!;

export const EngineBadge = ({ s }: { s: AppState }) => {
  const v = engineView(s.health, s.serverError);
  return (
    <StatusPill tone={v.tone} icon={v.spinner ? "loader-2" : undefined}>
      {v.label}
      {v.hint ? ` · ${v.hint}` : ""}
    </StatusPill>
  );
};

/** "Install the extension": reveals the bundled extension folder and opens the browser's extensions page, then shows the three steps. */
export function InstallExtension() {
  const { t } = useT();
  const [folder, setFolder] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        iconLeft="folder"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setFolder(await api.installExtension());
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("ext.install")}
      </Button>
      {folder === null && <Banner tone="info">{t("ext.none")}</Banner>}
      {folder && (
        <div className="sk-guide" data-testid="install-guide">
          <b>{t("ext.almost")}</b>
          <ol className="sk-steps">
            <li>
              <Rich text={t("ext.step1")} />
            </li>
            <li>
              <Rich text={t("ext.step2")} />
            </li>
            <li>
              {t("ext.step3")} <code>{folder}</code>{" "}
              <Button size="sm" iconLeft="copy" onClick={() => api.copy(folder)}>
                {t("ext.copyPath")}
              </Button>
            </li>
          </ol>
        </div>
      )}
    </>
  );
}
