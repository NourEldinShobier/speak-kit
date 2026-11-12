import { Button, EmptyState, SettingsSection } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { api, Page } from "../../ui";
import { rowAttr } from "./focus";

/** The notes of the version that is running, kept when it was downloaded. A version without kept notes has the release page. */
export function WhatsNewPage({ s }: { s: AppState }) {
  const kept = s.config.whatsNew;
  const notes = kept.version === s.version ? kept.notes : [];
  return (
    <Page
      title="What is new"
      lead={`Speak Kit ${s.version}`}
      action={
        <Button onClick={() => api.openExternal("release-notes")} aria-label="Open the release notes in your browser">
          Release notes
        </Button>
      }
    >
      {notes.length > 0 ? (
        <SettingsSection title="In this version">
          <ul {...rowAttr("whatsnew/notes")} className="sk-notes sk-notes--page" data-testid="whatsnew-notes">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </SettingsSection>
      ) : (
        <div {...rowAttr("whatsnew/notes")}>
          <EmptyState icon="sparkles" title="No notes kept for this version" primary={{ label: "Open the release notes", onClick: () => void api.openExternal("release-notes") }}>
            Notes are kept when an update downloads. This version came another way, so its notes are on the release page.
          </EmptyState>
        </div>
      )}
    </Page>
  );
}
