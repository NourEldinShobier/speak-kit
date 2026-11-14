/**
 * The settings pages, the frame around them (notice, row focus) and the accessibility effects the shell mounts.
 */
import { lazy } from "react";

export { GeneralPage } from "./GeneralPage";
export { VoicePage } from "./VoicePage";
export { ShortcutsPage } from "./ShortcutsPage";
export { NotificationsPage } from "./NotificationsPage";
export { PrivacyPage } from "./PrivacyPage";
export { AutomationPage } from "./AutomationPage";
export { SettingsFrame } from "./SettingsFrame";
export { useMotionPreference } from "./accessibility";
export { requestRow } from "./focus";
export { QuickTopics, SettingsResults, SettingsSearchField } from "./SettingsSearch";

// These pages are rarely opened: their code and text load on first use.
export const AboutPage = lazy(() => import("./AboutPage").then((m) => ({ default: m.AboutPage })));
export const AccessibilityPage = lazy(() => import("./AccessibilityPage").then((m) => ({ default: m.AccessibilityPage })));
export const BrowserPage = lazy(() => import("./BrowserPage").then((m) => ({ default: m.BrowserPage })));
export const DiagnosticsPage = lazy(() => import("./DiagnosticsPage").then((m) => ({ default: m.DiagnosticsPage })));
export const ExperimentsPage = lazy(() => import("./ExperimentsPage").then((m) => ({ default: m.ExperimentsPage })));
export const MemoryPage = lazy(() => import("./MemoryPage").then((m) => ({ default: m.MemoryPage })));
export const StoragePage = lazy(() => import("./StoragePage").then((m) => ({ default: m.StoragePage })));
export const WhatsNewPage = lazy(() => import("./WhatsNewPage").then((m) => ({ default: m.WhatsNewPage })));
