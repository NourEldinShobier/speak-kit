import { EmptyState } from "@speakkit/ui";
import { menuItem, settingsItem, type MenuPage } from "./routes";
import type { SettingsSub } from "../shared/ipc";
import { Page } from "./ui";

/** A page that is not built yet: the right title and layout, and a short empty state. */
export function StubPage({ page, setting }: { page?: MenuPage; setting?: SettingsSub }) {
  const d = page ? menuItem(page) : settingsItem(setting!);
  return (
    <Page title={d.label} lead={d.lead}>
      <EmptyState icon={d.icon} title="Coming soon">
        This page is not available in this version yet.
      </EmptyState>
    </Page>
  );
}
