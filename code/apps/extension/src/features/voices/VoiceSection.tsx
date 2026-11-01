import { useState } from "react";
import { plural, type Voice } from "@speakkit/protocol";
import { Avatar, Button, SettingRow, Segmented, Select, Slider, StatusPill, TextInput } from "@speakkit/ui";
import { defaultSettings, type SectionProps } from "../settings";
import { previewVoice, send } from "../../shared/client";
import { clampSpeed, speedLabel, wordsPerMinute } from "../../shared/format";
import { Card, PageHead } from "../../shared/ui";
import { langLabel, qualityLabel, voiceName } from "./catalog";
import { useVoices, type VoicesState } from "./hooks";

const PAUSES = { none: 0, short: 0.4, long: 0.8 } as const;

const PAUSE_ITEMS = [
  { id: "none", label: "None" },
  { id: "short", label: "Short" },
  { id: "long", label: "Long" },
];

function EngineCard({ count }: { count: number }) {
  return (
    <Card title="Engine" id="engine-h">
      <div className="op-engines" role="group" aria-label="Engine">
        <div className="op-engine on" aria-current="true">
          <div className="op-engine-h">
            <b>Kokoro-82M</b>
            <StatusPill tone="green">Installed</StatusPill>
          </div>
          <p>Fast, runs on any computer. {count ? `${plural(count, "voice", "voices")}.` : "Voices from the app."} The model loads when you press play and is released when idle.</p>
        </div>
        <div className="op-engine">
          <div className="op-engine-h">
            <b>Chatterbox</b>
            <StatusPill>Not installed</StatusPill>
          </div>
          <p>Expressive voices and voice cloning. Needs an NVIDIA GPU.</p>
          <Button size="sm" iconLeft="external-link" onClick={() => void send({ t: "launch-app" })}>
            Install in the app
          </Button>
        </div>
      </div>
    </Card>
  );
}

function voiceOptions(voices: Voice[], current: string, status: VoicesState["status"]) {
  if (voices.length) return voices.map((x) => ({ value: x.id, label: `${x.name} (${langLabel(x.lang)}) · Quality ${qualityLabel(x)}` }));
  return [{ value: current, label: status === "loading" ? "Loading voices..." : voiceName(voices, current) }];
}

function DefaultVoiceRow({ s, upd, list: { voices, status } }: Pick<SectionProps, "s" | "upd"> & { list: VoicesState }) {
  const cur = voices.find((x) => x.id === s.voice);
  return (
    <SettingRow
      label="Default voice"
      description={cur ? `${cur.lang === "en-US" ? "American" : "British"} English · Quality ${qualityLabel(cur)}` : "Choose from the voices installed in the app."}
      control={
        <Select
          label="Default voice"
          options={voiceOptions(voices, s.voice, status)}
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
  );
}

function PlaybackCard({ s, upd, list }: Pick<SectionProps, "s" | "upd"> & { list: VoicesState }) {
  const pause = PAUSES[s.pauseBetweenParagraphs];
  return (
    <Card title="Voice and playback" id="vp-h">
      <DefaultVoiceRow s={s} upd={upd} list={list} />
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
          <Segmented
            label="Pause between paragraphs"
            value={s.pauseBetweenParagraphs}
            onChange={(p) => upd((x) => ({ ...x, pauseBetweenParagraphs: p as "none" | "short" | "long" }))}
            items={PAUSE_ITEMS}
          />
        }
      />
    </Card>
  );
}

function PreviewCard({ voice, speed }: { voice: string; speed: number }) {
  const [text, setText] = useState("Notes, documents and even voices lived on someone else's server.");
  const [pv, setPv] = useState(false);
  return (
    <Card title="Preview" id="preview-h">
      <div className="op-preview">
        <TextInput aria-label="Sample text" value={text} onChange={(e) => setText(e.target.value)} />
        <Button
          variant="primary"
          iconLeft="player-play"
          disabled={!text.trim() || pv}
          onClick={async () => {
            setPv(true);
            await previewVoice(voice, text.trim(), speed);
            setTimeout(() => setPv(false), 600);
          }}
        >
          Play sample
        </Button>
      </div>
    </Card>
  );
}

/** C4 Voice and speed. The voice list comes from the app. */
export function VoiceSection({ s, upd, saved }: SectionProps) {
  const list = useVoices();
  const reset = () => upd((x) => ({ ...x, voice: defaultSettings().voice, speed: defaultSettings().speed, pauseBetweenParagraphs: defaultSettings().pauseBetweenParagraphs }));
  return (
    <>
      <PageHead title="Voice and speed" desc="Defaults for every page. You can still change them from the popup." saved={saved} onReset={reset} />
      <EngineCard count={list.voices.length} />
      <PlaybackCard s={s} upd={upd} list={list} />
      <PreviewCard voice={s.voice} speed={s.speed} />
    </>
  );
}
