import { Button, Icon, type IconName } from "@speakkit/ui";
import { api } from "../../ui";
import { Foot, Frame } from "./Frame";
import { MODEL_MB } from "./model";

const FEATURES: [IconName, string, string][] = [
  ["lock", "Private", "Text never leaves this device"],
  ["bolt", "Fast", "Starts speaking in about a second"],
  ["world", "Everywhere", "Web pages, PDFs, any text"],
];

/** Starting setup downloads the voice model; the next step shows the progress. */
export function WelcomeStep({ onNext }: { onNext(): void }) {
  const start = () => {
    void api.downloadModel();
    onNext();
  };
  return (
    <Frame
      at={0}
      center
      title="Read anything out loud."
      sub="On your own computer. No account, no cloud, no limits."
      foot={
        <Foot>
          <span style={{ color: "var(--text-tertiary)" }}>{`Setup downloads a ${MODEL_MB} MB voice model and takes about 3 minutes`}</span>
          <Button variant="primary" size="lg" iconRight="arrow-right" onClick={start}>
            Get started
          </Button>
        </Foot>
      }
    >
      <div className="sk-feats">
        {FEATURES.map(([i, t, d]) => (
          <div key={t} className="sk-feat">
            <Icon name={i} size={18} />
            <b>{t}</b>
            <span>{d}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}
