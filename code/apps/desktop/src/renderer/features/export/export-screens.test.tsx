import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ExportView } from "../../../shared/export";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { appState } from "../../app-state.fixture";
import { englishT } from "../../../shared/i18n";
import { doneView, renderingView } from "./JobViews";
import { initExport } from "./model";
import { optionsView } from "./OptionsView";

const job: ExportView = { id: "x1", name: "chapter.mp3", stage: "rendering", progress: 0.25, done: 1, total: 4 };
const html = (n: React.ReactNode) => renderToStaticMarkup(<>{n}</>);

describe("Export rendering view", () => {
  const v = renderingView({ job, onClose() {}, dispatch() {}, t: englishT });

  it("has a full-width 4 px progress bar between the status line and the hint", () => {
    const body = html(v.body);
    expect(body).toContain('class="lm-progress lm-progress--block sk-export__bar"');
    expect(body).toContain('aria-valuenow="25"');
    expect(body.indexOf("Rendering sentence 2 of 4")).toBeLessThan(body.indexOf("sk-export__bar"));
    expect(body.indexOf("sk-export__bar")).toBeLessThan(body.indexOf("You can close this window"));
  });
});

describe("Export done view", () => {
  it("lists the saved audio file only", () => {
    const done: ExportView = { ...job, stage: "done", path: "C:/x/chapter.mp3", bytes: 2048 };
    const body = html(doneView({ job: done, onClose() {}, dispatch() {}, t: englishT }).body);
    expect(body).toContain("<li>chapter.mp3</li>");
    expect(body).not.toContain("captions");
  });
});

describe("Export options", () => {
  it("offers format, voice, file name and folder, and no captions or chapter options", () => {
    const st = initExport(appState(), { text: "One sentence." });
    const body = html(optionsView({ s: appState(), st, dispatch() {}, onClose() {}, start() {}, t: englishT }).body);
    expect(body).toContain("File name");
    expect(body).toContain("Folder");
    expect(body).not.toContain("Captions");
    expect(body).not.toContain("chapter markers");
  });
});
