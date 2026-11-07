import { useEffect, useState } from "react";
import { Banner, Button, Icon, SettingsSection, StatusPill } from "@speakkit/ui";
import type { EngineList } from "@speakkit/protocol";
import { api } from "../../ui";
import { Back, Foot, Frame } from "./Frame";
import { chatterboxOffer, MODEL_MB, type WizardChoice } from "./model";

/** The engine list of the server (it carries the hardware probe): `undefined` while loading, `null` when it cannot be read. */
function useEngineList(): EngineList | null | undefined {
  const [list, setList] = useState<EngineList | null | undefined>(undefined);
  useEffect(() => {
    api.engines().then(setList, () => setList(null));
  }, []);
  return list;
}

/** Detected hardware in words (W2, W2b). */
function Hardware({ list, canRunChatterbox }: { list: EngineList | null | undefined; canRunChatterbox: boolean }) {
  const gpu = list?.engines.find((e) => e.gpu)?.gpu;
  if (gpu) {
    return (
      <Banner tone="info" icon="cpu" title={`Found ${gpu.name}, ${Math.round(gpu.vramMb / 1024)} GB`}>
        Kokoro runs on the CPU and needs no GPU.{canRunChatterbox && " Your graphics card can also run Chatterbox."}
      </Banner>
    );
  }
  return (
    <Banner tone="info" icon="cpu" title={list === undefined ? "Checking this computer" : "No supported graphics card found"}>
      Kokoro runs on the CPU, so any PC works. About one second to the first word.
    </Banner>
  );
}

interface ChoiceProps {
  engine: WizardChoice;
  choice: WizardChoice;
  disabled?: boolean;
  name: string;
  tile: "cpu" | "sparkles";
  lines: string[];
  pill: string;
  onChoose(): void;
}

function Choice({ engine, choice, disabled, name, tile, lines, pill, onChoose }: ChoiceProps) {
  const on = choice === engine;
  return (
    <button className={`sk-radio${on ? " is-sel" : ""}`} role="radio" aria-checked={on} aria-label={name} disabled={disabled} onClick={onChoose}>
      <span className="sk-tile">
        <Icon name={tile} size={18} />
      </span>
      <span className="sk-engine__body">
        <b>{name}</b>
        {lines.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </span>
      <StatusPill tone={engine === "kokoro" ? "green" : "neutral"}>{pill}</StatusPill>
    </button>
  );
}

export function EngineStep({ choice, onChoose, onBack, onDownload }: { choice: WizardChoice; onChoose(c: WizardChoice): void; onBack(): void; onDownload(): void }) {
  const list = useEngineList();
  const offer = chatterboxOffer(list);
  const download = () => {
    void api.downloadModel();
    onDownload();
  };
  return (
    <Frame
      at={1}
      title="Choose a voice engine"
      sub="Kokoro is always installed, so Speak Kit works right away. You can add or switch engines any time in Engines."
      foot={
        <Foot back={<Back onClick={onBack} />}>
          <Button variant="primary" size="lg" iconLeft="download" onClick={download}>
            Download Kokoro
          </Button>
        </Foot>
      }
    >
      <Hardware list={list} canRunChatterbox={offer.selectable} />
      <SettingsSection title="Engines">
        <Choice
          engine="kokoro"
          choice={choice}
          name="Kokoro-82M"
          tile="cpu"
          lines={["Natural English voices, 28 to choose from. About 1 second to the first word.", `Download ${MODEL_MB} MB · runs on any PC`]}
          pill="Recommended"
          onChoose={() => onChoose("kokoro")}
        />
        <Choice
          engine="chatterbox"
          choice={choice}
          disabled={!offer.selectable}
          name="Chatterbox"
          tile="sparkles"
          lines={["Expressive, with emotion control and voice cloning. Runs on an NVIDIA graphics card.", offer.note]}
          pill="Optional"
          onChoose={() => onChoose("chatterbox")}
        />
      </SettingsSection>
      {choice === "chatterbox" && (
        <p data-testid="chatterbox-plan" style={{ margin: 0, color: "var(--text-secondary)" }}>
          Kokoro downloads now and stays as your fallback. Chatterbox installs in the background once setup is finished; Engines shows its progress.
        </p>
      )}
    </Frame>
  );
}
