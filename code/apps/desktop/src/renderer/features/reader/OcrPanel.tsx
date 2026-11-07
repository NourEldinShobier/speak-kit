import { useRef, useState } from "react";
import { Banner, Button, Modal, ProgressBar } from "@speakkit/ui";
import { plural } from "@speakkit/protocol";
import { library, span } from "../library";
import { openPdfOcr, recognizeAll, type OcrProgress } from "./ocr";

type Phase = { name: "offer" } | { name: "consent" } | { name: "running"; progress?: OcrProgress | undefined } | { name: "failed"; message: string };

const progressLine = (p: OcrProgress) => `Page ${p.page} of ${p.total}${p.leftMs ? ` · about ${span(p.leftMs)} left` : ""}`;

function Running({ progress, onCancel }: { progress?: OcrProgress | undefined; onCancel(): void }) {
  return (
    <section className="rd-ocr" aria-label="Recognizing text">
      <div className="rd-ocr__head">
        <b>Recognizing text</b>
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <span className="rd-ocr__status" role="status" data-testid="ocr-progress">
        {progress ? progressLine(progress) : "Getting ready"}
      </span>
      <ProgressBar value={progress ? ((progress.page - 1) / progress.total) * 100 : undefined} label="Text recognition" />
    </section>
  );
}

function ConsentModal({ open, onClose, onAgree }: { open: boolean; onClose(): void; onAgree(): void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Recognize text on this computer?"
      width={460}
      footer={
        <>
          <Button onClick={onClose}>Not now</Button>
          <Button variant="primary" onClick={onAgree}>
            Recognize text
          </Button>
        </>
      }
    >
      <p className="rd-muted">
        Speak Kit will download English language data for text recognition once, from cdn.jsdelivr.net (a few megabytes), and keep it in this app. The pages themselves never leave this computer. Long
        documents take a while; you can cancel at any time.
      </p>
    </Modal>
  );
}

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
      const blocks = await recognizeAll(engine, { onProgress: (progress) => setPhase({ name: "running", progress }), signal: ac.signal });
      if (!blocks.length) throw new Error("No text was recognized on these pages.");
      await library.replaceBlocks(id, blocks);
      onDone();
    } catch (e) {
      setPhase(e instanceof DOMException && e.name === "AbortError" ? { name: "offer" } : { name: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  };

  if (phase.name === "running") return <Running progress={phase.progress} onCancel={() => abort.current?.abort()} />;
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
        {phase.name === "failed"
          ? phase.message
          : `The ${plural(pages, "page", "pages")} ${pages === 1 ? "is a picture" : "are pictures"} of text. Reading aloud needs text recognition (OCR), which runs on this computer.`}
      </Banner>
      <ConsentModal open={phase.name === "consent"} onClose={() => setPhase({ name: "offer" })} onAgree={() => void run()} />
    </>
  );
}
