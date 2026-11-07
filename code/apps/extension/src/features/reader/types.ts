import type { Settings } from "@speakkit/protocol";

export type SkipOpts = Settings["skip"];

/** A run of block text that maps back to one text node. When `ne - ns !== te - ts` the text was rewritten (whitespace run, URL -> "link"). */
export interface Piece {
  node: Text;
  ns: number;
  ne: number;
  ts: number;
  te: number;
}
export interface Block {
  el: Element;
  tag: string;
  text: string;
  pieces: Piece[];
  /** index of this block's first sentence in Extraction.sentences */
  first: number;
  count: number;
  /** live Range covering the block's spoken text */
  range: Range;
}
export interface Sentence {
  text: string;
  block: number;
  /** offsets inside Block.text */ start: number;
  end: number;
}
export interface Extraction {
  title: string;
  root: Element;
  blocks: Block[];
  sentences: Sentence[];
}
export interface ExtractOptions {
  skip: SkipOpts;
  /** Read only this range (selection mode: nav/aside/code filters are off, hidden and script filters stay). */
  selection?: Range;
  lang?: string;
  /** Filled with per-phase milliseconds (collect, split, ranges) when given. */
  timing?: Record<string, number>;
}
