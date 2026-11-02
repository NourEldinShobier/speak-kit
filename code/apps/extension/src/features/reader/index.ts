import css from "./reader.css?inline";

/**
 * Reader: page extraction (main-content detection, text blocks with live Ranges, sentence splitting), the ranges that map a sentence
 * or word back to the page, and the reader view in the Shadow DOM. Does not play audio or store settings. Area: extension content script.
 */
export { extract, findMainRoot, sentenceIndexAt, sentenceRange, wordRange, type Extraction } from "./extract";
export { ReaderView, type ReaderDeps } from "./view";
export { ReaderSection } from "./ReaderSection";
/** Stylesheet of the reader view, injected into the Shadow DOM. */
export const READER_CSS: string = css;
