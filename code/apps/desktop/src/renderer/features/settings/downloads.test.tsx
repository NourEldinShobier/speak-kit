import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { DeleteDownloadsBody } from "./DeleteDownloadsDialog";
import { downloadRows, resultText } from "./downloads";

const storage = { modelsBytes: 92_000_000, cacheBytes: 12_000_000 };

describe("downloadRows", () => {
  it("names each kind of download with its size", () => {
    expect(downloadRows(storage)).toEqual([
      ["Voice models", "92 MB"],
      ["OCR language data and exports", "12 MB"],
    ]);
  });
});

describe("resultText", () => {
  it("says what was freed", () => {
    expect(resultText({ removed: [{ kind: "models", bytes: 5e6 }], failed: [], freedBytes: 5e6 })).toBe("Freed 5 MB. Speak Kit downloads the voice model again the next time you read.");
  });

  it("names the folders that stayed", () => {
    const r = {
      removed: [],
      failed: [
        { kind: "exports" as const, reason: "busy" as const },
        { kind: "ocr" as const, reason: "busy" as const },
      ],
      freedBytes: 0,
    };
    expect(resultText(r)).toBe("Freed 0 B. Could not remove exports, OCR language data: close the apps that use them and try again.");
  });
});

describe("DeleteDownloadsBody", () => {
  it("lists the sizes and says the library stays", () => {
    const html = renderToStaticMarkup(<DeleteDownloadsBody phase={{ step: "confirm" }} storage={storage} />);
    for (const text of ["Voice models", "92 MB", "Your library and settings stay."]) expect(html).toContain(text);
  });

  it("shows the result after the delete", () => {
    const html = renderToStaticMarkup(<DeleteDownloadsBody phase={{ step: "done", report: { removed: [], failed: [], freedBytes: 2_000_000 } }} storage={storage} />);
    expect(html).toContain("Freed 2 MB.");
  });
});
