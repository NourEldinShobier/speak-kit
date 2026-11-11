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
  deps: Pick<DictationDeps, "transcriber" | "inserter" | "clock">;
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

async function insert(ctx: Context, job: Job, said: { clip: Clip; heard: Heard; text: string }): Promise<Outcome> {
  const { clip, heard, text } = said;
  const target = await job.target;
  const current = await foreground(ctx.deps.inserter);
  const plan = planPaste({ target, current, settings: ctx.settings, interrupted: clip.interrupted === true });
  if (plan.method === "refuse") return { error: plan.reason };
  const app = (current ?? target)?.exe;
  // Saved before inserting, so the text survives an insertion that fails.
  await ctx.history.add({
    at: ctx.deps.clock.now(),
    text,
    raw: heard.text,
    durationMs: Math.round((clip.pcm.length / clip.sampleRate) * 1000),
    ...(app !== undefined && { app }),
    ...(heard.language !== undefined && { language: heard.language }),
    ...(heard.model !== undefined && { model: heard.model }),
  });
  const done = await ctx.deps.inserter.insert({ text, plan });
  if (!done.ok) return { error: "insert-failed" };
  return { notice: plan.method === "copy" ? { kind: "copied", reason: plan.reason } : { kind: "inserted" } };
}

/** Recording to inserted text: silence check, transcription, text rules, insertion plan, history. */
export async function runJob(ctx: Context, job: Job): Promise<Outcome | undefined> {
  const clip = await job.clip;
  if (!clip) return undefined;
  if (clip.peak === 0) return { error: "mic-silent" };
  const heard = await ctx.deps.transcriber.transcribe({ clip, language: ctx.settings.language });
  if (!heard.ok) return { error: heard.code === "failed" ? "transcribe-failed" : heard.code };
  const text = applyRules(heard.text, { ...ctx.settings, language: heard.language ?? ctx.settings.language });
  if (!text) return { notice: { kind: "no-speech" } };
  ctx.inserting();
  return insert(ctx, job, { clip, heard, text });
}
