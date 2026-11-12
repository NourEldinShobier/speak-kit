export const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const ps = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * The one command a person can paste into a terminal to put the launcher where the Install button would, for when the button failed.
 * Null where there is no launcher to install (a build run from source, Linux).
 */
export function manualInstallCommand(platform: NodeJS.Platform, shippedDir: string | undefined): string | null {
  if (!shippedDir) return null;
  if (platform === "win32") {
    return `[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ';' + ${ps(shippedDir)}, 'User')`;
  }
  if (platform === "darwin") {
    return `mkdir -p ~/.local/bin && printf '#!/bin/sh\\nexec "%s" "$@"\\n' ${shellQuote(`${shippedDir}/speakkit`)} > ~/.local/bin/speakkit && chmod +x ~/.local/bin/speakkit`;
  }
  return null;
}
