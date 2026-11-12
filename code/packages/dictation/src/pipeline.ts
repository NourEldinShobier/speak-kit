import type { History } from "./history";
import { applyMode, resolveMode } from "./modes/modes";
import { rewritePass, type RewriteOutcome, type RewriteStyle } from "./modes/rewrite";
import { planPaste, type Target } from "./paste-plan";
import { applyRules } from "./rules";
import { buildPrompt, soundsLikeRules } from "./vocabulary";
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
  deps: Pick<DictationDeps, "transcriber" | "inserter" | "clock" | "audio" | "rewriter">;
  history: History;
  settings: Settings;
  /** Called when the text is ready and insertion starts. */
  inserting(): void;
}

type Heard = Extract<TranscribeResult, { ok: true }>;

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
  const app = (current ?? target)?.exe;
  // Saved before inserting, so the text survives an insertion that fails.
  const id = await ctx.history.add({
    at: ctx.deps.clock.now(),
    text,
    raw: heard.text,
    durationMs: Math.round((clip.pcm.length / clip.sampleRate) * 1000),
    ...(app !== undefined && { app }),
    ...(heard.language !== undefined && { language: heard.language }),
    ...(heard.model !== undefined && { model: heard.model }),
    ...(said.rewrite && { rewrite: said.rewrite }),
  });
  if (id && ctx.settings.keepRecordings && ctx.deps.audio) await keepRecording(ctx, id, clip);
  const done = await ctx.deps.inserter.insert({ text, plan });
  if (!done.ok) return { error: "insert-failed" };
  return { notice: plan.method === "copy" ? { kind: "copied", reason: plan.reason } : { kind: "inserted" } };
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
  ctx.inserting();
  let rewrite: RewriteOutcome | undefined;
  if (eff.rewrite && ctx.settings.rewrite.enabled && ctx.deps.rewriter) {
    const r = await rewritePass({
      text,
      rewriter: ctx.deps.rewriter,
      deadlineMs: ctx.settings.rewrite.deadlineMs,
      clock: ctx.deps.clock,
      style: rewriteStyle(eff),
    });
    text = r.text;
    rewrite = r.outcome;
  }
  return insert(ctx, job, { clip, heard, text, settings: eff, ...(rewrite && { rewrite }) });
}
