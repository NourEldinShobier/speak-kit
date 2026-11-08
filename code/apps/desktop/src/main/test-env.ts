import { app } from "electron";

/**
 * Test-only switches read from the environment. A packaged app ignores them, so a variable set in the user's session
 * cannot swap the updater, fix the pairing token or open the test hook. (SPEAKKIT_ENGINE, _USER_DATA and _PORT stay
 * honoured everywhere: the packaged smoke test runs the installed build with them. SPEAKKIT_UPDATE_URL is also honoured by a packaged build
 * that runs in an isolated SPEAKKIT_USER_DATA folder, which is how the update end-to-end run drives the installed app.)
 */
export const testEnv = () => {
  const on = !app.isPackaged;
  const e = process.env;
  return {
    /** Installs the test hook (globalThis.__speakkit) and simulates the OS for shortcuts and toasts. */
    hook: on && !!e.SPEAKKIT_TEST,
    fakeUpdate: on ? e.SPEAKKIT_FAKE_UPDATE || undefined : undefined,
    token: on ? e.SPEAKKIT_TOKEN || undefined : undefined,
    /** Lets the library fetch pages from this machine (the e2e web server listens on loopback). */
    allowLocalUrls: on && !!e.SPEAKKIT_TEST,
    /** Feed address that replaces GitHub Releases; never read by a packaged build on the user's own data. */
    updateUrl: on || e.SPEAKKIT_USER_DATA ? e.SPEAKKIT_UPDATE_URL || undefined : undefined,
  };
};
