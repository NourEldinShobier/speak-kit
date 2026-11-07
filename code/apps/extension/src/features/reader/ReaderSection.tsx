import { SettingRow, Segmented, Slider } from "@speakkit/ui";
import { defaultReader, type ReaderSettings, type SectionProps } from "../settings";
import { Card, PageHead, ToggleRow } from "../../shared/ui";
import { READER_FONT_STACK } from "./view";

interface RowProps {
  R: ReaderSettings;
  set(p: Partial<ReaderSettings>): void;
}

function FontRow({ R, set }: RowProps) {
  return (
    <SettingRow
      label="Font"
      description="Dyslexic uses OpenDyslexic or Lexend when installed, with wider spacing."
      control={
        <Segmented
          label="Font"
          value={R.font}
          onChange={(v) => set({ font: v as ReaderSettings["font"] })}
          items={[
            { id: "sans", label: "Sans" },
            { id: "serif", label: "Serif" },
            { id: "dyslexic", label: "Dyslexic" },
          ]}
        />
      }
    />
  );
}

function SizeRow({ R, set }: RowProps) {
  return (
    <SettingRow
      className="lm-row--control"
      label="Text size"
      description={`${R.size} px`}
      control={
        <div className="op-slider">
          <Slider aria-label="Reader text size" min={14} max={28} step={1} value={R.size} onChange={(v) => set({ size: v })} />
          <output>{R.size}px</output>
        </div>
      }
    />
  );
}

function WidthRow({ R, set }: RowProps) {
  return (
    <SettingRow
      className="lm-row--control"
      label="Page width"
      description={`${R.width} px`}
      control={
        <div className="op-slider">
          <Slider aria-label="Reader page width" min={480} max={960} step={20} value={R.width} onChange={(v) => set({ width: v })} />
          <output>{R.width}px</output>
        </div>
      }
    />
  );
}

function ThemeRow({ R, set }: RowProps) {
  return (
    <SettingRow
      label="Theme"
      description="Paper is a warm sand page; Light follows the extension colours."
      control={
        <Segmented
          label="Reader theme"
          value={R.theme}
          onChange={(v) => set({ theme: v as ReaderSettings["theme"] })}
          items={[
            { id: "paper", label: "Paper" },
            { id: "light", label: "Light" },
          ]}
        />
      }
    />
  );
}

function Preview({ R }: Pick<RowProps, "R">) {
  return (
    <Card id="reader-prev-h">
      <p className="op-reader-prev" data-testid="reader-preview" data-rtheme={R.theme} data-rhl={R.highlight ? "on" : "off"} style={{ fontFamily: READER_FONT_STACK[R.font], fontSize: R.size }}>
        For a decade, the default answer to every software question was the cloud. <span className="op-reader-hl">Notes, documents and even voices lived on someone else's server.</span> Lately that
        answer has started to wobble.
      </p>
    </Card>
  );
}

/** Options > Reader view: the same choices as the reading panel in the reader (font, size, width, theme, highlight). */
export function ReaderSection({ s, upd, saved }: SectionProps) {
  const R = s.reader;
  const set = (p: Partial<ReaderSettings>) => upd((x) => ({ ...x, reader: { ...x.reader, ...p } }));
  return (
    <>
      <PageHead
        title="Reader view"
        desc="A distraction-free page for the article you are listening to. Open it from the launcher, the popup or the dock."
        saved={saved}
        onReset={() => set(defaultReader())}
      />
      <Card title="Appearance" id="reader-h">
        <FontRow R={R} set={set} />
        <SizeRow R={R} set={set} />
        <WidthRow R={R} set={set} />
        <ThemeRow R={R} set={set} />
        <ToggleRow title="Highlight as it reads" desc="Marks the paragraph, the sentence and the word being spoken." on={R.highlight} onChange={(v) => set({ highlight: v })} />
      </Card>
      <Preview R={R} />
    </>
  );
}
