import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ExportView } from "../../../shared/export";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { renderingView } from "./JobViews";

const job: ExportView = { id: "x1", name: "chapter.mp3", stage: "rendering", progress: 0.25, done: 1, total: 4 };
const html = (n: React.ReactNode) => renderToStaticMarkup(<>{n}</>);

describe("Export rendering view", () => {
  const v = renderingView({ job, onClose() {}, dispatch() {} });

  it("has a full-width 4 px progress bar between the status line and the hint", () => {
    const body = html(v.body);
    expect(body).toContain('class="lm-progress lm-progress--block sk-export__bar"');
    expect(body).toContain('aria-valuenow="25"');
    expect(body.indexOf("Rendering sentence 2 of 4")).toBeLessThan(body.indexOf("sk-export__bar"));
    expect(body.indexOf("sk-export__bar")).toBeLessThan(body.indexOf("You can close this window"));
  });
});
