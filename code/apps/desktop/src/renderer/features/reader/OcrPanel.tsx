import { useRef, useState } from "react";
import { Banner, Button, Modal, ProgressBar } from "@speakkit/ui";
import { library, span } from "../library";
import { openPdfOcr, recognizeAll, type OcrProgress } from "./ocr";

type Phase = { name: "offer" } | { name: "consent" } | { name: "running"; progress?: OcrProgress } | { name: "failed"; message: string };

/** F11 and F13: a PDF without a text layer. Text recognition runs on this computer, only after the person agrees, and loads its code then. */
export function OcrPanel({ id, pages, onDone }: { id: string; pages: number; onDone(): void }) {
  const [phase, setPhase] = useState<Phase>({ name: "offer" });
  const abort = useRef<AbortController>(undefined);

  const run = async () => {
    const ac = (abort.current = new AbortController());
    setPhase({ name: "running" });
    try {
      const bytes = await library.source(id);
      if (!bytes) throw new Error("The original PDF is no longer stored.");
      const engine = await openPdfOcr(bytes);
      const blocks = await recognizeAll(engine, (progress) => setPhase({ name: "running", progress }), ac.signal);
      if (!blocks.length) throw new Error("No text was recognized on these pages.");
      await library.replaceBlocks(id, blocks);
      onDone();
    } catch (e) {
      setPhase(e instanceof DOMException && e.name === "AbortError" ? { name: "offer" } : { name: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  };

  if (phase.name === "running")
    return (
      <div className="rd-ocr" role="status" aria-label="Recognizing text">
        <b>Recognizing text</b>
        <span className="rd-muted" data-testid="ocr-progress">
          {phase.progress ? `Page ${phase.progress.page} of ${phase.progress.total}${phase.progress.leftMs ? ` · about ${span(phase.progress.leftMs)} left` : ""}` : "Getting ready"}
        </span>
        <ProgressBar value={phase.progress ? ((phase.progress.page - 1) / phase.progress.total) * 100 : undefined} label="Text recognition" />
        <Button size="sm" onClick={() => abort.current?.abort()}>
          Cancel
        </Button>
      </div>
    );
  return (
    <>
      <Banner
        tone={phase.name === "failed" ? "error" : "warning"}
        title={phase.name === "failed" ? "Text recognition stopped" : "This PDF has no text layer"}
        action={
          <Button size="sm" variant="primary" onClick={() => setPhase({ name: "consent" })}>
            {phase.name === "failed" ? "Try again" : "Recognize text"}
          </Button>
        }
      >
        {phase.name === "failed" ? phase.message : `The ${pages} pages are pictures of text. Reading aloud needs text recognition (OCR), which runs on this computer.`}
      </Banner>
      <Modal
        open={phase.name === "consent"}
        onClose={() => setPhase({ name: "offer" })}
        title="Recognize text on this computer?"
        width={460}
        footer={
          <>
            <Button onClick={() => setPhase({ name: "offer" })}>Not now</Button>
            <Button variant="primary" onClick={() => void run()}>
              Recognize text
            </Button>
          </>
        }
      >
        <p className="rd-muted">
          Speak Kit will download English language data for text recognition once, from cdn.jsdelivr.net (a few megabytes), and keep it in this app. The pages themselves never leave this computer.
          Long documents take a while; you can cancel at any time.
        </p>
      </Modal>
    </>
  );
}
