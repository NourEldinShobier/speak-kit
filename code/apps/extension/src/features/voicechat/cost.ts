import type { VoiceUsage } from "@speakkit/protocol";

/** Soft cap of one conversation in US dollars: past it the pill warns and the conversation ends politely. */
export const SESSION_CAP_USD = 0.5;

/** List prices of gpt-realtime-2.1 in dollars per million tokens. The meter is an estimate: the account's own price list wins. */
const PRICE = { audioIn: 32, audioOut: 64, textIn: 4, textOut: 24, imageIn: 5, cached: 0.4 } as const;

/** The `usage` of a response.done event (only the fields the meter reads). */
export interface RealtimeUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_token_details?: {
    text_tokens?: number;
    audio_tokens?: number;
    image_tokens?: number;
    cached_tokens?: number;
    cached_tokens_details?: { text_tokens?: number; audio_tokens?: number; image_tokens?: number };
  };
  output_token_details?: { text_tokens?: number; audio_tokens?: number };
}

const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);

/** Cost of one response in dollars. Cached tokens are billed at the cached price instead of their modality's. */
export function responseCost(u: RealtimeUsage): number {
  const i = u.input_token_details;
  const textIn = n(i?.text_tokens);
  const audioIn = n(i?.audio_tokens);
  const imageIn = n(i?.image_tokens);
  const cached = n(i?.cached_tokens);
  const split = i?.cached_tokens_details;
  // without a split the cache is assumed to be text: it is the instructions, the start of every prompt
  const cachedText = Math.min(textIn, split ? n(split.text_tokens) : cached);
  const cachedAudio = Math.min(audioIn, split ? n(split.audio_tokens) : Math.max(0, cached - cachedText));
  // a picture stays in the context after a look and is re-read by every later response: the report says how much of it came from the cache
  const cachedImage = Math.min(imageIn, split ? n(split.image_tokens) : 0);
  const o = u.output_token_details;
  const micros =
    (textIn - cachedText) * PRICE.textIn +
    (audioIn - cachedAudio) * PRICE.audioIn +
    (imageIn - cachedImage) * PRICE.imageIn +
    (cachedText + cachedAudio + cachedImage) * PRICE.cached +
    n(o?.text_tokens) * PRICE.textOut +
    n(o?.audio_tokens) * PRICE.audioOut;
  return micros / 1e6;
}

/** What one conversation has cost so far, from the usage of its responses. */
export class CostMeter {
  usd = 0;
  responses = 0;
  inputTokens = 0;
  outputTokens = 0;
  cachedTokens = 0;
  imageTokens = 0;
  readonly capUsd: number;
  constructor(capUsd = SESSION_CAP_USD) {
    this.capUsd = capUsd;
  }

  /** Adds a response.done usage; a response without one is not counted. */
  add(usage: RealtimeUsage | undefined) {
    if (!usage) return;
    this.responses++;
    this.usd += responseCost(usage);
    this.inputTokens += n(usage.input_tokens);
    this.outputTokens += n(usage.output_tokens);
    this.cachedTokens += n(usage.input_token_details?.cached_tokens);
    this.imageTokens += n(usage.input_token_details?.image_tokens);
  }

  get over() {
    return this.usd >= this.capUsd;
  }

  /** The usage the pill shows; undefined until a response was billed. */
  usage(capped = false): VoiceUsage | undefined {
    return this.responses ? { costUsd: this.usd, ...(capped ? { capped } : {}) } : undefined;
  }
}
