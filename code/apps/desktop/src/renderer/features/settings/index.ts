/**
 * The settings pages, the frame around them (notice, row focus) and the accessibility effects the shell mounts.
 */
import { lazy } from "react";

export { GeneralPage } from "./GeneralPage";
export { ShortcutsPage } from "./ShortcutsPage";
export { PrivacyPage } from "./PrivacyPage";
export { SettingsFrame } from "./SettingsFrame";
export { Advanced } from "./Advanced";
export { requestRow } from "./focus";
export { QuickTopics, SettingsResults, SettingsSearchField } from "./SettingsSearch";

// These pages are rarely opened: their code and text load on first use.
export const AboutPage = lazy(() => import("./AboutPage").then((m) => ({ default: m.AboutPage })));
export const AccessibilityPage = lazy(() => import("./AccessibilityPage").then((m) => ({ default: m.AccessibilityPage })));
export const BrowserPage = lazy(() => import("./BrowserPage").then((m) => ({ default: m.BrowserPage })));
export const StoragePage = lazy(() => import("./StoragePage").then((m) => ({ default: m.StoragePage })));
export const WhatsNewPage = lazy(() => import("./WhatsNewPage").then((m) => ({ default: m.WhatsNewPage })));
