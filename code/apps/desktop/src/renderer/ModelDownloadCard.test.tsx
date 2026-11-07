import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { downloadLine, ModelDownloadCard } from "./ModelDownloadCard";

describe("downloadLine", () => {
  it("reads percent, then downloaded of total, with a middle dot", () => {
    expect(downloadLine(0.62, 177, false)).toBe("62% · 110 MB of 177 MB");
    expect(downloadLine(0, 177, false)).toBe("0% · 0 MB of 177 MB");
    expect(downloadLine(1, 177, false)).toBe("100% · 177 MB of 177 MB");
  });

  it("says where a paused download stopped", () => {
    expect(downloadLine(0.62, 177, true)).toBe("Paused at 62% · 110 MB of 177 MB");
  });
});

describe("ModelDownloadCard", () => {
  const card = (pct: number, paused = false) => renderToStaticMarkup(<ModelDownloadCard name="kokoro-82m (q8)" pct={pct} totalMb={177} paused={paused} />);

  it("has the name, the line and a 6 px bar across the card, and no badge", () => {
    const html = card(0.62);
    expect(html).toContain('<b class="mdc__name">kokoro-82m (q8)</b>');
    expect(html).toContain('<span class="mdc__line">62% · 110 MB of 177 MB</span>');
    expect(html).toContain('class="lm-progress mdc__bar"');
    expect(html).toContain('aria-valuenow="62"');
    expect(html).not.toContain("lm-pill");
    expect(html).not.toContain("lm-row");
  });

  it("paused", () => {
    expect(card(0.62, true)).toContain("Paused at 62% · 110 MB of 177 MB");
  });
});
