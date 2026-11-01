import { DEFAULT_WORD_COLOR } from "@speakkit/protocol";
import { useState } from "react";
import { Icon, SettingRow, Segmented } from "@speakkit/ui";
import { tokens } from "@speakkit/ui/tokens";
import { defaultSettings, type SectionProps, type Settings } from "../settings";
import { contrast } from "../../shared/format";
import { Card, PageHead, ToggleRow } from "../../shared/ui";
import { SENTENCE_SWATCHES, WORD_SWATCHES, WORD_TEXT, paint, swatchIndex, type Swatch } from "./colors";

/** The page the preview is drawn on, per theme. */
const PAGE = { light: { bg: tokens.light["surface-editor"], text: tokens.light["text-on-highlight"] }, dark: { bg: tokens.dark["surface-card"], text: tokens.dark["text-primary"] } };

const HL_MODES: { id: Settings["highlight"]["mode"]; label: string }[] = [
  { id: "sentence+word", label: "Sentence + word" },
  { id: "sentence", label: "Sentence" },
  { id: "word", label: "Word" },
  { id: "off", label: "Off" },
];

function SwatchRow({ title, desc, list, value, onPick, label }: { title: string; desc: string; list: Swatch[]; value: string; onPick: (hex: string) => void; label: string }) {
  const idx = swatchIndex(list, value);
  return (
    <SettingRow
      label={title}
      description={desc}
      control={
        <div className="op-swatches" role="radiogroup" aria-label={label}>
          {list.map((sw, i) => (
            <button key={sw.name} type="button" role="radio" aria-checked={i === idx} className={`op-sw ${i === idx ? "sel" : ""}`} onClick={() => onPick(sw.light)}>
              <span className="ring">
                <span className="dot" style={{ background: sw.light }}>
                  {i === idx && <Icon name="check" size={14} />}
                </span>
              </span>
              <span>{sw.name}</span>
            </button>
          ))}
          <label className={`op-sw ${idx < 0 ? "sel" : ""}`}>
            <span className="ring">
              <span className="dot custom" style={idx < 0 ? { background: value } : undefined}>
                <Icon name={idx < 0 ? "check" : "plus"} size={14} />
              </span>
            </span>
            <span>Custom</span>
            <input
              type="color"
              className="sk-sr"
              aria-label={`Custom ${label.toLowerCase()}`}
              value={/^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_WORD_COLOR.toLowerCase()}
              onChange={(e) => onPick(e.target.value.toUpperCase())}
            />
          </label>
        </div>
      }
    />
  );
}

/** C5 / C8 Highlighting. */
export function HighlightSection({ s, upd, saved }: SectionProps) {
  const H = s.highlight;
  const [page, setPage] = useState<"light" | "dark">("light");
  const set = (p: Partial<Settings["highlight"]>) => upd((x) => ({ ...x, highlight: { ...x.highlight, ...p } }));
  const dark = page === "dark";
  const sent = paint(SENTENCE_SWATCHES, H.sentenceColor, dark, H.matchTheme);
  const word = paint(WORD_SWATCHES, H.wordColor, dark, H.matchTheme);
  const pg = PAGE[page];
  const useSent = H.mode === "sentence" || H.mode === "sentence+word";
  const useWord = H.mode === "word" || H.mode === "sentence+word";
  const sentStyle = useSent ? { background: sent } : undefined;
  const wordStyle = useWord ? { background: word, color: WORD_TEXT } : undefined;
  return (
    <>
      <PageHead title="Highlighting" desc="How the sentence and the current word are marked while Speak Kit reads." saved={saved} onReset={() => set(defaultSettings().highlight)} />
      <Card id="prev-h">
        <div className="op-prev-h">
          <h2 id="prev-h">Preview</h2>
          <Segmented
            label="Preview page"
            value={page}
            onChange={(v) => setPage(v as "light" | "dark")}
            items={[
              { id: "light", label: "Light page" },
              { id: "dark", label: "Dark page" },
            ]}
          />
          <span className="op-contrast">
            Text on sentence {contrast(pg.text, sent)}:1 &nbsp; Text on word {contrast(useWord ? WORD_TEXT : pg.text, word)}:1
          </span>
        </div>
        <p className="op-prev" style={{ background: pg.bg, color: pg.text }} data-testid="hl-preview">
          For a decade, the default answer to every software question was the cloud.{" "}
          <span style={sentStyle}>
            Notes, documents and even <span style={wordStyle}>voices</span> lived on someone else's server, rented back to us by the month.
          </span>{" "}
          Lately that answer has started to wobble.
        </p>
      </Card>
      <Card title="Style" id="style-h">
        <SettingRow
          label="Highlight"
          description="Sentence gives context; word helps you follow along."
          control={<Segmented label="Highlight" value={H.mode} onChange={(mode) => set({ mode: mode as Settings["highlight"]["mode"] })} items={HL_MODES} />}
        />
        <SwatchRow title="Sentence color" desc="Marks the sentence being read." label="Sentence color" list={SENTENCE_SWATCHES} value={H.sentenceColor} onPick={(c) => set({ sentenceColor: c })} />
        <SwatchRow title="Word color" desc="Marks the word being spoken." label="Word color" list={WORD_SWATCHES} value={H.wordColor} onPick={(c) => set({ wordColor: c })} />
        <ToggleRow title="Match page theme" desc="Use dark variants on dark pages." on={H.matchTheme} onChange={(v) => set({ matchTheme: v })} />
      </Card>
    </>
  );
}
