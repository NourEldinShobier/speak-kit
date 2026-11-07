import { Banner, Button } from "@speakkit/ui";
import type { Availability } from "./availability";

/** The header button of the Voices page. It starts cloning when Chatterbox is installed and is disabled otherwise. */
export function CloneButton({ availability, onClick }: { availability: Availability; onClick(): void }) {
  return (
    <Button iconLeft="microphone" disabled={availability.kind !== "ready"} onClick={onClick}>
      Clone a voice
    </Button>
  );
}

/** What cloning needs, with a way to the Engines page. */
export function CloningUnavailable({ availability, onOpenEngines }: { availability: Availability; onOpenEngines(): void }) {
  if (availability.kind !== "unavailable") return null;
  return (
    <Banner
      tone="warning"
      role="status"
      title={availability.title}
      action={
        <Button size="sm" iconRight="arrow-right" onClick={onOpenEngines}>
          Open Engines
        </Button>
      }
    >
      {availability.detail}
    </Banner>
  );
}
