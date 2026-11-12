import { chunkPcm, QUIET_PEAK } from "./capture/policy";
import type { History } from "./history";
import { planPaste, type Target } from "./paste-plan";
import { applyRules } from "./rules";
import type { Settings } from "./settings";
import type { Clip, DictationDeps, DictationErrorCode, Notice, TranscribeResult } from "./types";

export interface Job {
  /** The recording once stopped; undefined when it never started. */
  clip: Promise<Clip | undefined>;
  /** The window the key was pressed in. */
  target: Promise<Target | undefined>;
}

export type Outcome = { error: DictationErrorCode } | { notice: Notice };

export interface Context {
  deps: Pick<DictationDeps, "transcriber" | "inserter" | "clock" | "keepClip" | "log">;
  history: History;
  settings: Settings;
  /** Called when the text is ready and insertion starts. */
  inserting(): void;
}

type Heard = Extract<TranscribeResult, { ok: true }>;

/** Longest an optional step (a window read, the history write, bringing a window back) may hold the text up before it is passed on without it. */
export const STAGE_MS = 2000;

/**
 * Runs one optional stage with a deadline. When it fails or runs out of time the caller gets `fallback` (the input it already had) and one log line
 * naming the stage; the text is never held back by a stage that is not needed to produce it.
 */
export function within<T>(ctx: Pick<Context, "deps">, stage: string, ms: number, work: () => Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const settle = (value: T, why?: string) => {
      if (done) return;
      done = true;
      cancel();
      if (why) ctx.deps.log?.(stage, why);
      resolve(value);
    };
    const cancel = ctx.deps.clock.after(ms, () => settle(fallback, "timeout"));
    Promise.resolve()
      .then(work)
      .then(
        (v) => settle(v),
        () => settle(fallback, "failed"),
      );
  });
}

const peakOf = (pcm: Float32Array): number => {
  let peak = 0;
  for (const x of pcm) peak = Math.max(peak, Math.abs(x));
  return peak;
};

/** Transcribes a take of any length: a long one goes to the model in pieces, pieces with no sound are skipped, and the texts are joined. */
async function hear(ctx: Context, clip: Clip): Promise<TranscribeResult> {
  const req = (c: Clip) => ctx.deps.transcriber.transcribe({ clip: c, language: ctx.settings.language });
  const pieces = chunkPcm(clip.pcm, clip.sampleRate);
  if (pieces.length === 1) return req(clip);
  const texts: string[] = [];
  let language: string | undefined;
  let model: string | undefined;
  for (const pcm of pieces) {
    const peak = peakOf(pcm);
    if (peak < QUIET_PEAK) continue;
    const r = await req({ ...clip, pcm, peak });
    if (!r.ok) return r;
    if (r.text) texts.push(r.text);
    language ??= r.language;
    model ??= r.model;
  }
  return { ok: true, text: texts.join(" "), ...(language !== undefined && { language }), ...(model !== undefined && { model }) };
}

/** The foreground window, or undefined when it cannot be read. */
export async function foreground(inserter: DictationDeps["inserter"]): Promise<Target | undefined> {
  try {
    return await inserter.target();
  } catch {
    return undefined; // an unreadable window is treated as "unknown", which copies instead of pasting
  }
}

async function insert(ctx: Context, job: Job, said: { clip: Clip; heard: Heard; text: string }): Promise<Outcome> {
  const { clip, heard, text } = said;
  const target = await job.target;
  let current = await within(ctx, "window", STAGE_MS, () => foreground(ctx.deps.inserter), undefined);
  const refocus = ctx.settings.returnToApp && !!target && !!current && current.id !== target.id && !current.passwordField && !!ctx.deps.inserter.focus;
  let lost = false;
  if (refocus && target) {
    const back = await within(ctx, "return-to-app", STAGE_MS, () => ctx.deps.inserter.focus!(target), false);
    if (back) current = await within(ctx, "window", STAGE_MS, () => foreground(ctx.deps.inserter), undefined);
    lost = !back;
  }
  const plan = planPaste({ target, current, settings: ctx.settings, interrupted: clip.interrupted === true });
  if (plan.method === "refuse") return { error: plan.reason };
  // The text is in History before anything is sent, so an insertion that fails or a window that cannot be reached loses nothing.
  const app = (current ?? target)?.exe;
  // Saved before inserting, so the text survives an insertion that fails.
  await within(
    ctx,
    "history",
    STAGE_MS,
    () =>
      ctx.history.add({
        at: ctx.deps.clock.now(),
        text,
        raw: heard.text,
        durationMs: Math.round((clip.pcm.length / clip.sampleRate) * 1000),
        ...(app !== undefined && { app }),
        ...(heard.language !== undefined && { language: heard.language }),
        ...(heard.model !== undefined && { model: heard.model }),
        ...(clip.interrupted && { kind: "interrupted" as const }),
      }),
    undefined,
  );
  if (lost) return { error: "focus-failed" };
  const done = await ctx.deps.inserter.insert({ text, plan });
  if (!done.ok) return { error: "insert-failed" };
  return { notice: plan.method === "copy" ? { kind: "copied", reason: plan.reason } : { kind: "inserted" } };
}

/** Recording to inserted text: silence check, transcription, text rules, insertion plan, history. */
export async function runJob(ctx: Context, job: Job): Promise<Outcome | undefined> {
  const clip = await job.clip;
  if (!clip) return undefined;
  if (clip.peak < QUIET_PEAK) {
    ctx.deps.keepClip?.(clip, "silent");
    return { error: "mic-silent" };
  }
  if (clip.interrupted) ctx.deps.keepClip?.(clip, "interrupted");
  const heard = await hear(ctx, clip);
  if (!heard.ok) {
    ctx.deps.keepClip?.(clip, "failed");
    return { error: heard.code === "failed" ? "transcribe-failed" : heard.code };
  }
  const text = applyRules(heard.text, { ...ctx.settings, language: heard.language ?? ctx.settings.language });
  if (!text) return { notice: { kind: "no-speech" } };
  ctx.inserting();
  return insert(ctx, job, { clip, heard, text });
}
