import { useEffect, useRef, type ReactNode } from "react";
import { Segmented, Slider, Toggle } from "@speakkit/ui";
import type { Display } from "./display";

interface Props {
  d: Display;
  onChange(patch: Partial<Display>): void;
  onClose(): void;
}

function Group({ label, value, children }: { label: ReactNode; value: ReactNode; children: ReactNode }) {
  return (
    <div className="rd-display__row">
      <span className="rd-display__label">{label}</span>
      {children}
      <b className="rd-display__value">{value}</b>
    </div>
  );
}

const FONTS = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
];

/** Closes on Escape and on a press outside the card and outside the button that opens it. */
function useDismiss(card: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      document.querySelector<HTMLElement>("[data-display-trigger]")?.focus(); // the card was opened from this button
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!card.current?.contains(t) && !t.closest("[data-display-trigger]")) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [card, onClose]);
}

/** The compact display card, right-aligned in the reading pane under the header icons. */
export function DisplayCard({ d, onChange, onClose }: Props) {
  const card = useRef<HTMLDivElement>(null);
  useDismiss(card, onClose);
  useEffect(() => card.current?.querySelector<HTMLElement>("button")?.focus(), []);
  return (
    <div className="rd-float rd-display" role="dialog" aria-label="Display" ref={card}>
      <div className="rd-display__row rd-display__row--between">
        <span className="rd-display__label">Font</span>
        <Segmented label="Font" value={d.font} onChange={(v) => onChange({ font: v as Display["font"] })} items={FONTS} />
      </div>
        <Group label="Text size" value={`${d.size}px`}>
          <Slider min={14} max={30} step={1} value={d.size} aria-label="Text size" onChange={(v) => onChange({ size: v })} />
        </Group>
        <Group label="Line spacing" value={d.line.toFixed(1)}>
          <Slider min={1.3} max={2.2} step={0.1} value={d.line} aria-label="Line spacing" onChange={(v) => onChange({ line: Math.round(v * 10) / 10 })} />
        </Group>
        <Group label="Text width" value={`${d.width}px`}>
          <Slider min={480} max={960} step={20} value={d.width} aria-label="Text width" onChange={(v) => onChange({ width: v })} />
        </Group>
      <label className="rd-display__row rd-display__row--between rd-display__row--switch">
        <span className="rd-display__text">Scroll along with the voice</span>
        <Toggle checked={d.follow} onChange={(follow) => onChange({ follow })} aria-label="Scroll along with the voice" />
      </label>
    </div>
  );
}
