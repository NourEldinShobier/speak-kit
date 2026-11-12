import { useEffect, type ReactNode } from "react";
import { Banner, Button } from "@speakkit/ui";
import type { AppState, SettingsSub } from "../../../shared/ipc";
import { noticeText } from "../../../shared/settings/settings-file";
import { api } from "../../ui";
import { revealRow, subscribeRow, takeRow } from "./focus";

/** Around every settings page: the notice about the settings file, and the ring on a row asked for by search. */
export function SettingsFrame({ s, sub, children }: { s: AppState; sub: SettingsSub; children: ReactNode }) {
  useEffect(() => {
    const reveal = () => {
      const id = takeRow();
      if (id) requestAnimationFrame(() => requestAnimationFrame(() => revealRow(document, id))); // after the fold has opened
    };
    reveal();
    return subscribeRow(() => queueMicrotask(reveal));
  }, [sub]);
  const n = s.settingsNotice;
  return (
    <>
      {n && (
        <div className="sk-notice" data-testid="settings-notice">
          <Banner
            tone={n.kind === "newer" ? "warning" : "info"}
            title={n.kind === "newer" ? "Settings file is from a newer version" : "Some settings were reset"}
            action={<Button onClick={() => api.dismissSettingsNotice()}>Dismiss</Button>}
          >
            {noticeText(n)}
          </Banner>
        </div>
      )}
      {children}
    </>
  );
}
