import { app, shell } from "electron";
import type { NoticeAction } from "../../shared/capture/notices";
import { externalFor } from "./notice-target";
import type { CapturePlatform } from "./platform/types";

/** What a notice button does: opens the system place it names, asks for a folder, or tries again. Resolves "folder" when the page must ask for one. */
export async function runNoticeAction(action: NoticeAction, d: { platform: CapturePlatform; retry(): void }): Promise<"folder" | "done"> {
  const external = externalFor(action, d.platform.os, app.getPath("home"));
  if (external) await (external.kind === "url" ? shell.openExternal(external.value) : shell.openPath(external.value));
  else if (action === "open-permissions") await d.platform.openScreenSettings();
  else if (action === "choose-folder") return "folder";
  else if (action === "retry") d.retry();
  return "done";
}
