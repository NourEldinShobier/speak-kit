import { LINKS } from "../../shared/links";

interface LaunchDeps {
  /** open the deep link in a tab; resolves to the tab id */
  openTab(url: string): Promise<number | undefined>;
  closeTab(id: number): Promise<void>;
  /** true when the app answers on its port */
  isRunning(): Promise<boolean>;
  sleep(ms: number): Promise<void>;
}

type LaunchResult =
  | { ok: true; via: "running" | "protocol" }
  /** the protocol handler did not bring the app up in time; the UI then shows the install / start instructions */
  | { ok: false; via: "none"; reason: "not-installed-or-slow" };

/**
 * Starts the desktop app through the speakkit:// deep link. A tab is opened on the link (Chrome hands it to the OS
 * protocol handler), closed again shortly after, and the app's health endpoint is polled for up to `waitMs`.
 */
export async function launchApp(deps: LaunchDeps, waitMs = 8000, url = LINKS.launch): Promise<LaunchResult> {
  if (await deps.isRunning()) return { ok: true, via: "running" };
  let id: number | undefined;
  try {
    id = await deps.openTab(url);
  } catch {
    /* tab creation refused: fall through to polling, the user may start the app by hand */
  }
  const started = await (async () => {
    for (let waited = 0; waited < waitMs; waited += 500) {
      await deps.sleep(500);
      if (await deps.isRunning()) return true;
    }
    return false;
  })();
  if (id !== undefined) await deps.closeTab(id).catch(() => {});
  return started ? { ok: true, via: "protocol" } : { ok: false, via: "none", reason: "not-installed-or-slow" };
}
