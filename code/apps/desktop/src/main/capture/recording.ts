import type { PointerTrack } from "./pointer";
import type { LiveSession } from "./live-narrator";
import type { TimeRange } from "./page-context";
import type { Notice, NoticeParams } from "../../shared/capture/notices";
import type { RecorderResult } from "../../shared/capture/contract";
import type { CaptureConfig } from "../../shared/capture/settings";
import type { InputEvent } from "./events";
import type { Fence } from "./fence";
import type { Bundle } from "./bundle";
import type { Journal } from "./journal";
import { contactSheetPlan, MAX_SIDE_PX, pickKeyframes } from "./keyframes";
import { correctLag, findSegments, wordsOf, type Word } from "./narration";
import type { CapturePlatform, Resolved } from "./platform/types";
import type { Media, SessionPorts, SessionState, Target } from "./session";
import type { CaptureRecord, CaptureStore } from "./store";
import type { RecorderHost } from "./recorder-host";

export const SAMPLE_RATE = 16_000;
/** The microphone track runs behind the picture by about this much (device buffer plus worklet block). */
export const AUDIO_LAG_MS = 120;
const FRAME_EVERY_MS = 1000;

export interface Narrator {
  /** The speech model is loaded and can make words. */
  ready(): boolean;
  transcribe(pcm: Int16Array): Promise<string>;
}

export interface Delivery {
  /** Puts the contact sheet and the words on the clipboard. */
  copy(text: string, sheet: Buffer | undefined): void;
  /** Says what the finished capture is, for the capsule. */
  saved(record: CaptureRecord): void;
}

export interface RecordingDeps {
  platform: CapturePlatform;
  host: RecorderHost;
  /** Which recording the streamed data belongs to. */
  fence: Fence;
  bundle: Bundle;
  store: CaptureStore;
  journal: Journal;
  narrator: Narrator;
  settings(): CaptureConfig;
  /** Keeps this app's own windows out of the recording. */
  hideOwnWindows(on: boolean): void;
  delivery: Delivery;
  now(): number;
  newId(): string;
  log(line: string): void;
  pick(signal: AbortSignal): Promise<Target | null>;
  notify(n: Notice): void;
  changed(s: SessionState): void;
  /** The recorder could not open the microphone: the capsule says so. */
  micMissing(): void;
  noticeParams(): NoticeParams;
  /** The agent context text, or undefined when the experiment is off. */
  context?(sourceId: string | undefined, range: TimeRange): Promise<string | undefined>;
  /** Words made while the recording goes on (the live engine); absent or inactive, the whole track is transcribed afterwards. */
  live?: LiveSession;
  /** Where the pointer was during this recording (for suggested zooms); absent or with the input log off, nothing is noted. */
  pointer?: PointerTrack;
  /** The input events of this recording (drawing, pen, switches), taken once when the bundle is written. */
  events?(): InputEvent[];
}

const REASON: Record<Extract<RecorderResult, { ok: false }>["code"], string> = { source: "no frames from the source", encoder: "encoder failed", denied: "permission denied" };

interface Current {
  id: string;
  resolved: Resolved;
  startedAt: number;
  micOk: boolean;
}

/** The recorder side of one capture: starts and stops the recorder window and keeps what the session needs to finish the bundle. */
class RecorderPorts {
  readonly #d: RecordingDeps;
  #current: Current | undefined;

  constructor(d: RecordingDeps) {
    this.#d = d;
  }

