import { isLabId, type LabId } from "./labs";

export type DeepLink = { kind: "launch" } | { kind: "pair" } | { kind: "lab"; id: LabId };

/** Parses speakkit://launch, speakkit://pair and speakkit://lab/<id> (a known lab). Anything else (other schemes, hosts, credentials) is ignored; query and path are never used, so a link cannot carry a token. */
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
  if (u.hostname === "lab") {
    const id = u.pathname.slice(1);
    return isLabId(id) ? { kind: "lab", id } : null;
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
  navigate(sub: "browser" | "experiments"): void;
  /** Make sure the loopback server is running (no-op when it is). */
  ensureServer(): void;
}

/** launch: bring the app up. pair: same, then open the Browser page where the token lives. lab: open Experiments. */
export function handleDeepLink(link: DeepLink, a: DeepLinkActions): void {
  a.ensureServer();
  a.showWindow();
  if (link.kind === "pair") a.navigate("browser");
  if (link.kind === "lab") a.navigate("experiments");
}
