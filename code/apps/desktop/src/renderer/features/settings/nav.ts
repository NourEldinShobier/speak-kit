import type { IconName } from "@speakkit/ui";
import type { SettingsSub } from "../../../shared/ipc";

export const SETTINGS_NAV: { group: string; items: { id: SettingsSub; label: string; icon: IconName }[] }[] = [
  {
    group: "General",
    items: [
      { id: "general", label: "General", icon: "settings" },
      { id: "voice", label: "Voice and playback", icon: "volume" },
      { id: "shortcuts", label: "Shortcuts", icon: "keyboard" },
      { id: "notifications", label: "Notifications", icon: "bell" },
    ],
  },
  {
    group: "Device",
    items: [
      { id: "memory", label: "Memory", icon: "cpu" },
      { id: "storage", label: "Storage", icon: "folder" },
    ],
  },
  {
    group: "App",
    items: [
      { id: "browser", label: "Browser integration", icon: "world" },
      { id: "about", label: "About", icon: "info-circle" },
    ],
  },
];
