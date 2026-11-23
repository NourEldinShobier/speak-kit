import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { WriterCard } from "../../../shared/speech-models/contract";

vi.mock("../engines", () => ({ models: {} }));
const { WriterDownload } = await import("./WriterDownload");

const card = (over: Partial<WriterCard> = {}): WriterCard => ({
  id: "writer-gemma-4-e2b",
  name: "Gemma 4 E2B",
  description: "",
  bytes: 3_349_516_256,
  installed: false,
  license: { name: "Apache 2.0", url: "" },
  diskBytes: 0,
  ...over,
});
const text = (w: WriterCard) =>
  renderToStaticMarkup(<WriterDownload w={w} />)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("the writer download in the rewrite dialog", () => {
  it("offers the download with its size when the file is not on disk", () => {
    expect(text(card())).toBe("Download Gemma 4 E2B, 3.3 GB");
  });

  it("shows how much arrived and offers to pause and cancel while it runs", () => {
    const t = text(card({ transfer: { state: "running", fraction: 0.5, etaSeconds: 600 } }));
    expect(t).toContain("1.7 GB of 3.3 GB. About 10 minutes left.");
    expect(t).toContain("Pause");
    expect(t).toContain("Cancel");
  });

  it("offers to resume a paused download and says the part is kept", () => {
    const t = text(card({ transfer: { state: "paused", fraction: 0.25 } }));
    expect(t).toContain("Paused at 837 MB of 3.3 GB. The part already downloaded is kept.");
    expect(t).toContain("Resume");
  });

  it("names the host of a failed download and offers to try again", () => {
    const t = text(card({ failure: { kind: "unreachable", message: "huggingface.co cannot be reached.", host: "huggingface.co", keptBytes: 0, advice: "try-again" } }));
    expect(t).toContain("huggingface.co cannot be reached.");
    expect(t).toContain("Try again");
  });

  it("says it is downloaded, and where to delete it, once it is on disk", () => {
    expect(text(card({ installed: true, diskBytes: 3_349_516_256 }))).toBe("Gemma 4 E2B is downloaded (3.3 GB). Delete it under Engines, Disk space.");
  });
});
