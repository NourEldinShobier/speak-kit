/**
 * Settings page registry: ONE line per settings page id in SETTINGS_PAGES below. To build one, create renderer/features/<name>/
 * (public interface in index.ts). The sidebar list lives in routes.ts. Main pages have their registry in page-registry.tsx.
 */
import { Suspense, type ComponentType } from "react";
import type { AppState, SettingsSub } from "../shared/ipc";
import { AboutPage, AccessibilityPage, BrowserPage, GeneralPage, PrivacyPage, SettingsFrame, ShortcutsPage, StoragePage, WhatsNewPage } from "./features/settings";
import "./settings.css";

const SETTINGS_PAGES: Record<SettingsSub, ComponentType<{ s: AppState }>> = {
  general: GeneralPage,
  shortcuts: ShortcutsPage,
  accessibility: AccessibilityPage,
  storage: StoragePage,
  privacy: PrivacyPage,
  browser: BrowserPage,
  whatsnew: WhatsNewPage,
  about: AboutPage,
};

export function Settings({ s, sub }: { s: AppState; sub: SettingsSub }) {
  const Body = SETTINGS_PAGES[sub];
  return (
    <SettingsFrame s={s} sub={sub}>
      <Suspense fallback={null}>
        <Body s={s} />
      </Suspense>
    </SettingsFrame>
  );
}
