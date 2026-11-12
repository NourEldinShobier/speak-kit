import path from "node:path";
import type { NoticeAction } from "../../shared/capture/notices";

export type ExternalTarget = { kind: "url"; value: string } | { kind: "path"; value: string };

/** What a notice button opens outside the app, per operating system. `home` is the person's home folder (macOS has no shell URL for the Trash). */
export function externalFor(action: NoticeAction, os: "win32" | "darwin" | "other", home: string): ExternalTarget | undefined {
  const mac = os === "darwin";
  if (action === "open-audio") return { kind: "url", value: mac ? "x-apple.systempreferences:com.apple.preference.sound" : "ms-settings:sound" };
  if (action === "open-trash") return mac ? { kind: "path", value: path.join(home, ".Trash") } : { kind: "url", value: "shell:RecycleBinFolder" };
  return undefined;
}
