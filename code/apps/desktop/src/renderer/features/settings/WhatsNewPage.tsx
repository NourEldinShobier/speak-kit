import { Button, EmptyState, SettingsSection } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { api, Page } from "../../ui";
import { rowAttr } from "./focus";
import "../../../shared/i18n/packs/settings";
import { useT } from "../../i18n";

/** The notes of the version that is running, kept when it was downloaded. A version without kept notes has the release page. */
export function WhatsNewPage({ s }: { s: AppState }) {
  const { t } = useT();
  const kept = s.config.whatsNew;
  const notes = kept.version === s.version ? kept.notes : [];
  return (
    <Page
      title={t("s.new.title")}
      lead={`Speak Kit ${s.version}`}
      action={
        <Button onClick={() => api.openExternal("release-notes")} aria-label={t("s.new.open")}>
          {t("s.about.releaseNotes")}
        </Button>
      }
    >
      {notes.length > 0 ? (
        <SettingsSection title={t("s.new.inVersion")}>
          <ul {...rowAttr("whatsnew/notes")} className="sk-notes sk-notes--page" data-testid="whatsnew-notes">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </SettingsSection>
      ) : (
        <div {...rowAttr("whatsnew/notes")}>
          <EmptyState icon="sparkles" title={t("s.new.none")} primary={{ label: t("s.new.openNotes"), onClick: () => void api.openExternal("release-notes") }}>
            {t("s.new.noneBody")}
          </EmptyState>
        </div>
      )}
    </Page>
  );
}
