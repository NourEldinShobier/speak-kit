import { describe, expect, it } from "vite-plus/test";
import type { ExportView } from "../../../shared/export";
import { appState } from "../../app-state.fixture";
import { exportReducer, exportTitle, exportViewKind, initExport } from "./model";

const job = (stage: ExportView["stage"]): ExportView => ({ id: "j1", name: "a.mp3", stage, progress: 0.5, done: 1, total: 2 });

describe("initExport", () => {
  it("suggests a file name from the start of the text and takes the saved preferences", () => {
    const st = initExport(appState(), { text: "Chapter one. It was a dark night." });
    expect(st.form.name).toBe("Chapter one. It was a dark night.");
    expect(st.phase).toEqual({ kind: "options" });
    expect(st.error).toBeNull();
  });

  it("falls back to a default name for empty text and reopens a given job", () => {
    const st = initExport(appState(), { text: "", jobId: "j9" });
    expect(st.form.name).toBe("Speak Kit reading");
    expect(st.phase).toEqual({ kind: "job", id: "j9" });
  });
});

describe("exportReducer", () => {
  const start = () => initExport(appState(), { text: "Hello" });

  it("edits one option and keeps the others", () => {
    const st = exportReducer(start(), { type: "edit", patch: { name: "intro" } });
    expect(st.form.name).toBe("intro");
    expect(st.form.text).toBe("Hello");
  });

  it("walks options, file exists, rename, started and back to options", () => {
    const target = { path: "C:/x/intro.mp3", exists: true, alternative: "C:/x/intro (2).mp3" };
    let st = exportReducer(start(), { type: "exists", target });
    expect(st.phase).toEqual({ kind: "exists", target });
    st = exportReducer(st, { type: "rename" });
    expect(st.phase).toEqual({ kind: "options" });
    st = exportReducer(st, { type: "started", jobId: "j1" });
    expect(st.phase).toEqual({ kind: "job", id: "j1" });
    st = exportReducer(st, { type: "back-to-options" });
    expect(st.phase).toEqual({ kind: "options" });
  });

  it("keeps an error until the next attempt", () => {
    let st = exportReducer(start(), { type: "failed", message: "Disk full" });
    expect(st.error).toBe("Disk full");
    st = exportReducer(st, { type: "attempt" });
    expect(st.error).toBeNull();
  });
});

describe("exportViewKind and exportTitle", () => {
  it.each([
    ["rendering", "rendering", "Exporting audio"],
    ["encoding", "rendering", "Exporting audio"],
    ["saving", "rendering", "Exporting audio"],
    ["done", "done", "Export finished"],
    ["error", "error", "Export failed"],
    ["cancelled", "cancelled", "Export cancelled"],
  ] as const)("a %s job shows the %s view titled %s", (stage, kind, title) => {
    expect(exportViewKind({ kind: "job", id: "j1" }, job(stage))).toBe(kind);
    expect(exportTitle(kind)).toBe(title);
  });

  it("shows the options while the job is not in the app state yet, and the file-exists step", () => {
    expect(exportViewKind({ kind: "job", id: "j1" }, undefined)).toBe("options");
    expect(exportViewKind({ kind: "exists", target: { path: "p", exists: true, alternative: "q" } }, undefined)).toBe("exists");
    expect(exportTitle("options")).toBe("Export audio");
  });
});
