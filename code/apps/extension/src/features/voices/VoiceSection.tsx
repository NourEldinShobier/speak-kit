import { useState } from "react";
import { Avatar, Button, SettingRow, Segmented, Select, Slider, StatusPill, TextInput } from "@speakkit/ui";
import { defaultSettings, type SectionProps } from "../settings";
import { previewVoice, send } from "../../shared/client";
import { clampSpeed, speedLabel, wordsPerMinute } from "../../shared/format";
import { Card, PageHead } from "../../shared/ui";
import { langLabel, qualityLabel, voiceName } from "./catalog";
import { useVoices } from "./hooks";

const PAUSES = { none: 0, short: 0.4, long: 0.8 } as const;

/** C4 Voice and speed. The voice list comes from the app. */
export function VoiceSection({ s, upd, saved }: SectionProps) {
  const [text, setText] = useState("Notes, documents and even voices lived on someone else's server.");
  const [pv, setPv] = useState(false);
  const { voices, status } = useVoices();
  const cur = voices.find((x) => x.id === s.voice);
  const pause = PAUSES[s.pauseBetweenParagraphs];
  const reset = () => upd((x) => ({ ...x, voice: defaultSettings().voice, speed: defaultSettings().speed, pauseBetweenParagraphs: defaultSettings().pauseBetweenParagraphs }));
  const options = voices.length
    ? voices.map((x) => ({ value: x.id, label: `${x.name} (${langLabel(x.lang)}) · Quality ${qualityLabel(x)}` }))
    : [{ value: s.voice, label: status === "loading" ? "Loading voices..." : voiceName(voices, s.voice) }];
  return (
    <>
      <PageHead title="Voice and speed" desc="Defaults for every page. You can still change them from the popup." saved={saved} onReset={reset} />
      <Card title="Engine" id="engine-h">
        <div className="op-engines" role="group" aria-label="Engine">
          <div className="op-engine on" aria-current="true">
            <div className="op-engine-h"><b>Kokoro-82M</b><StatusPill tone="green">Installed</StatusPill></div>
            <p>Fast, runs on any computer. {voices.length ? `${voices.length} voices.` : "Voices from the app."} The model loads when you press play and is released when idle.</p>
          </div>
          <div className="op-engine">
            <div className="op-engine-h"><b>Chatterbox</b><StatusPill>Not installed</StatusPill></div>
            <p>Expressive voices and voice cloning. Needs an NVIDIA GPU.</p>
            <Button size="sm" iconLeft="external-link" onClick={() => void send({ t: "launch-app" })}>Install in the app</Button>
          </div>
        </div>
      </Card>
      <Card title="Voice and playback" id="vp-h">
        <SettingRow
          label="Default voice"
          description={cur ? `${cur.lang === "en-US" ? "American" : "British"} English · Quality ${qualityLabel(cur)}` : "Choose from the voices installed in the app."}
          control={
            <Select
              label="Default voice"
              options={options}
              value={s.voice}
              onChange={(id) => upd((x) => ({ ...x, voice: id }))}
              renderValue={(o) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Avatar name={cur?.name ?? voiceName(voices, s.voice)} size={20} tone="accent" aria-hidden />
                  <span>{cur ? `${cur.name} (${langLabel(cur.lang)})` : o?.label}</span>
                </span>
              )}
            />
          }
        />
        <SettingRow
          label="Speed"
          description={`${speedLabel(s.speed)} · about ${wordsPerMinute(s.speed)} words per minute. Arrow keys change it by 0.1x.`}
          control={
            <div className="op-slider wide">
              <Slider aria-label="Default speed" min={0.5} max={3} step={0.1} value={s.speed} onChange={(n) => upd((x) => ({ ...x, speed: clampSpeed(n) }))} />
              <output>{speedLabel(s.speed)}</output>
            </div>
          }
        />
        <SettingRow
          label="Pause between paragraphs"
          description={`${s.pauseBetweenParagraphs.charAt(0).toUpperCase()}${s.pauseBetweenParagraphs.slice(1)}${pause ? `, ${pause} s` : ""}`}
          control={
            <Segmented label="Pause between paragraphs" value={s.pauseBetweenParagraphs} onChange={(p) => upd((x) => ({ ...x, pauseBetweenParagraphs: p as "none" | "short" | "long" }))}
              items={[{ id: "none", label: "None" }, { id: "short", label: "Short" }, { id: "long", label: "Long" }]} />
          }
        />
      </Card>
      <Card title="Preview" id="preview-h">
        <div className="op-preview">
          <TextInput aria-label="Sample text" value={text} onChange={(e) => setText(e.target.value)} />
          <Button variant="primary" iconLeft="player-play" disabled={!text.trim() || pv} onClick={async () => { setPv(true); await previewVoice(s.voice, text.trim(), s.speed); setTimeout(() => setPv(false), 600); }}>Play sample</Button>
        </div>
      </Card>
    </>
  );
}
