export type MicAccess = "granted" | "denied" | "not-determined" | "restricted" | "unknown";

export const MIC_ACCESS_TEXT: Record<MicAccess, string> = {
  granted: "Allowed",
  denied: "Blocked in system settings",
  "not-determined": "Not asked yet",
  restricted: "Restricted by this computer",
  unknown: "Not known",
};

/** Maps what the operating system reports to the five states the page knows. Anything else is "unknown". */
export function micAccessOf(raw: string | undefined): MicAccess {
  return raw === "granted" || raw === "denied" || raw === "not-determined" || raw === "restricted" ? raw : "unknown";
}
