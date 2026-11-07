import { Button, Icon, type IconName } from "@speakkit/ui";
import { Foot, Frame } from "./Frame";

const FEATURES: [IconName, string, string][] = [
  ["lock", "Private", "Text never leaves this device"],
  ["bolt", "Fast", "Starts speaking in about a second"],
  ["world", "Everywhere", "Web pages, PDFs, any text"],
];

export function WelcomeStep({ onNext }: { onNext(): void }) {
  return (
    <Frame
      at={0}
      center
      title="Read anything out loud."
      sub="On your own computer. No account, no cloud, no limits."
      foot={
        <Foot>
          <span style={{ color: "var(--text-tertiary)" }}>Setup takes about 3 minutes</span>
          <Button variant="primary" size="lg" iconRight="arrow-right" onClick={onNext}>
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
