const HIDDEN = /^(ELECTRON_|NODE_|SPEAKKIT_)|TOKEN|SECRET|PASSWORD|API_?KEY|CREDENTIAL/i;

/** Environment for programs Speak Kit starts for the user (the browser, osascript): this process's own, without Electron and Node switches, Speak Kit settings and anything named like a secret. */
export function launchEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) if (v !== undefined && !HIDDEN.test(k)) env[k] = v;
  return env;
}
