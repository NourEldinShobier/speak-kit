import type { Fs } from "@speakkit/transcripts";

export interface FinishedEvent {
  /** Increases by one with every event, forever: a consumer that remembers the last number it saw asks for what came after. */
  seq: number;
  type: "meeting.finished";
  at: number;
  meetingId: string;
  title: string;
  durationSec: number;
}

export interface Since {
  events: FinishedEvent[];
  /** The newest number there is; a consumer that is level with it has missed nothing. */
  latest: number;
  /** Events the consumer asked for were already dropped to keep the log small: it should list the meetings to catch up. */
  gap: boolean;
}

interface Doc {
  v: number;
  last: number;
  events: FinishedEvent[];
  /** The newest event each named consumer confirmed. */
  consumers: Record<string, number>;
}

export interface EventLogOptions {
  fs: Fs;
  file: string;
  now(): number;
  /** Most events kept. */
  cap?: number;
}

/**
 * The "meeting finished" events, kept on disk so a consumer that was not running when one happened (a script, the command line, an agent) can catch up
 * with `since`. Each event is delivered to a consumer when it fetched it and confirmed it; the rest are waiting. Writes run one at a time.
 */
export class EventLog {
  readonly #o: EventLogOptions;
  #doc: Doc;
  #chain: Promise<unknown> = Promise.resolve();

  private constructor(o: EventLogOptions, doc: Doc) {
    this.#o = o;
    this.#doc = doc;
  }

  static async open(o: EventLogOptions): Promise<EventLog> {
    // Without a readable file the numbers start from the clock, so they still never repeat one a consumer saw.
    let doc: Doc = { v: 1, last: Math.floor(o.now() / 1000), events: [], consumers: {} };
    try {
      const raw = await o.fs.read(o.file);
      if (raw) {
        const d = JSON.parse(new TextDecoder().decode(raw)) as Partial<Doc> | null;
        const events = (Array.isArray(d?.events) ? d.events : []).filter((e): e is FinishedEvent => !!e && typeof e.seq === "number" && typeof e.meetingId === "string");
        const last = typeof d?.last === "number" ? Math.max(d.last, ...events.map((e) => e.seq)) : Math.max(0, ...events.map((e) => e.seq));
        doc = { v: 1, last, events, consumers: d?.consumers && typeof d.consumers === "object" ? { ...d.consumers } : {} };
      }
    } catch {
      /* keep the fresh doc */
    }
    return new EventLog(o, doc);
  }

  get latest(): number {
    return this.#doc.last;
  }

  #save(): Promise<void> {
    const run = this.#chain.then(() => this.#o.fs.write(this.#o.file, JSON.stringify(this.#doc)));
    this.#chain = run.catch(() => {});
    return run;
  }

  /** Records that a meeting finished. Resolves when it is on disk. */
  async emit(e: Omit<FinishedEvent, "seq" | "type" | "at">): Promise<FinishedEvent> {
    const ev: FinishedEvent = { seq: ++this.#doc.last, type: "meeting.finished", at: this.#o.now(), ...e };
    this.#doc.events.push(ev);
    const cap = this.#o.cap ?? 200;
    if (this.#doc.events.length > cap) this.#doc.events.splice(0, this.#doc.events.length - cap);
    await this.#save();
    return ev;
  }

  since(seq: number, limit = 100): Since {
    const first = this.#doc.events[0]?.seq;
    const gap = first !== undefined ? seq < first - 1 : seq < this.#doc.last;
    return { events: this.#doc.events.filter((e) => e.seq > seq).slice(0, limit), latest: this.#doc.last, gap };
  }

  /** The consumer has handled everything up to `seq`. Never moves backwards. */
  async ack(consumer: string, seq: number): Promise<void> {
    const at = Math.min(seq, this.#doc.last);
    if (at <= (this.#doc.consumers[consumer] ?? 0)) return;
    this.#doc.consumers[consumer] = at;
    await this.#save();
  }

  /** Each event with whether the consumer has it (delivered) or not (waiting). */
  status(consumer: string): { event: FinishedEvent; delivered: boolean }[] {
    const seen = this.#doc.consumers[consumer] ?? 0;
    return this.#doc.events.map((event) => ({ event, delivered: event.seq <= seen }));
  }
}
