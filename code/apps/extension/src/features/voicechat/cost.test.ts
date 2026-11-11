import { describe, expect, it } from "vite-plus/test";
import { CostMeter, responseCost } from "./cost";

describe("responseCost", () => {
  it("prices audio and text in and out at their own rates", () => {
    // 1000 audio in ($0.032) + 500 text in ($0.002) + 100 audio out ($0.0064) + 50 text out ($0.0012)
    const usage = { input_token_details: { audio_tokens: 1000, text_tokens: 500 }, output_token_details: { audio_tokens: 100, text_tokens: 50 } };
    expect(responseCost(usage)).toBeCloseTo(0.0416, 6);
  });

  it("bills cached tokens at the cached rate, split by modality when the report gives the split", () => {
    const usage = { input_token_details: { audio_tokens: 1000, text_tokens: 10_000, cached_tokens: 9000, cached_tokens_details: { text_tokens: 8000, audio_tokens: 1000 } } };
    // text: 2000 fresh ($0.008) + 8000 cached ($0.0032); audio: 0 fresh + 1000 cached ($0.0004)
    expect(responseCost(usage)).toBeCloseTo(0.0116, 6);
  });

  it("without a split the cache counts as text first", () => {
    expect(responseCost({ input_token_details: { text_tokens: 10_000, cached_tokens: 9000 } })).toBeCloseTo(0.0076, 6);
  });

  it("prices the tokens of a picture at the image rate, fresh and cached", () => {
    // 1100 image tokens fresh: $0.0055; with 1000 of them cached: 100 fresh ($0.0005) + 1000 cached ($0.0004)
    expect(responseCost({ input_token_details: { image_tokens: 1100 } })).toBeCloseTo(0.0055, 6);
    expect(responseCost({ input_token_details: { image_tokens: 1100, cached_tokens: 1000, cached_tokens_details: { image_tokens: 1000 } } })).toBeCloseTo(0.0009, 6);
  });

  it("does not take the cache of the text for the picture's when the report gives no split", () => {
    expect(responseCost({ input_token_details: { text_tokens: 1000, image_tokens: 1000, cached_tokens: 1000 } })).toBeCloseTo(0.0004 + 0.005, 6);
  });

  it("ignores missing and nonsense numbers", () => {
    expect(responseCost({})).toBe(0);
    expect(responseCost({ output_token_details: { audio_tokens: -5, text_tokens: Number.NaN } })).toBe(0);
  });
});

describe("CostMeter", () => {
  const turn = { input_tokens: 1000, output_tokens: 100, input_token_details: { audio_tokens: 1000 }, output_token_details: { audio_tokens: 100 } }; // $0.0384

  it("adds responses and reports the cost only once something was billed", () => {
    const m = new CostMeter(0.5);
    expect(m.usage()).toBeUndefined();
    m.add(undefined);
    expect(m.usage()).toBeUndefined();
    m.add(turn);
    m.add(turn);
    expect(m.usage()?.costUsd).toBeCloseTo(0.0768, 6);
    expect([m.responses, m.inputTokens, m.outputTokens]).toEqual([2, 2000, 200]);
  });

  it("counts the tokens of pictures", () => {
    const m = new CostMeter(0.5);
    m.add({ input_token_details: { image_tokens: 1100 } });
    m.add({ input_token_details: { image_tokens: 1100 } });
    m.add({ input_token_details: { text_tokens: 5 } });
    expect(m.imageTokens).toBe(2200);
    expect(m.usd).toBeCloseTo(0.011 + 0.00002, 6);
  });

  it("goes over its cap at the response that reaches it, not before", () => {
    const m = new CostMeter(0.0768);
    m.add(turn);
    expect(m.over).toBe(false);
    m.add(turn);
    expect(m.over).toBe(true);
    expect(m.usage(true)).toMatchObject({ capped: true });
  });
});