  async #resolve(target: Target): Promise<Resolved> {
    const resolved = await this.#d.platform.resolve(target);
    if (!resolved) throw new Error("no picture of the target");
    return resolved;
  }

  async begin(id: string, target: Target): Promise<void> {
    const d = this.#d;
    const resolved = await this.#resolve(target);
    await d.bundle.open(id);
    d.hideOwnWindows(true);
    const start = {
      op: "start",
      gen: d.fence.open(),
      sourceId: resolved.sourceId,
      ...(resolved.crop && { crop: resolved.crop }),
      narration: d.settings().narration,
      frameEveryMs: FRAME_EVERY_MS,
      maxSide: MAX_SIDE_PX,
    } as const;
    const r = await d.host.call(start, 15_000);
    if (!r.ok) {
      d.fence.close();
      throw new Error(REASON[r.code]);
    }
    if (d.settings().narration && !r.micOk) d.micMissing();
    this.#current = { id, resolved, startedAt: d.now(), micOk: !!r.micOk };
    d.live?.begin();
    d.pointer?.start(resolved.bounds);
  }

  async swap(id: string, target: Target): Promise<void> {
    const resolved = await this.#resolve(target);
    const r = await this.#d.host.call({ op: "switch", sourceId: resolved.sourceId, ...(resolved.crop && { crop: resolved.crop }) });
    if (!r.ok) throw new Error(REASON[r.code]);
    if (this.#current?.id === id) this.#current.resolved = resolved;
    this.#d.pointer?.move(resolved.bounds);
  }

  /** From the start of the recording to now. */
  #range() {
    return { from: this.#current?.startedAt ?? this.#d.now(), to: this.#d.now() };
  }

  async stop(id: string): Promise<Media> {
    const d = this.#d;
    // read first: stopping the recorder can change which window is in front
    const context = await d.context?.(this.#current?.resolved.sourceId, this.#range());
    d.pointer?.stop();
    const r = await d.host.call({ op: "stop" }, 60_000);
    // the recorder sends the last chunk before it answers, so nothing valid arrives after this
    d.fence.close();
    d.hideOwnWindows(false);
    if (!r.ok) throw new Error(REASON[r.code]);
    const hasVideo = !!(await d.bundle.readFile(id, "video.webm"))?.length;
    const cur = this.#current;
    return {
      durationMs: r.durationMs ?? 0,
      frames: await d.bundle.frames(id),
      videoFile: hasVideo ? "video.webm" : undefined,
      pcm: cur?.micOk ? await d.bundle.pcm(id) : undefined,
      ...(r.softwareEncoder && { softwareEncoder: true }),
      ...(context && { context }),
      ...(cur?.resolved.windowRect && { windowRect: cur.resolved.windowRect }),
    };
  }

  async abort(id: string): Promise<void> {
    // a capture that began meanwhile has a newer generation and keeps it
    if (!this.#current || this.#current.id === id) this.#d.fence.close();
    await this.#d.host.call({ op: "abort" });
    // A capture that began meanwhile is not this one's to clear.
    if (this.#current && this.#current.id !== id) return;
    this.#d.live?.cancel();
    this.#d.pointer?.stop();
    this.#d.hideOwnWindows(false);
    this.#current = undefined;
  }

  async save(id: string, media: Media, words: Word[] | null): Promise<CaptureRecord> {
    const title = this.#current?.resolved.title ?? "Screen capture";
    const record = await saveBundle(this.#d, { id, media, words, title, at: this.#current?.startedAt ?? this.#d.now() });
    this.#current = undefined;
    return record;
  }
}

/** The ports of the session that need the recorder window, the files, the speech model and the clipboard. */
export function createSessionPorts(d: RecordingDeps): SessionPorts {
  const r = new RecorderPorts(d);
  return {
    newId: d.newId,
    now: d.now,
    pick: d.pick,
    startRecording: (id, target) => r.begin(id, target),
    switchTarget: (id, target) => r.swap(id, target),
    stopRecording: (id) => r.stop(id),
    abortRecording: (id) => r.abort(id),
    transcribe: (media) => transcribeTrack(d, media),
    save: (id, media, words) => r.save(id, media, words),
    discard: (id) => d.bundle.remove(id),
    get journal() {
      return d.journal;
    },
    notify: d.notify,
    changed: d.changed,
    log: d.log,
    noticeParams: d.noticeParams,
  };
}

/** Words of the microphone track. Every stretch with any sound goes to the model; quiet speech is never dropped before it. */
export async function transcribeTrack(d: Pick<RecordingDeps, "narrator" | "log" | "live">, media: Media): Promise<Word[] | null> {
  if (d.live?.active()) {
    const words = await d.live.finish();
    return words && correctLag(words, AUDIO_LAG_MS);
  }
  if (!media.pcm?.length || !d.narrator.ready()) return null;
  const words: Word[] = [];
  for (const seg of findSegments(media.pcm, { rate: SAMPLE_RATE })) {
    const from = Math.floor((seg.startMs / 1000) * SAMPLE_RATE);
    const to = Math.ceil((seg.endMs / 1000) * SAMPLE_RATE);
    try {
      words.push(...wordsOf(await d.narrator.transcribe(media.pcm.subarray(from, to)), seg));
    } catch (e) {
      d.log(`capture narration: one stretch failed (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  return words.length ? correctLag(words, AUDIO_LAG_MS) : null;
}

/** Builds sheet.jpg from these picture files of the capture (the edited copies when the person edited them). */
export async function makeSheet(d: Pick<RecordingDeps, "bundle" | "host" | "log">, id: string, files: readonly string[]): Promise<Buffer | undefined> {
  const jpegs = (await Promise.all(files.map((f) => d.bundle.readFile(id, f)))).filter((b): b is Buffer => !!b);
  if (!jpegs.length) return undefined;
  const plan = contactSheetPlan(jpegs.length, 16 / 9);
  const r = await d.host.call({ op: "sheet", jpegs: jpegs.map((b) => new Uint8Array(b)), columns: plan.columns, cellWidth: plan.cellWidth, cellHeight: plan.cellHeight }, 20_000);
  if (!r.ok || !r.jpeg) {
    d.log("capture: the contact sheet could not be made");
    return undefined;
  }
  await d.bundle.writeFile(id, "sheet.jpg", r.jpeg);
  return Buffer.from(r.jpeg);
}

/** Writes the rest of the bundle (words, keyframes, contact sheet), adds it to the list and hands it to the clipboard. */
export interface Finished {
  id: string;
  media: Media;
  words: Word[] | null;
  title: string;
  at: number;
}

/** The input events of the recording, next to its pictures; no file when there were none. */
async function writeEvents(d: Pick<RecordingDeps, "events" | "pointer" | "bundle">, id: string) {
  const events = d.events?.() ?? [];
  if (events.length) await d.bundle.writeFile(id, "events.json", JSON.stringify(events));
  const pointer = d.pointer?.take() ?? [];
  if (pointer.length) await d.bundle.writeFile(id, "pointer.json", JSON.stringify(pointer));
}

export async function saveBundle(d: RecordingDeps, f: Finished): Promise<CaptureRecord> {
  const { id, media, words, title, at } = f;
  const plan = pickKeyframes(media.frames, words ?? []);
  if (words?.length) await d.bundle.words(id, words);
  await writeEvents(d, id);
  const sheet = await makeSheet(
    d,
    id,
    plan.frames.map((f) => f.file),
  );
  const record: CaptureRecord = {
    id,
    kind: "recording",
    title,
    at,
    dir: id,
    durationMs: media.durationMs,
    ...(words?.length && { words }),
    bytes: await d.bundle.bytes(id),
    media: media.videoFile ?? media.frames[0]?.file ?? "",
    frames: plan.frames.map((f) => f.file),
    ...(sheet && { sheet: "sheet.jpg" }),
    ...(media.context && { context: media.context }),
    chips: ["saved", "copied"],
  };
  await d.store.add(record);
  d.delivery.copy(words?.map((w) => w.text).join(" ") ?? "", sheet);
  d.delivery.saved(record);
  return record;
}
