import { defaultSettings as protocolDefaults, type Settings as ProtocolSettings } from "@speakkit/protocol";

/** Reader view preferences (panel in the reader: font, size, width, theme, highlight). Extension-side addition to the protocol Settings. */
export interface ReaderSettings {
  font: "sans" | "serif" | "dyslexic";
  /** px, 14 to 28 */
  size: number;
  /** px, 480 to 960 */
  width: number;
  theme: "paper" | "light";
  /** sentence / paragraph / word highlight inside the reader */
  highlight: boolean;
}

export type Settings = ProtocolSettings & { reader: ReaderSettings };

export const defaultReader = (): ReaderSettings => ({ font: "sans", size: 18, width: 680, theme: "paper", highlight: true });
export const defaultSettings = (): Settings => ({ ...protocolDefaults(), reader: defaultReader() });

/** Deep merge of stored (possibly partial) settings over the defaults; no validation (use parseSettings in the service worker). */
export function withDefaults(stored: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  const s = stored ?? {};
  return {
    ...d,
    ...s,
    launcher: { ...d.launcher, ...s.launcher },
    show: { ...d.show, ...s.show },
    highlight: { ...d.highlight, ...s.highlight },
    skip: { ...d.skip, ...s.skip },
    reader: { ...d.reader, ...s.reader },
    sites: { ...d.sites, ...s.sites },
  };
}

/** Props every options section receives. */
export interface SectionProps {
  s: Settings;
  upd: (fn: (s: Settings) => Settings) => void;
  saved: boolean;
}
