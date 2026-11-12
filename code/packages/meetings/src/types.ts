/** What to do when a call starts in an app. */
export type CallPolicy = "ask" | "always" | "never";

/** A call app. Built-in ones ship as data; the person can add any app or meeting link. */
export interface Provider {
  id: string;
  name: string;
  /** Two letters for the mark in lists. */
  mark: string;
  /** Lower-case process names without extension (native apps, and the browsers or PWAs that host the app). */
  exes: string[];
  /** Case-insensitive regular expression sources a window title must match. A native app with no title rule matches by process alone. */
  titles?: string[];
  /** Full meeting link rules, as host plus path pattern. Only for apps that live in a browser tab. */
  links?: { host: string; path: string }[];
  /** True when the app lives in a browser tab (any browser process, and the title must match). */
  inBrowser?: boolean;
  userAdded?: boolean;
}

export interface MicUser {
  pid: number;
  /** Lower-case process name without extension. */
  exe: string;
}

export interface OpenWindow {
  pid: number;
  exe: string;
  title: string;
}

/** What the OS says right now. */
export interface Probe {
  micUsers: MicUser[];
  windows: OpenWindow[];
}

export interface CallSession {
  /** One per call: the same app starting a second call is a new session. */
  id: string;
  providerId: string;
  providerName: string;
  pid: number;
  startedAt: number;
  /** The window title the call was recognised by (for the temporary meeting title). */
  title: string;
}

export interface Failure {
  code: string;
  message: string;
}
