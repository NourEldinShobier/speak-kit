import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ExportView } from "../../../shared/export";
import { appState } from "../../app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { renderingView } from "./JobViews";
import { initExport } from "./model";
import { optionsView } from "./OptionsView";

const job: ExportView = { id: "x1", name: "chapter.mp3", stage: "rendering", progress: 0.25, done: 1, total: 4 };
const html = (n: React.ReactNode) => renderToStaticMarkup(<>{n}</>);

describe("Export options", () => {
  const s = appState();
  const v = optionsView({ s, st: initExport(s, { text: "Hello there." }), dispatch() {}, onClose() {}, start() {} });
  const body = html(v.body);

  it("every control is 36 px: Format and bitrate dropdowns, Voice, File name, Browse", () => {
    expect(body).not.toContain("lm-select--sm");
    expect(body).not.toContain("lm-input--sm");
    expect(body).not.toContain("lm-btn--sm");
    expect(body).not.toContain("lm-seg");
    expect(body.match(/class="lm-select"/g)).toHaveLength(3);
    expect(body).toContain('aria-label="Format"');
    expect(body).toContain('aria-label="MP3 quality"');
  });
});

describe("Export rendering view", () => {
  const v = renderingView({ job, onClose() {}, dispatch() {} });

  it("has a full-width 4 px progress bar between the status line and the hint", () => {
    const body = html(v.body);
    expect(body).toContain('class="lm-progress lm-progress--block sk-export__bar"');
    expect(body).toContain('aria-valuenow="25"');
    expect(body.indexOf("Rendering sentence 2 of 4")).toBeLessThan(body.indexOf("sk-export__bar"));
    expect(body.indexOf("sk-export__bar")).toBeLessThan(body.indexOf("You can close this window"));
  });

  it("Cancel export is the destructive button", () => {
    expect(html(v.footer)).toContain('class="lm-btn lm-btn--danger"');
  });
});
