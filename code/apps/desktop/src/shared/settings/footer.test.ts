import { describe, expect, it } from "vite-plus/test";
import { UPDATE_UNSUPPORTED, type UpdateState } from "../updates";
import { footerStatus } from "./footer";

const base = { port: 47615, serverError: null, update: UPDATE_UNSUPPORTED };

describe("sidebar footer status", () => {
  it("shows the port and no update line when there is no news", () => {
    expect(footerStatus(base)).toEqual({ listener: "Listening on 47615", update: null, problem: false });
  });

  it("says starting before the server has a port and stopped on an error", () => {
    expect(footerStatus({ ...base, port: 0 }).listener).toBe("Starting");
    expect(footerStatus({ ...base, serverError: { code: "port-busy" } as never })).toMatchObject({ listener: "Listener stopped", problem: true });
  });

  it("names every update state that needs the user to look", () => {
    const at = (update: UpdateState) => footerStatus({ ...base, update }).update;
    expect(at({ kind: "available", version: "0.6.0" })).toBe("Update 0.6.0 available");
    expect(at({ kind: "manual", version: "0.6.0", url: "u" })).toBe("Update 0.6.0 available");
    expect(at({ kind: "downloading", version: "0.6.0", percent: 41 })).toBe("Downloading 41%");
    expect(at({ kind: "ready", version: "0.6.0", onQuit: false })).toBe("Update ready");
    expect(at({ kind: "error", error: { code: "update-offline" }, phase: "check" })).toBe("Update check failed");
    expect(at({ kind: "idle", checkedAtMs: 1 })).toBeNull();
  });
});
