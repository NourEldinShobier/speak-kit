import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const RENDERER = join(import.meta.dirname, "../../renderer");
const PAGES = [
  "App.tsx",
  "HomePage.tsx",
  "Sidebar.tsx",
  "TitleBar.tsx",
  "QuitDialog.tsx",
  "UpdateCard.tsx",
  "ModelDownloadCard.tsx",
  "pages.tsx",
  "TokenField.tsx",
  "features/palette/Palette.tsx",
  "features/apps/AppSuggestions.tsx",
  "features/experiments/ExperimentsPage.tsx",
  "features/export/ExportDialog.tsx",
  "features/export/ExportPill.tsx",
  "features/export/JobViews.tsx",
  "features/export/OptionsView.tsx",
  "features/library/DocRow.tsx",
  "features/library/ItemDialogs.tsx",
  "features/library/LibraryBody.tsx",
  "features/library/LibraryHead.tsx",
  "features/library/LibraryPage.tsx",
  "features/library/PasteDialog.tsx",
  "features/library/UrlDialog.tsx",
  "features/voices/VoicesPage.tsx",
  "features/voices/VoiceDrawer.tsx",
  "features/voice-chat/VoiceChatCard.tsx",
  "features/voice-chat/VoiceChatPage.tsx",
  "features/settings/AboutPage.tsx",
  "features/settings/AccessibilityPage.tsx",
  "features/settings/Advanced.tsx",
  "features/settings/AutomationPage.tsx",
  "features/settings/BrowserPage.tsx",
  "features/settings/DeleteDownloadsDialog.tsx",
  "features/settings/DiagnosticsPage.tsx",
  "features/settings/ExperimentsPage.tsx",
  "features/settings/GeneralPage.tsx",
  "features/settings/MemoryPage.tsx",
  "features/settings/NotificationsPage.tsx",
  "features/settings/PrivacyPage.tsx",
  "features/settings/ResourcesSection.tsx",
  "features/settings/SettingsFrame.tsx",
  "features/settings/SettingsSearch.tsx",
  "features/settings/ShortcutsPage.tsx",
  "features/settings/StoragePage.tsx",
  "features/settings/VoicePage.tsx",
  "features/settings/WhatsNewPage.tsx",
];

/** Names of keys and commands, which are the same in every language. */
const SAME_EVERYWHERE = new Set(["Speak Kit", "Kokoro-82M", "Esc", "Enter", "speakkit", "Promise", "document.querySelector", "https://example.com/article"]);

/** Limit: a regex scan of JSX text on one line and quoted attributes; it misses multi-line text, template literals, ternary strings and `attr={"..."}`. Text a reader sees that is written in the source instead of coming from the string table. */
function literals(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/>\s*([^<>{}\n]*[A-Za-z]{2}[^<>{}\n]*)\s*</g)) found.push(m[1]!.trim());
  for (const m of source.matchAll(/\b(?:label|aria-label|title|placeholder|description|alt)="([^"]*[A-Za-z]{2}[^"]*)"/g)) found.push(m[1]!);
  return found.filter((x) => !SAME_EVERYWHERE.has(x) && !/^;|^\)|&&|\|\||\?\s*\($/.test(x));
}

describe("interface text in the translated pages", () => {
  it.each(PAGES)("%s has no string written outside the table", (file) => {
    const code = readFileSync(join(RENDERER, file), "utf8");
    expect(literals(code)).toEqual([]);
  });

  it("the check finds a hard-coded label and a hard-coded text", () => {
    expect(literals('<Button label="Save">Delete me</Button>')).toEqual(["Delete me", "Save"]);
  });
});
