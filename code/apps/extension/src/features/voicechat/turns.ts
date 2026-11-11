import { CostMeter, type RealtimeUsage } from "./cost";
import type { PageIndex } from "./search";
import { answerSearches, deleteItems, type ToolEvent } from "./search-tool";

/** After the cost cap the pill warns first: until the answer that is playing is spoken (at most this long), or a moment when nothing is playing. */
const PLAYING_MS = 25_000;
const QUIET_MS = 4000;
const AFTER_AUDIO_MS = 1500;

export interface TurnHooks {
  /** a client event for the model (a search answer, an item delete) */
  send(ev: object): void;
  /** a response finished that was an answer, not a search call */
  answered(): void;
  /** the soft cost cap was reached: warn and stop listening */
  warn(): void;
  /** the warning is over: end the conversation */
  end(): void;
}

/** What each finished response means for the bill and for the context: its usage is metered, a search call is answered from the page, and the tool items are dropped again. */
export class Turns {
  readonly meter: CostMeter;
  /** set when the page is only outlined in the instructions */
  index: PageIndex | undefined;
  capped = false;
  private items: string[] = [];
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly hooks: TurnHooks;

  constructor(capUsd: number, hooks: TurnHooks) {
    this.meter = new CostMeter(capUsd);
    this.hooks = hooks;
  }

  /** A response.done. `playing`: the model's voice is playing right now. */
  responseDone(e: ToolEvent & { response?: { usage?: RealtimeUsage } }, playing: boolean) {
    this.meter.add(e.response?.usage);
    const answer = answerSearches(e, this.index, () => `sk_search_${++this.seq}`);
    if (answer) {
      this.items.push(...answer.items);
      answer.events.forEach((ev) => this.hooks.send(ev));
    } else {
      deleteItems(this.items).forEach((ev) => this.hooks.send(ev)); // the passages would be billed again on every later turn
      this.items = [];
      this.hooks.answered();
    }
    if (this.meter.over && !this.capped) {
      this.capped = true;
      this.hooks.warn();
      this.later(playing ? PLAYING_MS : QUIET_MS);
    }
  }

  /** The model's voice stopped: past the cap, the conversation ends right after. */
  audioStopped() {
    if (this.capped) this.later(AFTER_AUDIO_MS);
  }

  stop() {
    clearTimeout(this.timer);
  }

  private later(ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hooks.end(), ms);
  }
}
