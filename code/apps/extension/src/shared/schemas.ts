import * as v from "valibot";
import type { ContentToBg, VoiceUp } from "@speakkit/protocol";
import type { ExtraToBg } from "./internal";

/**
 * Trust boundary of the service worker: every message from a content script, popup, options page or side panel is
 * parsed here before it is routed. Anything that does not match is dropped (and answered with { ok: false }).
 * Content scripts run inside web pages, so their messages are treated as untrusted input.
 */
const int = (min = 0, max = 1_000_000) => v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));
const speed = v.pipe(v.number(), v.finite(), v.minValue(0.5), v.maxValue(3));
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(200));

const readDocSchema = v.object({
  docId: id,
  tabId: v.number(),
  url: v.pipe(v.string(), v.maxLength(4000)),
  title: v.pipe(v.string(), v.maxLength(1000)),
  sentences: v.pipe(v.array(v.object({ text: v.pipe(v.string(), v.maxLength(5000)), block: int() })), v.maxLength(100_000)),
  startIndex: int(),
  source: v.picklist(["page", "selection", "from-here"]),
});

const playerCommandSchema = v.variant("cmd", [
  v.object({ cmd: v.literal("play"), doc: readDocSchema }),
  v.object({ cmd: v.literal("pause") }),
  v.object({ cmd: v.literal("resume") }),
  v.object({ cmd: v.literal("toggle") }),
  v.object({ cmd: v.literal("stop") }),
  v.object({ cmd: v.literal("seek-ms"), deltaMs: v.pipe(v.number(), v.finite()) }),
  v.object({ cmd: v.literal("seek-sentence"), index: int() }),
  v.object({ cmd: v.literal("next-block") }),
  v.object({ cmd: v.literal("prev-block") }),
  v.object({ cmd: v.literal("set-speed"), speed }),
  v.object({ cmd: v.literal("set-voice"), voice: id }),
  v.object({ cmd: v.literal("queue-add"), doc: readDocSchema }),
  v.object({ cmd: v.literal("queue-remove"), docId: id }),
  v.object({ cmd: v.literal("queue-play"), docId: id }),
  v.object({ cmd: v.literal("queue-clear") }),
]);

const mode = v.picklist(["page", "selection", "from-here"]);
const tabMode = v.picklist(["page", "selection"]);

export const inboundSchema = v.variant("t", [
  v.object({ t: v.literal("player"), command: playerCommandSchema }),
  v.object({ t: v.literal("get-state") }),
  v.object({ t: v.literal("open-options"), section: v.optional(v.literal("voicechat")) }),
  v.object({ t: v.literal("hello"), url: v.pipe(v.string(), v.maxLength(4000)) }),
  v.object({ t: v.literal("dismiss"), on: v.boolean() }),
  v.object({ t: v.literal("frame") }),
  v.object({ t: v.literal("get-health"), force: v.optional(v.boolean()) }),
  v.object({ t: v.literal("auth-check"), port: v.optional(int(1, 65535)), token: v.optional(v.pipe(v.string(), v.maxLength(500))) }),
  v.object({ t: v.literal("get-voices") }),
  v.object({ t: v.literal("get-queue") }),
  v.object({ t: v.literal("read"), mode, tabId: v.optional(v.number()), queue: v.optional(v.boolean()) }),
  v.object({ t: v.literal("read-tab"), tabId: v.optional(v.number()), mode: tabMode, queue: v.optional(v.boolean()) }),
  v.object({ t: v.literal("open-sidepanel"), windowId: v.optional(v.number()) }),
  v.object({ t: v.literal("set-auto-play"), on: v.boolean() }),
  v.object({ t: v.literal("preview"), voice: id, speed: v.optional(speed), text: v.pipe(v.string(), v.maxLength(2000)) }),
  v.object({ t: v.literal("preview-voice"), voice: id }),
  v.object({ t: v.literal("open-app") }),
  v.object({ t: v.literal("launch-app") }),
  v.object({ t: v.literal("warm"), reason: v.optional(v.picklist(["popup", "hover", "selection", "dock", "options"])) }),
  v.object({ t: v.literal("reader"), tabId: v.optional(v.number()), open: v.boolean() }),
]);

export type Inbound = ContentToBg | ExtraToBg;

/** Returns the parsed message, or undefined when it is not a valid request. */
export function parseInbound(msg: unknown): Inbound | undefined {
  const r = v.safeParse(inboundSchema, msg);
  return r.success ? r.output : undefined; // a schema that drifts from Inbound fails to compile here
}

const voicePage = v.object({
  url: v.pipe(v.string(), v.maxLength(4000)),
  title: v.pipe(v.string(), v.maxLength(1000)),
  text: v.pipe(v.string(), v.maxLength(1_000_000)),
  selection: v.optional(v.pipe(v.string(), v.maxLength(200_000))),
});
const voiceUpSchema = v.variant("t", [
  v.object({ t: v.literal("start"), page: voicePage }),
  v.object({ t: v.literal("update"), page: voicePage }),
  v.object({ t: v.literal("mute"), on: v.boolean() }),
  v.object({ t: v.literal("keep-going") }),
  v.object({ t: v.literal("end") }),
]);

/** Returns the parsed message of a page on the voice port, or undefined when it is not one. */
export function parseVoiceUp(msg: unknown): VoiceUp | undefined {
  const r = v.safeParse(voiceUpSchema, msg);
  return r.success ? r.output : undefined;
}
