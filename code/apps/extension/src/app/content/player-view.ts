import type { PlayerState } from "@speakkit/protocol";
import { extract } from "../../features/reader";
import type { UiModel } from "../../shared/ui-types";
import type { Ctx } from "./context";
import { ACTIVE } from "./player-state";

const ESTIMATE_TTL_MS = 20000;
const CHARS_PER_SECOND = 15;

/** The player half of the UI model: status, times, speed, voice, the reading-time estimate and the paragraph being read. */
export class PlayerView {
  private est: { t: number; chars: number } | null = null;
  private readonly c: Ctx;

  constructor(c: Ctx) {
    this.c = c;
  }

  /** The page changed: the cached reading-time estimate belongs to the old one. */
  reset() {
    this.est = null;
  }

  private voiceName(id: string) {
    return this.c.voices.find((v) => v.id === id)?.name ?? id.replace(/^[a-z]{2}_/, "").replace(/^./, (ch) => ch.toUpperCase());
  }

  private estimate = () => {
    const now = performance.now();
    if (!this.est || now - this.est.t > ESTIMATE_TTL_MS) {
      const ex = extract(document, { skip: this.c.settings.skip });
      let chars = 0;
      for (const s of ex.sentences) chars += s.text.length;
      this.est = { t: now, chars };
    }
    return (this.est.chars / CHARS_PER_SECOND / Math.max(0.5, this.c.state?.speed ?? this.c.settings.speed)) * 1000;
  };

  /** "Paragraph n of N": blocks of the document being read, counted from 1. */
  private paragraph(): UiModel["paragraph"] {
    const st = this.c.state;
    const d = st?.docId ? this.c.docs.get(st.docId) : undefined;
    const s = d?.doc.sentences[st!.sentenceIndex];
    if (!d || !s) return undefined;
    const n = d.blocks.indexOf(s.block) + 1;
    return n > 0 ? { n, of: d.blocks.length } : undefined;
  }

  private readingBlock(): Element | undefined {
    const st = this.c.state;
    if (!st || !ACTIVE.includes(st.status)) return undefined;
    const d = this.c.docs.get(st.docId ?? "");
    const block = d?.doc.sentences[st.sentenceIndex]?.block;
    return block === undefined ? undefined : d?.ex.blocks[block]?.el;
  }

  /** Optional fields are left out, not set to undefined. */
  of(st: PlayerState | null) {
    const s = this.c.settings;
    const voice = st?.voice ?? s.voice;
    const paragraph = this.paragraph();
    const readingBlock = this.readingBlock();
    return {
      status: st?.status ?? "idle",
      elapsedMs: st?.elapsedMs ?? 0,
      totalMs: st?.totalMs ?? 0,
      speed: st?.speed ?? s.speed,
      voice,
      voiceName: this.voiceName(voice),
      estimate: this.estimate,
      ...(st?.error && { error: st.error }),
      ...(paragraph && { paragraph }),
      ...(readingBlock && { readingBlock }),
    };
  }
}
