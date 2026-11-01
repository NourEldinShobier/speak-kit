import { useEffect, useState } from "react";
import { Banner, Button, Icon, SettingsSection, StatusPill } from "@speakkit/ui";
import { api } from "../../ui";
import { Back, Foot, Frame } from "./Frame";
import { MODEL_MB } from "./model";

/** Detected hardware in words (W2, W2b): the engines list carries the GPU probe of the server. */
function Hardware() {
  const [gpu, setGpu] = useState<{ name: string; vramMb: number } | null | undefined>(undefined);
  useEffect(() => {
    api.engines().then(
      (l) => setGpu(l.engines.find((e) => e.gpu)?.gpu ?? null),
      () => setGpu(null),
    );
  }, []);
  if (gpu) {
    return (
      <Banner tone="info" icon="cpu" title={`Found ${gpu.name}, ${Math.round(gpu.vramMb / 1024)} GB`}>
        Kokoro runs on the CPU and needs no GPU. Your graphics card can run Chatterbox later (Engines).
      </Banner>
    );
  }
  return (
    <Banner tone="info" icon="cpu" title={gpu === null ? "No supported graphics card found" : "Checking this computer"}>
      Kokoro runs on the CPU, so any PC works. About one second to the first word.
    </Banner>
  );
}

export function EngineStep({ onBack, onDownload }: { onBack(): void; onDownload(): void }) {
  const download = () => {
    void api.downloadModel();
    onDownload();
  };
  return (
    <Frame
      at={1}
      title="Choose a voice engine"
      sub="You can add or switch engines any time in Engines."
      foot={
        <Foot back={<Back onClick={onBack} />}>
          <Button variant="primary" size="lg" iconLeft="download" onClick={download}>
            Download Kokoro
          </Button>
        </Foot>
      }
    >
      <Hardware />
      <SettingsSection title="Engines">
        <button className="sk-radio is-sel" role="radio" aria-checked="true" aria-label="Kokoro-82M">
          <span className="sk-tile">
            <Icon name="cpu" size={18} />
          </span>
          <span className="sk-engine__body">
            <b>Kokoro-82M</b>
            <span>Natural English voices, 28 to choose from. About 1 second to the first word.</span>
            <span>Download {MODEL_MB} MB · runs on any PC</span>
          </span>
          <StatusPill tone="green">Recommended</StatusPill>
        </button>
        <button className="sk-radio" disabled aria-label="Chatterbox, not available yet">
          <span className="sk-tile">
            <Icon name="sparkles" size={18} />
          </span>
          <span className="sk-engine__body">
            <b>Chatterbox</b>
            <span>Expressive, with emotion control and voice cloning.</span>
            <span>Not available yet. It arrives in a later version.</span>
          </span>
          <StatusPill>Optional</StatusPill>
        </button>
      </SettingsSection>
    </Frame>
  );
}
