import type { ReadDoc } from "@speakkit/protocol";
import { CHARS_PER_SEC } from "./timeline";
import type { QueueItem } from "./types";

/** Documents waiting to be read after the current one. */
export class DocQueue {
  private docs: ReadDoc[] = [];

  get length(): number {
    return this.docs.length;
  }

  /** Adds unless a document with this id is already queued; returns whether it was added. */
  add(doc: ReadDoc): boolean {
    if (this.docs.some((d) => d.docId === doc.docId)) return false;
    this.docs.push(doc);
    return true;
  }

  remove(docId: string): void {
    this.docs = this.docs.filter((d) => d.docId !== docId);
  }

  take(docId: string): ReadDoc | undefined {
    const i = this.docs.findIndex((d) => d.docId === docId);
    return i < 0 ? undefined : this.docs.splice(i, 1)[0];
  }

  shift(): ReadDoc | undefined {
    return this.docs.shift();
  }

  clear(): void {
    this.docs = [];
  }

  items(speed: number): QueueItem[] {
    return this.docs.map((d) => ({
      docId: d.docId,
      tabId: d.tabId,
      title: d.title,
      url: d.url,
      sentenceCount: d.sentences.length,
      estMs: Math.round((d.sentences.reduce((a, s) => a + s.text.length, 0) / CHARS_PER_SEC / speed) * 1000),
    }));
  }
}
