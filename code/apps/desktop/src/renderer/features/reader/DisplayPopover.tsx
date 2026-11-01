import { IconButton, Popover, Segmented, Slider, Toggle } from "@speakkit/ui";
import type { Display } from "./display";

export function DisplayPopover({ d, onChange }: { d: Display; onChange(patch: Partial<Display>): void }) {
  return (
    <Popover side="bottom" align="end" width={320} title="Display" trigger={(t) => <IconButton name="text-size" label="Display settings" {...t} />}>
      <div className="rd-pop">
        <div className="rd-pop__field">
          <span>Theme</span>
          <Segmented
            label="Theme"
            value={d.theme}
            onChange={(v) => onChange({ theme: v as Display["theme"] })}
            items={[
              { id: "app", label: "App" },
              { id: "light", label: "Light" },
              { id: "dark", label: "Dark" },
            ]}
          />
        </div>
        <div className="rd-pop__field">
          <span>Font</span>
          <Segmented
            label="Font"
            value={d.font}
            onChange={(v) => onChange({ font: v as Display["font"] })}
            items={[
              { id: "sans", label: "Sans" },
              { id: "serif", label: "Serif" },
            ]}
          />
        </div>
        <div className="rd-pop__field">
          <span>
            Text size <b>{d.size}px</b>
          </span>
          <Slider min={14} max={30} step={1} value={d.size} aria-label="Text size" onChange={(v) => onChange({ size: v })} />
        </div>
        <div className="rd-pop__field">
          <span>
            Line spacing <b>{d.line.toFixed(1)}</b>
          </span>
          <Slider min={1.3} max={2.2} step={0.1} value={d.line} aria-label="Line spacing" onChange={(v) => onChange({ line: Math.round(v * 10) / 10 })} />
        </div>
        <div className="rd-pop__field">
          <span>
            Text width <b>{d.width}px</b>
          </span>
          <Slider min={480} max={960} step={20} value={d.width} aria-label="Text width" onChange={(v) => onChange({ width: v })} />
        </div>
        <label className="rd-pop__row">
          <span>Scroll along with the voice</span>
          <Toggle checked={d.follow} onChange={(follow) => onChange({ follow })} aria-label="Scroll along with the voice" />
        </label>
      </div>
    </Popover>
  );
}
