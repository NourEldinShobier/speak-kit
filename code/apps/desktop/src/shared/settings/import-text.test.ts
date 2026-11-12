import { describe, expect, it } from "vite-plus/test";
import { importMessage } from "./import-text";

describe("importMessage", () => {
  it("names the settings that changed", () => {
    expect(importMessage("en", { status: "imported", applied: 4, changed: ["voice", "controlServer"], skipped: [] })).toBe("Imported 4 settings. Changed: voice, controlServer.");
  });

  it("names the settings left out as well", () => {
    expect(importMessage("es", { status: "imported", applied: 2, changed: ["speed"], skipped: ["capture.folder"] })).toBe("Se importaron 2 ajustes. Cambiados: speed. Omitidos: capture.folder.");
  });

  it("says only the count when nothing differed from what is set", () => {
    expect(importMessage("en", { status: "imported", applied: 3, changed: [], skipped: [] })).toBe("Imported 3 settings.");
    expect(importMessage("en", { status: "imported", applied: 3, changed: [], skipped: ["x"] })).toBe("Imported 3 settings. Left out: x.");
  });

  it("shortens a long list of changes", () => {
    const changed = Array.from({ length: 10 }, (_, i) => `k${i}`);
    expect(importMessage("en", { status: "imported", applied: 10, changed, skipped: [] })).toBe("Imported 10 settings. Changed: k0, k1, k2, k3, k4, k5, k6, k7 +2.");
  });
});
