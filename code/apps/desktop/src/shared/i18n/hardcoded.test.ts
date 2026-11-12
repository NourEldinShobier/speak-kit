import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const RENDERER = join(import.meta.dirname, "../../renderer");
const PAGES = [
  "App.tsx",
  "HomePage.tsx",
  "Sidebar.tsx",
  "TitleBar.tsx",
  "features/settings/Advanced.tsx",
  "features/settings/AutomationPage.tsx",
  "features/settings/GeneralPage.tsx",
  "features/settings/NotificationsPage.tsx",
  "features/settings/PrivacyPage.tsx",
  "features/settings/SettingsSearch.tsx",
  "features/settings/ShortcutsPage.tsx",
  "features/settings/VoicePage.tsx",
];

/** Names of keys and commands, which are the same in every language. */
const SAME_EVERYWHERE = new Set(["Esc", "speakkit", "Promise"]);

/** Limit: a regex scan of JSX text on one line and quoted attributes; it misses multi-line text, template literals, ternary strings and `attr={"..."}`. Text a reader sees that is written in the source instead of coming from the string table. */
function literals(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/>\s*([^<>{}\n]*[A-Za-z]{2}[^<>{}\n]*)\s*</g)) found.push(m[1]!.trim());
  for (const m of source.matchAll(/\b(?:label|aria-label|title|placeholder|description|alt)="([^"]*[A-Za-z]{2}[^"]*)"/g)) found.push(m[1]!);
  return found.filter((x) => !SAME_EVERYWHERE.has(x) && !/^;|&&|\|\|/.test(x));
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
