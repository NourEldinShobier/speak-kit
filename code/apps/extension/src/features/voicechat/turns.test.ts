import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { PageIndex } from "./search";
import { Turns } from "./turns";

const call = { type: "function_call", id: "item_1", name: "search_page", call_id: "call_1", arguments: '{"query":"parking"}' };
// 1000 audio tokens in and 200 out: $0.0448
const billed = { input_token_details: { audio_tokens: 1000 }, output_token_details: { audio_tokens: 200 } };

function setup(cap = 0.5) {
  const log: string[] = [];
  const turns = new Turns(cap, {
    send: (ev) => log.push(`send ${(ev as { type: string }).type}`),
    answered: () => log.push("answered"),
    warn: () => log.push("warn"),
    end: () => log.push("end"),
  });
  turns.index = new PageIndex("Parking costs two coins.");
  return { turns, log };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("search turns", () => {
  it("answers a search call without counting it as an answer, and deletes the tool items once the model has answered", () => {
    const { turns, log } = setup();
    turns.responseDone({ response: { output: [call] } }, false);
    expect(log).toEqual(["send conversation.item.create", "send response.create"]);
    log.length = 0;
    turns.responseDone({ response: { output: [{ type: "message" }] } }, true);
    expect(log).toEqual(["send conversation.item.delete", "send conversation.item.delete", "answered"]);
    log.length = 0;
    turns.responseDone({ response: { output: [{ type: "message" }] } }, true);
    expect(log).toEqual(["answered"]); // nothing left to delete
  });
});

describe("cost cap", () => {
  it("warns once at the response that reaches the cap, then ends: soon when nothing plays, after the answer when something does", () => {
    const { turns, log } = setup(0.04);
    turns.responseDone({ response: { usage: billed } }, false);
    turns.responseDone({ response: { usage: billed } }, false);
    expect(log.filter((l) => l === "warn")).toHaveLength(1);
    vi.advanceTimersByTime(3999);
    expect(log).not.toContain("end");
    vi.advanceTimersByTime(1);
    expect(log).toContain("end");
  });

  it("gives a playing answer time to finish: the end follows the audio, with a longer fallback", () => {
    const a = setup(0.04);
    a.turns.responseDone({ response: { usage: billed } }, true);
    vi.advanceTimersByTime(24_999);
    expect(a.log).not.toContain("end");
    a.turns.audioStopped();
    vi.advanceTimersByTime(1499);
    expect(a.log).not.toContain("end");
    vi.advanceTimersByTime(1);
    expect(a.log).toContain("end");

    const b = setup(0.04);
    b.turns.responseDone({ response: { usage: billed } }, true);
    vi.advanceTimersByTime(25_000);
    expect(b.log).toContain("end");
  });

  it("does nothing under the cap, and stop cancels a pending end", () => {
    const a = setup(0.5);
    a.turns.responseDone({ response: { usage: billed } }, true);
    a.turns.audioStopped();
    vi.advanceTimersByTime(60_000);
    expect(a.log).toEqual(["answered"]);
    const b = setup(0.04);
    b.turns.responseDone({ response: { usage: billed } }, false);
    b.turns.stop();
    vi.advanceTimersByTime(60_000);
    expect(b.log).not.toContain("end");
  });
});
