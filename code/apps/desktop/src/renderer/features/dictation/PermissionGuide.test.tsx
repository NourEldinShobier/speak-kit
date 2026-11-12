import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { PermissionId, PermissionState } from "../../../shared/permissions/channels";
import type { PermissionsStatus } from "../../../shared/permissions/contract";
import { guideFor } from "../../../shared/permissions/guide";
import { PermissionGuide } from "./PermissionGuide";

const status = (over: Partial<Record<PermissionId, PermissionState>>): PermissionsStatus => {
  const states = { accessibility: "granted", "input-monitoring": "granted", microphone: "granted", "screen-recording": "not-needed", ...over } as Record<PermissionId, PermissionState>;
  return { platform: "darwin", states, guides: { dictation: guideFor(states, "dictation"), "screen-reading": guideFor(states, "screen-reading"), meetings: guideFor(states, "meetings") } };
};
const html = (s: PermissionsStatus | null) => renderToStaticMarkup(<PermissionGuide status={s} onAct={() => undefined} />);
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("PermissionGuide", () => {
  it("lists what is open with a button per step, naming the permission for screen readers", () => {
    const h = html(status({ "input-monitoring": "denied", accessibility: "not-determined" }));
    expect(text(h)).toContain("1 of 3 allowed");
    expect(text(h)).toContain("Input Monitoring To notice the hotkey in any app. Blocked.");
    expect(h).toContain('aria-label="Open settings Input Monitoring"');
    expect(h).toContain('aria-label="Allow Accessibility"');
    expect(h).not.toContain("Allow Microphone");
  });

  it("is hidden when everything is allowed, before the status arrives, and when the system could not say", () => {
    expect(html(status({}))).toBe("");
    expect(html(null)).toBe("");
    expect(html(status({ microphone: "unknown" }))).toBe("");
  });

  it("leaves out permissions this system does not have", () => {
    const s = status({ accessibility: "not-needed", "input-monitoring": "not-needed", microphone: "denied" });
    expect(text(html(s))).not.toContain("Accessibility");
    expect(text(html(s))).toContain("0 of 1 allowed");
  });
});
