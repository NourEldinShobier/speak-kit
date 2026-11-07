import { CLONE_MAX_MS, CLONE_MIN_MS, CLONE_MIN_RATE, type CloneCheck } from "@speakkit/protocol";
import type { Wav } from "./wav";

export interface ClipReport {
  durationMs: number;
  checks: CloneCheck[];
  ok: boolean;
}

const FRAME_MS = 50;
const SILENT_DB = -50;
const MIN_LOUDNESS_DB = -35;
const MAX_SILENT_SHARE = 0.5;
const MIN_SNR_DB = 15;

const db = (rms: number) => 20 * Math.log10(Math.max(rms, 1e-9));
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function lengthMessage(durationMs: number): string {
  if (durationMs < CLONE_MIN_MS) return `Clip is ${sec(durationMs)}; at least ${sec(CLONE_MIN_MS)} is needed.`;
  if (durationMs > CLONE_MAX_MS) return `Clip is ${sec(durationMs)}; at most ${sec(CLONE_MAX_MS)} is allowed.`;
  return `Clip is ${sec(durationMs)}.`;
}

/**
 * Quality checks for a reference clip. Heuristics on the signal only:
 * length, sample rate, overall level, share of silence, and a noise estimate (loud frames against the quietest 10%).
 * "Single speaker" cannot be judged without a model and is not checked.
 */
export function analyzeClip({ sampleRate, samples }: Wav): ClipReport {
  const durationMs = Math.round((samples.length / sampleRate) * 1000);
  const frame = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000));
  const levels: number[] = [];
  let total = 0;
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let sum = 0;
    for (let j = i; j < i + frame; j++) sum += samples[j]! * samples[j]!;
    levels.push(db(Math.sqrt(sum / frame)));
    total += sum;
  }
  const overall = db(Math.sqrt(total / Math.max(1, levels.length * frame)));
  const sorted = [...levels].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? -90;
  const silentShare = levels.length ? levels.filter((l) => l < SILENT_DB).length / levels.length : 1;
  const snr = at(0.9) - at(0.1);

  const checks: CloneCheck[] = [
    {
      id: "length",
      ok: durationMs >= CLONE_MIN_MS && durationMs <= CLONE_MAX_MS,
      message: lengthMessage(durationMs),
    },
    {
      id: "sample-rate",
      ok: sampleRate >= CLONE_MIN_RATE,
      message: sampleRate >= CLONE_MIN_RATE ? `${sampleRate} Hz.` : `Sample rate is ${sampleRate} Hz; at least ${CLONE_MIN_RATE} Hz is needed.`,
    },
    {
      id: "loudness",
      ok: overall >= MIN_LOUDNESS_DB,
      message: overall >= MIN_LOUDNESS_DB ? "Level is fine." : "Recording is too quiet; move closer to the microphone.",
    },
    {
      id: "silence",
      ok: silentShare <= MAX_SILENT_SHARE,
      message: silentShare <= MAX_SILENT_SHARE ? "Enough speech." : `${Math.round(silentShare * 100)}% of the clip is silent.`,
    },
    {
      id: "noise",
      ok: snr >= MIN_SNR_DB,
      message: snr >= MIN_SNR_DB ? "Background noise is low." : "Too much background noise; record somewhere quieter.",
    },
  ];
  return { durationMs, checks, ok: checks.every((c) => c.ok) };
}
