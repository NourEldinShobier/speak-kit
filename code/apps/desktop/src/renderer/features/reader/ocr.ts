import type { Block } from "../../../main/library/contract";
import { textToBlocks } from "../../../main/library/parse/text";

export interface OcrEngine {
  pageCount: number;
  /** recognized text of page n (1-based) */
  recognize(page: number): Promise<string>;
  close(): Promise<void>;
}

export interface OcrProgress {
  page: number;
  total: number;
  /** estimated ms left, from the pages done so far */
  leftMs: number;
}

/** Recognizes every page in order and returns the text as blocks tagged with their page. Stops at the next page boundary when aborted. */
export async function recognizeAll(engine: OcrEngine, onProgress: (p: OcrProgress) => void, signal: AbortSignal, now: () => number = Date.now): Promise<Block[]> {
  const out: Block[] = [];
  const t0 = now();
  try {
    for (let page = 1; page <= engine.pageCount; page++) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const done = page - 1;
      onProgress({ page, total: engine.pageCount, leftMs: done ? ((now() - t0) / done) * (engine.pageCount - done) : 0 });
      for (const b of textToBlocks(await engine.recognize(page))) out.push({ ...b, page });
    }
    return out;
  } finally {
    await engine.close();
  }
}

const SCALE = 2;

/** pdf.js renders each page to a canvas, tesseract.js reads it. Both are loaded here, on first use, and never before the person agreed. */
export async function openPdfOcr(bytes: Uint8Array, lang = "eng"): Promise<OcrEngine> {
  const [pdfjs, { createWorker }, pdfWorker, ocrWorker, ocrCore] = await Promise.all([
    import("pdfjs-dist"),
    import("tesseract.js"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    import("tesseract.js/dist/worker.min.js?url"),
    import("tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  const worker = await createWorker(lang, 1, { workerPath: ocrWorker.default, corePath: ocrCore.default, workerBlobURL: false });
  return {
    pageCount: doc.numPages,
    async recognize(n) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
      page.cleanup();
      const { data } = await worker.recognize(await canvas.convertToBlob());
      return data.text;
    },
    close: async () => {
      await worker.terminate();
      await task.destroy();
    },
  };
}
