import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ScreenLook } from "@speakkit/protocol";
import type { LookAnswer } from "./look-tool";
import { PageIndex } from "./search";
import { Turns } from "./turns";

const call = { type: "function_call", id: "item_1", name: "search_page", call_id: "call_1", arguments: '{"query":"parking"}' };
// 1000 audio tokens in and 200 out: $0.0448
const billed = { input_token_details: { audio_tokens: 1000 }, output_token_details: { audio_tokens: 200 } };

const LOOK: ScreenLook = { image: "AAAA", width: 100, height: 50, text: "Total 42", ocr: "ok", target: "Notes", scope: "window" };
/** What the next look gives back; a test changes it. */
let looked: () => { answer: LookAnswer; resume: boolean } = () => ({ answer: { ok: true, look: LOOK }, resume: true });

function setup(cap = 0.5) {
  const log: string[] = [];
  const sent: { type: string; item?: { id?: string; type?: string; output?: string }; item_id?: string }[] = [];
  const turns = new Turns(cap, {
    send: (ev) => (log.push(`send ${(ev as { type: string }).type}`), sent.push(ev as (typeof sent)[number])),
    look: async (args) => (log.push(`look ${args.scope} ${args.want}`), looked()),
    answered: () => log.push("answered"),
    warn: () => log.push("warn"),
    end: () => log.push("end"),
  });
  turns.index = new PageIndex("Parking costs two coins.");
  return { turns, log, sent };
}

beforeEach(() => {
  vi.useFakeTimers();
  looked = () => ({ answer: { ok: true, look: LOOK }, resume: true });
});
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

describe("look turns", () => {
  const lookCall = (id: number, args = '{"scope":"screen","want":"read"}') => ({ type: "function_call", id: `item_l${id}`, name: "look_at_screen", call_id: `call_l${id}`, arguments: args });
  const flush = () => vi.advanceTimersByTimeAsync(0);
  const deleted = (sent: { type: string; item_id?: string }[]) => sent.filter((s) => s.type === "conversation.item.delete").map((s) => s.item_id);

  it("looks when the model asks, sends the output and the picture, and lets the model go on, without counting the call as an answer", async () => {
    const { turns, log } = setup();
    turns.responseDone({ response: { output: [lookCall(1)] } }, false);
    await flush();
    expect(log).toEqual(["look screen read", "send conversation.item.create", "send conversation.item.create", "send response.create"]);
  });

  it("takes the defaults for missing arguments", async () => {
    const { turns, log } = setup();
    turns.responseDone({ response: { output: [lookCall(1, "{}")] } }, false);
    await flush();
    expect(log[0]).toBe("look window describe");
  });

  it("keeps the newest two looks and deletes the call, output and picture of older ones", async () => {
    const { turns, sent } = setup();
    for (const n of [1, 2, 3]) {
      turns.responseDone({ response: { output: [lookCall(n)] } }, false);
      await flush();
    }
    expect(deleted(sent)).toEqual(["item_l1", "sk_look_1", "sk_img_1"]);
    turns.responseDone({ response: { output: [lookCall(4)] } }, false);
    await flush();
    expect(deleted(sent)).toEqual(["item_l1", "sk_look_1", "sk_img_1", "item_l2", "sk_look_2", "sk_img_2"]);
  });

  it("does not resume the model when the user spoke during the look, but still adds the picture", async () => {
    const { turns, log } = setup();
    looked = () => ({ answer: { ok: true, look: LOOK }, resume: false });
    turns.responseDone({ response: { output: [lookCall(1)] } }, false);
    await flush();
    expect(log).toEqual(["look screen read", "send conversation.item.create", "send conversation.item.create"]);
  });

  it("tells the model when the look failed, with no picture", async () => {
    const { turns, sent } = setup();
    looked = () => ({ answer: { ok: false, code: "declined" }, resume: true });
    turns.responseDone({ response: { output: [lookCall(1)] } }, false);
    await flush();
    expect(sent.map((s) => s.type)).toEqual(["conversation.item.create", "response.create"]);
    expect(sent[0]?.item?.output).toContain("did not allow");
  });

  it("answers a look that throws as a failed capture", async () => {
    const { turns, sent } = setup();
    looked = () => {
      throw new Error("boom");
    };
    turns.responseDone({ response: { output: [lookCall(1)] } }, false);
    await flush();
    expect(sent[0]?.item?.output).toContain("could not be captured");
    expect(sent.at(-1)?.type).toBe("response.create");
  });

  it("answers a search and a look of one response with a single response.create", async () => {
    const { turns, sent } = setup();
    turns.responseDone({ response: { output: [call, lookCall(1)] } }, false);
    await flush();
    expect(sent.map((s) => s.type)).toEqual(["conversation.item.create", "conversation.item.create", "conversation.item.create", "response.create"]);
  });

  it("does not look once the cost cap is reached, and meters the picture of the look", async () => {
    const a = setup(0.0001);
    a.turns.responseDone({ response: { output: [lookCall(1)], usage: { input_token_details: { image_tokens: 1100 } } } }, false);
    await flush();
    expect(a.log).not.toContain("look screen read");
    expect(a.turns.meter.imageTokens).toBe(1100);
    expect(a.log).toContain("warn");
  });

  it("sends nothing after stop", async () => {
    const { turns, log } = setup();
    turns.responseDone({ response: { output: [lookCall(1)] } }, false);
    turns.stop();
    await flush();
    expect(log).toEqual(["look screen read"]);
  });
});
