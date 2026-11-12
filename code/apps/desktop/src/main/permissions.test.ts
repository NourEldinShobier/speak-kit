import { describe, expect, it } from "vite-plus/test";
import { createPermissions } from "./permissions";

const sys = (status: string) => ({ getMediaAccessStatus: () => status });

describe("permissions adapter", () => {
  it("windows reports the status and opens the privacy page", () => {
    const p = createPermissions("win32", sys("denied"));
    expect(p.micStatus()).toBe("denied");
    expect(p.micSettingsUrl()).toBe("ms-settings:privacy-microphone");
  });

  it("macos reports the status and opens the security pane", () => {
    const p = createPermissions("darwin", sys("not-determined"));
    expect(p.micStatus()).toBe("not-determined");
    expect(p.micSettingsUrl()).toContain("Privacy_Microphone");
  });

  it("an unexpected answer or a throwing system is unknown", () => {
    expect(createPermissions("win32", sys("weird")).micStatus()).toBe("unknown");
    expect(createPermissions("win32", { getMediaAccessStatus: () => { throw new Error("x"); } }).micStatus()).toBe("unknown");
  });

  it("another system has no page and no status", () => {
    const p = createPermissions("linux", sys("granted"));
    expect(p.micStatus()).toBe("unknown");
    expect(p.micSettingsUrl()).toBeNull();
  });
});
