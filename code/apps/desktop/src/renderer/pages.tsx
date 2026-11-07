import { createContext, useContext, useState } from "react";
import { Banner, Button, StatusPill } from "@speakkit/ui";
import type { AppState } from "../shared/ipc";
import { engineView } from "../shared/engine-view";
import { api, usePreview } from "./ui";

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
        Install from this app
      </Button>
      {folder === null && <Banner tone="info">This copy has no bundled extension. Use the Chrome Web Store link.</Banner>}
      {folder && (
        <div className="sk-guide" data-testid="install-guide">
          <b>Almost there</b>
          <ol className="sk-steps">
            <li>
              In the extensions page that just opened, turn on <b>Developer mode</b> (top right).
            </li>
            <li>
              Choose <b>Load unpacked</b>.
            </li>
            <li>
              Pick this folder, which is open in Explorer: <code>{folder}</code>{" "}
              <Button size="sm" iconLeft="copy" onClick={() => api.copy(folder)}>
                Copy path
              </Button>
            </li>
          </ol>
        </div>
      )}
    </>
  );
}
