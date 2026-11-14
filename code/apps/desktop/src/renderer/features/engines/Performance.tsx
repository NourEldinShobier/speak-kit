import { useState } from "react";
import { Button, Icon, Select, SettingRow, Toggle } from "@speakkit/ui";
import type { DeviceValue, SpeechModelsView } from "../../../shared/speech-models/contract";
import { models, patchEngines } from "./api";
import type { EnginesPatch } from "../../../shared/speech-models/config";
import { deviceLine, hardwareLine, IDLE_LABELS } from "../../speech-text";
import { RuleEditor } from "./RuleEditor";
import type { Run } from "./run";

const IDLE_OPTIONS = [5, 15, 30, 60, 0].map((m) => ({ value: String(m), label: IDLE_LABELS[m]! }));
const DEVICE_OPTIONS = [
  { value: "auto", label: "Automatic" },
  { value: "gpu", label: "Graphics card" },
  { value: "cpu", label: "CPU" },
];

/** The graphics card or the CPU: what was detected, what is in use, the slow-CPU warning, and the way back after a card stopped. */
function DeviceRows({ v, run }: { v: SpeechModelsView; run: Run }) {
  const failed = v.device.failed;
  const stopped = failed.length > 0;
  return (
    <>
      <SettingRow
        className="lm-row--control"
        label="Run speech on"
        description={hardwareLine(v)}
        control={<Select label="Run speech on" value={v.device.choice} onChange={(c) => run(() => patchEngines({ device: c as DeviceValue }))} options={DEVICE_OPTIONS} />}
      />
      <SettingRow label="In use now" description={deviceLine(v)} />
      {v.device.cpuWarning && (
        <p className="sk-row-note" role="status">
          On the CPU speech can be many times slower than on the graphics card.
        </p>
      )}
      {(v.device.movedToCpuByMemory || stopped) && (
        <SettingRow
          className="lm-row--control"
          label={stopped ? "Graphics card stopped" : "Graphics card out of memory"}
          description={stopped ? failed.map((f) => `${f.name}, driver ${f.driver}: ${f.reason}`).join(" ") : "Speech runs on the CPU for now."}
          control={<Button onClick={() => run(() => models.retryGraphicsCard())}>Try the graphics card again</Button>}
        />
      )}
    </>
  );
}

function IdleRows({ v, run }: { v: SpeechModelsView; run: Run }) {
  const note = v.idleMinutes === 0 ? "The model stays in memory. Dictation starts at once." : "Frees about 1.1 GB of memory. The first dictation after an unload takes longer.";
  return (
    <>
      <SettingRow
        className="lm-row--control"
        label="Unload speech model when idle"
        description={note}
        control={
          <Select
            label="Unload speech model when idle"
            value={String(v.idleMinutes)}
            onChange={(m) => run(() => patchEngines({ idleMinutes: Number(m) as EnginesPatch["idleMinutes"] }))}
            options={IDLE_OPTIONS}
          />
        }
      />
      <SettingRow
        label="Release memory when the window closes"
        description="The window and the graphics card memory are released at once. The tray keeps running."
        control={<Toggle aria-label="Release memory when the window closes" checked={v.releaseOnClose} onChange={(on) => run(() => patchEngines({ releaseOnClose: on }))} />}
      />
    </>
  );
}

export function Performance({ v, run }: { v: SpeechModelsView; run: Run }) {
  const [open, setOpen] = useState(v.device.movedToCpuByMemory || v.device.failed.length > 0);
  return (
    <section className="sk-engines-section" aria-labelledby="perf-h">
      <h2 id="perf-h">Performance</h2>
      <div className="lm-card">
        <IdleRows v={v} run={run} />
        <button type="button" className="lm-row sk-advanced" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="lm-row__text">
            <span className="lm-row__label">Advanced</span>
            <span className="lm-row__desc">Graphics card or CPU, and devices Speak Kit stopped using.</span>
          </span>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={16} />
        </button>
        {open && (
          <>
            <DeviceRows v={v} run={run} />
            <RuleEditor v={v} run={run} />
          </>
        )}
      </div>
    </section>
  );
}
