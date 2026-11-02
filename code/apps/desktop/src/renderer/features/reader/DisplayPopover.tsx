import { IconButton, Popover, Segmented, Slider, Toggle } from "@speakkit/ui";
import type { ReactNode } from "react";
import type { Display } from "./display";

interface Props {
  d: Display;
  onChange(patch: Partial<Display>): void;
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="rd-pop__field">
      <span>{label}</span>
      {children}
    </div>
  );
}

const THEMES = [
  { id: "app", label: "App" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];
const FONTS = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
];

function Choices({ d, onChange }: Props) {
  return (
    <>
      <Field label="Theme">
        <Segmented label="Theme" value={d.theme} onChange={(v) => onChange({ theme: v as Display["theme"] })} items={THEMES} />
      </Field>
      <Field label="Font">
        <Segmented label="Font" value={d.font} onChange={(v) => onChange({ font: v as Display["font"] })} items={FONTS} />
      </Field>
    </>
  );
}

function Sizes({ d, onChange }: Props) {
  return (
    <>
      <Field
        label={
          <>
            Text size <b>{d.size}px</b>
          </>
        }
      >
        <Slider min={14} max={30} step={1} value={d.size} aria-label="Text size" onChange={(v) => onChange({ size: v })} />
      </Field>
      <Field
        label={
          <>
            Line spacing <b>{d.line.toFixed(1)}</b>
          </>
        }
      >
        <Slider min={1.3} max={2.2} step={0.1} value={d.line} aria-label="Line spacing" onChange={(v) => onChange({ line: Math.round(v * 10) / 10 })} />
      </Field>
      <Field
        label={
          <>
            Text width <b>{d.width}px</b>
          </>
        }
      >
        <Slider min={480} max={960} step={20} value={d.width} aria-label="Text width" onChange={(v) => onChange({ width: v })} />
      </Field>
    </>
  );
}

export function DisplayPopover({ d, onChange }: Props) {
  return (
    <Popover side="bottom" align="end" width={320} title="Display" trigger={(t) => <IconButton name="text-size" label="Display settings" {...t} />}>
      <div className="rd-pop">
        <Choices d={d} onChange={onChange} />
        <Sizes d={d} onChange={onChange} />
        <label className="rd-pop__row">
          <span>Scroll along with the voice</span>
          <Toggle checked={d.follow} onChange={(follow) => onChange({ follow })} aria-label="Scroll along with the voice" />
        </label>
      </div>
    </Popover>
  );
}
