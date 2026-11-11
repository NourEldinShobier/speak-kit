import { CostMeter, type RealtimeUsage } from "./cost";
import type { PageIndex } from "./search";
import { lookCalls, lookEvents, type LookAnswer, type LookArgs } from "./look-tool";
import { answerSearches, deleteItems, type ToolEvent } from "./search-tool";

/** After the cost cap the pill warns first: until the answer that is playing is spoken (at most this long), or a moment when nothing is playing. */
const PLAYING_MS = 25_000;
const QUIET_MS = 4000;
const AFTER_AUDIO_MS = 1500;

/** Newest looks that stay in the context with their picture; older ones are deleted so their tokens are not billed on every later response. */
export const LOOKS_KEPT = 2;

export interface TurnHooks {
  /** a client event for the model (a search answer, an item delete) */
  send(ev: object): void;
  /** One look at the screen. `resume` is false when the user spoke meanwhile: the model is then already answering them, and the picture only joins the context. */
  look(args: LookArgs): Promise<{ answer: LookAnswer; resume: boolean }>;
  /** a response finished that was an answer, not a search call */
  answered(): void;
  /** the soft cost cap was reached: warn and stop listening */
  warn(): void;
  /** the warning is over: end the conversation */
  end(): void;
}

/**
 * What each finished response means for the bill and for the context: its usage is metered, a search call is answered from the page, a look call from
 * the screen, and the tool items are dropped again (a search at the next answer, a look when two newer ones exist).
 */
export class Turns {
  readonly meter: CostMeter;
  /** set when the page is only outlined in the instructions */
  index: PageIndex | undefined;
  capped = false;
  private items: string[] = [];
  /** the item ids of each look still in the context, oldest first */
  private looks: string[][] = [];
  private seq = 0;
  private lookSeq = 0;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly hooks: TurnHooks;

  constructor(capUsd: number, hooks: TurnHooks) {
    this.meter = new CostMeter(capUsd);
    this.hooks = hooks;
  }

  /** A response.done. `playing`: the model's voice is playing right now. */
  responseDone(e: ToolEvent & { response?: { usage?: RealtimeUsage } }, playing: boolean) {
    this.meter.add(e.response?.usage);
    const looks = this.capped || this.meter.over ? [] : lookCalls(e); // the conversation is about to end: no new picture
    const answer = answerSearches(e, this.index, () => `sk_search_${++this.seq}`);
    if (answer) {
      this.items.push(...answer.items);
      if (looks.length) answer.events.pop(); // the look's response.create goes after both answers
      answer.events.forEach((ev) => this.hooks.send(ev));
    } else if (!looks.length) {
      deleteItems(this.items).forEach((ev) => this.hooks.send(ev)); // the passages would be billed again on every later turn
      this.items = [];
      this.hooks.answered();
    }
    if (looks.length) void this.answerLooks(looks);
    if (this.meter.over && !this.capped) {
      this.capped = true;
      this.hooks.warn();
      this.later(playing ? PLAYING_MS : QUIET_MS);
    }
  }

  /** Looks at the screen one after the other; each picture goes with its text, the oldest looks are dropped, and the model goes on after the last. */
  private async answerLooks(calls: ReturnType<typeof lookCalls>) {
    for (const [i, c] of calls.entries()) {
      const r = await this.hooks.look(c.args).catch((): { answer: LookAnswer; resume: boolean } => ({ answer: { ok: false, code: "capture-failed" }, resume: true }));
      if (this.stopped) return;
      const n = ++this.lookSeq;
      const sent = lookEvents(c, r.answer, { output: `sk_look_${n}`, image: `sk_img_${n}`, resume: r.resume && i === calls.length - 1 });
      sent.events.forEach((ev) => this.hooks.send(ev));
      this.looks.push(sent.items);
      while (this.looks.length > LOOKS_KEPT) deleteItems(this.looks.shift() ?? []).forEach((ev) => this.hooks.send(ev));
    }
  }

  /** The model's voice stopped: past the cap, the conversation ends right after. */
  audioStopped() {
    if (this.capped) this.later(AFTER_AUDIO_MS);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  private later(ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hooks.end(), ms);
  }
}
