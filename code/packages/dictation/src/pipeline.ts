import { chunkPcm, QUIET_PEAK } from "./capture/policy";
import { skipPauses } from "./capture/outage";
import type { History } from "./history";
import { applyMode, resolveMode } from "./modes/modes";
import { rewritePass, type RewriteOutcome } from "./modes/rewrite";
import { planPaste, type Target } from "./paste-plan";
import { applyRules } from "./rules";
import { buildPrompt, soundsLikeRules } from "./vocabulary";
import type { Settings } from "./settings";
import type { CaptureResult, Clip, DictationDeps, DictationErrorCode, Notice, TranscribeResult } from "./types";

export interface Job {
  /** The recording once stopped; undefined when it never started. */
  clip: Promise<Clip | undefined>;
  /** The window the key was pressed in. */
  target: Promise<Target | undefined>;
  /** Brought back after a cancel. */
  restored?: boolean;
}

export type Outcome = { error: DictationErrorCode } | { notice: Notice };

export interface Context {
  deps: Pick<DictationDeps, "transcriber" | "inserter" | "clock" | "audio" | "rewriter">;
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
export function within<T>(ctx: Pick<Context, "deps">, stage: { name: string; ms: number; fallback: T }, work: () => Promise<T>): Promise<T> {
  const { name, ms, fallback } = stage;
  return new Promise<T>((resolve) => {
    let done = false;
    const settle = (value: T, why?: string) => {
      if (done) return;
      done = true;
      cancel();
      if (why) ctx.deps.log?.(name, why);
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
async function hear(ctx: Context, clip: Clip): Promise<TranscribeResult & { droppedMs?: number }> {
  if (ctx.settings.skipPauses) {
    const cut = skipPauses(clip.pcm, clip.sampleRate);
    if (cut.droppedMs > 0) {
      const r = await hearAll(ctx, { ...clip, pcm: cut.pcm });
      // Trimming only helps when it kept the speech: an empty answer or a failure is tried again on the whole recording.
      if (r.ok && r.text) return { ...r, droppedMs: cut.droppedMs };
    }
  }
  return hearAll(ctx, clip);
}

async function hearAll(ctx: Context, clip: Clip): Promise<TranscribeResult> {
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

async function insert(ctx: Context, job: Job, said: { clip: Clip; heard: Heard; text: string; settings: Settings; rewrite?: RewriteOutcome }): Promise<Outcome> {
  const { clip, heard, text } = said;
  const target = await job.target;
  const current = await foreground(ctx.deps.inserter);
  const plan = planPaste({ target, current, settings: said.settings, interrupted: clip.interrupted === true });
  if (plan.method === "refuse") return { error: plan.reason };
  // The text is in History before anything is sent, so an insertion that fails or a window that cannot be reached loses nothing.
  const app = (current ?? target)?.exe;
  // Saved before inserting, so the text survives an insertion that fails.
  const id = await ctx.history.add({
    at: ctx.deps.clock.now(),
    text,
    raw: heard.text,
    durationMs: Math.round((clip.pcm.length / clip.sampleRate) * 1000),
    ...(heard.language !== undefined && { language: heard.language }),
    ...(heard.model !== undefined && { model: heard.model }),
    ...(said.rewrite && { rewrite: said.rewrite }),
  });
  if (id && ctx.settings.keepRecordings && ctx.deps.audio) {
    const audio = await ctx.deps.audio.save(id, clip).catch(() => undefined);
    if (audio) await ctx.history.patch(id, { audio });
  }
  const done = await ctx.deps.inserter.insert({ text, plan });
  if (!done.ok) return { error: "insert-failed" };
  return { notice: plan.method === "copy" ? { kind: "copied", reason: plan.reason } : { kind: "inserted" } };
}

/** Recording to inserted text: silence check, transcription, text rules, rewrite, insertion plan, history. */
export async function runJob(ctx: Context, job: Job): Promise<Outcome | undefined> {
  const clip = await job.clip;
  if (!clip) return undefined;
  if (clip.peak === 0) return { error: "mic-silent" };
  const mode = resolveMode(ctx.settings.modes, (await job.target)?.exe);
  const eff = applyMode(ctx.settings, mode);
  const prompt = ctx.settings.prompt ? buildPrompt(eff.terms).text : "";
  const heard = await ctx.deps.transcriber.transcribe({ clip, language: ctx.settings.language, ...(prompt && { prompt }) });
  if (!heard.ok) return { error: heard.code === "failed" ? "transcribe-failed" : heard.code };
  const language = heard.language ?? ctx.settings.language;
  let text = applyRules(heard.text, { ...eff, replacements: [...eff.replacements, ...soundsLikeRules(eff.terms)], language });
  if (!text) return { notice: { kind: "no-speech" } };
  if (job.print) return printed(ctx, job, { clip, heard, text });
  ctx.inserting();
  let rewrite: RewriteOutcome | undefined;
  if (eff.rewrite && ctx.settings.rewrite.enabled && ctx.deps.rewriter) {
    const r = await rewritePass({ text, rewriter: ctx.deps.rewriter, deadlineMs: ctx.settings.rewrite.deadlineMs, clock: ctx.deps.clock });
    text = r.text;
    rewrite = r.outcome;
  }
  return insert(ctx, job, { clip, heard, text, settings: eff, ...(rewrite && { rewrite }) });
}
