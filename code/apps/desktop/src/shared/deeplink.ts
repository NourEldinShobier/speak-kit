import { SETTINGS_SUBS, type SettingsSub } from "./ipc";

export type DeepLink = { kind: "launch" } | { kind: "pair" } | { kind: "settings"; page: SettingsSub } | { kind: "lab"; id: string };

/** Parses speakkit://launch, speakkit://pair, speakkit://settings/<page> and speakkit://lab/<id>. Anything else (other schemes, hosts, credentials, an unknown page) is ignored; the query is never used, so a link cannot carry a token or change a switch. */
export function parseDeepLink(raw: string): DeepLink | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "speakkit:" || u.username || u.password || u.port) return null;
  if (u.hostname === "launch") return { kind: "launch" };
  if (u.hostname === "pair") return { kind: "pair" };
  if (u.hostname === "settings") {
    const page = u.pathname.replace(/^\/+|\/+$/g, "");
    return (SETTINGS_SUBS as readonly string[]).includes(page) ? { kind: "settings", page: page as SettingsSub } : null;
  }
  if (u.hostname === "lab") {
    const id = u.pathname.replace(/^\/+|\/+$/g, "");
    return /^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ? { kind: "lab", id } : null;
  }
  return null;
}

/** First valid deep link in a process command line (second-instance argv or first launch). */
export function findDeepLink(argv: readonly string[]): DeepLink | null {
  for (const a of argv) {
    if (!a.startsWith("speakkit:")) continue;
    const l = parseDeepLink(a);
    if (l) return l;
  }
  return null;
}

interface DeepLinkActions {
  showWindow(): void;
  navigate(page: SettingsSub): void;
  /** Make sure the loopback server is running (no-op when it is). */
  ensureServer(): void;
}

/** launch: bring the app up. pair: same, then open the Browser page where the token lives. settings and lab: same, then open that page (a lab opens Experiments); a link never changes a setting. */
export function handleDeepLink(link: DeepLink, a: DeepLinkActions): void {
  a.ensureServer();
  a.showWindow();
  if (link.kind === "pair") a.navigate("browser");
  else if (link.kind === "settings") a.navigate(link.page);
  else if (link.kind === "lab") a.navigate("experiments");
}
