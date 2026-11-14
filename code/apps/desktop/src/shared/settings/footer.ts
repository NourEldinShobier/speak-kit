import type { AppState } from "../ipc";

/** The line at the foot of the Settings sidebar: the listener first, then the update when there is news. */
function updateLine(u: AppState["update"]): string | null {
  switch (u.kind) {
    case "available":
    case "manual":
      return `Update ${u.version} available`;
    case "downloading":
      return `Downloading ${u.percent}%`;
    case "ready":
      return "Update ready";
    case "error":
      return "Update check failed";
    default:
      return null;
  }
}

function listenerLine(s: Pick<AppState, "port" | "serverError">): string {
  if (s.serverError) return "Listener stopped";
  return s.port ? `Listening on ${s.port}` : "Starting";
}

export function footerStatus(s: Pick<AppState, "port" | "serverError" | "update">): { listener: string; update: string | null; problem: boolean } {
  return { listener: listenerLine(s), update: updateLine(s.update), problem: s.serverError !== null };
}
