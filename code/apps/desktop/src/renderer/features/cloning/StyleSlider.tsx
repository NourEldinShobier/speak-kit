import { Slider } from "@speakkit/ui";
import "./cloning.css";

interface SliderProps {
  label: string;
  hint: string;
  low: string;
  high: string;
  value: number;
  onChange(v: number): void;
  onCommit?: (v: number) => void;
}

/** A 0 to 1 slider with its name, a hint, the value on the right and the names of both ends underneath (2.17 slider). */
export function StyleSlider({ label, hint, low, high, value, onChange, onCommit }: SliderProps) {
  return (
    <div className="sk-clone-slider">
      <div className="sk-clone-slider__head">
        <span>
          <b>{label}</b>
          <small>{hint}</small>
        </span>
        <output>{value.toFixed(2)}</output>
      </div>
      <Slider aria-label={label} min={0} max={1} step={0.05} value={value} onChange={(v) => onChange(Math.round(v * 100) / 100)} {...(onCommit && { onCommit })} />
      <div className="sk-clone-slider__ends">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
