import { chunkPcm, QUIET_PEAK } from "./capture/policy";
import { skipPauses } from "./capture/outage";
import type { History } from "./history";
import { applyMode, resolveMode } from "./modes/modes";
import { rewritePass, type RewriteOutcome, type RewriteStyle } from "./modes/rewrite";
import { planPaste, type Target } from "./paste-plan";
import { applyRules } from "./rules";
import { stripTailCredit } from "./tail-filter";
import { buildPrompt, soundsLikeRules } from "./vocabulary";
import type { Settings } from "./settings";
import type { CaptureResult, Clip, DictationDeps, DictationErrorCode, Notice, TranscribeResult } from "./types";

export interface Job {
  /** The recording once stopped; undefined when it never started. */
  clip: Promise<Clip | undefined>;
  /** The window the key was pressed in. */
  target: Promise<Target | undefined>;
  /** Dictated without text clean-up or replacements. */
  raw?: boolean;
  /** The text goes here and not into a window; it is saved in the history as printed. */
  print?: (result: CaptureResult) => void;
}

export type Outcome = { error: DictationErrorCode } | { notice: Notice };

export interface Context {
  deps: Pick<DictationDeps, "transcriber" | "inserter" | "clock" | "keepClip" | "log" | "audio" | "rewriter">;
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
      try {
        if (why) ctx.deps.log?.(name, why);
      } catch {
        // a broken log must not hold the text up
      }
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
async function hear(ctx: Context, clip: Clip, prompt: string): Promise<TranscribeResult & { droppedMs?: number }> {
  if (ctx.settings.skipPauses) {
    const cut = skipPauses(clip.pcm, clip.sampleRate);
    if (cut.droppedMs > 0) {
      const r = await hearAll(ctx, { ...clip, pcm: cut.pcm }, prompt);
      // Trimming only helps when it kept the speech: an empty answer or a failure is tried again on the whole recording.
      if (r.ok && r.text) return { ...r, droppedMs: cut.droppedMs };
    }
  }
  return hearAll(ctx, clip, prompt);
}

async function hearAll(ctx: Context, clip: Clip, prompt: string): Promise<TranscribeResult> {
  const req = (c: Clip) => ctx.deps.transcriber.transcribe({ clip: c, language: ctx.settings.language, ...(prompt && { prompt }) });
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

const windowNow = (ctx: Context) => within(ctx, { name: "window", ms: STAGE_MS, fallback: undefined }, () => foreground(ctx.deps.inserter));

/** The window the key was pressed in and the one in front now. With "return to the app" on, a different window in front is replaced by the first; `lost` says that did not work. */
async function windows(ctx: Context, job: Job, settings: Settings): Promise<{ target: Target | undefined; current: Target | undefined; lost: boolean }> {
  const target = await within(ctx, { name: "window", ms: STAGE_MS, fallback: undefined }, () => job.target);
  const current = await windowNow(ctx);
  const focus = ctx.deps.inserter.focus;
  const moved = !!target && !!current && current.id !== target.id && !current.passwordField;
  if (!settings.returnToApp || !moved || !focus) return { target, current, lost: false };
  const back = await within(ctx, { name: "return-to-app", ms: STAGE_MS, fallback: false }, () => focus(target));
  return { target, current: back ? await windowNow(ctx) : current, lost: !back };
}

function kindOf(clip: Clip, job: Job): "raw" | "interrupted" | undefined {
  if (clip.interrupted) return "interrupted";
  return job.raw ? "raw" : undefined;
}

type Said = { clip: Clip; heard: Heard; text: string; rewrite?: RewriteOutcome };

async function insert(ctx: Context, job: Job, said: Said & { settings: Settings; transcribeMs: number; droppedMs: number | undefined }): Promise<Outcome> {
  const { clip, heard, text, transcribeMs, droppedMs } = said;
  const { target, current, lost } = await windows(ctx, job, said.settings);
  const plan = planPaste({ target, current, settings: said.settings, interrupted: clip.interrupted === true });
  if (plan.method === "refuse") return { error: plan.reason };
  // The text is in History before anything is sent, so an insertion that fails or a window that cannot be reached loses nothing.
  const app = (current ?? target)?.exe;
  // Saved before inserting, so the text survives an insertion that fails.
  const name = (current ?? target)?.name;
  const kind = kindOf(clip, job);
  const entryId = await within(ctx, { name: "history", ms: STAGE_MS, fallback: undefined }, () =>
    ctx.history.add({
      at: ctx.deps.clock.now(),
      text,
      raw: heard.text,
      durationMs: Math.round((clip.pcm.length / clip.sampleRate) * 1000),
      ...(app !== undefined && { app }),
      ...(heard.language !== undefined && { language: heard.language }),
      ...(heard.model !== undefined && { model: heard.model }),
      ...(kind && { kind }),
      ...(name !== undefined && { displayName: name }),
      timings: { transcribeMs, ...(droppedMs && { pausesDroppedMs: droppedMs }) },
      outcome: plan.method === "copy" ? ("copied" as const) : ("sent" as const),
      ...(said.rewrite && { rewrite: said.rewrite }),
    }),
  );
  if (entryId && ctx.settings.keepRecordings && ctx.deps.audio) await keepRecording(ctx, entryId, clip);
  const failed = (error: "focus-failed" | "insert-failed"): Outcome => {
    if (entryId) void ctx.history.update(entryId, { outcome: "failed" });
    return { error };
  };
  if (lost) return failed("focus-failed");
  const done = await ctx.deps.inserter.insert({ text, plan });
  if (!done.ok) return failed("insert-failed");
  return { notice: plan.method === "copy" ? { kind: "copied", reason: plan.reason } : { kind: "inserted" } };
}

async function printed(ctx: Context, job: Job, said: Said): Promise<undefined> {
  const { clip, heard, text } = said;
  await ctx.history.add({
    at: ctx.deps.clock.now(),
    text,
    raw: heard.text,
    durationMs: Math.round((clip.pcm.length / clip.sampleRate) * 1000),
    ...(heard.language !== undefined && { language: heard.language }),
    ...(heard.model !== undefined && { model: heard.model }),
    kind: "printed",
    ...(said.rewrite && { rewrite: said.rewrite }),
  });
  job.print?.({ ok: true, text });
  return undefined;
}

/** Keeps the audio next to the history entry. A recording that cannot be saved leaves the entry without one; the dictation goes on. */
async function keepRecording(ctx: Context, id: string, clip: Clip): Promise<void> {
  try {
    const audio = await ctx.deps.audio?.save(id, clip);
    if (audio) await ctx.history.patch(id, { audio });
  } catch {
    // no recording for this entry
  }
}

const rewriteStyle = (s: Pick<Settings, "lowercase" | "autoCapitalize" | "stripFinalStop">): RewriteStyle => {
  let capitals: RewriteStyle["capitals"] = "keep";
  if (s.lowercase) capitals = "lower";
  else if (s.autoCapitalize) capitals = "sentence";
  return { capitals, stripFinalStop: s.stripFinalStop };
};

/** A take with no sound is refused and kept; one cut short is kept too, and goes on. */
function checkClip(ctx: Context, clip: Clip): Outcome | undefined {
  if (clip.peak < QUIET_PEAK) {
    ctx.deps.keepClip?.(clip, "silent");
    return { error: "mic-silent" };
  }
  if (clip.interrupted) ctx.deps.keepClip?.(clip, "interrupted");
  return undefined;
}

/** The text rules of the mode in use, with the sounds-like spellings of the vocabulary. */
function cleanUp(heard: Heard, eff: Settings, language: string): string {
  return applyRules(heard.text, { ...eff, replacements: [...eff.replacements, ...soundsLikeRules(eff.terms)], language: heard.language ?? language });
}

/** The speech engine's text for the take, with a made-up credit at the end removed; or why there is none. The take is kept when the engine fails. */
async function transcribe(ctx: Context, clip: Clip, prompt: string): Promise<{ heard: Heard & { droppedMs?: number }; transcribeMs: number } | { error: DictationErrorCode }> {
  const from = ctx.deps.clock.now();
  const said = await hear(ctx, clip, prompt);
  const transcribeMs = ctx.deps.clock.now() - from;
  if (!said.ok) {
    ctx.deps.keepClip?.(clip, "failed");
    return { error: said.code === "failed" ? "transcribe-failed" : said.code };
  }
  return { heard: { ...said, text: stripTailCredit(said.text, clip.pcm, clip.sampleRate) }, transcribeMs };
}

/** The rewrite pass, when the mode asks for one, it is switched on and a writer is there; otherwise undefined. */
async function rewriteStep(ctx: Context, eff: Settings, text: string): Promise<{ text: string; outcome: RewriteOutcome } | undefined> {
  if (!eff.rewrite || !ctx.settings.rewrite.enabled || !ctx.deps.rewriter) return undefined;
  return rewritePass({ text, rewriter: ctx.deps.rewriter, deadlineMs: ctx.settings.rewrite.deadlineMs, clock: ctx.deps.clock, style: rewriteStyle(eff) });
}

/** Recording to inserted text: silence check, transcription, text rules, rewrite, insertion plan, history. */
export async function runJob(ctx: Context, job: Job): Promise<Outcome | undefined> {
  const clip = await job.clip;
  if (!clip) return undefined;
  const silent = checkClip(ctx, clip);
  if (silent) return silent;
  const target = await within(ctx, { name: "window", ms: STAGE_MS, fallback: undefined }, () => job.target);
  const eff = applyMode(ctx.settings, resolveMode(ctx.settings.modes, target?.exe));
  const prompt = ctx.settings.prompt ? buildPrompt(eff.terms).text : "";
  const got = await transcribe(ctx, clip, prompt);
  if ("error" in got) return got;
  const { heard, transcribeMs } = got;
  let text = job.raw ? heard.text.trim() : cleanUp(heard, eff, ctx.settings.language);
  if (!text) return { notice: { kind: "no-speech" } };
  const rewritten = job.raw ? undefined : await rewriteStep(ctx, eff, text);
  if (rewritten) text = rewritten.text;
  const rewrite = rewritten?.outcome;
  if (job.print) return printed(ctx, job, { clip, heard, text, ...(rewrite && { rewrite }) });
  ctx.inserting();
  return insert(ctx, job, { clip, heard, text, transcribeMs, droppedMs: heard.droppedMs, settings: eff, ...(rewrite && { rewrite }) });
}

/** Why a job that was meant to print produced no text. */
export function failureOf(outcome: Outcome | undefined): CaptureResult {
  if (outcome && "error" in outcome) return { ok: false, code: outcome.error };
  return { ok: false, code: outcome ? "no-speech" : "mic-failed" };
}

/** Types the newest non-empty history entry into the window in front. The entry was saved before the dictation was inserted, so it is never older text. */
export async function pasteLast(ctx: Pick<Context, "deps" | "history" | "settings">): Promise<"pasted" | "copied" | "empty" | "failed"> {
  const entry = (await ctx.history.list()).find((e) => e.text.trim());
  if (!entry) return "empty";
  const current = await foreground(ctx.deps.inserter);
  const plan = planPaste({ target: current, current, settings: ctx.settings, interrupted: false });
  if (plan.method === "refuse") return "failed";
  try {
    if (!(await ctx.deps.inserter.insert({ text: entry.text, plan })).ok) return "failed";
  } catch {
    return "failed";
  }
  return plan.method === "copy" ? "copied" : "pasted";
}
