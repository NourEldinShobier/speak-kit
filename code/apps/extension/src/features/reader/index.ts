import css from "./reader.css?inline";

export * from "./extract";
export { ReaderView, type ReaderDeps } from "./view";
export { ReaderSection } from "./ReaderSection";
export const READER_CSS: string = css;
