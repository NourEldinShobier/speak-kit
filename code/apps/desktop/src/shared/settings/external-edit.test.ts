import { describe, expect, it } from "vite-plus/test";
import { parseConfig } from "../schemas";
import { readExternalEdit } from "./external-edit";

const base = () => parseConfig({});
const text = (o: object) => JSON.stringify(o);

describe("readExternalEdit", () => {
  it("reports a changed top-level field with its new value", () => {
    const r = readExternalEdit(base(), text({ closeAction: "quit" }));
    expect(r).toEqual({ kind: "changed", patch: { closeAction: "quit" }, keys: ["closeAction"], repaired: [] });
  });

  it("is the same when the file holds what the app already has", () => {
    const current = base();
    expect(readExternalEdit(current, text(current))).toEqual({ kind: "same" });
    expect(readExternalEdit(current, text({}))).toEqual({ kind: "same" });
  });

  it("treats a half-written or non-object file as unreadable and changes nothing", () => {
    expect(readExternalEdit(base(), '{"closeAction": "qu')).toEqual({ kind: "unreadable" });
    expect(readExternalEdit(base(), "")).toEqual({ kind: "unreadable" });
    expect(readExternalEdit(base(), "[1,2]")).toEqual({ kind: "unreadable" });
    expect(readExternalEdit(base(), "null")).toEqual({ kind: "unreadable" });
  });

  it("repairs a bad value to its default and names the field", () => {
    const current = parseConfig({ closeAction: "quit" });
    const r = readExternalEdit(current, text({ closeAction: "explode", speed: 9 }));
    expect(r).toEqual({ kind: "changed", patch: { closeAction: "hide" }, keys: ["closeAction"], repaired: ["closeAction", "speed"] });
  });

  it("does not apply a file from a newer app", () => {
    expect(readExternalEdit(base(), text({ configVersion: 7, closeAction: "quit" }))).toEqual({ kind: "newer", version: 7 });
  });

  it("compares nested settings by value", () => {
    const current = base();
    const edited = structuredClone(current.notifications);
    edited["export-done"] = structuredClone(edited["reading-finished"]);
    const r = readExternalEdit(current, text({ notifications: edited }));
    expect(r.kind).toBe("changed");
    expect(r.kind === "changed" && r.keys).toEqual(["notifications"]);
  });

  it("leaves out the fields the caller keeps for this run", () => {
    expect(readExternalEdit(base(), text({ preferredPort: 5555 }), ["preferredPort"])).toEqual({ kind: "same" });
  });

  it("never takes the migration bookkeeping from an edit", () => {
    expect(readExternalEdit(base(), text({ appliedMigrations: ["x"] }))).toEqual({ kind: "same" });
  });
});
