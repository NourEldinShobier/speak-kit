import path from "node:path";

/** The folder the app keeps its files in: the same one `app.getPath("userData")` gives it (see main/index.ts). */
export function userDataDir(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): string {
  if (env.SPEAKKIT_USER_DATA) return env.SPEAKKIT_USER_DATA;
  const known: Partial<Record<NodeJS.Platform, string>> = {
    win32: env.APPDATA ?? path.join(home, "AppData", "Roaming"),
    darwin: path.join(home, "Library", "Application Support"),
  };
  const appData = known[platform] ?? env.XDG_CONFIG_HOME ?? path.join(home, ".config");
  return path.join(appData, "@speakkit", "desktop");
}

/** Where Claude Code looks for a personal skill. */
export const skillFilePath = (home: string): string => path.join(home, ".claude", "skills", "speakkit", "SKILL.md");
